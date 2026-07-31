from fastapi import APIRouter, HTTPException, Depends, Query, Body
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
    MessageStatus
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
            channel_id=channel_id
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


# ========== WEBHOOK (для входящих сообщений) ==========

@router.post("/webhook/messages")
async def webhook_incoming_message(
    payload: dict = Body(...)
):
    """
    Webhook для обработки входящих сообщений от Wazzup24
    
    Этот эндпоинт должен быть настроен в кабинете Wazzup24
    
    Логика работы:
    1. Сохраняет входящее сообщение в MongoDB для истории
    2. При входящем сообщении проверяем, нет ли активного лида с этим телефоном
    3. Если нет активного лида - создаем новый лид в статусе "new" (НЕРАЗОБРАННЫЕ)
    4. Если есть активный лид - не создаем дубликат (это продолжение текущего обращения)
    """
    try:
        from database import get_database
        from crm.services.lead_service import LeadService
        from crm.schemas.lead_schemas import LeadCreate
        from crm.models.lead import LeadSource
        
        message_type = payload.get("type")
        
        if message_type == "incomingMessage":
            message_data = payload.get("message", {})
            contact_phone = message_data.get("chatId", "").split("@")[0]
            text = message_data.get("text", "")
            contact_name = message_data.get("userName", "")
            channel_id = message_data.get("channelId", "")
            message_id = message_data.get("messageId", "")
            msg_type = message_data.get("type", "text")
            media_url = message_data.get("mediaUrl")
            
            print(f"📨 Входящее сообщение от {contact_phone}: {text}")
            
            # Сохраняем входящее сообщение в БД
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
                    metadata=payload
                )
                print(f"💾 Сообщение сохранено в БД")
            except Exception as db_error:
                print(f"⚠️ Ошибка сохранения в БД: {db_error}")
            
            # Получаем базу данных (get_database уже возвращает готовую БД)
            from database import db as database
            lead_service = LeadService(database)
            
            # Проверяем, нет ли активного лида с этим телефоном
            existing_active_lead = await lead_service.get_active_lead_by_phone(contact_phone)
            
            if existing_active_lead:
                # Уже есть активный лид - не создаем дубликат
                print(f"Активный лид уже существует для {contact_phone}, ID: {existing_active_lead.id}")
                return {
                    "status": "ok",
                    "message": "Active lead already exists",
                    "lead_id": existing_active_lead.id
                }
            
            # Создаем нового лида
            # Пытаемся разбить имя на части
            name_parts = contact_name.split(" ") if contact_name else ["", ""]
            first_name = name_parts[0] if len(name_parts) > 0 else "Клиент"
            last_name = name_parts[1] if len(name_parts) > 1 else "WhatsApp"
            
            lead_data = LeadCreate(
                first_name=first_name,
                last_name=last_name,
                phone=contact_phone,
                source=LeadSource.SOCIAL,  # WhatsApp = соц.сети
                description=f"Обращение через WhatsApp: {text[:200]}"  # Первые 200 символов
            )
            
            new_lead = await lead_service.create_lead(lead_data, created_by="wazzup_webhook")
            
            print(f"🆕 Создан новый лид ID: {new_lead.id} для {contact_phone}")
            
            return {
                "status": "ok",
                "message": "New lead created",
                "lead_id": new_lead.id
            }
        
        return {"status": "ok", "message": "Event processed"}
        
    except Exception as e:
        # Не возвращаем ошибку, чтобы Wazzup24 не пытался повторно отправить webhook
        print(f"❌ Ошибка обработки webhook: {str(e)}")
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}


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
