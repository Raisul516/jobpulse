# JobPulse AI service, for Hugging Face Spaces (Docker) or any Docker host.
FROM python:3.12-slim

# Hugging Face Spaces runs the container as user 1000
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH" PYTHONUNBUFFERED=1
WORKDIR /home/user/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

COPY --chown=user app ./app
# Download the embedding model while building, so the first request after a restart is fast.
RUN python -c "from app.embeddings import embed; embed(['warm up'])"

EXPOSE 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
