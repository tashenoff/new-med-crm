import os
import base64
import hashlib
import hmac
import httpx
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional, Tuple
from fastapi import HTTPException

logger = logging.getLogger(__name__)

# Кэш WebRTC-ключа в памяти процесса: { key: str, expires_at: datetime }
_webrtc_key_cache: Dict[str, Any] = {}
KEY_LIFETIME_SECONDS = 70 * 60 * 60  # 70 часов — запас до 72ч


class TelephonyService:
    """Сервис для работы с телефонией и Zadarma API."""

    def __init__(self):
        self.api_key = os.getenv("ZADARMA_KEY")
        self.api_secret = os.getenv("ZADARMA_SECRET")
        self.sip_login = os.getenv("ZADARMA_SIP_LOGIN") or os.getenv("ZADARMA_SIP_INTERNAL", "596634-100")
        self.api_url = "https://api.zadarma.com"

    def _make_auth_header(self, method_path: str, params: Optional[Dict[str, Any]] = None) -> str:
        """Сформировать заголовок Authorization: key:signature для Zadarma API v1."""
        if not self.api_key or not self.api_secret:
            raise HTTPException(status_code=500, detail="Zadarma credentials not configured")

        params = params or {}
        sorted_params = sorted(params.items(), key=lambda item: item[0])
        query_string = "&".join(f"{k}={v}" for k, v in sorted_params)
        md5_of_params = hashlib.md5(query_string.encode("utf-8")).hexdigest()
        data_to_sign = f"{method_path}{query_string}{md5_of_params}"
        signature = base64.b64encode(
            hmac.new(
                self.api_secret.encode("utf-8"),
                data_to_sign.encode("utf-8"),
                hashlib.sha1,
            ).digest()
        ).decode("utf-8")
        return f"{self.api_key}:{signature}"

    async def get_webrtc_key(self) -> Tuple[str, int]:
        """
        Получить WebRTC-ключ от Zadarma с кэшированием в памяти процесса.
        Возвращает (key, expires_in_seconds).
        """
        global _webrtc_key_cache

        now = datetime.now(timezone.utc)
        cached = _webrtc_key_cache.get("key")
        expires_at = _webrtc_key_cache.get("expires_at")

        if cached and expires_at and now < expires_at:
            remaining = int((expires_at - now).total_seconds())
            logger.info("Using cached Zadarma WebRTC key")
            return cached, remaining

        method_path = "/v1/webrtc/get_key/"
        params = {"sip": self.sip_login}
        auth_header = self._make_auth_header(method_path, params)

        url = f"{self.api_url}{method_path}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.get(
                    url,
                    params=params,
                    headers={"Authorization": auth_header},
                )
                response.raise_for_status()
                payload = response.json()
            except httpx.HTTPStatusError as e:
                logger.error("Zadarma API error: %s", e.response.text)
                raise HTTPException(
                    status_code=e.response.status_code,
                    detail="Ошибка получения WebRTC-ключа от Zadarma",
                )
            except httpx.RequestError as e:
                logger.error("Zadarma API request error: %s", str(e))
                raise HTTPException(
                    status_code=502,
                    detail="Не удалось соединиться с Zadarma API",
                )

        if payload.get("status") != "success" or "key" not in payload:
            logger.error("Unexpected Zadarma response: %s", payload)
            raise HTTPException(
                status_code=502,
                detail="Некорректный ответ Zadarma при получении WebRTC-ключа",
            )

        key = payload["key"]
        expires_at = now + timedelta(seconds=KEY_LIFETIME_SECONDS)
        _webrtc_key_cache = {"key": key, "expires_at": expires_at}

        logger.info("Fetched new Zadarma WebRTC key")
        return key, KEY_LIFETIME_SECONDS


telephony_service = TelephonyService()