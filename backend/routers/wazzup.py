from fastapi import APIRouter, HTTPException, Depends, Query, Body, File, UploadFile
import os
import uuid
import httpx
from pathlib import Path
from typing import List, Optional
from datetime import datetime

from models.wazzup import (
    WazzupContact,
    WazzupMessage,
    WazzupChannel,
    WazzupDialog,
    WazzupTemplate,
    SendMessageRequest,
    SendTemplateRequest,
    MessageType,
    MessageStatus,
    WazzupChatUpdate
)
from services.wazzup_service import wazzup_service
from dependencies import get_current_user
from models.auth import User

router = APIRouter(prefix="/api/wazzup", tags=["Wazzup24"])


# ========== СООБЩЕНИЯ ==========

@router.post("/messages/send", response_model=WazzupMessage)
async def send_message(
    request: SendMessageRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Отправить текстовое сообщение через Wazzup24
    
    - **phone**: Номер телефона получателя в международном формате (+996...)
    - **text**: Текст сообщения
    - **channel_id**: (опционально) ID канала для отправки
    """
    try:
        return await wazzup_service.send_message(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка отправки сообщения: {str(e)}")


@router.post("/messages/send-template", response_model=WazzupMessage)
async def send_template_message(
    request: SendTemplateRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Отправить шаблонное сообщение
    
    - **phone**: Номер телефона получателя
    - **template_name**: Название шаблона
    - **parameters**: Параметры для подстановки в шаблон
    """
    try:
        return await wazzup_service.send_template(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка отправки шаблона: {str(e)}")


@router.post("/messages/send-media", response_model=WazzupMessage)
async def send_media_message(
    phone: str = Body(..., description="Номер телефона получателя"),
    media_url: str = Body(..., description="URL файла для отправки"),
    media_type: MessageType = Body(..., description="Тип медиа (image, video, document)"),
    caption: Optional[str] = Body(None, description="Подпись к медиа"),
    channel_id: Optional[str] = Body(None, description="ID канала"),
    original_filename: Optional[str] = Body(None, description="Оригинальное имя файла (для документов пациента)"),
    current_user: User = Depends(get_current_user)
):
    """
    Отправить медиа-файл (изображение, видео, документ)
    """
    try:
        return await wazzup_service.send_media(
            phone=phone,
            media_url=media_url,
            media_type=media_type,
            caption=caption,
            channel_id=channel_id,
            original_filename=original_filename
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка отправки медиа: {str(e)}")


@router.get("/messages", response_model=List[WazzupMessage])
async def get_messages(
    phone: Optional[str] = Query(None, description="Фильтр по номеру телефона"),
    limit: int = Query(100, ge=1, le=500, description="Количество сообщений"),
    offset: int = Query(0, ge=0, description="Смещение"),
    current_user: User = Depends(get_current_user)
):
    """
    Получить список сообщений
    """
    try:
        return await wazzup_service.get_messages(phone=phone, limit=limit, offset=offset)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка получения сообщений: {str(e)}")


@router.get("/messages/chat/{phone}")
async def get_chat_messages(
    phone: str,
    channel_id: Optional[str] = Query(None, description="ID канала"),
    limit: int = Query(100, ge=1, le=100, description="Количество сообщений"),
    before: Optional[str] = Query(None, description="ID сообщения для пагинации"),
    current_user: User = Depends(get_current_user)
):
    """
    Получить всю историю сообщений с конкретным клиентом
    
    Этот endpoint возвращает полную историю переписки с клиентом,
    включая входящие и исходящие сообщения.
    
    - **phone**: Номер телефона клиента (формат: +996... или 87781647391)
    - **channel_id**: (опционально) ID канала WhatsApp
    - **limit**: Количество сообщений (максимум 100)
    - **before**: ID последнего сообщения из предыдущего запроса (для загрузки более старых)
    
    Пример ответа:
    ```json
    {
        "phone": "+77781647391",
        "chat_id": "77781647391@c.us",
        "channel_id": "abc123",
        "messages": [
            {
                "id": "msg123",
                "text": "Здравствуйте",
                "sent_at": "2026-03-18T14:25:00",
                "metadata": {
                    "from_me": false
                }
            }
        ],
        "total_count": 10,
        "has_more": false
    }
    ```
    """
    try:
        return await wazzup_service.get_chat_messages(
            phone=phone,
            channel_id=channel_id,
            limit=limit,
            before=before
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка получения истории чата: {str(e)}")


@router.get("/messages/{message_id}/status")
async def get_message_status(
    message_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Получить статус сообщения
    """
    try:
        status = await wazzup_service.get_message_status(message_id)
        return {"message_id": message_id, "status": status}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка получения статуса: {str(e)}")


# ========== КОНТАКТЫ ==========

@router.post("/contacts", response_model=WazzupContact)
async def create_contact(
    contact: WazzupContact,
    current_user: User = Depends(get_current_user)
):
    """
    Создать новый контакт в Wazzup24
    
    - **phone**: Номер телефона (обязательно)
    - **name**: Имя контакта
    - **email**: Email
    - **tags**: Теги для группировки
    - **custom_fields**: Дополнительные поля
    """
    try:
        return await wazzup_service.create_contact(contact)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка создания контакта: {str(e)}")


@router.get("/contacts/{phone}", response_model=Optional[WazzupContact])
async def get_contact(
    phone: str,
    current_user: User = Depends(get_current_user)
):
    """
    Получить контакт по номеру телефона
    """
    try:
        contact = await wazzup_service.get_contact(phone)
        if not contact:
            raise HTTPException(status_code=404, detail="Контакт не найден")
        return contact
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка получения контакта: {str(e)}")


@router.put("/contacts/{phone}", response_model=WazzupContact)
async def update_contact(
    phone: str,
    contact: WazzupContact,
    current_user: User = Depends(get_current_user)
):
    """
    Обновить контакт
    """
    try:
        return await wazzup_service.update_contact(phone, contact)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка обновления контакта: {str(e)}")


@router.get("/contacts", response_model=List[WazzupContact])
async def get_contacts(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    tags: Optional[str] = Query(None, description="Фильтр по тегам (через запятую)"),
    current_user: User = Depends(get_current_user)
):
    """
    Получить список контактов
    """
    try:
        tags_list = tags.split(",") if tags else None
        return await wazzup_service.get_contacts(limit=limit, offset=offset, tags=tags_list)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка получения контактов: {str(e)}")


# ========== КАНАЛЫ ==========

@router.get("/channels", response_model=List[WazzupChannel])
async def get_channels(
    current_user: User = Depends(get_current_user)
):
    """
    Получить список всех каналов
    """
    try:
        return await wazzup_service.get_channels()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка получения каналов: {str(e)}")


@router.get("/channels/{channel_id}", response_model=WazzupChannel)
async def get_channel(
    channel_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Получить информацию о канале
    """
    try:
        return await wazzup_service.get_channel(channel_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка получения канала: {str(e)}")


# ========== ДИАЛОГИ ==========

@router.get("/dialogs", response_model=List[WazzupDialog])
async def get_dialogs(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    unread_only: bool = Query(False, description="Показывать только непрочитанные"),
    current_user: User = Depends(get_current_user)
):
    """
    Получить список диалогов
    """
    try:
        return await wazzup_service.get_dialogs(
            limit=limit,
            offset=offset,
            unread_only=unread_only
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка получения диалогов: {str(e)}")


# ========== ШАБЛОНЫ ==========

@router.get("/templates", response_model=List[WazzupTemplate])
async def get_templates(
    current_user: User = Depends(get_current_user)
):
    """
    Получить список шаблонов сообщений
    """
    try:
        return await wazzup_service.get_templates()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка получения шаблонов: {str(e)}")


# ========== УТИЛИТЫ ==========

@router.post("/appointments/send-reminder")
async def send_appointment_reminder(
    patient_phone: str = Body(...),
    patient_name: str = Body(...),
    doctor_name: str = Body(...),
    appointment_date: str = Body(...),
    appointment_time: str = Body(...),
    current_user: User = Depends(get_current_user)
):
    """
    Отправить напоминание пациенту о записи на прием
    """
    try:
        message = await wazzup_service.send_appointment_reminder(
            patient_phone=patient_phone,
            patient_name=patient_name,
            doctor_name=doctor_name,
            appointment_date=appointment_date,
            appointment_time=appointment_time
        )
        return {
            "success": True,
            "message_id": message.id,
            "status": "sent"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка отправки напоминания: {str(e)}")


@router.post("/appointments/send-confirmation")
async def send_appointment_confirmation(
    patient_phone: str = Body(...),
    patient_name: str = Body(...),
    doctor_name: str = Body(...),
    appointment_date: str = Body(...),
    appointment_time: str = Body(...),
    current_user: User = Depends(get_current_user)
):
    """
    Отправить подтверждение записи на прием
    """
    try:
        message = await wazzup_service.send_appointment_confirmation(
            patient_phone=patient_phone,
            patient_name=patient_name,
            doctor_name=doctor_name,
            appointment_date=appointment_date,
            appointment_time=appointment_time
        )
        return {
            "success": True,
            "message_id": message.id,
            "status": "sent"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка отправки подтверждения: {str(e)}")


@router.post("/phone/format")
async def format_phone(
    phone: str = Body(..., embed=True),
    current_user: User = Depends(get_current_user)
):
    """
    Форматировать номер телефона для API
    """
    try:
        formatted = await wazzup_service.format_phone(phone)
        return {"original": phone, "formatted": formatted}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка форматирования: {str(e)}")




# ========== ЧАТЫ (Инбокс) ==========

@router.get("/chats")
async def list_chats(
    status: Optional[str] = Query(None, description="Фильтр по статусу (этап воронки лида)"),
    assigned_manager_id: Optional[str] = Query(None, description="Фильтр по менеджеру"),
    search: Optional[str] = Query(None, description="Поиск по имени или телефону"),
    limit: int = Query(100, ge=1, le=500),
    skip: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
):
    from database import get_database
    from services.wazzup_chat_service import WazzupChatService
    svc = WazzupChatService(get_database())
    chats = await svc.list_chats(
        status=status, assigned_manager_id=assigned_manager_id,
        search=search, limit=limit, skip=skip,
    )
    return {"chats": chats, "total": len(chats)}


@router.get("/chats/{phone}")
async def get_chat(
    phone: str,
    current_user: User = Depends(get_current_user),
):
    from database import get_database
    from services.wazzup_chat_service import WazzupChatService
    svc = WazzupChatService(get_database())
    chat = await svc.get_chat(phone)
    if not chat:
        raise HTTPException(status_code=404, detail="Чат не найден")
    return chat


@router.patch("/chats/{phone}")
async def update_chat(
    phone: str,
    update: WazzupChatUpdate,
    current_user: User = Depends(get_current_user),
):
    from database import get_database
    from services.wazzup_chat_service import WazzupChatService
    db = get_database()
    svc = WazzupChatService(db)

    chat = await svc.get_chat(phone)
    if not chat:
        raise HTTPException(status_code=404, detail="Чат не найден")

    changed = update.model_fields_set
    if "status" in changed and update.status is not None:
        await svc.set_field(phone, "status", update.status)
        # Статус чата = статус лида (воронка реюзится): синхронизируем лид.
        lead_id = chat.get("linked_lead_id")
        if lead_id:
            try:
                from crm.services.lead_service import LeadService
                from crm.models.lead import LeadStatus
                await LeadService(db).update_lead_status(lead_id, LeadStatus(update.status))
            except Exception as e:
                print(f"Не удалось синхронизировать статус лида {lead_id}: {e}")

    for field in ("assigned_manager_id", "linked_patient_id"):
        if field in changed and getattr(update, field) is not None:
            await svc.set_field(phone, field, getattr(update, field))

    updated = await svc.get_chat(phone)
    return updated



# ========== ЗАГРУЗКА ФАЙЛОВ ДЛЯ ОТПРАВКИ В WHATSAPP ==========

_WAZZUP_MEDIA_EXT = {
    "image": {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"},
    "video": {".mp4", ".webm", ".mov", ".mkv", ".avi"},
    "audio": {".mp3", ".wav", ".m4a", ".ogg", ".aac", ".opus"},
    "document": {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv", ".zip", ".rar", ".7z", ".rtf"},
}
_ALLOWED_WAZZUP_EXT = set().union(*_WAZZUP_MEDIA_EXT.values())
_MAX_MEDIA_BYTES = 50 * 1024 * 1024


@router.post("/media/upload")
async def upload_wa_media(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Загрузить файл для отправки пациенту в WhatsApp.

    Файл кладётся в /uploads и возвращается относительный URL, который фронт
    превращает в абсолютный и передаёт в /wazzup/messages/send-media.
    media_type определяется по расширению (image/video/audio/document).
    """
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED_WAZZUP_EXT:
        raise HTTPException(status_code=400, detail=f"Недопустимый тип файла: {ext or 'без расширения'}")
    media_type = next((t for t, exts in _WAZZUP_MEDIA_EXT.items() if ext in exts), "document")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Пустой файл")
    if len(content) > _MAX_MEDIA_BYTES:
        raise HTTPException(status_code=400, detail="Файл слишком большой (лимит 50 МБ)")

    name = f"wazzup_{uuid.uuid4().hex}{ext}"
    upload_dir = Path("uploads")
    upload_dir.mkdir(exist_ok=True)
    (upload_dir / name).write_bytes(content)

    return {
        "relative_url": f"/uploads/{name}",
        "media_type": media_type,
        "filename": file.filename,
    }

# ========== WEBHOOK (для входящих сообщений) ==========

_WAZZUP_MSG_TYPES = {"text", "image", "video", "audio", "document"}


def _extract_incoming_messages(payload: dict) -> list:
    """Входящие сообщения из вебхука Wazzup.

    v3: {"messages": [{"chatId", "text", "isEcho": false, ...}]}.
    Старый формат {type: "incomingMessage", message: {...}} поддерживаем тоже.
    Исходящие эхо (isEcho=true) и статусы пропускаем.
    """
    items = []
    if isinstance(payload.get("messages"), list):
        items = [m for m in payload["messages"] if isinstance(m, dict) and not m.get("isEcho")]
    elif payload.get("type") == "incomingMessage" and isinstance(payload.get("message"), dict):
        items = [payload["message"]]
    return items


async def _process_incoming_message(message_data: dict) -> None:
    """Сохранить входящее, провести через опрос обратной связи, иначе завести лид."""
    from database import db as database
    from crm.services.lead_service import LeadService
    from crm.schemas.lead_schemas import LeadCreate
    from crm.models.lead import LeadSource
    from services.feedback_service import FeedbackService
    from models.wazzup import SendMessageRequest

    contact_phone = str(message_data.get("chatId", "")).split("@")[0]
    text = message_data.get("text", "") or ""
    contact = message_data.get("contact") or {}
    contact_name = message_data.get("userName", "") or (contact.get("name", "") if isinstance(contact, dict) else "")
    channel_id = message_data.get("channelId", "")
    message_id = message_data.get("messageId", "")
    msg_type = message_data.get("type", "text")
    # Голосовые в WhatsApp могут приходить как audio/ptt/voice — сводим к audio.
    if msg_type in ("audio", "ptt", "voice", "audio_message", "round_play"):
        msg_type = "audio"
    if msg_type not in _WAZZUP_MSG_TYPES:
        msg_type = "text"
    media_url = message_data.get("contentUri") or message_data.get("mediaUrl")
    filename = (message_data.get("fileName") or message_data.get("filename")
                or (media_url.split("?")[0].rsplit("/", 1)[-1] if media_url else ""))

    print(f"Входящее сообщение от {contact_phone}: {text}")

    async def _upsert_chat(lead_id=None, lead_status=None):
        from services.wazzup_chat_service import WazzupChatService
        await WazzupChatService(database).upsert_incoming(
            phone=contact_phone,
            contact_name=contact_name,
            text=text,
            channel_id=channel_id,
            ts=datetime.now(),
            linked_lead_id=lead_id,
            status=lead_status,
        )


    try:
        await wazzup_service.save_message_to_db(
            message_id=message_id,
            channel_id=channel_id,
            phone=contact_phone,
            message_type=MessageType(msg_type),
            text=text,
            direction="incoming",
            contact_name=contact_name,
            media_url=media_url,
            status=MessageStatus.DELIVERED,
            timestamp=datetime.now(),
            metadata={**message_data, "filename": filename},
        )
    except Exception as db_error:
        print(f"Ошибка сохранения в БД: {db_error}")

    # Входящее медиа (файл/картинка/видео/голосовое): скачиваем локально в /uploads,
    # чтобы в переписке можно было проиграть, и дублируем в Документы пациента.
    if msg_type in ("image", "video", "audio", "document") and media_url:
        try:
            import uuid as _uuid
            import os as _os
            from pathlib import Path
            from services.wazzup_chat_service import WazzupChatService
            from services.document_service import DocumentService

            local_name = None
            # Уже локально (наш клиент положил) — не качаем повторно.
            if media_url.startswith("/uploads/") or "/uploads/" in media_url.split("?")[0]:
                local_name = media_url.split("?")[0].rsplit("/", 1)[-1]
            else:
                _url = media_url.split("?")[0]
                _ext = _os.path.splitext(_url)[1][:8] or (f".{msg_type}" if msg_type != "audio" else ".mp3")
                name = f"wazzup_{_uuid.uuid4().hex}{_ext}"
                async with httpx.AsyncClient(timeout=40) as _ac:
                    _r = await _ac.get(media_url)
                if _r.status_code == 200 and _r.content:
                    (Path("uploads") / name).write_bytes(_r.content)
                    local_name = name

            if local_name:
                # Обновляем media_url сообщения на локальный (для проигрывания в чате).
                await database.wazzup_messages.update_one(
                    {"message_id": message_id},
                    {"$set": {"media_url": f"/uploads/{local_name}"}},
                )
                # Имя файла для голосового.
                disp_name = filename or (local_name if local_name != "" else "")
                if msg_type == "audio" and not filename:
                    disp_name = "Голосовое сообщение"

                chat_svc = WazzupChatService(database)
                chat = await chat_svc.get_chat(contact_phone)
                pid = chat.get("patient_id") if chat else None
                if pid:
                    await DocumentService(database, Path("uploads")).add_patient_file(
                        patient_id=pid,
                        src_filename=local_name,
                        original_filename=disp_name,
                        content_type=msg_type,
                        uploaded_by="whatsapp",
                        uploaded_by_name="WhatsApp (клиент)",
                        description="Файл прислан пациентом по WhatsApp",
                    )
                print(f"Входящее медиа {local_name} локализовано (тип {msg_type})")
        except Exception as e:
            print(f"Не удалось локализовать/сохранить входящее медиа: {e}")

    lead_service = LeadService(database)

    existing_active_lead = await lead_service.get_active_lead_by_phone(contact_phone)

    await _trigger_auto_ai_analysis(contact_phone, contact_name)

    # Ответ на опрос обратной связи (оценка 1-10 / причина) — лид не создаём.
    try:
        result = await FeedbackService(database).handle_incoming(contact_phone, text)
        if result.get("consumed"):
            if result.get("reply"):
                await wazzup_service.send_message(
                    SendMessageRequest(phone=result["reply"]["phone"], text=result["reply"]["text"])
                )
                print(f"Ответ обратной связи отправлен {result['reply']['phone']}")
            print(f"Сообщение — ответ на опрос обратной связи, лид не создаём ({contact_phone})")
            await _upsert_chat(
                lead_id=(str(existing_active_lead.id) if existing_active_lead else None),
                lead_status=(existing_active_lead.status if existing_active_lead else None),
            )
            return
    except Exception as fe:
        print(f"Ошибка обработки обратной связи: {fe}")

    if existing_active_lead:
        print(f"Активный лид уже существует для {contact_phone}, ID: {existing_active_lead.id}")
        await _upsert_chat(str(existing_active_lead.id), existing_active_lead.status)
        return

    name_parts = contact_name.split(" ") if contact_name else ["", ""]
    first_name = name_parts[0] if len(name_parts) > 0 and name_parts[0] else "Клиент"
    last_name = name_parts[1] if len(name_parts) > 1 else "WhatsApp"

    lead_data = LeadCreate(
        first_name=first_name,
        last_name=last_name,
        phone=contact_phone,
        source=LeadSource.SOCIAL,
        description=f"Обращение через WhatsApp: {text[:200]}",
    )
    new_lead = await lead_service.create_lead(lead_data, created_by="wazzup_webhook")
    print(f"Создан новый лид ID: {new_lead.id} для {contact_phone}")
    await _upsert_chat(str(new_lead.id), new_lead.status)


@router.post("/webhook/messages")
async def webhook_incoming_message(
    payload: dict = Body(...)
):
    """Вебхук входящих сообщений Wazzup24.

    v3 присылает {"messages": [...]} и {"statuses": [...]}; при подключении
    шлёт тестовый POST {test: true} и ждёт 200. Старый формат
    {type: "incomingMessage"} тоже принимаем.
    """
    if payload.get("test") is True:
        return {"status": "ok"}
    try:
        for message_data in _extract_incoming_messages(payload):
            await _process_incoming_message(message_data)
        return {"status": "ok", "message": "Event processed"}
    except Exception as e:
        # Не возвращаем ошибку, чтобы Wazzup24 не слал вебхук повторно
        print(f"Ошибка обработки webhook: {str(e)}")
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}


async def _trigger_auto_ai_analysis(phone: str, contact_name: Optional[str] = None):
    """
    Автоматический AI-анализ диалога
    Запускается в фоне при получении входящего сообщения
    """
    try:
        from services.ai_quality_service import ai_quality_service
        from database import db
        
        # Проверяем, включен ли автоматический анализ
        if not await ai_quality_service.is_analysis_enabled():
            print("🤖 AI-анализ отключен в настройках")
            return
        
        settings = await ai_quality_service.get_settings()
        
        # Получаем историю сообщений для анализа
        history = await wazzup_service.get_history_from_db(phone, limit=settings.ai_batch_size, skip=0)
        messages = history.get("messages", [])
        
        if len(messages) < 3:
            print(f"🤖 Недостаточно сообщений для анализа ({len(messages)} < 3)")
            return
        
        # Проверяем, есть ли новый анализ за последние 10 минут
        from datetime import timedelta
        recent_cutoff = datetime.utcnow() - timedelta(minutes=10)
        recent_analysis = await db.service_quality_analyses.find_one({
            "phone": {"$regex": phone[-10:]},
            "analyzed_at": {"$gte": recent_cutoff}
        })
        
        if recent_analysis:
            print(f"🤖 Недавний анализ уже есть для {phone}, пропускаем")
            return
        
        # Преобразуем сообщения в нужный формат
        formatted_messages = []
        for msg in messages:
            formatted_messages.append({
                "message_id": msg.id,
                "text": msg.text,
                "direction": "outgoing" if msg.metadata.get("from_me") else "incoming",
                "timestamp": msg.sent_at,
                "contact_name": msg.metadata.get("contact_name") or contact_name
            })
        
        # Определяем оператора
        operator_id = "system"
        operator_name = "Оператор"
        operator_email = None
        
        # Пытаемся найти менеджера, привязанного к лиду
        from crm.services.lead_service import LeadService
        lead_service = LeadService(db)
        lead = await lead_service.get_active_lead_by_phone(phone)
        if lead and lead.assigned_manager_id:
            manager = await db.users.find_one({"_id": lead.assigned_manager_id})
            if manager:
                operator_id = str(manager.get("_id"))
                operator_name = manager.get("full_name", "Оператор")
                operator_email = manager.get("email")
        
        # Запускаем анализ
        print(f"🤖 Запуск AI-анализа диалога с {phone}...")
        analysis = await ai_quality_service.analyze_conversation(
            messages=formatted_messages,
            operator_id=operator_id,
            operator_name=operator_name,
            operator_email=operator_email,
            phone=phone,
            contact_name=contact_name
        )
        
        if analysis:
            print(f"AI-анализ завершён! Оценка: {analysis.overall_score}/5 ({analysis.overall_rating.value})")
        else:
            print(f"AI-анализ не удался или был пропущен")
            
    except Exception as e:
        print(f"Ошибка автоматического AI-анализа: {e}")
        import traceback
        traceback.print_exc()


# ========== ИСТОРИЯ СООБЩЕНИЙ (из MongoDB) ==========

@router.get("/messages/history/{phone}")
async def get_message_history(
    phone: str,
    limit: int = Query(100, ge=1, le=500, description="Количество сообщений"),
    skip: int = Query(0, ge=0, description="Пропустить первые N сообщений"),
    current_user: User = Depends(get_current_user)
):
    """
    Получить историю сообщений с клиентом из MongoDB
    
    Этот endpoint возвращает историю переписки, которая была сохранена в БД:
    - Исходящие сообщения (отправленные через CRM)
    - Входящие сообщения (полученные через webhook)
    
    Сообщения отсортированы по времени (новые первые).
    """
    try:
        return await wazzup_service.get_history_from_db(
            phone=phone,
            limit=limit,
            skip=skip
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Ошибка получения истории: {str(e)}"
        )


@router.get("/health")
async def health_check():
    """
    Проверка работоспособности интеграции
    """
    try:
        # Проверяем доступность API
        channels = await wazzup_service.get_channels()
        return {
            "status": "healthy",
            "api_url": wazzup_service.api_url,
            "channels_count": len(channels),
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }
