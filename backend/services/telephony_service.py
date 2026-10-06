import os

import hashlib

import hmac

import base64

import json

import httpx

from typing import Optional, Dict, Any

from urllib.parse import urlencode



from fastapi import HTTPException





# Константы API Zadarma

ZADARMA_API_BASE = "https://api.zadarma.com"





def _zadarma_sign(method_path: str, params: Dict[str, str], secret: str) -> str:

    """

    Формирует подпись для запроса к Zadarma API.



    sign = base64(

        hmac_sha1_hex(method_path + params_str + md5(params_str), secret)

    )



    Где:

      - method_path — путь ДО параметров и ВКЛЮЧАЯ версию, например /v1/request/callback/

      - params_str — параметры, отсортированные по имени ключа и собранные urlencode по RFC1738

      - md5(params_str) — MD5-хеш строки параметров (HEX-строка)

      - hmac_sha1_hex — hmac.new(secret, data, hashlib.sha1).hexdigest()

    """

    sorted_params = sorted(params.items())

    params_str = urlencode(sorted_params) if sorted_params else ""



    # Строим data: method_path + params_str + md5(params_str)

    md5_hex = hashlib.md5(params_str.encode()).hexdigest()

    data = method_path + params_str + md5_hex



    # HMAC-SHA1 -> hexdigest -> base64

    hmac_digest = hmac.new(secret.encode(), data.encode(), hashlib.sha1).hexdigest()

    sign = base64.b64encode(hmac_digest.encode()).decode()



    return sign





class TelephonyService:

    """

    Сервис для работы с Zadarma API.



    Использует переменные окружения:

      ZADARMA_KEY        — ключ API (логин)

      ZADARMA_SECRET     — секрет API

      ZADARMA_CALLER_ID  — номер клиники для исходящих звонков (from)

      ZADARMA_SIP_INTERNAL — внутренний номер АТС (sip), по умолчанию "100"

    """



    def __init__(self):

        # НЕ валидируем при инициализации — ленивая проверка

        self._key: Optional[str] = None

        self._secret: Optional[str] = None

        self._caller_id: Optional[str] = None

        self._sip_internal: str = "100"



    def _ensure_credentials(self):

        """Ленивая проверка и загрузка credentials из env.

        Бросает HTTPException(500), если ключи не установлены.

        """

        if self._key is not None:

            return



        key = os.getenv("ZADARMA_KEY")

        secret = os.getenv("ZADARMA_SECRET")

        caller_id = os.getenv("ZADARMA_CALLER_ID")

        sip_internal = os.getenv("ZADARMA_SIP_INTERNAL", "100")



        if not key or not secret:

            raise HTTPException(

                status_code=500,

                detail="ZADARMA_KEY и ZADARMA_SECRET не установлены в переменных окружения"

            )



        self._key = key

        self._secret = secret

        self._caller_id = caller_id

        self._sip_internal = sip_internal



    def _make_auth_header(self, method_path: str, params: Dict[str, str]) -> Dict[str, str]:

        """Формирует заголовок Authorization для запроса к Zadarma."""

        self._ensure_credentials()

        sign = _zadarma_sign(method_path, params, self._secret)

        return {

            "Authorization": f"{self._key}:{sign}",

            "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",

        }



    async def _api_request(

        self,

        method: str,

        path: str,

        params: Optional[Dict[str, str]] = None,

        data: Optional[Dict[str, str]] = None,

    ) -> Dict[str, Any]:

        """Базовый метод для выполнения запросов к Zadarma API."""

        self._ensure_credentials()



        params = params or {}

        method_path = f"/v1/{path}/"

        url = f"{ZADARMA_API_BASE}{method_path}"



        # Для POST параметры идут в теле, но участвуют в подписи

        if method == "POST" and data is not None:

            sign_params = data

            request_data = data

        else:

            sign_params = params

            request_data = None



        headers = self._make_auth_header(method_path, sign_params)



        async with httpx.AsyncClient(timeout=30.0) as client:

            try:

                if method == "GET":

                    response = await client.get(url, headers=headers, params=params)

                elif method == "POST":

                    response = await client.post(url, headers=headers, data=request_data)

                else:

                    raise ValueError(f"Неподдерживаемый HTTP метод: {method}")



                response.raise_for_status()

                return response.json()



            except httpx.HTTPStatusError as e:

                raise HTTPException(

                    status_code=e.response.status_code,

                    detail=f"Ошибка Zadarma API: {e.response.text}"

                )

            except httpx.RequestError as e:

                raise HTTPException(

                    status_code=500,

                    detail=f"Ошибка соединения с Zadarma: {str(e)}"

                )



    async def request_callback(self, phone: str, sip: Optional[str] = None) -> Dict[str, Any]:

        """

        Клик-ту-колл: инициирует звонок из CRM на номер пациента.



        POST /v1/request/callback/

        Параметры:

          from — наш номер / SIP / внутренний номер АТС

          to   — номер пациента

          sip  (опц.) — SIP-пользователь или внутренний номер АТС

        """

        self._ensure_credentials()



        if not self._caller_id:

            raise HTTPException(

                status_code=500,

                detail="ZADARMA_CALLER_ID не установлен в переменных окружения"

            )



        data = {

            "from": self._caller_id,

            "to": phone,

        }

        if sip:

            data["sip"] = sip

        elif self._sip_internal:

            data["sip"] = self._sip_internal



        return await self._api_request("POST", "request/callback", data=data)



    async def configure_webhooks(self, url: str) -> Dict[str, Any]:

        """

        Регистрирует URL вебхука и включает события звонков.



        1. POST /v1/pbx/callinfo/url/ — установка URL

        2. POST /v1/pbx/callinfo/notifications/ — включение событий

        """

        # Шаг 1: установка URL

        result_url = await self._api_request(

            "POST", "pbx/callinfo/url/",

            data={"url": url}

        )



        # Шаг 2: включение событий

        result_notify = await self._api_request(

            "POST", "pbx/callinfo/notifications/",

            data={

                "notify_start": "true",

                "notify_answer": "true",

                "notify_end": "true",

                "notify_out_start": "true",

                "notify_out_end": "true",

            }

        )



        return {

            "url_set": result_url,

            "notifications_set": result_notify,

        }



    async def get_balance(self) -> Dict[str, Any]:

        """

        Получить баланс аккаунта. Используется для health-проверки.



        GET /v1/info/balance/

        """

        return await self._api_request("GET", "info/balance")









    async def request_record_link(self, call_id: str) -> Dict[str, Any]:

        """

        Запросить временную ссылку на запись разговора.



        GET /v1/pbx/record/request/

        Параметры:

          call_id — идентификатор звонка (call_id_with_rec / pbx_call_id)

        """

        return await self._api_request("GET", "pbx/record/request", params={"call_id": call_id})

# Единственный экземпляр сервиса (как wazzup_service)

telephony_service = TelephonyService()



