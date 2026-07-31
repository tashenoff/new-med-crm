import xml.etree.ElementTree as ET
from pymongo import MongoClient
from datetime import datetime
import os

# Подключение к MongoDB
MONGO_URL = "mongodb://admin:admin123@localhost:27017/?authSource=admin"
DB_NAME = "medcrm"

def parse_xml_and_import(xml_file_path):
    """Парсит XML файл и импортирует данные о визитах/платежах в MongoDB"""
    
    # Подключение к MongoDB
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    patients_collection = db['patients']
    appointments_collection = db['appointments']
    
    # Парсинг XML
    tree = ET.parse(xml_file_path)
    root = tree.getroot()
    
    stats = {
        'total_rows': 0,
        'patients_updated': 0,
        'appointments_added': 0,
        'skipped': 0
    }
    
    print("Начинаем импорт визитов и платежей из XML...")
    print("-" * 80)
    
    # Обработка каждой строки (row) в XML
    for row in root.findall('row'):
        stats['total_rows'] += 1
        
        # Извлечение данных
        row_id = row.find('id')
        date_elem = row.find('date')
        type_elem = row.find('type')
        
        # Пациент
        patient_elem = row.find('patient')
        if patient_elem is None:
            stats['skipped'] += 1
            continue
            
        patient_id = patient_elem.find('id')
        patient_name = patient_elem.find('name')
        
        if patient_id is None or patient_name is None:
            stats['skipped'] += 1
            continue
        
        # Доктор
        doctor_elem = row.find('doctor')
        doctor_name = doctor_elem.find('name').text if doctor_elem is not None and doctor_elem.find('name') is not None else None
        
        # Администратор
        admin_elem = row.find('admin')
        admin_name = admin_elem.find('name').text if admin_elem is not None and admin_elem.find('name') is not None else None
        
        # Финансовые данные
        paid_elem = row.find('paid')
        dolg_elem = row.find('dolg')
        overpay_elem = row.find('overpay')
        
        paid = float(paid_elem.text) if paid_elem is not None and paid_elem.text else 0.0
        dolg = float(dolg_elem.text) if dolg_elem is not None and dolg_elem.text else 0.0
        overpay = float(overpay_elem.text) if overpay_elem is not None and overpay_elem.text else 0.0
        
        # Обновляем пациента - добавляем revenue
        external_patient_id = patient_id.text
        existing_patient = patients_collection.find_one({'external_id': external_patient_id})
        
        if existing_patient:
            # Увеличиваем revenue пациента
            current_revenue = existing_patient.get('revenue', 0.0)
            new_revenue = current_revenue + paid
            
            patients_collection.update_one(
                {'_id': existing_patient['_id']},
                {
                    '$set': {
                        'revenue': new_revenue,
                        'updated_at': datetime.now()
                    }
                }
            )
            stats['patients_updated'] += 1
            
            patient_mongo_id = existing_patient['_id']
        else:
            # Если пациента нет, пропускаем
            print(f"⚠ Пациент {patient_name.text} (ID: {external_patient_id}) не найден в базе")
            stats['skipped'] += 1
            continue
        
        # Создаем документ визита/приема
        appointment_data = {
            'external_id': row_id.text if row_id is not None else None,
            'date': datetime.strptime(date_elem.text, '%Y-%m-%d') if date_elem is not None else None,
            'patient_id': patient_mongo_id,
            'patient_name': patient_name.text,
            'doctor_name': doctor_name,
            'admin_name': admin_name,
            'paid': paid,
            'debt': dolg,
            'overpay': overpay,
            'created_at': datetime.now(),
            'imported_from_xml': True
        }
        
        # Проверяем, существует ли уже этот визит
        existing_appointment = appointments_collection.find_one({
            'external_id': appointment_data['external_id']
        })
        
        if not existing_appointment:
            appointments_collection.insert_one(appointment_data)
            stats['appointments_added'] += 1
            print(f"+ Визит добавлен: {patient_name.text} - {date_elem.text} - оплата: {paid} тг")
    
    # Вывод статистики
    print("-" * 80)
    print("\n📊 Статистика импорта:")
    print(f"   Всего записей в XML: {stats['total_rows']}")
    print(f"   Пациентов обновлено (revenue): {stats['patients_updated']}")
    print(f"   Визитов добавлено: {stats['appointments_added']}")
    print(f"   Пропущено: {stats['skipped']}")
    print("\n✅ Импорт завершен!")
    
    # Итоговая статистика по revenue
    print("\n💰 Статистика revenue:")
    total_revenue = 0
    for patient in patients_collection.find({'revenue': {'$gt': 0}}):
        total_revenue += patient.get('revenue', 0)
    print(f"   Общий revenue всех пациентов: {total_revenue:,.2f} тг")
    
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
