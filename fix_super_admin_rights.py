"""
Скрипт для добавления UserRole.SUPER_ADMIN во все проверки прав доступа
"""
import os
import re

# Список файлов для обработки
files_to_fix = [
    'backend/routers/rooms.py',
    'backend/routers/services_router.py',
    'backend/routers/materials.py',
    'backend/routers/loyalty.py',
    'backend/routers/laboratories.py',
    'backend/routers/inventory.py',
    'backend/routers/directories.py',
    'backend/routers/appointments.py',
]

def fix_file(filepath):
    """Заменяет require_role([UserRole.ADMIN]) на require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN])"""
    if not os.path.exists(filepath):
        print(f"❌ Файл не найден: {filepath}")
        return False
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    
    # Заменяем только те случаи, где ADMIN указан без SUPER_ADMIN
    content = re.sub(
        r'require_role\(\[UserRole\.ADMIN\]\)',
        'require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN])',
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
    print("🔧 Начинаем исправление прав доступа для SUPER_ADMIN...\n")
    
    fixed_count = 0
    for filepath in files_to_fix:
        if fix_file(filepath):
            fixed_count += 1
    
    print(f"\n✨ Готово! Исправлено файлов: {fixed_count}/{len(files_to_fix)}")
    print("\n📝 Не забудьте перезапустить backend сервер!")

if __name__ == "__main__":
    main()
