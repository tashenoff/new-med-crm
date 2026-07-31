"""
Тест функционала инвентаризации склада
"""
import requests
import json

BASE_URL = "http://127.0.0.1:8001/api"

def login():
    """Получить токен авторизации"""
    response = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "alex@mail.ru",
        "password": "admin"
    })
    
    if response.status_code == 200:
        token = response.json()["access_token"]
        print("✓ Успешная авторизация")
        return token
    else:
        print(f"✗ Ошибка авторизации: {response.status_code}")
        print(response.text)
        return None

def get_materials(token):
    """Получить список материалов"""
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/materials?status=active", headers=headers)
    
    if response.status_code == 200:
        materials = response.json()
        print(f"✓ Получено материалов: {len(materials)}")
        return materials
    else:
        print(f"✗ Ошибка получения материалов: {response.status_code}")
        return []

def create_inventory(token, materials):
    """Создать инвентаризацию"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    # Подготовить материалы для инвентаризации
    items = []
    for material in materials[:3]:  # Берем первые 3 материала
        items.append({
            "material_id": material["id"],
            "material_name": material["name"],
            "expected_quantity": material["balance"],
            "actual_quantity": material["balance"] * 0.9,  # Симулируем расхождение
            "difference": material["balance"] * 0.9 - material["balance"],
            "notes": "Тестовая инвентаризация"
        })
    
    data = {
        "warehouse_name": "Склад по умолчанию",
        "employee": "Директор Аманжол Серикович",
        "status": "На заполнении",
        "notes": "Тестовая инвентаризация системы",
        "items": items
    }
    
    response = requests.post(f"{BASE_URL}/inventories", headers=headers, json=data)
    
    if response.status_code == 200:
        inventory = response.json()
        print(f"✓ Создана инвентаризация #{inventory['number']}")
        print(f"  ID: {inventory['id']}")
        print(f"  Склад: {inventory['warehouse_name']}")
        print(f"  Сотрудник: {inventory['employee']}")
        print(f"  Материалов: {len(inventory['items'])}")
        return inventory
    else:
        print(f"✗ Ошибка создания инвентаризации: {response.status_code}")
        print(response.text)
        return None

def get_inventories(token):
    """Получить список инвентаризаций"""
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/inventories", headers=headers)
    
    if response.status_code == 200:
        inventories = response.json()
        print(f"✓ Получено инвентаризаций: {len(inventories)}")
        for inv in inventories:
            print(f"  #{inv['number']}: {inv['warehouse_name']} - {inv['status']}")
        return inventories
    else:
        print(f"✗ Ошибка получения инвентаризаций: {response.status_code}")
        return []

def update_inventory(token, inventory_id):
    """Обновить инвентаризацию"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    data = {
        "status": "Заполнено",
        "notes": "Инвентаризация завершена"
    }
    
    response = requests.put(f"{BASE_URL}/inventories/{inventory_id}", headers=headers, json=data)
    
    if response.status_code == 200:
        inventory = response.json()
        print(f"✓ Инвентаризация обновлена")
        print(f"  Статус: {inventory['status']}")
        print(f"  Дата заполнения: {inventory.get('completion_date', 'N/A')}")
        return inventory
    else:
        print(f"✗ Ошибка обновления инвентаризации: {response.status_code}")
        print(response.text)
        return None

def get_materials_needing_attention(token):
    """Получить материалы, требующие внимания"""
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/materials/needs-attention", headers=headers)
    
    if response.status_code == 200:
        materials = response.json()
        print(f"✓ Материалов требует внимания: {len(materials)}")
        for material in materials[:5]:  # Показать первые 5
            print(f"  {material['material_name']} ({material['warehouse_name']})")
            print(f"    Остаток: {material['current_stock']}, Минимум: {material['min_stock']}")
            print(f"    Дефицит: {material['shortage']}")
        return materials
    else:
        print(f"✗ Ошибка получения материалов: {response.status_code}")
        return []

def main():
    print("=" * 60)
    print("ТЕСТ ФУНКЦИОНАЛА ИНВЕНТАРИЗАЦИИ")
    print("=" * 60)
    print()
    
    # 1. Авторизация
    print("1. Авторизация...")
    token = login()
    if not token:
        print("Не удалось авторизоваться. Завершение теста.")
        return
    print()
    
    # 2. Получить материалы
    print("2. Получение списка материалов...")
    materials = get_materials(token)
    print()
    
    # 3. Создать инвентаризацию
    if materials:
        print("3. Создание инвентаризации...")
        inventory = create_inventory(token, materials)
        print()
        
        # 4. Получить список инвентаризаций
        print("4. Получение списка инвентаризаций...")
        get_inventories(token)
        print()
        
        # 5. Обновить инвентаризацию
        if inventory:
            print("5. Обновление инвентаризации...")
            update_inventory(token, inventory['id'])
            print()
    
    # 6. Получить материалы, требующие внимания
    print("6. Получение материалов, требующих внимания...")
    get_materials_needing_attention(token)
    print()
    
    print("=" * 60)
    print("ТЕСТ ЗАВЕРШЕН")
    print("=" * 60)

if __name__ == "__main__":
    main()
