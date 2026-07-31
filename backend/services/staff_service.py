"""
Staff Service Module

Сервис для управления персоналом
"""

from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import List, Optional, Dict, Any
from datetime import datetime
import bcrypt

from models.staff import (
    StaffMember,
    StaffMemberCreate,
    StaffMemberUpdate,
    StaffMemberResponse,
    StaffRole,
    Permission,
    ROLE_PERMISSIONS
)


class StaffService:
    """Сервис для работы с персоналом"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.staff
        self.users_collection = db.users
    
    def _hash_password(self, password: str) -> str:
        """Хеширование пароля используя bcrypt напрямую"""
        try:
            # bcrypt работает с байтами, лимит 72 байта
            password_bytes = password.encode('utf-8')
            original_len = len(password_bytes)
            
            # Обрезаем если нужно
            if original_len > 72:
                password_bytes = password_bytes[:72]
                print(f"⚠️ Пароль обрезан с {original_len} до 72 байт")
            
            print(f"✅ Хеширование пароля длиной {len(password_bytes)} байт")
            
            # Используем bcrypt напрямую
            salt = bcrypt.gensalt()
            hashed = bcrypt.hashpw(password_bytes, salt)
            
            # Возвращаем как строку
            return hashed.decode('utf-8')
        except Exception as e:
            print(f"❌ Ошибка при хешировании пароля: {e}")
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
        staff_doc = await self.collection.find_one({"_id": staff_id})
        
        if not staff_doc:
            return None
        
        staff_doc["id"] = str(staff_doc.pop("_id"))
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
        
        # Проверяем, не существует ли уже АКТИВНЫЙ пользователь с таким email
        existing_staff = await self.collection.find_one({
            "email": staff_data.email,
            "is_active": True
        })
        if existing_staff:
            raise ValueError(f"Сотрудник с email {staff_data.email} уже существует")
        
        # Хешируем пароль
        hashed_password = self._hash_password(staff_data.password)
        
        # Создаем сотрудника
        staff_member = StaffMember(
            email=staff_data.email,
            full_name=staff_data.full_name,
            role=staff_data.role,
            phone=staff_data.phone,
            custom_permissions=staff_data.custom_permissions
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
            "hashed_password": hashed_password,
            "full_name": staff_data.full_name,
            "role": staff_data.role.value,
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
        # Проверяем существование сотрудника
        existing_staff = await self.collection.find_one({"_id": staff_id})
        if not existing_staff:
            return None
        
        # Подготавливаем данные для обновления
        update_data = staff_update.dict(exclude_unset=True)
        
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
            print(f"   ✅ После конвертации: {update_data['custom_permissions']}")
        
        # Обновляем в коллекции staff
        await self.collection.update_one(
            {"_id": staff_id},
            {"$set": update_data}
        )
        
        # Обновляем в коллекции users, если изменены критичные поля
        user_update_fields = {}
        if "email" in update_data:
            user_update_fields["email"] = update_data["email"]
        if "full_name" in update_data:
            user_update_fields["full_name"] = update_data["full_name"]
        if "role" in update_data:
            user_update_fields["role"] = update_data["role"].value if isinstance(update_data["role"], StaffRole) else update_data["role"]
        if "is_active" in update_data:
            user_update_fields["is_active"] = update_data["is_active"]
        # ВАЖНО: Обновляем custom_permissions тоже!
        if "custom_permissions" in update_data:
            user_update_fields["custom_permissions"] = update_data["custom_permissions"]
        
        if user_update_fields:
            user_update_fields["updated_at"] = datetime.utcnow()
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
        # Проверяем существование и роль сотрудника
        existing_staff = await self.collection.find_one({"_id": staff_id})
        
        result = await self.collection.update_one(
            {"_id": staff_id},
            {
                "$set": {
                    "is_active": False,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        # Также деактивируем пользователя
        await self.users_collection.update_one(
            {"_id": staff_id},
            {
                "$set": {
                    "is_active": False,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        # Если это был врач, деактивируем его в коллекции doctors
        if existing_staff and existing_staff.get("role") == "doctor":
            await self.db.doctors.update_one(
                {"id": staff_id},  # Используем id, а не _id
                {
                    "$set": {
                        "is_active": False,
                        "updated_at": datetime.utcnow()
                    }
                }
            )
        
        return result.modified_count > 0
    
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
        
        # Получаем обычный персонал из staff (не врачи)
        staff_cursor = self.collection.find({"is_active": True})
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
                "phone": staff_doc.get("phone", ""),
                "role": staff_doc.get("role", ""),
                "is_active": staff_doc.get("is_active", True),
                "created_at": created_at,
                "has_access": user_doc is not None,
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
            
            personnel.append({
                "id": str(doctor_id),  # Убедимся что id это строка
                "full_name": doctor_doc.get("full_name", ""),
                "email": email or "",
                "phone": doctor_doc.get("phone", ""),
                "specialty": doctor_doc.get("specialty", ""),
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
        email: str, 
        password: str
    ) -> Dict[str, Any]:
        """
        Назначить врачу логин и пароль для доступа в систему
        """
        # Проверяем, существует ли врач
        doctor_doc = await self.db.doctors.find_one({"id": doctor_id, "is_active": True})
        if not doctor_doc:
            raise ValueError("Врач не найден")
        
        # Проверяем, не занят ли email
        existing_user = await self.users_collection.find_one({"email": email})
        if existing_user and existing_user["_id"] != doctor_id:
            raise ValueError(f"Email {email} уже используется другим пользователем")
        
        # Проверяем, нет ли уже записи в staff для этого врача
        existing_staff = await self.collection.find_one({"_id": doctor_id})
        
        # Хешируем пароль
        hashed_password = self._hash_password(password)
        
        current_time = datetime.utcnow()
        
        # Создаем/обновляем запись в staff
        staff_data = {
            "_id": doctor_id,
            "email": email,
            "full_name": doctor_doc.get("full_name"),
            "role": "doctor",
            "phone": doctor_doc.get("phone"),
            "is_active": True,
            "hashed_password": hashed_password,
            "custom_permissions": [],
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
            "hashed_password": hashed_password,
            "full_name": doctor_doc.get("full_name"),
            "role": "doctor",
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
        if doctor_doc.get("email") != email:
            await self.db.doctors.update_one(
                {"id": doctor_id},
                {"$set": {"email": email, "updated_at": current_time}}
            )
        
        return {
            "id": doctor_id,
            "email": email,
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
