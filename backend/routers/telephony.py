from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from datetime import datetime

from dependencies import get_current_user
from models.auth import UserInDB
from services.telephony_service import telephony_service
from models.telephony import TelephonyCall
from database import db

router = APIRouter(prefix="/api/telephony", tags=["Telephony"])


@router.get("/webrtc-key")
async def get_webrtc_key(current_user: UserInDB = Depends(get_current_user)):
    """
    Получить WebRTC-ключ для инициализации виджета Zadarma.
    Ключ кэшируется на бэкенде на 70 часов и не сохраняется в БД/логи.
    """
    key, expires_in = await telephony_service.get_webrtc_key()
    return {
        "key": key,
        "login": telephony_service.sip_login,
        "expires_in": expires_in,
    }


@router.get("/calls", response_model=List[TelephonyCall])
async def get_calls(
    phone: Optional[str] = None,
    user_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: UserInDB = Depends(get_current_user),
):
    """Получить историю звонков с фильтрацией."""
    query = {}
    if phone:
        query["phone_number"] = phone
    if user_id:
        query["user_id"] = user_id

    cursor = db.telephony_calls.find(query).sort("created_at", -1).skip(offset).limit(limit)
    calls = []
    async for doc in cursor:
        doc["id"] = str(doc["_id"])
        del doc["_id"]
        calls.append(TelephonyCall(**doc))
    return calls


@router.post("/callbacks")
async def create_callback(
    request: dict,
    current_user: UserInDB = Depends(get_current_user),
):
    """
    Заглушка для обратного click-to-call.
    Ранее использовалась для инициации звонка через Zadarma callback.
    Сейчас звонки совершаются напрямую через WebRTC-виджет в браузере.
    """
    raise HTTPException(
        status_code=410,
        detail="Callback устарел. Используйте WebRTC-виджет для звонков из браузера.",
    )


@router.get("/health")
async def health_check(current_user: UserInDB = Depends(get_current_user)):
    """Проверка работоспособности интеграции телефонии."""
    return {
        "status": "ok",
        "provider": "zadarma",
        "sip": telephony_service.sip_login,
        "timestamp": datetime.utcnow().isoformat(),
    }