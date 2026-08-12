"""
Service Quality Analysis Router
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from datetime import datetime

from models.system_settings import SystemSettings, SystemSettingsUpdate, SystemSettingsResponse
from models.service_quality import ServiceQualityAnalysis, ServiceQualitySummary, QualityAnalysisFilter, QualityRating
from services.ai_quality_service import ai_quality_service
from dependencies import get_current_active_user
from models.auth import UserInDB
from database import db

router = APIRouter(prefix="/api/service-quality", tags=["Service Quality"])


@router.get("/settings", response_model=SystemSettingsResponse)
async def get_ai_settings(current_user: UserInDB = Depends(get_current_active_user)):
    """Получить настройки AI-анализа"""
    if current_user.role not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Только администраторы")
    return await ai_quality_service.get_settings()


@router.put("/settings", response_model=SystemSettingsResponse)
async def update_ai_settings(settings_update: SystemSettingsUpdate, current_user: UserInDB = Depends(get_current_active_user)):
    """Обновить настройки AI-анализа"""
    if current_user.role not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Только администраторы")
    
    current = await ai_quality_service.get_settings()
    update_data = settings_update.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.utcnow()
    update_data["updated_by"] = current_user.full_name
    updated_dict = current.model_dump()
    updated_dict.update(update_data)
    
    await db.system_settings.update_one({"id": "system_settings_main"}, {"$set": updated_dict}, upsert=True)
    return SystemSettings(**updated_dict)


@router.post("/settings/toggle")
async def toggle_ai_analysis(enabled: bool, current_user: UserInDB = Depends(get_current_active_user)):
    """Быстрое включение/выключение AI-анализа"""
    if current_user.role not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Только администраторы")
    
    await db.system_settings.update_one(
        {"id": "system_settings_main"},
        {"$set": {"ai_whatsapp_analysis_enabled": enabled, "updated_at": datetime.utcnow(), "updated_by": current_user.full_name}},
        upsert=True
    )
    return {"success": True, "ai_whatsapp_analysis_enabled": enabled}


@router.get("/analyses")
async def get_analyses(
    user_id: Optional[str] = None, phone: Optional[str] = None, rating: Optional[QualityRating] = None,
    min_score: Optional[int] = Query(None, ge=1, le=5), date_from: Optional[datetime] = None,
    limit: int = Query(50, ge=1, le=500), skip: int = Query(0, ge=0),
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Получить список анализов"""
    if current_user.role not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    filter_params = QualityAnalysisFilter(user_id=user_id, phone=phone, rating=rating, min_score=min_score, date_from=date_from, limit=limit, skip=skip)
    analyses, total = await ai_quality_service.get_analyses(filter_params)
    return {"items": [a.model_dump() for a in analyses], "total": total, "limit": limit, "skip": skip}


@router.get("/analyses/{analysis_id}")
async def get_analysis_detail(analysis_id: str, current_user: UserInDB = Depends(get_current_active_user)):
    """Получить детали анализа"""
    if current_user.role not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    doc = await db.service_quality_analyses.find_one({"id": analysis_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Анализ не найден")
    return ServiceQualityAnalysis(**doc).model_dump()


@router.get("/summary/users")
async def get_all_users_summary(days: int = Query(30, ge=1, le=365), current_user: UserInDB = Depends(get_current_active_user)):
    """Сводка по всем операторам"""
    if current_user.role not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    summaries = await ai_quality_service.get_all_users_summary(days)
    return [s.model_dump() for s in summaries]


@router.get("/summary/user/{user_id}")
async def get_user_summary(user_id: str, days: int = Query(30, ge=1, le=365), current_user: UserInDB = Depends(get_current_active_user)):
    """Сводка по оператору"""
    if current_user.role not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    return (await ai_quality_service.get_user_summary(user_id, days)).model_dump()


@router.get("/summary/my")
async def get_my_summary(days: int = Query(30, ge=1, le=365), current_user: UserInDB = Depends(get_current_active_user)):
    """Своя сводка"""
    return (await ai_quality_service.get_user_summary(str(current_user.id), days)).model_dump()


@router.post("/analyze/conversation")
async def analyze_conversation_manual(phone: str, limit: int = Query(20, ge=5, le=100), current_user: UserInDB = Depends(get_current_active_user)):
    """Ручной анализ переписки"""
    if current_user.role not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    if not await ai_quality_service.is_analysis_enabled():
        raise HTTPException(status_code=400, detail="AI-анализ отключен")
    
    from services.wazzup_service import wazzup_service
    history = await wazzup_service.get_history_from_db(phone, limit=limit, skip=0)
    messages = [{"message_id": m.id, "text": m.text, "direction": "outgoing" if m.metadata.get("from_me") else "incoming", "timestamp": m.sent_at, "contact_name": m.metadata.get("contact_name")} for m in history.get("messages", [])]
    
    if not messages:
        raise HTTPException(status_code=404, detail="Сообщения не найдены")
    
    contact_name = next((m.get("contact_name") for m in messages if m.get("contact_name")), None)
    analysis = await ai_quality_service.analyze_conversation(messages, str(current_user.id), current_user.full_name, current_user.email, phone, contact_name)
    
    if not analysis:
        raise HTTPException(status_code=500, detail="Не удалось выполнить анализ")
    return analysis.model_dump()


@router.get("/dashboard/stats")
async def get_dashboard_stats(days: int = Query(30, ge=1, le=365), current_user: UserInDB = Depends(get_current_active_user)):
    """Получить статистику для дашборда качества обслуживания"""
    if current_user.role not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    from datetime import timedelta
    date_from = datetime.utcnow() - timedelta(days=days)
    
    # Общее количество анализов
    total_analyses = await db.service_quality_analyses.count_documents({"analyzed_at": {"$gte": date_from}})
    
    # Средняя оценка
    pipeline = [
        {"$match": {"analyzed_at": {"$gte": date_from}}},
        {"$group": {"_id": None, "avg_score": {"$avg": "$overall_score"}}}
    ]
    avg_result = await db.service_quality_analyses.aggregate(pipeline).to_list(1)
    avg_score = avg_result[0]["avg_score"] if avg_result else 0
    
    # Распределение по рейтингам
    rating_pipeline = [
        {"$match": {"analyzed_at": {"$gte": date_from}}},
        {"$group": {"_id": "$overall_rating", "count": {"$sum": 1}}}
    ]
    rating_dist = await db.service_quality_analyses.aggregate(rating_pipeline).to_list(10)
    rating_distribution = {r["_id"]: r["count"] for r in rating_dist}
    
    # Тренд по дням
    trend_pipeline = [
        {"$match": {"analyzed_at": {"$gte": date_from}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$analyzed_at"}},
            "avg_score": {"$avg": "$overall_score"},
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id": 1}}
    ]
    daily_trend = await db.service_quality_analyses.aggregate(trend_pipeline).to_list(100)
    
    # Топ проблемные диалоги (низкие оценки)
    low_score_docs = await db.service_quality_analyses.find(
        {"analyzed_at": {"$gte": date_from}, "overall_score": {"$lte": 2}}
    ).sort("analyzed_at", -1).limit(5).to_list(5)
    
    # Топ лучшие диалоги
    high_score_docs = await db.service_quality_analyses.find(
        {"analyzed_at": {"$gte": date_from}, "overall_score": {"$gte": 4}}
    ).sort("analyzed_at", -1).limit(5).to_list(5)
    
    # Статистика по категориям
    category_pipeline = [
        {"$match": {"analyzed_at": {"$gte": date_from}}},
        {"$unwind": "$metrics"},
        {"$group": {"_id": "$metrics.category", "avg_score": {"$avg": "$metrics.score"}}}
    ]
    category_stats = await db.service_quality_analyses.aggregate(category_pipeline).to_list(10)
    
    return {
        "period_days": days,
        "total_analyses": total_analyses,
        "average_score": round(avg_score, 2) if avg_score else 0,
        "rating_distribution": rating_distribution,
        "daily_trend": [{"date": d["_id"], "avg_score": round(d["avg_score"], 2), "count": d["count"]} for d in daily_trend],
        "low_score_dialogues": [{"id": str(d.get("_id", d.get("id"))), "phone": d.get("phone"), "score": d.get("overall_score"), "user_name": d.get("user_name"), "summary": d.get("ai_summary")} for d in low_score_docs],
        "high_score_dialogues": [{"id": str(d.get("_id", d.get("id"))), "phone": d.get("phone"), "score": d.get("overall_score"), "user_name": d.get("user_name"), "summary": d.get("ai_summary")} for d in high_score_docs],
        "category_averages": {c["_id"]: round(c["avg_score"], 2) for c in category_stats}
    }
