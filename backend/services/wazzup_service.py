import os
import httpx
from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient

from models.wazzup import (
    WazzupContact,
    WazzupMessage,
    WazzupChannel,
    WazzupDialog,
    WazzupTemplate,
    WazzupMessageDB,
    SendMessageRequest,
    SendTemplateRequest,
    MessageType,
    MessageStatus
)
from database import get_database


class WazzupService:
    """Сервис для работы с Wazzup24 API"""
    
    def __init__(self):
        self.api_key = os.getenv("WAZZUP24_API_KEY")
        self.api_url = os.getenv("WAZZUP24_API_URL", "https://api.wazzup24.com/v3")
        
        if not self.api_key:
            raise ValueError("WAZZUP24_API_KEY не установлен в переменных окружения")
        
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
    
    async def _make_request(
        self, 
        method: str, 
        endpoint: str, 
        data: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Базовый метод для выполнения HTTP запросов к API"""
        url = f"{self.api_url}/{endpoint}"
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                if method == "GET":
                    response = await client.get(url, headers=self.headers, params=params)
                elif method == "POST":
                    response = await client.post(url, headers=self.headers, json=data)
                elif method == "PUT":
                    response = await client.put(url, headers=self.headers, json=data)
                elif method == "DELETE":
                    response = await client.delete(url, headers=self.headers)
                else:
                    raise ValueError(f"Неподдерживаемый HTTP метод: {method}")
                
                response.raise_for_status()
                return response.json()
            
            except httpx.HTTPStatusError as e:
                raise HTTPException(
                    status_code=e.response.status_code,
                    detail=f"Ошибка Wazzup24 API: {e.response.text}"
                )
            except httpx.RequestError as e:
                raise HTTPException(
                    status_code=500,
                    detail=f"Ошибка соединения с Wazzup24: {str(e)}"
                )
    
    # ========== РАБОТА С СООБЩЕНИЯМИ ==========
    
    async def send_message(self, request: SendMessageRequest) -> WazzupMessage:
        """Отправить текстовое сообщение"""
        # Форматируем телефон и создаем chatId
        phone = await self.format_phone(request.phone)
        # Убираем + для chatId
        phone_number = phone.replace("+", "")
        chat_id = f"{phone_number}@c.us"
        
        # Если channelId не указан, получаем первый доступный канал
        channel_id = request.channel_id
        if not channel_id:
            channels = await self.get_channels()
            if channels:
                channel_id = channels[0].id
            else:
                raise HTTPException(
                    status_code=500,
                    detail="Нет доступных каналов Wazzup24"
                )
        
        data = {
            "channelId": channel_id,
            "chatId": chat_id,
            "chatType": "whatsapp",
            "text": request.text
        }
        
        result = await self._make_request("POST", "message", data)
        
        message_id = result.get("messageId")
        sent_time = datetime.now()
        
        # Сохраняем отправленное сообщение в БД
        try:
            await self.save_message_to_db(
                message_id=message_id,
                channel_id=channel_id,
                phone=phone,
                message_type=MessageType.TEXT,
                text=request.text,
                direction="outgoing",
                status=MessageStatus.SENT,
                timestamp=sent_time
            )
        except Exception as e:
            # Логируем ошибку, но не прерываем процесс отправки
            print(f"⚠️ Не удалось сохранить сообщение в БД: {e}")
        
        return WazzupMessage(
            id=message_id,
            channel_id=channel_id,
            contact_phone=phone,
            message_type=MessageType.TEXT,
            text=request.text,
            status=MessageStatus.SENT,
            sent_at=sent_time
        )
    
    async def send_template(self, request: SendTemplateRequest) -> WazzupMessage:
        """Отправить шаблонное сообщение"""
        data = {
            "phone": request.phone,
            "message": {
                "type": "template",
                "template": {
                    "name": request.template_name,
                    "language": "ru"
                }
            }
        }
        
        if request.parameters:
            data["message"]["template"]["parameters"] = [
                {"type": "text", "text": param} for param in request.parameters
            ]
        
        if request.channel_id:
            data["channelId"] = request.channel_id
        
        result = await self._make_request("POST", "messages", data)
        
        return WazzupMessage(
            id=result.get("messageId"),
            channel_id=request.channel_id,
            contact_phone=request.phone,
            message_type=MessageType.TEMPLATE,
            status=MessageStatus.SENT,
            sent_at=datetime.now(),
            metadata={"template": request.template_name}
        )
    
    async def send_media(
        self, 
        phone: str, 
        media_url: str, 
        media_type: MessageType,
        caption: Optional[str] = None,
        channel_id: Optional[str] = None
    ) -> WazzupMessage:
        """Отправить медиа-сообщение (изображение, видео, документ)"""
        data = {
            "phone": phone,
            "message": {
                "type": media_type.value,
                "url": media_url
            }
        }
        
        if caption:
            data["message"]["caption"] = caption
        
        if channel_id:
            data["channelId"] = channel_id
        
        result = await self._make_request("POST", "messages", data)
        
        return WazzupMessage(
            id=result.get("messageId"),
            channel_id=channel_id,
            contact_phone=phone,
            message_type=media_type,
            media_url=media_url,
            caption=caption,
            status=MessageStatus.SENT,
            sent_at=datetime.now()
        )
    
    async def get_messages(
        self, 
        phone: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[WazzupMessage]:
        """Получить список сообщений"""
        params = {
            "limit": limit,
            "offset": offset
        }
        
        if phone:
            params["phone"] = phone
        
        result = await self._make_request("GET", "messages", params=params)
        
        messages = []
        for msg in result.get("messages", []):
            messages.append(WazzupMessage(
                id=msg.get("id"),
                channel_id=msg.get("channelId"),
                contact_phone=msg.get("phone"),
                message_type=MessageType(msg.get("type", "text")),
                text=msg.get("text"),
                media_url=msg.get("mediaUrl"),
                status=MessageStatus(msg.get("status", "sent")),
                sent_at=msg.get("sentAt"),
                delivered_at=msg.get("deliveredAt"),
                read_at=msg.get("readAt")
            ))
        
        return messages
    
    async def get_chat_messages(
        self,
        phone: str,
        channel_id: Optional[str] = None,
        limit: int = 100,
        before: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Получить всю историю сообщений с конкретным клиентом
        
        Args:
            phone: Номер телефона клиента
            channel_id: ID канала (если не указан, используется первый доступный)
            limit: Количество сообщений (максимум 100 за запрос)
            before: ID сообщения, до которого нужно получить историю (для пагинации)
        
        Returns:
            Dict с полной историей чата, включая входящие и исходящие сообщения
        """
        # Форматируем телефон и создаем chatId
        formatted_phone = await self.format_phone(phone)
        phone_number = formatted_phone.replace("+", "")
        chat_id = f"{phone_number}@c.us"
        
        # Если channelId не указан, получаем первый доступный канал
        if not channel_id:
            channels = await self.get_channels()
            if channels:
                channel_id = channels[0].id
            else:
                raise HTTPException(
                    status_code=500,
                    detail="Нет доступных каналов Wazzup24"
                )
        
        # Формируем параметры запроса
        params = {
            "chatId": chat_id,
            "limit": min(limit, 100)  # API ограничивает до 100
        }
        
        if before:
            params["before"] = before
        
        # Используем endpoint для получения сообщений чата
        endpoint = f"channels/{channel_id}/chats/{chat_id}/messages"
        
        try:
            result = await self._make_request("GET", endpoint, params=params)
            
            # Парсим сообщения
            messages = []
            raw_messages = result.get("messages", [])
            
            for msg in raw_messages:
                # Определяем направление сообщения (входящее/исходящее)
                from_me = msg.get("fromMe", False)
                
                message = WazzupMessage(
                    id=msg.get("id"),
                    channel_id=channel_id,
                    contact_phone=formatted_phone,
                    message_type=MessageType(msg.get("type", "text")),
                    text=msg.get("text"),
                    media_url=msg.get("mediaUrl"),
                    caption=msg.get("caption"),
                    status=MessageStatus(msg.get("status", "sent")) if from_me else MessageStatus.DELIVERED,
                    sent_at=msg.get("timestamp"),
                    delivered_at=msg.get("deliveredAt"),
                    read_at=msg.get("readAt"),
                    metadata={
                        "from_me": from_me,
                        "chat_id": chat_id,
                        "message_number": msg.get("messageNumber")
                    }
                )
                messages.append(message)
            
            return {
                "phone": formatted_phone,
                "chat_id": chat_id,
                "channel_id": channel_id,
                "messages": messages,
                "total_count": len(messages),
                "has_more": len(messages) >= limit
            }
            
        except HTTPException as e:
            # Если конкретный endpoint не работает, пробуем альтернативный способ
            if e.status_code == 404:
                # Используем общий endpoint с фильтром по телефону
                messages_result = await self.get_messages(phone=formatted_phone, limit=limit)
                return {
                    "phone": formatted_phone,
                    "chat_id": chat_id,
                    "channel_id": channel_id,
                    "messages": messages_result,
                    "total_count": len(messages_result),
                    "has_more": False
                }
            raise
    
    async def get_message_status(self, message_id: str) -> MessageStatus:
        """Получить статус сообщения"""
        result = await self._make_request("GET", f"messages/{message_id}")
        return MessageStatus(result.get("status", "sent"))
    
    # ========== РАБОТА С КОНТАКТАМИ ==========
    
    async def create_contact(self, contact: WazzupContact) -> WazzupContact:
        """Создать новый контакт"""
        data = {
            "phone": contact.phone,
            "name": contact.name,
            "email": contact.email,
            "tags": contact.tags or [],
            "customFields": contact.custom_fields or {}
        }
        
        result = await self._make_request("POST", "contacts", data)
        
        return WazzupContact(
            id=result.get("id"),
            phone=result.get("phone"),
            name=result.get("name"),
            email=result.get("email"),
            tags=result.get("tags", []),
            custom_fields=result.get("customFields", {}),
            created_at=datetime.now()
        )
    
    async def get_contact(self, phone: str) -> Optional[WazzupContact]:
        """Получить контакт по номеру телефона"""
        try:
            result = await self._make_request("GET", f"contacts/{phone}")
            
            return WazzupContact(
                id=result.get("id"),
                phone=result.get("phone"),
                name=result.get("name"),
                email=result.get("email"),
                tags=result.get("tags", []),
                custom_fields=result.get("customFields", {}),
                created_at=result.get("createdAt"),
                updated_at=result.get("updatedAt")
            )
        except HTTPException as e:
            if e.status_code == 404:
                return None
            raise
    
    async def update_contact(self, phone: str, contact: WazzupContact) -> WazzupContact:
        """Обновить контакт"""
        data = {
            "name": contact.name,
            "email": contact.email,
            "tags": contact.tags or [],
            "customFields": contact.custom_fields or {}
        }
        
        result = await self._make_request("PUT", f"contacts/{phone}", data)
        
        return WazzupContact(
            id=result.get("id"),
            phone=result.get("phone"),
            name=result.get("name"),
            email=result.get("email"),
            tags=result.get("tags", []),
            custom_fields=result.get("customFields", {}),
            updated_at=datetime.now()
        )
    
    async def get_contacts(
        self, 
        limit: int = 100, 
        offset: int = 0,
        tags: Optional[List[str]] = None
    ) -> List[WazzupContact]:
        """Получить список контактов"""
        params = {
            "limit": limit,
            "offset": offset
        }
        
        if tags:
            params["tags"] = ",".join(tags)
        
        result = await self._make_request("GET", "contacts", params=params)
        
        contacts = []
        for contact_data in result.get("contacts", []):
            contacts.append(WazzupContact(
                id=contact_data.get("id"),
                phone=contact_data.get("phone"),
                name=contact_data.get("name"),
                email=contact_data.get("email"),
                tags=contact_data.get("tags", []),
                custom_fields=contact_data.get("customFields", {})
            ))
        
        return contacts
    
    # ========== РАБОТА С КАНАЛАМИ ==========
    
    async def get_channels(self) -> List[WazzupChannel]:
        """Получить список каналов"""
        result = await self._make_request("GET", "channels")
        
        # API возвращает список напрямую, а не в объекте
        if isinstance(result, list):
            channel_list = result
        else:
            channel_list = result.get("channels", [])
        
        channels = []
        for channel_data in channel_list:
            channels.append(WazzupChannel(
                id=channel_data.get("channelId") or channel_data.get("id"),
                name=channel_data.get("name"),
                type=channel_data.get("transport") or channel_data.get("type"),
                phone=channel_data.get("plainId") or channel_data.get("phone"),
                status=channel_data.get("state") or channel_data.get("status"),
                created_at=channel_data.get("createdAt")
            ))
        
        return channels
    
    async def get_channel(self, channel_id: str) -> WazzupChannel:
        """Получить информацию о канале"""
        result = await self._make_request("GET", f"channels/{channel_id}")
        
        return WazzupChannel(
            id=result.get("id"),
            name=result.get("name"),
            type=result.get("type"),
            phone=result.get("phone"),
            status=result.get("status"),
            created_at=result.get("createdAt")
        )
    
    # ========== РАБОТА С ДИАЛОГАМИ ==========
    
    async def get_dialogs(
        self, 
        limit: int = 50,
        offset: int = 0,
        unread_only: bool = False
    ) -> List[WazzupDialog]:
        """Получить список диалогов"""
        params = {
            "limit": limit,
            "offset": offset
        }
        
        if unread_only:
            params["unreadOnly"] = "true"
        
        result = await self._make_request("GET", "dialogs", params=params)
        
        dialogs = []
        for dialog_data in result.get("dialogs", []):
            dialogs.append(WazzupDialog(
                contact_phone=dialog_data.get("phone"),
                contact_name=dialog_data.get("contactName"),
                last_message=dialog_data.get("lastMessage", {}).get("text"),
                last_message_time=dialog_data.get("lastMessageTime"),
                unread_count=dialog_data.get("unreadCount", 0),
                tags=dialog_data.get("tags", [])
            ))
        
        return dialogs
    
    # ========== РАБОТА С ШАБЛОНАМИ ==========
    
    async def get_templates(self) -> List[WazzupTemplate]:
        """Получить список шаблонов"""
        result = await self._make_request("GET", "templates")
        
        templates = []
        for template_data in result.get("templates", []):
            templates.append(WazzupTemplate(
                id=template_data.get("id"),
                name=template_data.get("name"),
                text=template_data.get("text"),
                parameters_count=len(template_data.get("parameters", [])),
                language=template_data.get("language", "ru"),
                status=template_data.get("status")
            ))
        
        return templates
    
    # ========== УТИЛИТЫ ==========
    
    async def format_phone(self, phone: str) -> str:
        """Форматировать номер телефона для API"""
        # Удаляем все символы кроме цифр и +
        phone = "".join(c for c in phone if c.isdigit() or c == "+")
        
        # Если номер начинается с 8 (русский/казахстанский формат), заменяем на +7
        if phone.startswith("8") and len(phone) == 11:
            phone = "+7" + phone[1:]
        # Если номер не начинается с +, добавляем +
        elif not phone.startswith("+"):
            phone = "+" + phone
        
        return phone
    
    async def send_appointment_reminder(
        self,
        patient_phone: str,
        patient_name: str,
        doctor_name: str,
        appointment_date: str,
        appointment_time: str
    ) -> WazzupMessage:
        """Отправить напоминание о приеме"""
        text = f"""Здравствуйте, {patient_name}!

Напоминаем о записи на прием:
👨‍⚕️ Врач: {doctor_name}
📅 Дата: {appointment_date}
🕐 Время: {appointment_time}

Если не сможете прийти, пожалуйста, отмените запись заранее.

С уважением, ваша клиника."""
        
        return await self.send_message(
            SendMessageRequest(
                phone=await self.format_phone(patient_phone),
                text=text
            )
        )
    
    async def send_appointment_confirmation(
        self,
        patient_phone: str,
        patient_name: str,
        doctor_name: str,
        appointment_date: str,
        appointment_time: str
    ) -> WazzupMessage:
        """Отправить подтверждение записи"""
        text = f"""Здравствуйте, {patient_name}!

Ваша запись успешно подтверждена:
👨‍⚕️ Врач: {doctor_name}
📅 Дата: {appointment_date}
🕐 Время: {appointment_time}

Ждем вас в клинике!"""
        
        return await self.send_message(
            SendMessageRequest(
                phone=await self.format_phone(patient_phone),
                text=text
            )
        )
    
    # ========== РАБОТА С MONGODB (История сообщений) ==========
    
    async def save_message_to_db(
        self,
        message_id: str,
        channel_id: str,
        phone: str,
        message_type: MessageType,
        text: Optional[str],
        direction: str,  # "incoming" или "outgoing"
        contact_name: Optional[str] = None,
        media_url: Optional[str] = None,
        status: MessageStatus = MessageStatus.SENT,
        timestamp: Optional[datetime] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Сохранить сообщение в MongoDB для истории"""
        db = get_database()
        
        formatted_phone = await self.format_phone(phone)
        phone_number = formatted_phone.replace("+", "")
        chat_id = f"{phone_number}@c.us"
        
        message_doc = {
            "message_id": message_id,
            "channel_id": channel_id,
            "chat_id": chat_id,
            "phone": formatted_phone,
            "contact_name": contact_name,
            "message_type": message_type.value if isinstance(message_type, MessageType) else message_type,
            "text": text,
            "media_url": media_url,
            "status": status.value if isinstance(status, MessageStatus) else status,
            "direction": direction,
            "timestamp": timestamp or datetime.now(),
            "created_at": datetime.now(),
            "metadata": metadata or {}
        }
        
        result = await db.wazzup_messages.insert_one(message_doc)
        return str(result.inserted_id)
    
    async def get_history_from_db(
        self,
        phone: str,
        limit: int = 100,
        skip: int = 0
    ) -> Dict[str, Any]:
        """Получить историю сообщений из MongoDB"""
        db = get_database()
        
        formatted_phone = await self.format_phone(phone)
        phone_number = formatted_phone.replace("+", "")
        chat_id = f"{phone_number}@c.us"
        
        # Получаем сообщения из БД, отсортированные по времени (новые первые)
        cursor = db.wazzup_messages.find(
            {"phone": formatted_phone}
        ).sort("timestamp", -1).skip(skip).limit(limit)
        
        messages_docs = await cursor.to_list(length=limit)
        
        # Преобразуем в WazzupMessage объекты
        messages = []
        for doc in messages_docs:
            message = WazzupMessage(
                id=doc.get("message_id"),
                channel_id=doc.get("channel_id"),
                contact_phone=doc.get("phone"),
                message_type=MessageType(doc.get("message_type", "text")),
                text=doc.get("text"),
                media_url=doc.get("media_url"),
                status=MessageStatus(doc.get("status", "sent")),
                sent_at=doc.get("timestamp"),
                metadata={
                    "from_me": doc.get("direction") == "outgoing",
                    "chat_id": doc.get("chat_id"),
                    "contact_name": doc.get("contact_name"),
                    **(doc.get("metadata", {}))
                }
            )
            messages.append(message)
        
        # Подсчитываем общее количество сообщений
        total_count = await db.wazzup_messages.count_documents({"phone": formatted_phone})
        
        return {
            "phone": formatted_phone,
            "chat_id": chat_id,
            "messages": messages,
            "total_count": total_count,
            "has_more": (skip + len(messages)) < total_count
        }


# Создаем единственный экземпляр сервиса
wazzup_service = WazzupService()
