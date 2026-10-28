"""
Staff Service Module

Сервис для управления персоналом
"""

from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import List, Optional, Dict, Any
from datetime import datetime
import bcrypt
import logging
from pydantic import EmailStr, TypeAdapter, ValidationError

from models.staff import (
    StaffMember,
    StaffMemberCreate,
    StaffMemberUpdate,
    StaffMemberResponse,
    StaffRole,
    Permission,
    ROLE_PERMISSIONS
)
from permission_policy import effective_permissions


_READ_EMAIL = TypeAdapter(Optional[EmailStr])


def _email_for_read(value) -> Optional[str]:
    """Keep malformed legacy contact data out of the response projection only.

    Request models still validate every newly supplied email. Do not rewrite
    the stored address or change any identity, role, or permission fields.
    """
    try:
        return _READ_EMAIL.validate_python(value)
    except ValidationError:
        return None


class StaffService:
    """Сервис для работы с персоналом"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.staff
        self.users_collection = db.users

    @staticmethod
    def _normalize_extension(extension) -> Optional[str]:
        if extension is None:
            return None
        return "".join(str(extension).split()) or None

    async def resolve_operator_by_extension(self, extension: Optional[str]) -> Optional[str]:
        """Resolve a PBX extension without interrupting webhook processing."""
        try:
            extension = self._normalize_extension(extension)
            if not extension:
                return None
            member = await self.collection.find_one({"extension": extension})
            return (member.get("full_name") or None) if member else None
        except Exception:
            logging.getLogger(__name__).warning("Could not resolve CallIQ operator", exc_info=True)
            return None
    
    def _hash_password(self, password: str) -> str:
        """Хеширование пароля используя bcrypt напрямую"""
        try:
            # bcrypt работает с байтами, лимит 72 байта
            password_bytes = password.encode('utf-8')
            original_len = len(password_bytes)
            
            # Обрезаем если нужно
            if original_len > 72:
                password_bytes = password_bytes[:72]
                print(f"Пароль обрезан с {original_len} до 72 байт")
            
            print(f"Хеширование пароля длиной {len(password_bytes)} байт")
            
            # Используем bcrypt напрямую
            salt = bcrypt.gensalt()
            hashed = bcrypt.hashpw(password_bytes, salt)
            
            # Возвращаем как строку
            return hashed.decode('utf-8')
        except Exception as e:
            print(f"Ошибка при хешировании пароля: {e}")
            raise ValueError(f"Не удалось захешировать пароль: {str(e)}")
    
    def _verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Проверка пароля используя bcrypt напрямую"""
        try:
            # Конвертируем оба в байты
            password_bytes = plain_password.encode('utf-8')
            
            # Обрезаем если нужно (как при хешировании)
            if len(password_bytes) > 72:
                password_bytes = password_bytes[:72]
            
            hashed_bytes = hashed_password.encode('utf-8')
            
            # Проверяем через bcrypt
            return bcrypt.checkpw(password_bytes, hashed_bytes)
        except Exception as e:
            print(f"Ошибка при проверке пароля: {e}")
            return False
    
    async def get_all_staff(self, skip: int = 0, limit: int = 100) -> List[StaffMemberResponse]:
        """Получить список всего персонала"""
        cursor = self.collection.find({"is_active": True}).skip(skip).limit(limit)
        staff_list = []
        
        async for staff_doc in cursor:
            staff_doc["id"] = str(staff_doc.pop("_id"))
            staff_doc["email"] = _email_for_read(staff_doc.get("email"))
            staff = StaffMember(**staff_doc)
            
            # Исключаем custom_permissions из dict() чтобы избежать дубликата
            staff_data = staff.dict(exclude={'custom_permissions'})
            
            staff_list.append(StaffMemberResponse(
                **staff_data,
                permissions=staff.get_permissions(),
                custom_permissions=staff.custom_permissions
            ))
        
        return staff_list
    
    async def get_staff_by_id(self, staff_id: str) -> Optional[StaffMemberResponse]:
        """Получить сотрудника по ID"""
        # Сначала ищем в коллекции staff
        staff_doc = await self.collection.find_one({"_id": staff_id})
        
        # Если не нашли — ищем в users (старые пользователи без записи в staff)
        if not staff_doc:
            # У старых пользователей _id может быть ObjectId, а id — строка UUID
            user_doc = await self.users_collection.find_one({"id": staff_id})
            if not user_doc:
                user_doc = await self.users_collection.find_one({"_id": staff_id})
            if not user_doc:
                return None
            # Преобразуем user_doc в формат StaffMemberResponse
            user_doc["id"] = str(user_doc.pop("_id"))
            return StaffMemberResponse(
                id=user_doc["id"],
                email=_email_for_read(user_doc.get("email")),
                login=user_doc.get("login"),
                full_name=user_doc.get("full_name", ""),
                role=user_doc.get("role", "admin"),
                phone=user_doc.get("phone"),
                is_active=user_doc.get("is_active", True),
                created_at=user_doc.get("created_at"),
                updated_at=user_doc.get("updated_at"),
                last_login=user_doc.get("last_login"),
                permissions=effective_permissions(user_doc),
                permission_mode=user_doc.get("permission_mode", "legacy"),
                custom_permissions=user_doc.get("custom_permissions", [])
            )
        
        staff_doc["id"] = str(staff_doc.pop("_id"))
        staff_doc["email"] = _email_for_read(staff_doc.get("email"))
        staff = StaffMember(**staff_doc)
        
        # Исключаем custom_permissions из dict() чтобы избежать дубликата
        staff_data = staff.dict(exclude={'custom_permissions'})
        
        return StaffMemberResponse(
            **staff_data,
            permissions=staff.get_permissions(),
            custom_permissions=staff.custom_permissions
        )
    
    async def get_staff_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """Получить сотрудника по email"""
        staff_doc = await self.collection.find_one({"email": email})
        
        if staff_doc:
            staff_doc["id"] = str(staff_doc.pop("_id"))
        
        return staff_doc
    
    async def create_staff_member(self, staff_data: StaffMemberCreate) -> StaffMemberResponse:
        """Создать нового сотрудника (НЕ врача)"""
        # ВАЖНО: Врачи НЕ создаются через Staff Management!
        # Врачи создаются только через раздел "Врачи"
        if staff_data.role == StaffRole.DOCTOR:
            raise ValueError("Врачи создаются только в разделе 'Врачи'. Используйте раздел управления врачами.")
        
        # Должен быть указан хотя бы email или логин
        if not staff_data.email and not staff_data.login:
            raise ValueError("Необходимо указать email или логин")
        
        # Проверяем, не существует ли уже активный пользователь с таким email (если email указан)
        if staff_data.email:
            existing_staff = await self.collection.find_one({
                "email": staff_data.email,
                "is_active": True
            })
            if existing_staff:
                raise ValueError(f"Сотрудник с email {staff_data.email} уже существует")
        
        # Проверяем уникальность логина (если указан)
        if staff_data.login:
            existing_login = await self.users_collection.find_one({"login": staff_data.login})
            if existing_login:
                raise ValueError(f"Логин '{staff_data.login}' уже используется другим пользователем")
        
        for field in ("email", "login"):
            value = getattr(staff_data, field)
            if value:
                for collection in (self.collection, self.users_collection):
                    if await collection.find_one({field: value}):
                        raise ValueError(f"{field} already used by another account")
        # Хешируем пароль
        hashed_password = self._hash_password(staff_data.password)
        
        # Создаем сотрудника
        staff_member = StaffMember(
            email=staff_data.email,
            login=staff_data.login,  # Логин для входа
            full_name=staff_data.full_name,
            role=staff_data.role,
            phone=staff_data.phone,
            extension=self._normalize_extension(staff_data.extension),
            custom_permissions=staff_data.custom_permissions,
            permission_mode="explicit"
        )
        
        # Сохраняем в БД
        staff_dict = staff_member.dict()
        staff_dict["_id"] = staff_member.id
        staff_dict["hashed_password"] = hashed_password
        del staff_dict["id"]
        
        await self.collection.insert_one(staff_dict)
        
        # Создаем пользователя для авторизации
        user_doc = {
            "_id": staff_member.id,
            "email": staff_data.email,
            "login": staff_data.login,  # Логин для входа (альтернатива email)
            "hashed_password": hashed_password,
            "full_name": staff_data.full_name,
            "role": staff_data.role.value,
            "permission_mode": "explicit",
            "custom_permissions": [p.value for p in staff_member.custom_permissions],
            "is_active": True,
            "created_at": staff_member.created_at,
            "updated_at": staff_member.updated_at
        }
        await self.users_collection.insert_one(user_doc)
        
        # Исключаем custom_permissions из dict() чтобы избежать дубликата
        staff_data = staff_member.dict(exclude={'custom_permissions'})
        
        return StaffMemberResponse(
            **staff_data,
            permissions=staff_member.get_permissions(),
            custom_permissions=staff_member.custom_permissions
        )
    
    async def update_staff_member(
        self,
        staff_id: str,
        staff_update: StaffMemberUpdate
    ) -> Optional[StaffMemberResponse]:
        """Обновить данные сотрудника"""
        # Validate identity changes before updating or migrating any record.
        for field in ("email", "login"):
            value = getattr(staff_update, field)
            if value:
                for collection in (self.users_collection, self.collection):
                    collision = await collection.find_one({
                        field: value, "_id": {"$ne": staff_id}, "id": {"$ne": staff_id}
                    })
                    if collision:
                        raise ValueError(f"{field} already used by another account")
        # Проверяем существование сотрудника
        existing_staff = await self.collection.find_one({"_id": staff_id})
        
        # Если нет в staff, проверяем есть ли в users (старые пользователи)
        if not existing_staff:
            # У старых пользователей _id может быть ObjectId, а id — строка UUID
            existing_user = await self.users_collection.find_one({"id": staff_id})
            if not existing_user:
                existing_user = await self.users_collection.find_one({"_id": staff_id})
            if not existing_user:
                return None
            # Создаём запись в staff для пользователя из users (автоматическая миграция)
            staff_data = {
                "_id": staff_id,
                "email": existing_user.get("email"),
                "login": existing_user.get("login"),
                "full_name": existing_user.get("full_name", ""),
                "role": existing_user.get("role", "admin"),
                "phone": existing_user.get("phone"),
                "is_active": existing_user.get("is_active", True),
                "custom_permissions": existing_user.get("custom_permissions", []),
                "permission_mode": existing_user.get("permission_mode", "legacy"),
                "created_at": existing_user.get("created_at", datetime.utcnow()),
                "updated_at": datetime.utcnow()
            }
            if "hashed_password" in existing_user:
                staff_data["hashed_password"] = existing_user["hashed_password"]
            await self.collection.insert_one(staff_data)
            existing_staff = staff_data
        
        # Подготавливаем данные для обновления
        update_data = staff_update.dict(exclude_unset=True)
        # Saving a list is an explicit replacement, including []. A role-only
        # change freezes the previous effective grants instead of broadening them.
        if "custom_permissions" in update_data:
            update_data["permission_mode"] = "explicit"
        elif "role" in update_data or "permission_mode" in update_data:
            update_data["custom_permissions"] = effective_permissions(existing_staff)
            update_data["permission_mode"] = "explicit"
        if "extension" in update_data:
            update_data["extension"] = self._normalize_extension(update_data["extension"])
        
        if not update_data:
            return await self.get_staff_by_id(staff_id)
        
        update_data["updated_at"] = datetime.utcnow()
        
        # DEBUG: Логируем что обновляется
        print(f"🔧 Обновление staff {staff_id}:")
        print(f"   update_data = {update_data}")
        print(f"   custom_permissions = {update_data.get('custom_permissions', 'НЕТ')}")
        
        # ВАЖНО: Конвертируем Permission enum в строки!
        if "custom_permissions" in update_data and update_data["custom_permissions"]:
            update_data["custom_permissions"] = [
                p.value if isinstance(p, Permission) else p 
                for p in update_data["custom_permissions"]
            ]
            print(f"   После конвертации: {update_data['custom_permissions']}")
        
        # Обновляем в коллекции staff
        await self.collection.update_one(
            {"_id": staff_id},
            {"$set": update_data}
        )
        
        # Обновляем в коллекции users, если изменены критичные поля
        user_update_fields = {}
        if "email" in update_data:
            user_update_fields["email"] = update_data["email"]
        if "login" in update_data:
            user_update_fields["login"] = update_data["login"]
        if "full_name" in update_data:
            user_update_fields["full_name"] = update_data["full_name"]
        if "role" in update_data:
            user_update_fields["role"] = update_data["role"].value if isinstance(update_data["role"], StaffRole) else update_data["role"]
        if "is_active" in update_data:
            user_update_fields["is_active"] = update_data["is_active"]
        # ВАЖНО: Обновляем custom_permissions тоже!
        if "permission_mode" in update_data:
            user_update_fields["permission_mode"] = update_data["permission_mode"]
        if "custom_permissions" in update_data:
            user_update_fields["custom_permissions"] = update_data["custom_permissions"]
        
        if user_update_fields:
            user_update_fields["updated_at"] = datetime.utcnow()
            # Ищем пользователя по id (UUID) или _id (ObjectId для старых записей)
            user_update_result = await self.users_collection.update_one(
                {"id": staff_id},
                {"$set": user_update_fields}
            )
            if user_update_result.modified_count == 0:
                # Если не нашли по id, пробуем по _id
                await self.users_collection.update_one(
                    {"_id": staff_id},
                    {"$set": user_update_fields}
                )
        
        # Если у сотрудника роль врача, обновляем запись в коллекции doctors
        if existing_staff.get("role") == "doctor":
            doctor_update_fields = {}
            if "full_name" in update_data:
                doctor_update_fields["full_name"] = update_data["full_name"]
            if "phone" in update_data:
                doctor_update_fields["phone"] = update_data["phone"]
            if "email" in update_data:
                doctor_update_fields["email"] = update_data["email"]
            if "is_active" in update_data:
                doctor_update_fields["is_active"] = update_data["is_active"]
            
            if doctor_update_fields:
                doctor_update_fields["updated_at"] = datetime.utcnow()
                await self.db.doctors.update_one(
                    {"id": staff_id},  # Используем id, а не _id
                    {"$set": doctor_update_fields}
                )
        
        return await self.get_staff_by_id(staff_id)
    
    async def delete_staff_member(self, staff_id: str) -> bool:
        """Удалить сотрудника (мягкое удаление)"""
        existing_staff = await self.collection.find_one({"_id": staff_id})
        existing_user = await self.users_collection.find_one({"id": staff_id})
        if not existing_user:
            existing_user = await self.users_collection.find_one({"_id": staff_id})
        if not existing_staff and not existing_user:
            return False
        update = {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
        if existing_staff:
            await self.collection.update_one({"_id": existing_staff["_id"]}, update)
        if existing_user:
            await self.users_collection.update_one({"_id": existing_user["_id"]}, update)
        account = existing_staff or existing_user
        if account.get("role") == "doctor":
            await self.db.doctors.update_one({"id": staff_id}, update)
        return True

    async def check_permission(self, staff_id: str, permission: Permission) -> bool:
        """Проверить наличие права у сотрудника"""
        staff = await self.get_staff_by_id(staff_id)
        
        if not staff or not staff.is_active:
            return False
        
        return permission in staff.permissions
    
    async def update_last_login(self, staff_id: str) -> None:
        """Обновить время последнего входа"""
        await self.collection.update_one(
            {"_id": staff_id},
            {"$set": {"last_login": datetime.utcnow()}}
        )
    
    async def get_role_permissions(self, role: StaffRole) -> List[Permission]:
        """Получить список прав для роли"""
        return ROLE_PERMISSIONS.get(role, [])
    
    async def change_password(self, staff_id: str, new_password: str) -> bool:
        """Изменить пароль сотрудника"""
        hashed_password = self._hash_password(new_password)
        
        # Обновляем в staff
        result = await self.collection.update_one(
            {"_id": staff_id},
            {
                "$set": {
                    "hashed_password": hashed_password,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        # Обновляем в users
        await self.users_collection.update_one(
            {"_id": staff_id},
            {
                "$set": {
                    "hashed_password": hashed_password,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        return result.modified_count > 0
    
    async def get_all_personnel(self, skip: int = 0, limit: int = 500) -> List[Dict[str, Any]]:
        """
        Получить всех сотрудников и врачей для отображения в управлении персоналом
        Врачи читаются из коллекции doctors и помечаются как type="doctor"
        Остальные сотрудники читаются из коллекции staff
        """
        personnel = []
        
        # Получаем обычный персонал из staff (ИСКЛЮЧАЯ врачей - они приходят из doctors)
        # Врачи в staff создаются только для хранения учетных данных (email/password)
        staff_cursor = self.collection.find({
            "is_active": True,
            "role": {"$ne": "doctor"}  # Исключаем врачей - они читаются из коллекции doctors
        })
        async for staff_doc in staff_cursor:
            # Проверяем есть ли у сотрудника запись в users (т.е. есть ли доступ)
            user_doc = await self.users_collection.find_one({"_id": staff_doc["_id"]})
            
            # Преобразуем created_at в строку ISO если это datetime
            created_at = staff_doc.get("created_at")
            if created_at and hasattr(created_at, 'isoformat'):
                created_at = created_at.isoformat()
            
            personnel.append({
                "id": str(staff_doc["_id"]),
                "full_name": staff_doc.get("full_name", ""),
                "email": staff_doc.get("email", ""),
                "login": staff_doc.get("login", ""),
                "phone": staff_doc.get("phone", ""),
                "role": staff_doc.get("role", ""),
                "is_active": staff_doc.get("is_active", True),
                "created_at": created_at,
                "has_access": user_doc is not None,
                "custom_permissions": staff_doc.get("custom_permissions", []),
                "permissions": effective_permissions(staff_doc),
                "permission_mode": staff_doc.get("permission_mode", "legacy"),
                "type": "staff"
            })
        
        # Дополнительно: получаем пользователей из users, у которых нет записи в staff
        # (старые администраторы, созданные до внедрения коллекции staff)
        users_cursor = self.users_collection.find({
            "role": {"$nin": ["doctor", "patient"]},  # Не врачи и не пациенты
            "is_active": True
        })
        async for user_doc in users_cursor:
            # Используем поле "id" (UUID строку) вместо _id (ObjectId),
            # чтобы фронтенд отправлял правильный ID для поиска
            actual_id = user_doc.get("id") or str(user_doc["_id"])
            # Проверяем, что этот пользователь уже не попал из staff
            already_added = any(p["id"] == actual_id for p in personnel)
            if not already_added:
                created_at = user_doc.get("created_at")
                if created_at and hasattr(created_at, 'isoformat'):
                    created_at = created_at.isoformat()
                
                personnel.append({
                    "id": actual_id,
                    "full_name": user_doc.get("full_name", ""),
                    "email": user_doc.get("email", ""),
                    "login": user_doc.get("login", ""),
                    "phone": user_doc.get("phone", ""),
                    "role": user_doc.get("role", ""),
                    "is_active": user_doc.get("is_active", True),
                    "created_at": created_at,
                    "has_access": True,
                    "custom_permissions": user_doc.get("custom_permissions", []),
                    "permissions": effective_permissions(user_doc),
                    "permission_mode": user_doc.get("permission_mode", "legacy"),
                    "type": "staff"
                })
        
        # Получаем врачей из doctors
        doctors_cursor = self.db.doctors.find({"is_active": True})
        async for doctor_doc in doctors_cursor:
            doctor_id = doctor_doc.get("id")
            
            # Проверяем есть ли у врача аккаунт в users/staff
            user_doc = await self.users_collection.find_one({"_id": doctor_id})
            staff_doc = await self.collection.find_one({"_id": doctor_id})
            
            email = None
            if staff_doc:
                email = staff_doc.get("email")
            elif user_doc:
                email = user_doc.get("email")
            
            # Преобразуем created_at в строку ISO если это datetime
            created_at = doctor_doc.get("created_at")
            if created_at and hasattr(created_at, 'isoformat'):
                created_at = created_at.isoformat()
            
            # Получаем специальность врача (поддерживаем оба формата: specialty и specialties)
            doctor_specialty = ""
            doctor_specialties = doctor_doc.get("specialties", [])
            if isinstance(doctor_specialties, list) and len(doctor_specialties) > 0:
                doctor_specialty = ", ".join(doctor_specialties)
            else:
                doctor_specialty = doctor_doc.get("specialty", "")
            
            personnel.append({
                "id": str(doctor_id),  # Убедимся что id это строка
                "full_name": doctor_doc.get("full_name", ""),
                "email": email or "",
                "login": (staff_doc.get("login") if staff_doc else "") or (user_doc.get("login") if user_doc else ""),
                "phone": doctor_doc.get("phone", ""),
                "specialty": doctor_specialty,
                "role": "doctor",
                "is_active": doctor_doc.get("is_active", True),
                "created_at": created_at,
                "has_access": user_doc is not None,
                "type": "doctor"
            })
        
        return personnel
    
    async def assign_access_to_doctor(
        self, 
        doctor_id: str, 
        email: Optional[str],
        password: str,
        login: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Назначить врачу логин и пароль для доступа в систему
        """
        # Проверяем, существует ли врач
        if not email and not login:
            raise ValueError("Email or login is required")

        doctor_doc = await self.db.doctors.find_one({"id": doctor_id, "is_active": True})
        if not doctor_doc:
            raise ValueError("Врач не найден")
        
        # Проверяем, не занят ли email
        if email:
            email_owner = await self.users_collection.find_one({"email": email})
            if email_owner and email_owner["_id"] != doctor_id:
                raise ValueError(f"Email {email} уже используется другим пользователем")
        existing_user = await self.users_collection.find_one({"_id": doctor_id})
        
        # Проверяем уникальность логина (если указан)
        if login:
            existing_login = await self.users_collection.find_one({"login": login})
            if existing_login and existing_login["_id"] != doctor_id:
                raise ValueError(f"Логин '{login}' уже используется другим пользователем")
        
        # Проверяем, нет ли уже записи в staff для этого врача
        existing_staff = await self.collection.find_one({"_id": doctor_id})
        if any(record and record.get("role") != "doctor" for record in (existing_user, existing_staff)):
            raise ValueError("Doctor identity collides with another staff account")
        
        # Хешируем пароль
        hashed_password = self._hash_password(password)
        
        current_time = datetime.utcnow()
        
        # Создаем/обновляем запись в staff
        staff_data = {
            "_id": doctor_id,
            "email": email,
            "login": login,
            "full_name": doctor_doc.get("full_name"),
            "role": "doctor",
            "phone": doctor_doc.get("phone"),
            "is_active": True,
            "hashed_password": hashed_password,
            "custom_permissions": (existing_staff or existing_user or {}).get("custom_permissions", []),
            "permission_mode": (existing_staff or existing_user or {}).get("permission_mode", "explicit"),
            "updated_at": current_time
        }
        
        if existing_staff:
            # Обновляем существующую запись
            await self.collection.update_one(
                {"_id": doctor_id},
                {"$set": staff_data}
            )
        else:
            # Создаем новую запись
            staff_data["created_at"] = current_time
            await self.collection.insert_one(staff_data)
        
        # Создаем/обновляем запись в users
        user_data = {
            "_id": doctor_id,
            "email": email,
            "login": login,
            "hashed_password": hashed_password,
            "full_name": doctor_doc.get("full_name"),
            "role": "doctor",
            "custom_permissions": staff_data["custom_permissions"],
            "permission_mode": staff_data["permission_mode"],
            "doctor_id": doctor_id,  # ИСПРАВЛЕНИЕ: Устанавливаем doctor_id для фильтрации записей
            "is_active": True,
            "updated_at": current_time
        }
        
        if existing_user:
            await self.users_collection.update_one(
                {"_id": doctor_id},
                {"$set": user_data}
            )
        else:
            user_data["created_at"] = current_time
            await self.users_collection.insert_one(user_data)
        
        # Обновляем email в doctors если он изменился
        if email and doctor_doc.get("email") != email:
            await self.db.doctors.update_one(
                {"id": doctor_id},
                {"$set": {"email": email, "updated_at": current_time}}
            )
        
        return {
            "id": doctor_id,
            "email": email,
            "login": login,
            "full_name": doctor_doc.get("full_name"),
            "has_access": True
        }
    
    async def revoke_doctor_access(self, doctor_id: str) -> bool:
        """
        Отозвать доступ врача к системе
        """
        # Удаляем из users
        await self.users_collection.delete_one({"_id": doctor_id})
        
        # Удаляем из staff
        result = await self.collection.delete_one({"_id": doctor_id})
        
        return result.deleted_count > 0
