"""Turns text into a list of numbers ("embedding") so similar meanings end up close together.

Runs a small multilingual model on this computer (no API, no cost; understands Bangla too).
The model (~220 MB) is downloaded once, the first time it's needed, into ai-service/.models.
"""

from __future__ import annotations

import threading
from pathlib import Path

MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
DIMENSIONS = 384
CACHE_DIR = Path(__file__).resolve().parent.parent / ".models"
MAX_CHARS = 2000  # the model only reads ~128 words anyway; longer text just costs time

_model = None
_lock = threading.Lock()


def _get_model():
    global _model
    with _lock:
        if _model is None:
            from fastembed import TextEmbedding  # imported here so tests don't need the model

            _model = TextEmbedding(model_name=MODEL_NAME, cache_dir=str(CACHE_DIR))
        return _model


def embed(texts: list[str]) -> list[list[float]]:
    import numpy as np

    model = _get_model()
    cleaned = [" ".join(t.split())[:MAX_CHARS] or " " for t in texts]
    result = []
    for vector in model.embed(cleaned):
        # Scale every vector to length 1, so "cosine similarity" is just a dot product
        # (and pgvector's cosine distance gives the same answer).
        norm = float(np.linalg.norm(vector)) or 1.0
        result.append([round(float(x) / norm, 6) for x in vector])
    return result
