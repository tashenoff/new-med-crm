import asyncio
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent / 'backend'))

from database import db, get_database
from services.service_price_service import ServicePriceService

async def test_lab_statistics():
    """Test lab statistics endpoint"""
    try:
        # Get database
        database = await get_database()
        
        # Create service
        service = ServicePriceService(database)
        
        # Call the method
        print("Вызываем get_lab_price_statistics()...")
        result = await service.get_lab_price_statistics()
        
        print("\n=== Результат ===")
        print(f"Общее количество: {result['total_count']}")
        print(f"Общая стоимость: {result['total_cost']}")
        print(f"\nКатегории:")
        for category, data in result['categories'].items():
            print(f"  - {category}: {data['count']} услуг, стоимость: {data['total_cost']}")
        
        print("\n✅ Тест успешно пройден!")
        
    except Exception as e:
        print(f"\n❌ Ошибка: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_lab_statistics())
