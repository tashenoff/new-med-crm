"""Загрузка файла для отправки в WhatsApp: POST /wazzup/media/upload.

Файл кладётся в /uploads, возвращается relative_url + media_type (по расширению).
"""
import os

os.environ.setdefault("WAZZUP24_API_KEY", "test-key-for-tests")

import pytest  # noqa: E402


@pytest.fixture
def auth_client(clean_db, monkeypatch):
    from httpx import AsyncClient, ASGITransport
    from dependencies import get_current_user
    import server

    class _FakeUser:
        id = "u1"
        role = "admin"
        is_active = True
        email = "admin@test.ru"

    monkeypatch.setattr("database.db", clean_db)
    server.app.dependency_overrides[get_current_user] = lambda: _FakeUser()
    try:
        transport = ASGITransport(app=server.app)
        yield AsyncClient(transport=transport, base_url="http://test")
    finally:
        server.app.dependency_overrides.pop(get_current_user, None)


async def _upload(auth_client, name, content, ctype):
    return await auth_client.post(
        "/api/wazzup/media/upload",
        files={"file": (name, content, ctype)},
    )


async def test_upload_pdf_returns_document(auth_client):
    r = await _upload(auth_client, "отчет.pdf", b"%PDF-1.4 fake pdf", "application/pdf")
    assert r.status_code == 200
    data = r.json()
    assert data["media_type"] == "document"
    assert data["relative_url"].startswith("/uploads/wazzup_")
    assert data["relative_url"].endswith(".pdf")
    fname = os.path.basename(data["relative_url"])
    try:
        assert os.path.exists(os.path.join("uploads", fname))
    finally:
        os.remove(os.path.join("uploads", fname))


async def test_upload_png_returns_image(auth_client):
    r = await _upload(auth_client, "photo.png", b"\x89PNG fake", "image/png")
    assert r.status_code == 200
    assert r.json()["media_type"] == "image"
    fname = os.path.basename(r.json()["relative_url"])
    os.remove(os.path.join("uploads", fname))


async def test_upload_rejects_unsupported_ext(auth_client):
    r = await _upload(auth_client, "virus.sh", b"#!/bin/bash", "text/x-sh")
    assert r.status_code == 400
    assert r.json()["detail"]


async def test_upload_rejects_empty(auth_client):
    r = await _upload(auth_client, "empty.pdf", b"", "application/pdf")
    assert r.status_code == 400