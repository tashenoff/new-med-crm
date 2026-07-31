from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum
from bson import ObjectId


class MessageType(str, Enum):
    """Типы сообщений в Wazzup24"""
    TEXT = "text"
    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"
    DOCUMENT = "document"
    LOCATION = "location"
    CONTACT = "contact"
    TEMPLATE = "template"


class MessageStatus(str, Enum):
    """Статусы сообщений"""
    SENT = "sent"
    DELIVERED = "delivered"
    READ = "read"
    FAILED = "failed"


class WazzupContact(BaseModel):
    """Контакт в системе Wazzup24"""
    id: Optional[str] = None
    phone: str
    name: Optional[str] = None
    email: Optional[str] = None
    tags: Optional[List[str]] = []
    custom_fields: Optional[Dict[str, Any]] = {}
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class WazzupMessage(BaseModel):
    """Сообщение в Wazzup24"""
    id: Optional[str] = None
    channel_id: Optional[str] = None
    contact_phone: str
    message_type: MessageType = MessageType.TEXT
    text: Optional[str] = None
    media_url: Optional[str] = None
    caption: Optional[str] = None
    status: Optional[MessageStatus] = MessageStatus.SENT
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    read_at: Optional[datetime] = None
    metadata: Optional[Dict[str, Any]] = {}


class WazzupWebhookMessage(BaseModel):
    """Входящее сообщение от вебхука Wazzup24"""
    message_id: str
    channel_id: str
    from_phone: str
    to_phone: str
    message_type: str
    text: Optional[str] = None
    media_url: Optional[str] = None
    timestamp: datetime
    contact_name: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = {}


class SendMessageRequest(BaseModel):
    """Запрос на отправку сообщения"""
    phone: str = Field(..., description="Номер телефона получателя в международном формате")
    text: str = Field(..., description="Текст сообщения")
    channel_id: Optional[str] = Field(None, description="ID канала для отправки")


class SendTemplateRequest(BaseModel):
    """Запрос на отправку шаблонного сообщения"""
    phone: str = Field(..., description="Номер телефона получателя")
    template_name: str = Field(..., description="Название шаблона")
    parameters: Optional[List[str]] = Field([], description="Параметры для шаблона")
    channel_id: Optional[str] = None


class WazzupChannel(BaseModel):
    """Канал в Wazzup24"""
    id: str
    name: str
    type: str  # whatsapp, telegram, viber, etc.
    phone: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None


class WazzupDialog(BaseModel):
    """Диалог с контактом"""
    contact_phone: str
    contact_name: Optional[str] = None
    last_message: Optional[str] = None
    last_message_time: Optional[datetime] = None
    unread_count: int = 0
    tags: Optional[List[str]] = []


class WazzupTemplate(BaseModel):
    """Шаблон сообщения"""
    id: str
    name: str
    text: str
    parameters_count: int = 0
    language: str = "ru"
    status: str


# MongoDB модель для хранения истории сообщений
class WazzupMessageDB(BaseModel):
    """Модель сообщения для хранения в MongoDB"""
    id: Optional[str] = Field(default=None, alias="_id")
    message_id: str  # ID сообщения от Wazzup24
    channel_id: str
    chat_id: str  # phone@c.us
    phone: str  # Нормализованный номер телефона (+7...)
    contact_name: Optional[str] = None
    message_type: MessageType = MessageType.TEXT
    text: Optional[str] = None
    media_url: Optional[str] = None
    caption: Optional[str] = None
    status: MessageStatus = MessageStatus.SENT
    direction: str = Field(..., description="incoming или outgoing")
    timestamp: datetime
    created_at: datetime = Field(default_factory=datetime.now)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    class Config:
        populate_by_name = True
        json_encoders = {
            ObjectId: str,
            datetime: lambda v: v.isoformat()
        }
