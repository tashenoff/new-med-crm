"""
AI Quality Analysis Service

Сервис для AI-анализа качества обслуживания через OpenRouter
"""

import os
import json
import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
import requests

from database import get_database
from models.service_quality import (
    ServiceQualityAnalysis,
    QualityRating,
    QualityMetric,
    QualityCategory,
    SentimentType,
    ServiceQualitySummary,
    QualityAnalysisFilter
)
from models.system_settings import SystemSettings

logger = logging.getLogger(__name__)

OPEN_ROUTER_API_KEY = os.environ.get("OPEN_ROUTER_API_KEY")
OPEN_ROUTER_MODEL = os.environ.get("OPEN_ROUTER_MODEL")
OPEN_ROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


QUALITY_ANALYSIS_PROMPT = """Ты - эксперт по анализу качества обслуживания клиентов в медицинской клинике.

Проанализируй диалог между оператором (сотрудником) и клиентом через WhatsApp.

ДИАЛОГ:
{conversation}

ИНФОРМАЦИЯ:
- Оператор: {operator_name}
- Клиент: {customer_name}

Оцени качество обслуживания по критериям (от 1 до 5):
1. response_time - Скорость ответов
2. politeness - Вежливость
3. helpfulness - Полезность информации
4. professionalism - Профессионализм
5. problem_resolution - Решение вопроса
6. communication - Качество коммуникации

Ответь СТРОГО в JSON:
{{
    "overall_score": <1-5>,
    "overall_rating": "<excellent|good|satisfactory|poor|very_poor>",
    "metrics": [
        {{"category": "response_time", "score": <1-5>, "comment": "..."}},
        {{"category": "politeness", "score": <1-5>, "comment": "..."}},
        {{"category": "helpfulness", "score": <1-5>, "comment": "..."}},
        {{"category": "professionalism", "score": <1-5>, "comment": "..."}},
        {{"category": "problem_resolution", "score": <1-5>, "comment": "..."}},
        {{"category": "communication", "score": <1-5>, "comment": "..."}}
    ],
    "customer_sentiment": "<positive|neutral|negative>",
    "operator_sentiment": "<positive|neutral|negative>",
    "summary": "<резюме в 1-2 предложениях>",
    "recommendations": ["<рекомендация>"],
    "highlights": ["<положительный момент>"],
    "concerns": ["<проблема>"]
}}

overall_rating: 5=excellent, 4=good, 3=satisfactory, 2=poor, 1=very_poor
"""


class AIQualityService:
    """Сервис AI-анализа качества обслуживания"""
    
    def __init__(self):
        self.db = get_database()
    
    async def get_settings(self) -> SystemSettings:
        """Получить текущие настройки системы"""
        settings_doc = await self.db.system_settings.find_one({"id": "system_settings_main"})
        if settings_doc:
            return SystemSettings(**settings_doc)
        return SystemSettings()
    
    async def is_analysis_enabled(self) -> bool:
        """Проверить, включен ли AI анализ"""
        settings = await self.get_settings()
        return settings.ai_whatsapp_analysis_enabled
    
    async def analyze_conversation(
        self, messages: List[Dict[str, Any]], operator_id: str, operator_name: str,
        operator_email: Optional[str], phone: str, contact_name: Optional[str] = None
    ) -> Optional[ServiceQualityAnalysis]:
        """Анализировать диалог"""
        if not OPEN_ROUTER_API_KEY or not OPEN_ROUTER_MODEL:
            return None
        settings = await self.get_settings()
        if not settings.ai_whatsapp_analysis_enabled:
            return None
        
        filtered = [m for m in messages if len(m.get("text", "")) >= settings.ai_min_message_length]
        if not filtered:
            return None
        
        conv_text = self._format_conversation(filtered, operator_name, contact_name)
        start = datetime.utcnow()
        ai_resp = await self._call_openrouter(conv_text, operator_name, contact_name or "Клиент", settings.ai_model_temperature)
        duration = int((datetime.utcnow() - start).total_seconds() * 1000)
        
        if not ai_resp:
            return None
        data = self._parse_ai_response(ai_resp)
        if not data:
            return None
        
        analysis = ServiceQualityAnalysis(
            user_id=operator_id, user_name=operator_name, user_email=operator_email,
            phone=phone, contact_name=contact_name, messages_analyzed=len(filtered),
            message_ids=[m.get("message_id", "") for m in filtered],
            conversation_snippet=conv_text[:1000],
            overall_rating=QualityRating(data.get("overall_rating", "satisfactory")),
            overall_score=data.get("overall_score", 3),
            metrics=self._parse_metrics(data.get("metrics", [])),
            customer_sentiment=SentimentType(data.get("customer_sentiment", "neutral")),
            operator_sentiment=SentimentType(data.get("operator_sentiment", "neutral")),
            ai_summary=data.get("summary"), ai_recommendations=data.get("recommendations", []),
            ai_highlights=data.get("highlights", []), ai_concerns=data.get("concerns", []),
            analysis_model=OPEN_ROUTER_MODEL, analysis_duration_ms=duration
        )
        await self._save_analysis(analysis)
        return analysis
    
    def _format_conversation(self, messages: List[Dict], operator_name: str, contact_name: Optional[str]) -> str:
        lines = []
        for msg in sorted(messages, key=lambda x: x.get("timestamp", datetime.min)):
            direction = msg.get("direction", "")
            text = msg.get("text", "")
            ts = msg.get("timestamp", "")
            time_str = ts.strftime("%H:%M") if isinstance(ts, datetime) else str(ts)[:16]
            sender = f"ОПЕРАТОР ({operator_name})" if direction == "outgoing" else f"КЛИЕНТ ({contact_name or 'Клиент'})"
            lines.append(f"[{time_str}] {sender}: {text}")
        return "\n".join(lines)
    
    async def _call_openrouter(self, conversation: str, operator: str, customer: str, temp: float) -> Optional[Dict]:
        prompt = QUALITY_ANALYSIS_PROMPT.format(conversation=conversation, operator_name=operator, customer_name=customer)
        payload = {"model": OPEN_ROUTER_MODEL, "messages": [{"role": "user", "content": prompt}], "temperature": temp, "max_tokens": 2000}
        headers = {"Authorization": f"Bearer {OPEN_ROUTER_API_KEY}", "Content-Type": "application/json"}
        try:
            resp = await asyncio.to_thread(requests.post, OPEN_ROUTER_URL, json=payload, headers=headers, timeout=60)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.exception(f"Ошибка OpenRouter: {e}")
            return None
    
    def _parse_ai_response(self, response: Dict) -> Optional[Dict]:
        try:
            content = response.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            if content.startswith("```"):
                content = content.strip("`").strip()
                if content.startswith("json"):
                    content = content[4:].strip()
            start, end = content.find("{"), content.rfind("}") + 1
            if start == -1 or end == 0:
                return None
            return json.loads(content[start:end])
        except Exception as e:
            logger.exception(f"Ошибка парсинга: {e}")
            return None
    
    def _parse_metrics(self, metrics_data: List[Dict]) -> List[QualityMetric]:
        metrics = []
        for m in metrics_data:
            try:
                cat = QualityCategory(m.get("category"))
                score = max(1, min(5, int(m.get("score", 3))))
                metrics.append(QualityMetric(category=cat, score=score, comment=m.get("comment")))
            except (ValueError, KeyError):
                continue
        return metrics
    
    async def _save_analysis(self, analysis: ServiceQualityAnalysis) -> str:
        doc = analysis.model_dump()
        result = await self.db.service_quality_analyses.insert_one(doc)
        return str(result.inserted_id)
    
    async def get_analyses(self, filter_params: QualityAnalysisFilter) -> Tuple[List[ServiceQualityAnalysis], int]:
        """Получить список анализов"""
        query = {}
        if filter_params.user_id:
            query["user_id"] = filter_params.user_id
        if filter_params.phone:
            query["phone"] = {"$regex": filter_params.phone}
        if filter_params.rating:
            query["overall_rating"] = filter_params.rating.value
        if filter_params.min_score:
            query["overall_score"] = {"$gte": filter_params.min_score}
        if filter_params.date_from:
            query["analyzed_at"] = {"$gte": filter_params.date_from}
        
        total = await self.db.service_quality_analyses.count_documents(query)
        cursor = self.db.service_quality_analyses.find(query).sort("analyzed_at", -1).skip(filter_params.skip).limit(filter_params.limit)
        docs = await cursor.to_list(length=filter_params.limit)
        return [ServiceQualityAnalysis(**doc) for doc in docs], total
    
    async def get_user_summary(self, user_id: str, days: int = 30) -> ServiceQualitySummary:
        """Получить сводку по пользователю"""
        date_from = datetime.utcnow() - timedelta(days=days)
        cursor = self.db.service_quality_analyses.find({"user_id": user_id, "analyzed_at": {"$gte": date_from}}).sort("analyzed_at", -1)
        docs = await cursor.to_list(length=1000)
        
        if not docs:
            return ServiceQualitySummary(user_id=user_id, period_start=date_from, period_end=datetime.utcnow())
        
        scores = [d.get("overall_score", 0) for d in docs]
        avg = sum(scores) / len(scores) if scores else 0
        rating_dist = {}
        for d in docs:
            r = d.get("overall_rating", "satisfactory")
            rating_dist[r] = rating_dist.get(r, 0) + 1
        
        return ServiceQualitySummary(
            user_id=user_id, user_name=docs[0].get("user_name"), user_email=docs[0].get("user_email"),
            total_analyses=len(docs), average_score=round(avg, 2), rating_distribution=rating_dist,
            recent_analyses=[ServiceQualityAnalysis(**d) for d in docs[:5]],
            period_start=date_from, period_end=datetime.utcnow()
        )
    
    async def get_all_users_summary(self, days: int = 30) -> List[ServiceQualitySummary]:
        """Получить сводку по всем пользователям"""
        date_from = datetime.utcnow() - timedelta(days=days)
        pipeline = [{"$match": {"analyzed_at": {"$gte": date_from}}}, {"$group": {"_id": "$user_id"}}]
        user_ids = await self.db.service_quality_analyses.aggregate(pipeline).to_list(length=100)
        summaries = []
        for item in user_ids:
            if item.get("_id"):
                summaries.append(await self.get_user_summary(item["_id"], days))
        summaries.sort(key=lambda x: x.average_score, reverse=True)
        return summaries


ai_quality_service = AIQualityService()
