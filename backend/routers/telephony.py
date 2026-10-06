import os
import uuid
from pathlib import Path

import httpx

import logging

from typing import Optional, List, Dict, Any

from datetime import datetime



from fastapi import APIRouter, HTTPException, Depends, Query, Body, Request, Response



from models.telephony import (

    TelephonyCall,

    TelephonyCallCreate,

    TelephonyCallUpdate,

    CallDirection,

    CallStatus,

    Disposition,

)

from services.telephony_service import telephony_service

from dependencies import get_current_user

from models.auth import User

from database import get_database





logger = logging.getLogger(__name__)



router = APIRouter(prefix="/api/telephony", tags=["Telephony"])





# ---------------------------------------------------------------------------

# Вспомогательные функции

# ---------------------------------------------------------------------------



def _normalize_phone(phone: str) -> str:

    """Нормализация телефона: оставляет последние 10 цифр."""

    digits = "".join(filter(str.isdigit, phone))

    return digits[-10:] if len(digits) >= 10 else digits


async def _download_call_record(call_id: str) -> tuple[Optional[str], Optional[str]]:

    """

    Запрашивает временную ссылку на запись и скачивает mp3 в uploads/.



    Возвращает (local_url, remote_url):

      - local_url — /uploads/<файл> при успешном скачивании, иначе None;

      - remote_url — удалённая ссылка для фолбэка, если API вернуло.

    """

    remote_url = None

    try:

        result = await telephony_service.request_record_link(call_id)

        if result.get("status") != "success":

            logger.warning("Zadarma record request не success: %s", result)

            return None, None

        link = result.get("link")

        if not link:

            return None, None

        remote_url = link

        filename = link.split("?")[0].rsplit("/", 1)[-1]

        if not filename or "." not in filename:

            ext = os.path.splitext(link.split("?")[0])[1] or ".mp3"

            filename = f"record_{uuid.uuid4().hex}{ext}"

        upload_dir = Path("uploads")

        upload_dir.mkdir(exist_ok=True)

        async with httpx.AsyncClient(timeout=40) as client:

            response = await client.get(link)

        if response.status_code == 200 and response.content:

            (upload_dir / filename).write_bytes(response.content)

            return f"/uploads/{filename}", remote_url

        else:

            logger.warning("Не удалось скачать запись %s: статус %s", link, response.status_code)

            return None, remote_url

    except Exception as e:

        logger.exception("Ошибка при получении/скачивании записи разговора: %s", e)

        return None, remote_url





async def _find_patient_by_phone(db, phone: str) -> Optional[dict]:

    """Поиск пациента по нормализованному телефону (по последним 10 цифрам)."""

    normalized = _normalize_phone(phone)

    if not normalized:

        return None



    # Загружаем пациентов (разумный лимит) и проверяем нормализованный телефон

    cursor = db.patients.find(

        {"phone": {"$exists": True}},

        {"_id": 1, "id": 1, "phone": 1, "full_name": 1, "first_name": 1, "last_name": 1}

    ).limit(2000)

    async for patient in cursor:

        patient_phone = patient.get("phone", "")

        if patient_phone and _normalize_phone(patient_phone) == normalized:

            return patient

    return None





async def _find_or_create_lead(db, phone: str, contact_name: Optional[str] = None) -> Optional[dict]:

    """Ищет активный лид по телефону или создаёт новый."""
    from crm.services.lead_service import LeadService
    from crm.schemas.lead_schemas import LeadCreate
    from crm.models.lead import LeadSource

    lead_service = LeadService(db)

    existing = await lead_service.get_active_lead_by_phone(phone)
    if existing:
        return existing.dict() if hasattr(existing, "dict") else existing

    # Создаём новый лид
    name_parts = (contact_name or "Клиент").split(" ", 1)
    first_name = name_parts[0] if name_parts[0] else "Клиент"
    last_name = name_parts[1] if len(name_parts) > 1 else ""

    lead_data = LeadCreate(
        first_name=first_name,
        last_name=last_name or "Телефония",
        phone=phone,
        source=LeadSource.PHONE,
        description="Обращение через Zadarma-звонок",
    )
    new_lead = await lead_service.create_lead(lead_data, created_by="telephony_webhook")
    return new_lead.dict() if hasattr(new_lead, "dict") else new_lead


async def _resolve_contact_name(db, call_doc: dict) -> Optional[str]:
    """Определяет имя контакта для документа звонка по patient_id или номеру телефона."""
    # Если в документе уже заполнено имя — не перезаписываем
    if call_doc.get("contact_name"):
        return call_doc["contact_name"]

    # 1. Ищем пациента по patient_id
    patient_id = call_doc.get("patient_id")
    if patient_id:
        try:
            from bson.objectid import ObjectId
            query = {"_id": ObjectId(patient_id)}
        except Exception:
            query = {"id": patient_id}
        patient = await db.patients.find_one(query, {"full_name": 1})
        if patient and patient.get("full_name"):
            return patient["full_name"]

    phone = call_doc.get("phone_number", "")
    if not phone:
        return None

    # 2. Ищем пациента по номеру телефона
    patient = await _find_patient_by_phone(db, phone)
    if patient:
        full_name = patient.get("full_name")
        if full_name:
            return full_name
        first_name = patient.get("first_name", "").strip()
        last_name = patient.get("last_name", "").strip()
        if first_name and last_name:
            return f"{first_name} {last_name}"
        return first_name or last_name or None

    # 3. Ищем активного лида по номеру телефона
    from crm.services.lead_service import LeadService
    lead_service = LeadService(db)
    lead = await lead_service.get_active_lead_by_phone(phone)
    if lead:
        lead_dict = lead.dict() if hasattr(lead, "dict") else lead
        first_name = lead_dict.get("first_name", "").strip()
        last_name = lead_dict.get("last_name", "").strip()
        if first_name and last_name:
            return f"{first_name} {last_name}"
        return first_name or last_name or None

    return None




async def _save_call_to_db(db, call_data: dict) -> str:

    """Сохраняет запись звонка в коллекцию telephony_calls."""

    if "_id" in call_data:

        del call_data["_id"]

    if "id" in call_data:

        del call_data["id"]

    if "created_at" not in call_data or call_data.get("created_at") is None:

        call_data["created_at"] = datetime.utcnow()

    call_data["updated_at"] = datetime.utcnow()



    result = await db.telephony_calls.insert_one(call_data)

    return str(result.inserted_id)





async def _update_call_in_db(db, call_id: str, update_data: dict):

    """Обновляет запись звонка."""

    update_data["updated_at"] = datetime.utcnow()

    await db.telephony_calls.update_one(

        {"_id": call_id},

        {"$set": update_data}

    )





# ---------------------------------------------------------------------------

# Вебхук событий звонков (ПУБЛИЧНЫЙ, без авторизации)

# ---------------------------------------------------------------------------



@router.get("/webhook/events")

@router.post("/webhook/events")

async def webhook_events(request: Request):

    """

    Вебхук для событий звонков от Zadarma.



    - Без авторизации, публичный.

    - Обрабатывает zd_echo (GET и POST): возвращает значение параметра zd_echo.

    - Разбирает события звонков (NOTIFY_START, NOTIFY_ANSWER, NOTIFY_END и т.д.).

    - Матчит телефон на существующего пациента или создаёт лид.

    - Сохраняет/обновляет документ в коллекции telephony_calls.

    """

    db = get_database()



    # Собираем параметры по приоритету: query -> form -> json

    params = dict(request.query_params)



    if request.method != "GET":

        content_type = request.headers.get("content-type", "")

        if "application/x-www-form-urlencoded" in content_type:

            try:

                form = await request.form()

                params.update({k: v for k, v in form.items()})

            except Exception as e:

                logger.warning("Ошибка разбора form-encoded: %s", e)

        elif "application/json" in content_type:

            try:

                body = await request.json()

                if isinstance(body, dict):

                    params.update(body)

            except Exception as e:

                logger.warning("Ошибка разбора JSON body: %s", e)



    # Логируем сырой payload

    logger.info("Zadarma webhook received: %s", params)



    # --- Обработка zd_echo ---

    echo = params.get("zd_echo")

    if echo is not None:

        logger.info("Zadarma echo probe: returning %s", echo)

        return Response(content=str(echo), media_type="text/plain")



    # --- Обработка события звонка ---

    event = params.get("event", "")

    if not event:

        # Нет ни echo, ни event — возвращаем ok, но логируем

        logger.warning("Zadarma webhook: ни zd_echo, ни event не найдены. Payload: %s", params)

        return {"status": "ok"}

    # ------------------------------------------------------------------
    # NOTIFY_RECORD приходит БЕЗ номера телефона: ссылку на запись надо
    # запрашивать отдельным методом, а привязку делать по pbx_call_id.
    # Поэтому это событие обрабатываем ДО проверки телефона.
    # ------------------------------------------------------------------
    if event == "NOTIFY_RECORD":
        rec_pbx_call_id = params.get("pbx_call_id", "")
        call_id_with_rec = params.get("call_id_with_rec", "") or params.get("call_id", "")
        recording_url = params.get("recording_url", "") or params.get("recording", "") or None

        if call_id_with_rec and not recording_url:
            local_url, remote_url = await _download_call_record(call_id_with_rec)
            recording_url = local_url or remote_url

        existing_call = None
        if rec_pbx_call_id:
            existing_call = await db.telephony_calls.find_one({"pbx_call_id": rec_pbx_call_id})

        if existing_call:
            rec_update = {"is_recorded": True, "updated_at": datetime.utcnow()}
            if recording_url:
                rec_update["recording_url"] = recording_url
            if not existing_call.get("contact_name"):
                contact_name = await _resolve_contact_name(db, existing_call)
                if contact_name:
                    rec_update["contact_name"] = contact_name
            await db.telephony_calls.update_one(
                {"_id": existing_call["_id"]},
                {"$set": rec_update},
            )
            logger.info("Звонок %s: привязана запись %s", rec_pbx_call_id, recording_url)
        else:
            # Звонка ещё нет — сохраняем отдельным документом, чтобы не потерять запись
            await db.telephony_calls.insert_one({
                "phone_number": "",
                "normalized_phone": "",
                "direction": CallDirection.INBOUND.value,
                "status": CallStatus.ANSWERED.value,
                "disposition": Disposition.ANSWERED.value,
                "pbx_call_id": rec_pbx_call_id,
                "call_id": call_id_with_rec,
                "is_recorded": True,
                "duration": 0,
                "recording_url": recording_url,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "raw_payload": params,
            })
            logger.warning(
                "NOTIFY_RECORD: звонок %s не найден, запись сохранена отдельно",
                rec_pbx_call_id,
            )
        return {"status": "ok"}




    # Определяем направление

    if event in ("NOTIFY_START", "NOTIFY_ANSWER", "NOTIFY_END", "NOTIFY_RECORD"):

        direction = CallDirection.INBOUND

        # Для входящих — телефон звонящего

        phone = params.get("caller_id", "") or params.get("from", "")

    elif event in ("NOTIFY_OUT_START", "NOTIFY_OUT_END"):

        direction = CallDirection.OUTBOUND

        # Для исходящих — телефон вызываемого

        phone = params.get("to", "") or params.get("caller_id", "")

    else:

        logger.warning("Zadarma webhook: неизвестное событие %s", event)

        return {"status": "ok"}



    if not phone:

        logger.warning("Zadarma webhook: не удалось определить номер телефона")

        return {"status": "ok"}



    # Нормализуем телефон

    normalized_phone = _normalize_phone(phone)



    # Ищем пациента или создаём лид

    patient = await _find_patient_by_phone(db, phone)

    lead = None

    patient_id = None

    lead_id = None



    if patient:

        patient_id = str(patient.get("id") or patient.get("_id", ""))

    else:

        # Создаём лид, если пациента нет

        try:

            lead = await _find_or_create_lead(db, phone)

            if lead:

                lead_id = lead.get("id") or lead.get("_id", "")

        except Exception as e:

            logger.error("Ошибка создания лида: %s", e)



    # Определяем статус звонка

    call_status = CallStatus.MISSED

    disposition = None

    if event == "NOTIFY_START":

        call_status = CallStatus.MISSED

    elif event == "NOTIFY_ANSWER":

        call_status = CallStatus.ANSWERED

        disposition = Disposition.ANSWERED

    elif event == "NOTIFY_END":

        disp = params.get("disposition", "").lower()

        if disp == "answered":

            call_status = CallStatus.ANSWERED

            disposition = Disposition.ANSWERED

        elif disp in ("busy", "busy"):

            call_status = CallStatus.BUSY

            disposition = Disposition.BUSY

        elif disp in ("no answer", "no_answer"):

            call_status = CallStatus.MISSED

            disposition = Disposition.NO_ANSWER

        elif disp == "cancel":

            call_status = CallStatus.REJECTED

            disposition = Disposition.CANCEL

        else:

            call_status = CallStatus.MISSED

            disposition = Disposition.MISSED

    elif event == "NOTIFY_RECORD":

        call_status = CallStatus.ANSWERED

        disposition = Disposition.ANSWERED

    elif event == "NOTIFY_OUT_START":

        call_status = CallStatus.MISSED

    elif event == "NOTIFY_OUT_END":

        disp = params.get("disposition", "").lower()

        if disp == "answered":

            call_status = CallStatus.ANSWERED

            disposition = Disposition.ANSWERED

        elif disp == "busy":

            call_status = CallStatus.BUSY

            disposition = Disposition.BUSY

        else:

            call_status = CallStatus.MISSED

            disposition = Disposition.MISSED



    # Извлекаем длительность

    duration = 0

    try:

        duration = int(params.get("duration", 0))

    except (ValueError, TypeError):

        pass



    # ID звонка

    pbx_call_id = params.get("pbx_call_id", "") or params.get("call_id", "")

    call_id = params.get("call_id", "") or params.get("pbx_call_id", "")



    # URL записи (NOTIFY_RECORD)

    recording_url = params.get("recording_url", "") or params.get("recording", "")

    call_id_with_rec = params.get("call_id_with_rec", "") or call_id or pbx_call_id

    if event == "NOTIFY_RECORD" and call_id_with_rec and not recording_url:

        local_url, remote_url = await _download_call_record(call_id_with_rec)

        if local_url:

            recording_url = local_url

        elif remote_url:

            recording_url = remote_url



    # Проверяем, есть ли уже документ для этого pbx_call_id

    if pbx_call_id:
        existing_call = await db.telephony_calls.find_one({"pbx_call_id": pbx_call_id})
        if existing_call:
            # Обновляем существующий документ
            update = {
                "status": call_status.value,
                "disposition": disposition.value if disposition else None,
                "duration": duration,
                "updated_at": datetime.utcnow(),
            }
            if recording_url:
                update["recording_url"] = recording_url
            if event == "NOTIFY_RECORD":
                update["is_recorded"] = True
            if not existing_call.get("contact_name"):
                contact_name = await _resolve_contact_name(db, existing_call)
                if contact_name:
                    update["contact_name"] = contact_name

            await db.telephony_calls.update_one(
                {"_id": existing_call["_id"]},
                {"$set": update}
            )
            logger.info("Обновлён звонок %s: событие %s", pbx_call_id, event)
            return {"status": "ok"}


    # Создаём новый документ

    call_doc = {
        "phone_number": phone,
        "normalized_phone": normalized_phone,
        "direction": direction.value,
        "status": call_status.value,
        "disposition": disposition.value if disposition else None,
        "pbx_call_id": pbx_call_id,
        "call_id": call_id,
        "is_recorded": event == "NOTIFY_RECORD" or bool(recording_url),
        "duration": duration,
        "recording_url": recording_url or None,
        "patient_id": patient_id,
        "lead_id": lead_id,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "raw_payload": params,
    }

    # Подтягиваем имя контакта сразу при создании
    contact_name = await _resolve_contact_name(db, call_doc)
    if contact_name:
        call_doc["contact_name"] = contact_name

    await db.telephony_calls.insert_one(call_doc)
    logger.info(

        "Сохранён звонок %s: %s %s (%ds)",

        pbx_call_id or "(no id)", direction.value, phone, duration

    )



    return {"status": "ok"}





# ---------------------------------------------------------------------------

# Клик-ту-колл (авторизованный)

# ---------------------------------------------------------------------------



@router.post("/callbacks")

async def start_callback(

    body: dict = Body(...),

    current_user: User = Depends(get_current_user),

):

    """

    Инициировать звонок из CRM на номер пациента.



    Тело: {"phone": "+7...", "sip": "100" (опц.)}



    Использует клик-ту-колл Zadarma: POST /v1/request/callback/

    """

    phone = body.get("phone", "")

    if not phone:

        raise HTTPException(status_code=400, detail="Поле phone обязательно")



    sip = body.get("sip")



    try:

        result = await telephony_service.request_callback(phone, sip=sip)



        # Сохраняем исходящий звонок в историю

        db = get_database()
        normalized = _normalize_phone(phone)
        call_doc = {
            "phone_number": phone,
            "normalized_phone": normalized,
            "direction": CallDirection.OUTBOUND.value,
            "status": CallStatus.MISSED.value,  # пока статус неизвестен
            "duration": 0,
            "user_id": str(current_user.id) if hasattr(current_user, "id") else None,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        contact_name = await _resolve_contact_name(db, call_doc)
        if contact_name:
            call_doc["contact_name"] = contact_name
        await db.telephony_calls.insert_one(call_doc)


        return {

            "status": "success",

            "result": result,

        }

    except HTTPException:

        raise

    except Exception as e:

        raise HTTPException(

            status_code=500,

            detail=f"Ошибка инициации звонка: {str(e)}"

        )





# ---------------------------------------------------------------------------

# История звонков (авторизованный)

# ---------------------------------------------------------------------------



@router.get("/calls", response_model=List[TelephonyCall])

async def get_calls(
    phone: Optional[str] = Query(None, description="Фильтр по номеру телефона"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
):
    """История звонков с фильтрацией и пагинацией."""
    db = get_database()

    query = {}
    if phone:
        normalized = _normalize_phone(phone)
        query["normalized_phone"] = normalized

    cursor = db.telephony_calls.find(query, {"_id": 0}).sort("created_at", -1).skip(offset).limit(limit)
    calls = await cursor.to_list(length=limit)

    for call in calls:
        call["contact_name"] = await _resolve_contact_name(db, call)
    return calls




@router.get("/calls/{phone}", response_model=List[TelephonyCall])

async def get_calls_by_phone(
    phone: str,
    limit: int = Query(50, ge=1, le=500),
    current_user: User = Depends(get_current_user),
):
    """История звонков по конкретному пациенту (по номеру телефона)."""
    db = get_database()
    normalized = _normalize_phone(phone)

    cursor = db.telephony_calls.find(
        {"normalized_phone": normalized}, {"_id": 0}
    ).sort("created_at", -1).limit(limit)
    calls = await cursor.to_list(length=limit)

    for call in calls:
        call["contact_name"] = await _resolve_contact_name(db, call)
    return calls




# ---------------------------------------------------------------------------

# Health-check

# ---------------------------------------------------------------------------



@router.get("/health")

async def health_check():

    """Проверка работоспособности интеграции."""

    try:

        balance = await telephony_service.get_balance()

        return {

            "status": "healthy",

            "api_base": "https://api.zadarma.com",

            "balance": balance,

            "timestamp": datetime.now().isoformat(),

        }

    except HTTPException:

        raise

    except Exception as e:

        # Если ключи не заданы, баланс не получим — но это не ошибка роутера

        return {

            "status": "unhealthy",

            "error": str(e),

            "timestamp": datetime.now().isoformat(),

        }



