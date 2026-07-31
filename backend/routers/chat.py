from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import os
import requests
import json
from bson import ObjectId
from datetime import datetime

class JSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, ObjectId):
            return str(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)
import jwt
import time
from dependencies import get_current_active_user
from models.auth import UserInDB
from database import db

chat_router = APIRouter(prefix="/chat", tags=["Chat"])

OPEN_ROUTER_API_KEY = os.environ.get("OPEN_ROUTER_API_KEY")
OPEN_ROUTER_MODEL = os.environ.get("OPEN_ROUTER_MODEL")
OPEN_ROUTER_TEMPERATURE = float(os.environ.get("OPEN_ROUTER_TEMPERATURE", "0.7"))
OPEN_ROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# Metabase configuration
METABASE_SECRET_KEY = "6e107b0b6bdbd2736457c8c3c90561dccdf9318004497fb5df66b3af4702ee7d"
METABASE_SITE_URL = os.environ.get("METABASE_SITE_URL", "http://localhost:3000")  # Adjust as needed

class ChatRequest(BaseModel):
    message: str
    context: str = ""

class ChatResponse(BaseModel):
    response: str

@chat_router.get("/test")
async def test_chat_endpoint():
    """Тестовый endpoint для проверки работы роутера"""
    print("CHAT TEST ENDPOINT CALLED")
    return {"message": "Chat router is working"}

@chat_router.post("/", response_model=ChatResponse)
async def chat_with_ai(
    request: ChatRequest,
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Чат с ИИ через OpenRouter с доступом к CRM данным"""
    print(f"CHAT API CALLED: message='{request.message}', context='{request.context}', user={current_user.full_name}")
    if not OPEN_ROUTER_API_KEY:
        print("ERROR: OPEN_ROUTER_API_KEY not configured")
        raise HTTPException(status_code=500, detail="OpenRouter API key not configured")

    if not OPEN_ROUTER_MODEL:
        print("ERROR: OPEN_ROUTER_MODEL not configured")
        raise HTTPException(status_code=500, detail="OpenRouter model not configured")

    try:
        print(f"DEBUG: OPEN_ROUTER_MODEL = {OPEN_ROUTER_MODEL}")
        print(f"DEBUG: OPEN_ROUTER_API_KEY exists = {bool(OPEN_ROUTER_API_KEY)}")

        # Получаем актуальные данные из CRM для контекста
        print("DEBUG: Getting CRM context...")
        try:
            crm_context = await get_crm_context_for_ai(request.message)
            print(f"DEBUG: CRM context length: {len(crm_context)}")
        except Exception as e:
            print(f"ERROR in get_crm_context_for_ai: {e}")
            import traceback
            traceback.print_exc()
            raise

        messages = [
            {
                "role": "system",
                "content": (
                    "Ты — полезный ИИ-ассистент для медицинской CRM системы. "
                    "Отвечай на русском языке. Будь вежливым и профессиональным. "
                    "У тебя есть доступ к актуальным данным из CRM системы через MCP инструменты. "
                    "Используй предоставленные данные и MCP инструменты для получения дополнительной информации. "
                    "Доступные коллекции в базе данных: patients, doctors, appointments, materials, treatment_plans, rooms. "
                    "Если тебе нужны дополнительные данные, ты можешь использовать инструменты для запросов к базе. "
                    "ВАЖНО: Если в предоставленных данных есть 'metabase_iframe_url', ОБЯЗАТЕЛЬНО включи эту ссылку в свой ответ. "
                    "Предоставляй iframe URL как есть, без изменений. Пользователь увидит интерактивный график с данными. "
                    "Всегда предлагай визуализацию данных, когда это уместно для вопросов о статистике."
                )
            },
            {
                "role": "system",
                "content": f"Актуальные данные из CRM: {crm_context}"
            },
            {
                "role": "system",
                "content": (
                    "MCP инструменты доступны для получения данных:\n"
                    "- get_patient_stats: комплексная статистика по пациентам\n"
                    "- count_patients: подсчет пациентов\n"
                    "- execute_query: выполнение произвольных запросов к коллекциям\n"
                    "Используй эти инструменты когда нужно получить точные данные."
                )
            }
        ]

        if request.context:
            messages.append({
                "role": "system",
                "content": f"Дополнительный контекст: {request.context}"
            })

        messages.append({
            "role": "user",
            "content": request.message
        })

        payload = {
            "model": OPEN_ROUTER_MODEL,
            "messages": messages,
            "temperature": OPEN_ROUTER_TEMPERATURE,
            "max_tokens": 1000
        }

        headers = {
            "Authorization": f"Bearer {OPEN_ROUTER_API_KEY}",
            "Content-Type": "application/json"
        }

        response = requests.post(
            OPEN_ROUTER_URL,
            json=payload,
            headers=headers,
            timeout=30
        )
        response.raise_for_status()

        data = response.json()
        ai_response = data["choices"][0]["message"]["content"]

        return ChatResponse(response=ai_response.strip())

    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Error communicating with AI service: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


async def get_crm_context_for_ai(user_message: str) -> str:
    """Получить релевантные данные из CRM для ответа ИИ"""
    message_lower = user_message.lower()

    context_data = {}

    try:
        # Анализируем вопрос и собираем релевантные данные
        if any(keyword in message_lower for keyword in ['сколько', 'количество', 'число', 'count', 'total', 'пациент']):
            # Статистика по пациентам
            total_patients = await db.patients.count_documents({})
            active_patients = await db.patients.count_documents({"appointments_count": {"$gt": 0}})

            # Новые пациенты за последний месяц
            from datetime import datetime, timedelta
            last_month = datetime.utcnow() - timedelta(days=30)
            new_patients = await db.patients.count_documents({"created_at": {"$gte": last_month}})

            # Список последних пациентов (без чувствительных данных)
            recent_patients_cursor = db.patients.find({}, {
                "full_name": 1,
                "phone": 1,
                "created_at": 1
            }).sort("created_at", -1).limit(5)
            recent_patients = await recent_patients_cursor.to_list(None)

            # Metabase iframe для пациентов (question ID 38)
            patients_iframe_url = get_metabase_iframe_url(38)

            context_data['patient_stats'] = {
                'total_patients': total_patients,
                'active_patients': active_patients,
                'new_patients_last_month': new_patients,
                'recent_patients': recent_patients,
                'metabase_iframe_url': patients_iframe_url
            }

        if any(keyword in message_lower for keyword in ['выручка', 'доход', 'revenue', 'money', 'рубл']):
            # Общая выручка
            revenue_result = await db.patients.aggregate([
                {"$group": {"_id": None, "total": {"$sum": "$revenue"}}}
            ]).to_list(None)
            total_revenue = revenue_result[0]['total'] if revenue_result else 0

            # Общий долг
            debt_result = await db.patients.aggregate([
                {"$group": {"_id": None, "total": {"$sum": "$debt"}}}
            ]).to_list(None)
            total_debt = debt_result[0]['total'] if debt_result else 0

            context_data['financial_stats'] = {
                'total_revenue': total_revenue,
                'total_debt': total_debt
            }

        if any(keyword in message_lower for keyword in ['врач', 'доктор', 'doctor', 'специалист', 'специальность']):
            # Статистика по врачам
            total_doctors = await db.doctors.count_documents({"is_active": True})

            # Список врачей с деталями
            doctors_cursor = db.doctors.find({"is_active": True}, {
                "full_name": 1,
                "specialty": 1,
                "phone": 1,
                "email": 1
            }).limit(10)
            doctors_list = await doctors_cursor.to_list(None)

            # Врачи с записями на следующую неделю
            from datetime import datetime, timedelta
            next_week = datetime.utcnow() + timedelta(days=7)
            busy_doctors = await db.appointments.distinct("doctor_id", {
                "appointment_date": {"$lte": next_week.isoformat()},
                "status": {"$in": ["confirmed", "pending"]}
            })
            idle_doctors = max(total_doctors - len(busy_doctors), 0)

            context_data['doctor_stats'] = {
                'total_active_doctors': total_doctors,
                'idle_doctors': idle_doctors,
                'doctors': doctors_list
            }

        if any(keyword in message_lower for keyword in ['запись', 'прием', 'appointment', 'встреча']):
            # Статистика по записям
            today = datetime.utcnow().date()
            tomorrow = today + timedelta(days=1)

            today_iso = today.isoformat()
            tomorrow_iso = tomorrow.isoformat()

            # Записи на сегодня
            today_appointments = await db.appointments.count_documents({
                "appointment_date": {"$gte": today_iso, "$lt": tomorrow_iso}
            })

            # Неподтвержденные записи
            unconfirmed = await db.appointments.count_documents({
                "appointment_date": {"$gte": today_iso, "$lt": tomorrow_iso},
                "status": "unconfirmed"
            })

            context_data['appointment_stats'] = {
                'today_appointments': today_appointments,
                'unconfirmed_today': unconfirmed
            }

        if any(keyword in message_lower for keyword in ['товар', 'склад', 'материал', 'product', 'stock', 'inventory']):
            # Статистика по товарам/материалам
            try:
                total_materials = await db.materials.count_documents({})
                low_stock = await db.materials.count_documents({"quantity": {"$lte": 10}})

                context_data['inventory_stats'] = {
                    'total_materials': total_materials,
                    'low_stock_items': low_stock
                }
            except Exception as e:
                context_data['inventory_error'] = f"Данные о товарах недоступны: {str(e)}"

        if any(keyword in message_lower for keyword in ['план', 'лечение', 'treatment', 'plan']):
            # Статистика по планам лечения
            try:
                total_plans = await db.treatment_plans.count_documents({})
                active_plans = await db.treatment_plans.count_documents({
                    "execution_status": {"$in": ["pending", "in_progress"]}
                })
                completed_plans = await db.treatment_plans.count_documents({
                    "execution_status": "completed"
                })

                context_data['treatment_plan_stats'] = {
                    'total_plans': total_plans,
                    'active_plans': active_plans,
                    'completed_plans': completed_plans
                }
            except Exception as e:
                context_data['treatment_plan_error'] = f"Данные о планах лечения недоступны: {str(e)}"

        # Если вопрос общий или не распознан, предоставляем базовую статистику
        if not context_data:
            total_patients = await db.patients.count_documents({})
            total_doctors = await db.doctors.count_documents({"is_active": True})
            today_appointments = await db.appointments.count_documents({
                "appointment_date": {"$gte": datetime.utcnow().date().isoformat()}
            })

            context_data['general_stats'] = {
                'total_patients': total_patients,
                'total_active_doctors': total_doctors,
                'today_appointments': today_appointments
            }

    except Exception as e:
        print(f"Error getting CRM context: {e}")
        context_data['error'] = f"Не удалось получить данные из CRM: {str(e)}"

    return json.dumps(context_data, ensure_ascii=False, indent=2, cls=JSONEncoder)


def generate_metabase_token(question_id: int, params: dict = None) -> str:
    """Генерировать JWT токен для Metabase iframe"""
    if params is None:
        params = {}

    current_time = round(time.time())
    payload = {
        "resource": {"question": question_id},
        "params": params,
        "iat": current_time,  # issued at - обязательное поле
        "exp": current_time + (60 * 10),  # 10 minute expiration
        "_embedding_params": {}  # обязательное поле для embedded
    }

    token = jwt.encode(payload, METABASE_SECRET_KEY, algorithm="HS256")
    return token


def get_metabase_iframe_url(question_id: int, params: dict = None) -> str:
    """Получить URL для Metabase iframe"""
    token = generate_metabase_token(question_id, params)
    return f"{METABASE_SITE_URL}/embed/question/{token}#bordered=true&titled=true"
