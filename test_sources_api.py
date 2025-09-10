#!/usr/bin/env python3
"""
Тестируем API источников для обновления статистики
"""

import asyncio
import aiohttp

async def test_sources_api():
    """Тестировать API источников"""
    
    base_url = "http://127.0.0.1:8001/api/crm"
    
    async with aiohttp.ClientSession() as session:
        try:
            # Получаем источники
            print("=== ПОЛУЧАЕМ ИСТОЧНИКИ ===")
            async with session.get(f"{base_url}/sources/") as response:
                if response.status == 200:
                    sources = await response.json()
                    print(f"Найдено источников: {len(sources)}")
                    for source in sources:
                        print(f"- {source['name']}: {source['leads_count']} заявок")
                else:
                    print(f"Ошибка получения источников: {response.status}")
                    return
            
            # Получаем заявки
            print("\n=== ПОЛУЧАЕМ ЗАЯВКИ ===")
            async with session.get(f"{base_url}/leads/") as response:
                if response.status == 200:
                    leads = await response.json()
                    print(f"Найдено заявок: {len(leads)}")
                    for lead in leads:
                        print(f"- ID: {lead['id']}, Source: {lead.get('source', 'N/A')}, Source_ID: {lead.get('source_id', 'N/A')}")
                else:
                    print(f"Ошибка получения заявок: {response.status}")
                    return
                    
            # Пытаемся обновить статистику
            print("\n=== ОБНОВЛЯЕМ СТАТИСТИКУ ===")
            async with session.post(f"{base_url}/sources/update-statistics") as response:
                if response.status == 200:
                    result = await response.json()
                    print(f"✅ Статистика обновлена: {result}")
                else:
                    text = await response.text()
                    print(f"❌ Ошибка обновления статистики: {response.status} - {text}")
                    
        except Exception as e:
            print(f"❌ Ошибка: {e}")

if __name__ == "__main__":
    asyncio.run(test_sources_api())
