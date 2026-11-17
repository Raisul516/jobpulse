"""JobPulse AI service.

Only the Node backend calls this (never the browser directly), and it only listens on localhost.

  GET  /health
  POST /parse-cv   multipart file  -> CV text + draft profile fields
  POST /embed      {"texts": [...]} -> one 384-number vector per text
"""

from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from .cv_parser import parse_cv
from .cv_text import CvReadError, extract_text
from .embeddings import DIMENSIONS, MODEL_NAME, embed

MAX_UPLOAD_BYTES = 5 * 1024 * 1024

app = FastAPI(title="JobPulse AI service")


@app.get("/health")
def health():
    return {"ok": True, "embeddingModel": MODEL_NAME, "dimensions": DIMENSIONS}


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
