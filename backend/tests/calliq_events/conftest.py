"""This suite never connects to MongoDB or a real HTTP provider."""

import httpx
import pytest
import pytest_asyncio
from mongomock_motor import AsyncMongoMockClient


@pytest_asyncio.fixture
async def clean_db():
    client = AsyncMongoMockClient()
    yield client["calliq_event_tests"]
    client.close()


@pytest.fixture(autouse=True)
def forbid_real_http(monkeypatch):
    monkeypatch.setenv("WAZZUP24_API_KEY", "synthetic-disabled-network")
    monkeypatch.setenv("CALLIQ_EVENT_SYNC_ENABLED", "false")

    async def forbidden(*args, **kwargs):
        raise AssertionError("Real HTTP forbidden in synthetic suite")

    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", forbidden)
