import json

import httpx
import pytest

from services.calliq_client import CalliqClient, CalliqError


async def test_upload_and_get_call(monkeypatch, tmp_path):
    for key, value in {"URL": " https://calliq.test/ ", "EMAIL": "user@test.kz",
                       "PASSWORD": "secret", "PROJECT_ID": "7"}.items():
        monkeypatch.setenv(f"CALLIQ_{key}", value)
    requests = []

    async def handler(request):
        requests.append(request)
        if request.url.path == "/auth/login":
            assert json.loads(request.content) == {"email": "user@test.kz", "password": "secret"}
            return httpx.Response(200, json={"access_token": "token"})
        assert request.headers["Authorization"] == "Bearer token"
        if request.method == "POST":
            assert request.url.params["project_id"] == "7"
            body = await request.aread()
            for part in (b'name="operator"', b'Operator Name', b'name="channel"', b'100',
                         b'filename="record.mp3"', b'audio/mpeg', b'mp3-data'):
                assert part in body
            return httpx.Response(200, json={"id": 42})
        return httpx.Response(200, json={"transcript": "hello", "metrics": {}, "status": "done"})

    client = CalliqClient()
    await client._client.aclose()
    client._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    path = tmp_path / "record.mp3"
    path.write_bytes(b"mp3-data")
    try:
        assert client.is_configured()
        assert await client.upload_call(str(path), "Operator Name", "100") == 42
        assert client._token == "token"
        assert (await client.get_call(42))["metrics"] == {}
        assert len(requests) == 3
    finally:
        await client.aclose()


async def test_unconfigured(monkeypatch):
    monkeypatch.delenv("CALLIQ_URL", raising=False)
    client = CalliqClient()
    try:
        assert not client.is_configured()
        with pytest.raises(CalliqError):
            await client._login()
    finally:
        await client.aclose()


@pytest.mark.parametrize("payload", [{}, {"access_token": ""}])
async def test_bad_login(monkeypatch, payload):
    monkeypatch.setenv("CALLIQ_URL", "https://calliq.test")
    monkeypatch.setenv("CALLIQ_EMAIL", "user")
    monkeypatch.setenv("CALLIQ_PASSWORD", "secret")
    client = CalliqClient()
    await client._client.aclose()
    client._client = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=payload)))
    try:
        with pytest.raises(CalliqError):
            await client._login()
    finally:
        await client.aclose()


async def test_empty_form_and_http_error(monkeypatch, tmp_path):
    monkeypatch.setenv("CALLIQ_URL", "https://calliq.test")
    monkeypatch.delenv("CALLIQ_PROJECT_ID", raising=False)
    client = CalliqClient()
    client._token = "token"
    await client._client.aclose()

    async def handler(request):
        assert not request.url.query
        body = await request.aread()
        assert b'name="operator"\r\n\r\n\r\n' in body
        assert b'name="channel"\r\n\r\n\r\n' in body
        return httpx.Response(503)

    client._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    path = tmp_path / "record.mp3"
    path.write_bytes(b"audio")
    try:
        with pytest.raises(CalliqError, match="upload failed") as error:
            await client.upload_call(str(path), None, None)
        assert isinstance(error.value.__cause__, httpx.HTTPStatusError)
    finally:
        await client.aclose()
