#!/usr/bin/env python3
"""
Миграция: Удаление медицинских карт и связанных коллекций
Дата: 2025-09-14
Задача: MED-3 - Удалить медкарты и всю связанную логику

ВНИМАНИЕ: Эта миграция необратима! 
Убедитесь, что у вас есть резервная копия данных перед запуском.

Удаляемые коллекции:
- medical_records
- medical_entries  
- diagnoses
- medications
- allergies

Запуск: python migrations/010_remove_medical_records.py
"""

import os
import asyncio
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
from pathlib import Path
from dotenv import load_dotenv

# Загружаем переменные окружения
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']

async def remove_medical_collections():
    """Удаляет все коллекции связанные с медкартами"""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Коллекции для удаления
    medical_collections = [
        'medical_records',
        'medical_entries', 
        'diagnoses',
        'medications',
        'allergies'
    ]
    
    print(f"🚨 ВНИМАНИЕ: Начинаем удаление медицинских коллекций из БД '{DB_NAME}'")
    print(f"📅 Время: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    total_deleted_docs = 0
    
    for collection_name in medical_collections:
        print(f"🗑️  Удаляем коллекцию: {collection_name}")
        
        try:
            collection = db[collection_name]
            
            # Подсчитываем количество документов перед удалением
            count = await collection.count_documents({})
            
            if count > 0:
                # Удаляем все документы в коллекции
                result = await collection.delete_many({})
                print(f"   ✅ Удалено {result.deleted_count} документов из {collection_name}")
                total_deleted_docs += result.deleted_count
                
                # Удаляем саму коллекцию
                await collection.drop()
                print(f"   ✅ Коллекция {collection_name} удалена")
            else:
                print(f"   ℹ️  Коллекция {collection_name} пуста, удаляем...")
                await collection.drop()
                print(f"   ✅ Пустая коллекция {collection_name} удалена")
                
        except Exception as e:
            print(f"   ❌ Ошибка при удалении {collection_name}: {e}")
            continue
    
    print("=" * 60)
    print(f"📊 ИТОГО:")
    print(f"   - Удалено коллекций: {len(medical_collections)}")
    print(f"   - Удалено документов: {total_deleted_docs}")
    print(f"✅ Миграция завершена успешно!")
    
    # Проверяем, что коллекции действительно удалены
    print("\n🔍 Проверяем результат:")
    remaining_collections = await db.list_collection_names()
    
    for collection_name in medical_collections:
        if collection_name in remaining_collections:
            print(f"   ⚠️  ВНИМАНИЕ: Коллекция {collection_name} все еще существует!")
        else:
            print(f"   ✅ Коллекция {collection_name} успешно удалена")
    
    client.close()
    print(f"\n🎉 Медицинские карты полностью удалены из системы!")
    return total_deleted_docs

async def main():
    """Главная функция миграции"""
    try:
        # Запрашиваем подтверждение у пользователя
        print("🚨 ВНИМАНИЕ: Эта операция необратима!")
        print("Будут удалены ВСЕ медицинские карты, записи, диагнозы, лекарства и аллергии.")
        print("Убедитесь, что у вас есть резервная копия данных.")
        print()
        
        confirmation = input("Вы уверены, что хотите продолжить? Введите 'YES' для подтверждения: ")
        
        if confirmation != 'YES':
            print("❌ Миграция отменена пользователем.")
            return
        
        print("\n🔄 Начинаем миграцию...")
        deleted_count = await remove_medical_collections()
        
        # Записываем информацию о миграции
        migration_info = {
            'migration': '010_remove_medical_records',
            'date': datetime.now().isoformat(),
            'deleted_documents': deleted_count,
            'status': 'completed'
        }
        
        print(f"\n📝 Информация о миграции: {migration_info}")
        
    except Exception as e:
        print(f"💥 Критическая ошибка при выполнении миграции: {e}")
        raise

if __name__ == "__main__":
    asyncio.run(main())
