#!/usr/bin/env python3
"""
Скрипт для получения количества пациентов из базы данных
Используется ИИ для получения актуальной информации о клиентах
"""
from pymongo import MongoClient
import os
from datetime import datetime, timedelta

def get_patient_statistics():
    """Получить статистику по пациентам"""

    # Подключение к MongoDB
    MONGO_URL = os.environ.get("MONGO_URL", "mongodb://admin:admin123@localhost:27017/?authSource=admin")
    DB_NAME = os.environ.get("DB_NAME", "medcrm")

    try:
        client = MongoClient(MONGO_URL)
        db = client[DB_NAME]

        # Общее количество пациентов
        total_patients = db.patients.count_documents({})

        # Активные пациенты (с приемами)
        active_patients = db.patients.count_documents({"appointments_count": {"$gt": 0}})

        # Новые пациенты за последний месяц
        last_month = datetime.utcnow() - timedelta(days=30)
        new_patients_last_month = db.patients.count_documents({
            "created_at": {"$gte": last_month}
        })

        # Общая выручка
        revenue_pipeline = [
            {"$group": {"_id": None, "total": {"$sum": "$revenue"}}}
        ]
        revenue_result = list(db.patients.aggregate(revenue_pipeline))
        total_revenue = revenue_result[0]["total"] if revenue_result else 0.0

        # Общий долг
        debt_pipeline = [
            {"$group": {"_id": None, "total": {"$sum": "$debt"}}}
        ]
        debt_result = list(db.patients.aggregate(debt_pipeline))
        total_debt = debt_result[0]["total"] if debt_result else 0.0

        # Распределение по источникам
        source_pipeline = [
            {"$group": {"_id": "$source", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}}
        ]
        source_result = list(db.patients.aggregate(source_pipeline))
        patients_by_source = {item["_id"] or "other": item["count"] for item in source_result}

        client.close()

        return {
            "total_patients": total_patients,
            "active_patients": active_patients,
            "new_patients_last_month": new_patients_last_month,
            "total_revenue": total_revenue,
            "total_debt": total_debt,
            "patients_by_source": patients_by_source,
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        return {
            "error": f"Ошибка подключения к базе данных: {str(e)}",
            "timestamp": datetime.utcnow().isoformat()
        }

if __name__ == "__main__":
    import json
    stats = get_patient_statistics()
    print(json.dumps(stats, indent=2, ensure_ascii=False))
