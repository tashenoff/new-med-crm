from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List

import requests
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

OPEN_ROUTER_API_KEY = os.environ.get("OPEN_ROUTER_API_KEY")
OPEN_ROUTER_MODEL = os.environ.get("OPEN_ROUTER_MODEL")
OPEN_ROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
CACHE_TTL_SECONDS = 120


class InsightsService:
    """Бизнес-логика генерации сигналов для бейджей под шапкой."""

    _cache_entry: Dict[str, Any] = {"data": None, "expires_at": 0}
    _cache_lock = asyncio.Lock()
    LEVEL_COLOR_MAP = {
        "critical": "#dc2626",
        "high": "#f97316",
        "medium": "#fbbf24",
        "low": "#22c55e"
    }

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def get_insights(self) -> Dict[str, Any]:
        """Возвращает кешированные бейджи или генерирует новые."""
        async with InsightsService._cache_lock:
            now = time.time()
            if InsightsService._cache_entry["data"] and InsightsService._cache_entry["expires_at"] > now:
                return InsightsService._cache_entry["data"]

            facts = await self._collect_facts()
            badges, source = await self._generate_badges(facts)

            payload = {
                "badges": badges,
                "generated_at": datetime.utcnow().isoformat() + "Z",
                "source": source
            }

            InsightsService._cache_entry = {
                "data": payload,
                "expires_at": now + CACHE_TTL_SECONDS
            }

            return payload

    async def _collect_facts(self) -> List[Dict[str, Any]]:
        today = datetime.utcnow().date()
        tomorrow = today + timedelta(days=1)
        next_week = today + timedelta(days=7)
        lookback_date = today - timedelta(days=14)

        iso_today = today.isoformat()
        iso_tomorrow = tomorrow.isoformat()
        iso_next_week = next_week.isoformat()
        iso_lookback = lookback_date.isoformat()

        overdue_filters = {"payment_status": {"$in": ["overdue", "partially_paid"]}}
        overdue_plans = await self.db.treatment_plans.find(overdue_filters).to_list(None)
        overdue_count = len(overdue_plans)
        overdue_amount = sum(
            max((plan.get("total_cost") or 0) - (plan.get("paid_amount") or 0), 0) for plan in overdue_plans
        )

        pending_plans = await self.db.treatment_plans.count_documents({
            "execution_status": {"$in": ["pending", "in_progress"]},
            "payment_status": {"$in": ["unpaid", "partially_paid"]}
        })

        unconfirmed_query = {
            "status": "unconfirmed",
            "appointment_date": {"$gte": iso_today, "$lte": iso_tomorrow}
        }
        unconfirmed_count = await self.db.appointments.count_documents(unconfirmed_query)

        recent_query = {"appointment_date": {"$gte": iso_lookback, "$lte": iso_today}}
        total_recent = await self.db.appointments.count_documents(recent_query)
        no_show_recent = await self.db.appointments.count_documents({
            **recent_query,
            "status": "no_show"
        })
        no_show_ratio = round((no_show_recent / total_recent * 100), 1) if total_recent else 0.0

        future_query = {"appointment_date": {"$gte": iso_today, "$lte": iso_next_week}}
        booked_doctors = await self.db.appointments.distinct("doctor_id", future_query)
        total_active_doctors = await self.db.doctors.count_documents({"is_active": True})
        idle_doctors = max(total_active_doctors - len(booked_doctors), 0)

        facts: List[Dict[str, Any]] = []

        facts.append({
            "id": "overdue_payments",
            "title": "Пропущенные оплаты планов",
            "summary": f"{overdue_count} планов лечения, сумма {int(overdue_amount):,} ₽ ожидает оплаты",
            "level": "critical" if overdue_count > 3 or overdue_amount > 50000 else "high" if overdue_count else "low",
            "details": {
                "overdue_count": overdue_count,
                "overdue_amount": overdue_amount
            },
            "action": {
                "type": "filter",
                "payload": {"section": "crm", "tab": "crm-clients", "focus": "overdue-payments"}
            }
        })

        facts.append({
            "id": "unconfirmed_appointments",
            "title": "Не подтверждённые записи",
            "summary": f"{unconfirmed_count} заявок на ближайшие два дня всё ещё не подтверждены",
            "level": "high" if unconfirmed_count > 4 else "medium" if unconfirmed_count else "low",
            "details": {"count": unconfirmed_count},
            "action": {
                "type": "filter",
                "payload": {"section": "hms", "tab": "calendar", "focus": "pending-approvals"}
            }
        })

        facts.append({
            "id": "no_show_ratio",
            "title": "Неявки за последние 14 дней",
            "summary": f"{no_show_ratio}% ({no_show_recent}/{total_recent}) неявок в датах {iso_lookback}—{iso_today}",
            "level": "high" if no_show_ratio > 15 else "medium" if no_show_ratio > 8 else "low",
            "details": {"ratio": no_show_ratio, "no_show_count": no_show_recent},
            "action": {
                "type": "navigate",
                "payload": {"tab": "doctor-statistics", "section": "statistics"}
            }
        })

        facts.append({
            "id": "idle_doctors",
            "title": "Свободные врачи на следующую неделю",
            "summary": f"{idle_doctors} врачей без записей на {iso_next_week}",
            "level": "medium" if idle_doctors > 1 else "low",
            "details": {"idle_doctors": idle_doctors},
            "action": {
                "type": "navigate",
                "payload": {"tab": "doctor-statistics", "section": "statistics"}
            }
        })

        if not facts:
            facts.append({
                "id": "no_alarms",
                "title": "Система в норме",
                "summary": "За последние пару недель нет отклонений, требующих внимания",
                "level": "low",
            })

        return facts

    async def _generate_badges(self, facts: List[Dict[str, Any]]) -> tuple[List[Dict[str, Any]], str]:
        if not OPEN_ROUTER_API_KEY or not OPEN_ROUTER_MODEL:
            logger.info("OpenRouter key или model отсутствует, собираю бейджи локально")
            return self._fallback_badges(facts), "fallback"

        messages = [
            {
                "role": "system",
                "content": (
                    "Ты — аналитик CRM-хаба, который следит за операционными отклонениями. "
                    "Получаешь набор фактов с уровнями важности. "
                    "Сформируй до 4 бейджей, каждый должен содержать "
                    "`id`, `title`, `description`, `level`, `color`, `action` (в объекте), "
                    "где `level` один из `critical`, `high`, `medium`, `low`. "
                    "Возвращай только JSON вида: "
                    "`{\"badges\": [{...}, ...]}`."
                )
            },
            {
                "role": "user",
                "content": self._prompt_from_facts(facts)
            }
        ]

        try:
            response = await self._call_openrouter(messages)
            llm_badges = self._parse_llm_response(response)
            if llm_badges:
                normalized = self._normalize_badges(llm_badges, source="openrouter")
                return normalized, "openrouter"
            logger.warning("OpenRouter вернул пустой список бейджей, использую fallback")
        except Exception as exc:
            logger.exception("Ошибка при запросе к OpenRouter: %s", exc)

        return self._fallback_badges(facts), "fallback"

    def _prompt_from_facts(self, facts: List[Dict[str, Any]]) -> str:
        lines = []
        for fact in facts:
            level = fact.get("level", "medium")
            summary = fact.get("summary", "")
            lines.append(f"- [{level}] {fact['title']}: {summary}")
        return (
            "Данные:\n"
            + "\n".join(lines)
            + "\n\nЕсли данных мало — скажи, что всё стабильно. Создай уникальные `id` и опиши, "
              "какие действия могут помочь."
        )

    async def _call_openrouter(self, messages: List[Dict[str, Any]]) -> Dict[str, Any]:
        payload = {
            "model": OPEN_ROUTER_MODEL,
            "messages": messages,
            "temperature": 0.2,
            "top_p": 1.0
        }
        headers = {
            "Authorization": f"Bearer {OPEN_ROUTER_API_KEY}",
            "Content-Type": "application/json"
        }
        response = await asyncio.to_thread(
            requests.post,
            OPEN_ROUTER_URL,
            json=payload,
            headers=headers,
            timeout=30
        )
        response.raise_for_status()
        return response.json()

    def _parse_llm_response(self, payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        try:
            content = payload["choices"][0]["message"]["content"]
            json_fragment = self._extract_json_fragment(content)
            data = json.loads(json_fragment)
            return data.get("badges", [])
        except Exception as exc:
            logger.exception("Не удалось разобрать ответ OpenRouter: %s", exc)
            return []

    @staticmethod
    def _extract_json_fragment(text: str) -> str:
        text = text.strip()
        if text.startswith("```"):
            text = text.strip("`")
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1:
            raise ValueError("JSON не найден")
        return text[start:end + 1]

    def _normalize_badges(self, badges: List[Dict[str, Any]], source: str) -> List[Dict[str, Any]]:
        normalized = []
        for idx, badge in enumerate(badges[:4]):
            raw_level = str(badge.get("level", "medium")).lower()
            level = raw_level if raw_level in self.LEVEL_COLOR_MAP else "medium"
            normalized.append({
                "id": badge.get("id") or f"insight_{idx}",
                "title": badge.get("title") or "Внимание",
                "description": badge.get("description") or badge.get("text") or "",
                "level": level,
                "color": badge.get("color") or self.LEVEL_COLOR_MAP[level],
                "action": badge.get("action"),
                "source": source,
                "meta": badge.get("meta")
            })
        return normalized

    def _fallback_badges(self, facts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        fallback = []
        for fact in facts:
            level = fact.get("level", "medium")
            if level not in self.LEVEL_COLOR_MAP:
                level = "medium"
            if not fact.get("summary"):
                continue
            fallback.append({
                "id": fact.get("id"),
                "title": fact.get("title"),
                "description": fact.get("summary"),
                "level": level,
                "color": self.LEVEL_COLOR_MAP[level],
                "action": fact.get("action"),
                "source": "fallback",
                "meta": {"details": fact.get("details")}
            })
            if len(fallback) >= 4:
                break

        if not fallback:
            fallback.append({
                "id": "no_data",
                "title": "Нет тревог",
                "description": "По данным последних часов критичных отклонений не выявлено.",
                "level": "low",
                "color": self.LEVEL_COLOR_MAP["low"],
                "source": "fallback"
            })
        return fallback
