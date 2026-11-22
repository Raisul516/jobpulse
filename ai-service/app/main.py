"""JobPulse AI service.

Only the Node backend calls this (never the browser directly), and it only listens on localhost.

  GET  /health
  POST /parse-cv   multipart file  -> CV text + draft profile fields
  POST /embed      {"texts": [...]} -> one 384-number vector per text
  POST /explain-match {job, profile, match} -> {text}           (needs LLM_API_KEY)
  POST /ask           {question, jobs, profile} -> {answer, jobIds} (needs LLM_API_KEY)
"""

import hmac
import os

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .env import load_env

load_env()  # ai-service/.env (LLM_API_KEY etc.), before anything reads the settings

from .cv_parser import parse_cv  # noqa: E402
from .cv_text import CvReadError, extract_text  # noqa: E402
from .embeddings import DIMENSIONS, MODEL_NAME, embed  # noqa: E402
from . import llm  # noqa: E402

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
# When deployed on the internet, set AI_SERVICE_TOKEN (same value as in the backend) so only
# the JobPulse backend can use this service. Locally it's empty and everything is open.
TOKEN = os.environ.get("AI_SERVICE_TOKEN", "")

app = FastAPI(title="JobPulse AI service", docs_url=None if TOKEN else "/docs", redoc_url=None, openapi_url=None if TOKEN else "/openapi.json")


@app.middleware("http")
async def require_token(request: Request, call_next):
    if TOKEN and request.url.path not in ("/", "/health"):
        sent = request.headers.get("authorization", "")
        if not hmac.compare_digest(sent.encode(), f"Bearer {TOKEN}".encode()):
            return JSONResponse({"detail": "Not allowed."}, status_code=401)
    return await call_next(request)


@app.get("/")
def root():
    return {"ok": True}


@app.get("/health")
def health():
    return {"ok": True, "embeddingModel": MODEL_NAME, "dimensions": DIMENSIONS, "llm": llm.model_name() if llm.is_configured() else None}


@app.post("/parse-cv")
async def parse_cv_endpoint(file: UploadFile = File(...)):
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="The CV file is larger than 5 MB.")
    try:
        text = extract_text(file.filename or "", data)
    except CvReadError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    parsed = parse_cv(text)
    return {"text": text, **parsed}


class EmbedRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=64)


@app.post("/embed")
def embed_endpoint(body: EmbedRequest):
    return {"model": MODEL_NAME, "dimensions": DIMENSIONS, "vectors": embed(body.texts)}


# ---------- RAG: the backend finds the jobs (retrieval), the LLM writes the text (generation) ----------


class ExplainRequest(BaseModel):
    job: dict
    profile: dict | None = None
    match: dict | None = None


@app.post("/explain-match")
def explain_match_endpoint(body: ExplainRequest):
    try:
        return llm.explain_match(body.job, body.profile, body.match)
    except llm.LlmError as err:
        raise HTTPException(status_code=err.status, detail=str(err)) from err


class AskRequest(BaseModel):
    question: str = Field(min_length=2, max_length=500)
    jobs: list[dict] = Field(max_length=12)
    profile: dict | None = None


@app.post("/ask")
def ask_endpoint(body: AskRequest):
    try:
        return llm.answer_question(body.question, body.jobs, body.profile)
    except llm.LlmError as err:
        raise HTTPException(status_code=err.status, detail=str(err)) from err
