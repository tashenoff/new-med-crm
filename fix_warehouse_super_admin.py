"""
Скрипт для добавления проверки super_admin в компонентах склада
"""
import os
import re

# Список файлов для обработки
files_to_fix = [
    'frontend/src/components/warehouse/WarehouseMaterials.jsx',
    'frontend/src/components/warehouse/WarehouseInventory.jsx',
]

def fix_file(filepath):
    """Заменяет user?.role === 'admin' на user?.role === 'admin' || user?.role === 'super_admin'"""
    if not os.path.exists(filepath):
        print(f"❌ Файл не найден: {filepath}")
        return False
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    
    # Заменяем проверки роли admin на admin || super_admin
    # Ищем паттерн где проверяется только admin
    content = re.sub(
        r"user\?\.role === ['\"]admin['\"](?!\s*\|\|)",
        "user?.role === 'admin' || user?.role === 'super_admin'",
        content
    )
    
    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"✅ Исправлен: {filepath}")
        return True
    else:
        print(f"ℹ️  Без изменений: {filepath}")
        return False

def main():
    print("🔧 Начинаем исправление прав доступа для SUPER_ADMIN на складе...\n")
    
    fixed_count = 0
    for filepath in files_to_fix:
        if fix_file(filepath):
            fixed_count += 1
    
    print(f"\n✨ Готово! Исправлено файлов: {fixed_count}/{len(files_to_fix)}")
    print("\n📝 Изменения на складе будут доступны после перезагрузки страницы!")

if __name__ == "__main__":
    main()
