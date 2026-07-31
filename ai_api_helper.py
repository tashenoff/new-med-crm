#!/usr/bin/env python3
"""
Помощник для ИИ - получение данных через API endpoints
Используется ИИ для получения актуальной информации из CRM системы
"""
import requests
import json
import os
from typing import Dict, Any, Optional

class CRMAPIHelper:
    """Класс для работы с CRM API"""

    def __init__(self, base_url: str = "http://localhost:8000", token: Optional[str] = None):
        self.base_url = base_url.rstrip('/')
        self.token = token or os.environ.get("CRM_API_TOKEN")
        self.session = requests.Session()
        if self.token:
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})

    def get_patient_stats(self) -> Dict[str, Any]:
        """Получить статистику по пациентам"""
        try:
            response = self.session.get(f"{self.base_url}/patients/stats")
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            return {
                "error": f"Не удалось получить статистику пациентов: {str(e)}",
                "total_patients": 0,
                "active_patients": 0,
                "total_revenue": 0.0,
                "total_debt": 0.0
            }

    def get_patients(self, search: Optional[str] = None, limit: int = 100) -> Dict[str, Any]:
        """Получить список пациентов"""
        try:
            params = {}
            if search:
                params["search"] = search
            # limit не используется в API, но можно добавить если нужно

            response = self.session.get(f"{self.base_url}/patients", params=params)
            response.raise_for_status()
            patients = response.json()
            return {
                "count": len(patients),
                "patients": patients[:limit],  # ограничиваем количество
                "total_in_db": len(patients)
            }
        except requests.exceptions.RequestException as e:
            return {
                "error": f"Не удалось получить список пациентов: {str(e)}",
                "count": 0,
                "patients": []
            }

    def get_insights(self) -> Dict[str, Any]:
        """Получить аналитику и инсайты"""
        try:
            response = self.session.get(f"{self.base_url}/insights/badges")
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            return {
                "error": f"Не удалось получить инсайты: {str(e)}",
                "badges": []
            }

def get_crm_stats():
    """Функция для ИИ - получить статистику по клиентам"""
    helper = CRMAPIHelper()

    print("🔍 Получаю статистику по клиентам через API...")
    stats = helper.get_patient_stats()

    if "error" in stats:
        print(f"❌ Ошибка API: {stats['error']}")
        # Fallback к прямому запросу к БД
        print("🔄 Использую fallback - прямой запрос к БД...")
        from get_patient_count import get_patient_statistics
        stats = get_patient_statistics()

    return stats

def get_patient_list(search: Optional[str] = None, limit: int = 10):
    """Функция для ИИ - получить список пациентов"""
    helper = CRMAPIHelper()

    print(f"📋 Получаю список пациентов через API (поиск: {search or 'все'})...")
    result = helper.get_patients(search=search, limit=limit)

    if "error" in result:
        print(f"❌ Ошибка API: {result['error']}")
        return {"error": result["error"], "count": 0, "patients": []}

    return result

def get_system_insights():
    """Функция для ИИ - получить системные инсайты"""
    helper = CRMAPIHelper()

    print("💡 Получаю системные инсайты через API...")
    insights = helper.get_insights()

    if "error" in insights:
        print(f"❌ Ошибка API: {insights['error']}")
        return {"error": insights["error"], "badges": []}

    return insights

# Функции для использования ИИ
def сколько_клиентов():
    """Специальная функция для ИИ - сколько всего клиентов"""
    stats = get_crm_stats()
    if "error" in stats:
        return f"Ошибка получения данных: {stats['error']}"

    total = stats.get('total_patients', 0)
    active = stats.get('active_patients', 0)
    new_month = stats.get('new_patients_last_month', 0)

    return f"Всего клиентов: {total}, активных: {active}, новых за месяц: {new_month}"

def показать_статистику():
    """Показать полную статистику для ИИ"""
    stats = get_crm_stats()
    return json.dumps(stats, indent=2, ensure_ascii=False)

if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        command = sys.argv[1]

        if command == "stats":
            result = get_crm_stats()
            print(json.dumps(result, indent=2, ensure_ascii=False))
        elif command == "patients":
            search = sys.argv[2] if len(sys.argv) > 2 else None
            result = get_patient_list(search)
            print(json.dumps(result, indent=2, ensure_ascii=False))
        elif command == "insights":
            result = get_system_insights()
            print(json.dumps(result, indent=2, ensure_ascii=False))
        elif command == "count":
            print(сколько_клиентов())
        else:
            print("Использование: python ai_api_helper.py [stats|patients|insights|count] [search]")
    else:
        # По умолчанию показываем статистику
        result = get_crm_stats()
        print("📊 Статистика по клиентам:")
        print(json.dumps(result, indent=2, ensure_ascii=False))
