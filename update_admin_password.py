"""
Скрипт для обновления пароля admin пользователя
"""
import asyncio
import bcrypt
from motor.motor_asyncio import AsyncIOMotorClient

# Конфигурация БД (из backend/.env)
MONGODB_URL = "mongodb://admin:admin123@localhost:27017/?authSource=admin"
DATABASE_NAME = "medcrm"

async def update_password():
    # Подключаемся к БД
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]
    
    # Email пользователя
    email = "alex@mail.ru"
    new_password = "admin"
    
    print(f"🔍 Ищем пользователя {email}...")
    
    # Проверяем существование пользователя
    user = await db.users.find_one({"email": email})
    
    if not user:
        print(f"❌ Пользователь {email} не найден!")
        client.close()
        return
    
    print(f"✅ Пользователь найден: {user.get('full_name', 'N/A')}")
    print(f"   Роль: {user.get('role', 'N/A')}")
    
    # Хешируем новый пароль через bcrypt
    print(f"\n🔐 Хешируем новый пароль...")
    password_bytes = new_password.encode('utf-8')
    
    # Обрезаем если нужно (bcrypt лимит 72 байта)
    if len(password_bytes) > 72:
        password_bytes = password_bytes[:72]
        print(f"⚠️ Пароль обрезан до 72 байт")
    
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    hashed_str = hashed.decode('utf-8')
    
    print(f"✅ Пароль захеширован")
    print(f"   Хеш: {hashed_str[:50]}...")
    
    # Обновляем пароль в БД
    print(f"\n💾 Обновляем пароль в users...")
    result = await db.users.update_one(
        {"email": email},
        {"$set": {"hashed_password": hashed_str}}
    )
    
    if result.modified_count > 0:
        print(f"✅ Пароль обновлен в users!")
    else:
        print(f"⚠️ Ничего не изменено в users (возможно, хеш уже такой же)")
    
    # Обновляем в staff если есть
    staff = await db.staff.find_one({"email": email})
    if staff:
        print(f"\n💾 Обновляем пароль в staff...")
        result = await db.staff.update_one(
            {"email": email},
            {"$set": {"hashed_password": hashed_str}}
        )
        if result.modified_count > 0:
            print(f"✅ Пароль обновлен в staff!")
        else:
            print(f"⚠️ Ничего не изменено в staff")
    
    print(f"\n🎉 Готово! Теперь можно войти с:")
    print(f"   Email: {email}")
    print(f"   Password: {new_password}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(update_password())
