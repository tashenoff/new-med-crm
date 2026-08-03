"""
Тест API статистики врачей
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def test_aggregation():
    client = AsyncIOMotorClient("mongodb://admin:admin123@localhost:27017/?authSource=admin")
    db = client.medcrm
    
    # Воспроизводим агрегацию из StatisticsService.get_individual_doctor_statistics
    pipeline = [
        # Без date_filter
        {
            "$addFields": {
                "appointment_duration": 0.5
            }
        },
        {
            "$group": {
                "_id": "$doctor_id",
                "total_appointments": {"$sum": 1},
                "completed_appointments": {
                    "$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}
                },
                "cancelled_appointments": {
                    "$sum": {"$cond": [{"$eq": ["$status", "cancelled"]}, 1, 0]}
                },
                "no_show_appointments": {
                    "$sum": {"$cond": [{"$eq": ["$status", "no_show"]}, 1, 0]}
                },
                "total_worked_hours": {
                    "$sum": {
                        "$cond": [
                            {"$eq": ["$status", "completed"]},
                            "$appointment_duration",
                            0
                        ]
                    }
                },
                "total_scheduled_hours": {
                    "$sum": "$appointment_duration"
                },
                "total_revenue": {
                    "$sum": {
                        "$cond": [
                            {"$eq": ["$status", "completed"]},
                            {"$toDouble": {"$ifNull": ["$price", 0]}},
                            0
                        ]
                    }
                }
            }
        }
    ]
    
    print("\n=== РЕЗУЛЬТАТ АГРЕГАЦИИ (БЕЗ LOOKUP) ===")
    results = await db.appointments.aggregate(pipeline).to_list(None)
    for r in results:
        print(f"\ndoctor_id: {r['_id']}")
        print(f"  total_appointments: {r['total_appointments']}")
        print(f"  completed_appointments: {r['completed_appointments']}")
        print(f"  total_worked_hours: {r['total_worked_hours']}")
        print(f"  total_revenue: {r['total_revenue']}")
    
    # Теперь с lookup
    print("\n=== РЕЗУЛЬТАТ АГРЕГАЦИИ (С LOOKUP) ===")
    pipeline_with_lookup = pipeline + [
        {
            "$lookup": {
                "from": "doctors",
                "localField": "_id",
                "foreignField": "id",
                "as": "doctor"
            }
        },
        {"$unwind": "$doctor"},
        {
            "$project": {
                "_id": 0,
                "doctor_id": "$_id",
                "doctor_name": "$doctor.full_name",
                "total_appointments": 1,
                "completed_appointments": 1,
                "total_worked_hours": 1,
                "total_revenue": 1
            }
        }
    ]
    
    results_with_lookup = await db.appointments.aggregate(pipeline_with_lookup).to_list(None)
    for r in results_with_lookup:
        print(f"\n{r.get('doctor_name')} (id: {r.get('doctor_id')})")
        print(f"  total_appointments: {r['total_appointments']}")
        print(f"  completed_appointments: {r['completed_appointments']}")
        print(f"  total_worked_hours: {r['total_worked_hours']}")
        print(f"  total_revenue: {r['total_revenue']}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(test_aggregation())
