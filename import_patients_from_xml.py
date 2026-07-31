import xml.etree.ElementTree as ET
from pymongo import MongoClient
from datetime import datetime
import os

# Подключение к MongoDB
MONGO_URL = "mongodb://admin:admin123@localhost:27017/?authSource=admin"
DB_NAME = "medcrm"

def parse_xml_and_import(xml_file_path):
    """Парсит XML файл и импортирует пациентов в MongoDB"""
    
    # Подключение к MongoDB
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    patients_collection = db['patients']
    
    # Парсинг XML
    tree = ET.parse(xml_file_path)
    root = tree.getroot()
    
    stats = {
        'total_rows': 0,
        'patients_found': 0,
        'patients_added': 0,
        'patients_updated': 0,
        'patients_skipped': 0
    }
    
    print("Начинаем импорт пациентов из XML...")
    print("-" * 60)
    
    # Обработка каждой строки (row) в XML
    for row in root.findall('row'):
        stats['total_rows'] += 1
        
        # Извлечение данных пациента
        patient_elem = row.find('patient')
        
        if patient_elem is None:
            continue
            
        # Получение данных пациента из XML
        patient_id = patient_elem.find('id')
        patient_name = patient_elem.find('name')
        patient_iin = patient_elem.find('iin')
        patient_birth = patient_elem.find('birth')
        patient_phone = patient_elem.find('phone')
        
        # Пропускаем если нет основных данных
        if patient_id is None or patient_name is None:
            stats['patients_skipped'] += 1
            continue
        
        stats['patients_found'] += 1
        
        # Формирование документа пациента
        # Используем FirstName как в вашей базе данных
        full_name = patient_name.text
        patient_data = {
            'FirstName': full_name,  # Полное имя из XML
        }
        
        # Добавляем опциональные поля если они есть
        if patient_iin is not None and patient_iin.text:
            patient_data['iin'] = patient_iin.text
            
        if patient_birth is not None and patient_birth.text:
            try:
                # Преобразуем дату из формата YYYY-MM-DD в datetime
                patient_data['DateOfBirth'] = datetime.strptime(patient_birth.text, '%Y-%m-%d')
            except:
                patient_data['birth_date_str'] = patient_birth.text
                
        if patient_phone is not None and patient_phone.text:
            patient_data['Phone'] = patient_phone.text
        
        # ID из внешней системы
        external_id = patient_id.text
        
        # Проверяем, существует ли пациент
        existing_patient = patients_collection.find_one({
            '$or': [
                {'external_id': external_id},
                {'iin': patient_data.get('iin')} if patient_data.get('iin') else {},
                {'FirstName': patient_data['FirstName'], 'Phone': patient_data.get('Phone')} if patient_data.get('Phone') else {}
            ]
        })
        
        if existing_patient:
            # Обновляем существующего пациента
            update_data = {
                '$set': {
                    'external_id': external_id,
                    **patient_data,
                    'updated_at': datetime.now()
                }
            }
            patients_collection.update_one(
                {'_id': existing_patient['_id']},
                update_data
            )
            stats['patients_updated'] += 1
            print(f"✓ Обновлен: {patient_data['FirstName']} (ID: {external_id})")
        else:
            # Создаем нового пациента
            patient_data['external_id'] = external_id
            patient_data['created_at'] = datetime.now()
            patient_data['updated_at'] = datetime.now()
            
            result = patients_collection.insert_one(patient_data)
            stats['patients_added'] += 1
            print(f"+ Добавлен: {patient_data['FirstName']} (ID: {external_id})")
    
    # Вывод статистики
    print("-" * 60)
    print("\n📊 Статистика импорта:")
    print(f"   Всего записей в XML: {stats['total_rows']}")
    print(f"   Найдено пациентов: {stats['patients_found']}")
    print(f"   Добавлено новых: {stats['patients_added']}")
    print(f"   Обновлено существующих: {stats['patients_updated']}")
    print(f"   Пропущено: {stats['patients_skipped']}")
    print("\n✅ Импорт завершен!")
    
    client.close()
    return stats

if __name__ == "__main__":
    # Укажите путь к вашему XML файлу
    xml_file = input("Введите путь к XML файлу (или нажмите Enter для 'data.xml'): ").strip()
    
    if not xml_file:
        xml_file = "data.xml"
    
    if not os.path.exists(xml_file):
        print(f"❌ Ошибка: Файл '{xml_file}' не найден!")
        print("Пожалуйста, поместите XML файл в ту же папку, что и скрипт.")
    else:
        try:
            stats = parse_xml_and_import(xml_file)
        except Exception as e:
            print(f"❌ Ошибка при импорте: {e}")
            import traceback
            traceback.print_exc()
