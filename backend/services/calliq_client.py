"""Asynchronous client for the optional CallIQ recording integration."""

import os
from pathlib import Path
from threading import Lock

import httpx


class CalliqError(Exception):
    """CallIQ authentication, transport or response error."""


class CalliqClient:
    def __init__(self):
        self.base_url = (os.getenv("CALLIQ_URL") or "").strip().rstrip("/")
        self.email = os.getenv("CALLIQ_EMAIL")
        self.password = os.getenv("CALLIQ_PASSWORD")
        self.project_id = os.getenv("CALLIQ_PROJECT_ID")
        self._token = None
        self._client = httpx.AsyncClient(timeout=30)

    def is_configured(self) -> bool:
        return bool(self.base_url and self.email and self.password)

    async def _login(self):
        try:
            if not self.is_configured():
                raise CalliqError("CallIQ is not configured")
            response = await self._client.post(
                f"{self.base_url}/auth/login", json={"email": self.email, "password": self.password})
            response.raise_for_status()
            token = response.json().get("access_token")
            if not isinstance(token, str) or not token:
                raise CalliqError("CallIQ login returned no access_token")
            self._token = token
        except CalliqError:
            raise
        except Exception as exc:
            raise CalliqError("CallIQ login failed") from exc

    async def upload_call(self, file_path: str, operator: str | None, channel: str | None) -> int:
        try:
            if not self._token:
                await self._login()
            with open(file_path, "rb") as recording:
                response = await self._client.post(
                    f"{self.base_url}/calls",
                    params={"project_id": self.project_id} if self.project_id else None,
                    files={"file": (Path(file_path).name, recording, "audio/mpeg")},
                    data={"operator": operator or "", "channel": channel or ""},
                    headers={"Authorization": f"Bearer {self._token}"})
            response.raise_for_status()
            return int(response.json()["id"])
        except Exception as exc:
            raise CalliqError("CallIQ recording upload failed") from exc

    async def get_call(self, call_id: int) -> dict:
        try:
            if not self._token:
                await self._login()
            response = await self._client.get(
                f"{self.base_url}/calls/{call_id}", headers={"Authorization": f"Bearer {self._token}"})
            response.raise_for_status()
            result = response.json()
            if not isinstance(result, dict):
                raise CalliqError("CallIQ call response must be an object")
            return result
        except Exception as exc:
            raise CalliqError("CallIQ call retrieval failed") from exc

    async def aclose(self):
        await self._client.aclose()


_client = None
_lock = Lock()


def get_calliq_client() -> CalliqClient:
    global _client
    with _lock:
        if _client is None:
            _client = CalliqClient()
        return _client
