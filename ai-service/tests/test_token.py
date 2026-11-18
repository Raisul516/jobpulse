import importlib

from fastapi.testclient import TestClient


def make_client(monkeypatch, token):
    monkeypatch.setenv("AI_SERVICE_TOKEN", token)
    import app.main as main

    return TestClient(importlib.reload(main).app)


def test_open_when_no_token(monkeypatch):
    client = make_client(monkeypatch, "")
    assert client.post("/parse-cv").status_code == 422  # reaches the endpoint (missing file)


def test_token_required_when_set(monkeypatch):
    client = make_client(monkeypatch, "s3cret")
    assert client.get("/health").status_code == 200  # health stays open for keep-awake pings
    assert client.post("/parse-cv").status_code == 401
    assert client.post("/parse-cv", headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.post("/parse-cv", headers={"Authorization": "Bearer s3cret"}).status_code == 422
    assert client.get("/docs").status_code in (401, 404)


def teardown_module():
    import os

    import app.main as main

    os.environ.pop("AI_SERVICE_TOKEN", None)
    importlib.reload(main)  # leave the module as it is without a token
