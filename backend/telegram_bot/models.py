"""
Модели для Telegram бота
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, Literal, Any
from datetime import datetime
from bson import ObjectId


class TelegramUser(BaseModel):
    """Модель пользователя Telegram"""
    id: Optional[str] = Field(default=None, alias="_id")
    
    @field_validator('id', mode='before')
    @classmethod
    def convert_objectid(cls, v: Any) -> Optional[str]:
        """Конвертирует ObjectId в строку"""
        if isinstance(v, ObjectId):
            return str(v)
        return v
    telegram_id: int  # ID пользователя в Telegram
    phone_number: Optional[str] = None  # Номер телефона
    username: Optional[str] = None  # Username в Telegram
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    role: Optional[Literal["admin", "doctor", "patient"]] = None  # Роль пользователя
    is_authorized: bool = False  # Авторизован ли пользователь
    auth_code: Optional[str] = None  # Код авторизации
    auth_code_expires: Optional[datetime] = None  # Время истечения кода
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    
    # Связь с сущностями в основной БД
    patient_id: Optional[str] = None  # ID пациента в основной БД
    doctor_id: Optional[str] = None  # ID врача в основной БД

    class Config:
        populate_by_name = True
        json_encoders = {
            ObjectId: str,
            datetime: lambda v: v.isoformat()
        }


class VerificationCode(BaseModel):
    """Модель кода верификации"""
    phone_number: str
    code: str
    telegram_id: int
    created_at: datetime = Field(default_factory=datetime.now)
    expires_at: datetime
    is_used: bool = False
