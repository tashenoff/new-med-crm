"""
Работа с базой данных для Telegram бота
"""
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timedelta
import random
import string
from typing import Optional
from .config import (
    MONGO_URL, 
    DB_NAME, 
    TELEGRAM_USERS_COLLECTION, 
    VERIFICATION_CODES_COLLECTION,
    AUTH_CODE_LENGTH,
    AUTH_CODE_EXPIRY_MINUTES,
    TELEGRAM_ADMIN_ID
)
from .models import TelegramUser, VerificationCode


class TelegramDatabase:
    """Класс для работы с базой данных Telegram бота"""
    
    def __init__(self):
        self.client = AsyncIOMotorClient(MONGO_URL)
        self.db = self.client[DB_NAME]
        self.users = self.db[TELEGRAM_USERS_COLLECTION]
        self.verification_codes = self.db[VERIFICATION_CODES_COLLECTION]
        
        # Коллекции из основной БД
        self.patients = self.db["patients"]
        self.doctors = self.db["doctors"]
    
    async def init_indexes(self):
        """Создание индексов"""
        await self.users.create_index("telegram_id", unique=True)
        await self.users.create_index("phone_number")
        await self.verification_codes.create_index("phone_number")
        await self.verification_codes.create_index(
            "created_at", 
            expireAfterSeconds=AUTH_CODE_EXPIRY_MINUTES * 60
        )
    
    async def get_or_create_user(self, telegram_id: int, username: str = None, 
                                 first_name: str = None, last_name: str = None) -> TelegramUser:
        """Получить или создать пользователя"""
        user_data = await self.users.find_one({"telegram_id": telegram_id})
        
        if user_data:
            return TelegramUser(**user_data)
        
        # Проверяем, является ли пользователь админом
        is_admin = telegram_id == TELEGRAM_ADMIN_ID
        
        new_user = TelegramUser(
            telegram_id=telegram_id,
            username=username,
            first_name=first_name,
            last_name=last_name,
            role="admin" if is_admin else None,
            is_authorized=is_admin  # Админ авторизован автоматически
        )
        
        result = await self.users.insert_one(new_user.dict(by_alias=True, exclude={"id"}))
        new_user.id = str(result.inserted_id)
        
        return new_user
    
    async def generate_verification_code(self, phone_number: str, telegram_id: int) -> str:
        """Генерация кода верификации"""
        code = ''.join(random.choices(string.digits, k=AUTH_CODE_LENGTH))
        
        verification = VerificationCode(
            phone_number=phone_number,
            code=code,
            telegram_id=telegram_id,
            expires_at=datetime.now() + timedelta(minutes=AUTH_CODE_EXPIRY_MINUTES)
        )
        
        await self.verification_codes.insert_one(verification.dict())
        
        return code
    
    async def verify_code(self, phone_number: str, code: str, telegram_id: int) -> bool:
        """Проверка кода верификации"""
        verification = await self.verification_codes.find_one({
            "phone_number": phone_number,
            "code": code,
            "telegram_id": telegram_id,
            "is_used": False,
            "expires_at": {"$gt": datetime.now()}
        })
        
        if verification:
            # Отмечаем код как использованный
            await self.verification_codes.update_one(
                {"_id": verification["_id"]},
                {"$set": {"is_used": True}}
            )
            return True
        
        return False
    
    async def authorize_user(self, telegram_id: int, phone_number: str) -> Optional[TelegramUser]:
        """Авторизация пользователя после проверки кода"""
        # Функция нормализации номера
        def normalize_phone(phone):
            if not phone:
                return ""
            return ''.join(filter(str.isdigit, phone))
        
        normalized_input = normalize_phone(phone_number)
        
        # Ищем пациента или врача по номеру телефона с учетом разных форматов
        patient = None
        doctor = None
        
        # Ищем среди всех пациентов
        async for p in self.patients.find({}):
            if p.get('phone'):
                if normalize_phone(p['phone']) == normalized_input:
                    patient = p
                    break
        
        # Ищем среди всех врачей
        if not patient:
            async for d in self.doctors.find({}):
                if d.get('phone'):
                    if normalize_phone(d['phone']) == normalized_input:
                        doctor = d
                        break
        
        role = None
        patient_id = None
        doctor_id = None
        
        if patient:
            role = "patient"
            # Используем id если есть, иначе _id
            patient_id = patient.get("id", str(patient["_id"]))
        elif doctor:
            role = "doctor"
            # КРИТИЧЕСКИ ВАЖНО: В appointments и doctor_schedules используется doctor.id (UUID), а не _id (ObjectId)!
            # Всегда используем поле 'id' (UUID), а не '_id' (ObjectId)
            doctor_id = doctor.get("id")
            if not doctor_id:
                # Если по какой-то причине нет поля 'id', используем _id как fallback
                doctor_id = str(doctor["_id"])
                print(f"WARNING: Doctor {doctor.get('full_name')} doesn't have 'id' field, using _id as fallback")
        else:
            # Если не найден ни пациент, ни врач - создаем как нового пациента
            role = "patient"
        
        # Обновляем пользователя
        update_data = {
            "phone_number": phone_number,
            "is_authorized": True,
            "role": role,
            "updated_at": datetime.now()
        }
        
        if patient_id:
            update_data["patient_id"] = patient_id
        if doctor_id:
            update_data["doctor_id"] = doctor_id
        
        await self.users.update_one(
            {"telegram_id": telegram_id},
            {"$set": update_data}
        )
        
        user_data = await self.users.find_one({"telegram_id": telegram_id})
        return TelegramUser(**user_data) if user_data else None
    
    async def get_user(self, telegram_id: int) -> Optional[TelegramUser]:
        """Получить пользователя по telegram_id"""
        user_data = await self.users.find_one({"telegram_id": telegram_id})
        return TelegramUser(**user_data) if user_data else None
    
    async def is_user_authorized(self, telegram_id: int) -> bool:
        """Проверить, авторизован ли пользователь"""
        user = await self.get_user(telegram_id)
        return user.is_authorized if user else False
    
    async def get_user_role(self, telegram_id: int) -> Optional[str]:
        """Получить роль пользователя"""
        user = await self.get_user(telegram_id)
        return user.role if user else None


# Глобальный экземпляр
db = TelegramDatabase()
