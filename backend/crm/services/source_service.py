"""
Source Service - Сервис для работы с источниками обращений
"""

import uuid
from datetime import datetime, date, timedelta, timezone
from typing import Optional, List, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import DESCENDING
from ..models.source import Source, SourceStatus, SourceType
from ..schemas.source_schemas import SourceCreate, SourceUpdate
from ..models.source_dimensions import validate_dimensions


def storage(value):
    if isinstance(value, dict):
        return {key: storage(item) for key, item in value.items()}
    if isinstance(value, list):
        return [storage(item) for item in value]
    return value.isoformat() if isinstance(value, date) and not isinstance(value, datetime) else value


class SourceService:
    """Сервис для работы с источниками"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.crm_sources
        self.leads_collection = db.crm_leads

    @staticmethod
    def tariff_version(tariff, previous=()):
        if not tariff:
            return None
        tariff = dict(tariff)
        effective = tariff['effective_at'].astimezone(timezone.utc)
        now = datetime.now(timezone.utc)
        if effective < now - timedelta(minutes=5):
            raise ValueError('Новый тариф применяется с текущего или будущего времени; прошлые условия не переписываются')
        for version in previous:
            at = version['effective_at']
            if isinstance(at, str):
                at = datetime.fromisoformat(at.replace('Z', '+00:00'))
            at = at.replace(tzinfo=timezone.utc) if at.tzinfo is None else at.astimezone(timezone.utc)
            if effective <= at:
                raise ValueError('Начало новой версии должно быть позже уже сохранённых версий')
        return {**tariff, 'effective_at': effective, 'id': str(uuid.uuid4()), 'recorded_at': now}

    @staticmethod
    def _normalize_source_doc(doc: dict) -> dict:
        """Нормализует документ источника для совместимости со старой схемой.

        Старые миграции (003) создавали источники БЕЗ поля type и status
        (вместо этого использовали is_active). Добавляем значения по умолчанию,
        чтобы Source(**doc) не падал при валидации.
        """
        normalized = dict(doc)
        if "type" not in normalized or not normalized.get("type"):
            normalized["type"] = SourceType.OTHER
        if "status" not in normalized or not normalized.get("status"):
            # Старые источники с is_active=False считаем неактивными
            is_active = normalized.pop("is_active", True)
            normalized["status"] = SourceStatus.ACTIVE if is_active else SourceStatus.INACTIVE
        return normalized
    
    async def create_source(self, source_data: SourceCreate, created_by: Optional[str] = None) -> Source:
        """Создать новый источник"""
        source_dict = source_data.dict()
        validate_dimensions(source_dict['channels'], source_dict['campaigns'])
        tariff = self.tariff_version(source_dict.pop('tariff', None))
        source_dict['pricing_history'] = [tariff] if tariff else []
        source_dict["id"] = str(uuid.uuid4())
        source_dict["created_at"] = datetime.utcnow()
        source_dict["updated_at"] = datetime.utcnow()
        source_dict["created_by"] = created_by
        source_dict["status"] = SourceStatus.ACTIVE
        
        # Инициализируем статистику
        source_dict["leads_count"] = 0
        source_dict["leads_this_month"] = 0
        source_dict["conversion_count"] = 0
        source_dict["conversion_rate"] = 0.0
        
        # Создаем объект Source для валидации
        source = Source(**source_dict)
        
        # Сохраняем в БД
        await self.collection.insert_one(storage(source.dict()))
        
        return source
    
    async def get_source_by_id(self, source_id: str) -> Optional[Source]:
        """Получить источник по ID"""
        source_data = await self.collection.find_one({"id": source_id})
        if source_data:
            # Обновляем статистику перед возвратом
            await self._update_source_statistics(source_id)
            source_data = await self.collection.find_one({"id": source_id})
            return Source(**self._normalize_source_doc(source_data))
        return None
    
    async def update_source(self, source_id: str, update_data: SourceUpdate) -> Optional[Source]:
        """Обновить источник"""
        update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
        before = await self.collection.find_one({'id': source_id})
        if before is None:
            return None
        channels, campaigns = validate_dimensions(update_dict.get('channels', before.get('channels', [])),
                                                  update_dict.get('campaigns', before.get('campaigns', [])))
        # Archive dimensions rather than delete/reuse their identities. Existing
        # attribution remains resolvable even after a channel/campaign is retired.
        for field, rows in (('channels', channels), ('campaigns', campaigns)):
            if field not in update_dict:
                continue
            previous = before.get(field, [])
            if {row['id'] for row in previous} - {row['id'] for row in rows}:
                raise ValueError('Существующие каналы и кампании можно отключить, но нельзя удалять')
        previous_channels = {row['id']: row for row in before.get('channels', [])}
        if any(row['id'] in previous_channels and row['adapter'] != previous_channels[row['id']]['adapter'] for row in channels):
            raise ValueError('Создайте новый канал для другого адаптера; ID существующего канала сохраняет свой смысл')
        tariff = self.tariff_version(update_dict.pop('tariff', None), before.get('pricing_history', []))
        guarded = {'id': source_id}
        dimension_change = bool({'channels', 'campaigns'}.intersection(update_dict)) or tariff is not None
        if dimension_change:
            revision = before.get('dimensions_revision', 0)
            if update_dict.pop('dimensions_revision', revision) != revision:
                raise ValueError('Настройки уже изменены другим пользователем; откройте источник заново')
            guarded['dimensions_revision'] = before.get('dimensions_revision')
            update_dict['dimensions_revision'] = revision + 1
        update = {'$set': update_dict}
        if tariff:
            update['$push'] = {'pricing_history': tariff}
        update_dict["updated_at"] = datetime.utcnow()
        
        result = await self.collection.update_one(
            guarded,
            storage(update)
        )
        
        if result.modified_count > 0:
            return await self.get_source_by_id(source_id)
        if dimension_change and not result.matched_count:
            raise ValueError('Настройки изменены одновременно; откройте источник заново')
        return None
    
    async def delete_source(self, source_id: str) -> bool:
        """Удалить источник (только если нет связанных заявок)"""
        document = await self.collection.find_one({'id': source_id})
        if document and document.get('expenses'):
            raise ValueError('Источник с сохранёнными расходами нельзя удалить; отключите его')
        # Проверяем, есть ли заявки с этим источником
        leads_count = await self.leads_collection.count_documents({"source_id": source_id})
        
        if leads_count > 0:
            raise ValueError(f"Невозможно удалить источник: найдено {leads_count} заявок с этим источником")

        for name in ('patients', 'appointments', 'crm_funnel_events'):
            if await getattr(self.db, name).count_documents({'source_id': source_id}):
                raise ValueError('Источник связан с историей пациента, записи или воронки; отключите его вместо удаления')

        if await self.db.crm_inbound_source_mappings.find_one({'source_id': source_id}):
            raise ValueError('Сначала снимите привязку входящего номера в форме источника')
        
        result = await self.collection.delete_one({"id": source_id})
        return result.deleted_count > 0
    
    async def get_sources(
        self, 
        skip: int = 0, 
        limit: int = 50,
        status: Optional[SourceStatus] = None,
        source_type: Optional[SourceType] = None,
        search: Optional[str] = None
    ) -> List[Source]:
        """Получить список источников с фильтрацией"""
        query = {}
        
        if status:
            query["status"] = status
        if source_type:
            query["type"] = source_type
        if search:
            query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"description": {"$regex": search, "$options": "i"}},
                {"url": {"$regex": search, "$options": "i"}}
            ]
        
        cursor = self.collection.find(query).sort("created_at", DESCENDING).skip(skip).limit(limit)
        sources_data = await cursor.to_list(None)
        
        # Обновляем статистику для всех источников
        sources = []
        for source_data in sources_data:
            await self._update_source_statistics(source_data["id"])
            updated_source_data = await self.collection.find_one({"id": source_data["id"]})
            sources.append(Source(**self._normalize_source_doc(updated_source_data)))
        
        return sources
    
    async def count_sources(
        self,
        status: Optional[SourceStatus] = None,
        source_type: Optional[SourceType] = None,
        search: Optional[str] = None
    ) -> int:
        """Подсчитать количество источников"""
        query = {}
        if status:
            query["status"] = status
        if source_type:
            query["type"] = source_type
        if search:
            query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"description": {"$regex": search, "$options": "i"}},
                {"url": {"$regex": search, "$options": "i"}}
            ]
        
        return await self.collection.count_documents(query)
    
    async def get_statistics(self) -> Dict[str, Any]:
        """Получить статистику по источникам"""
        # Обновляем статистику для всех источников
        sources = await self.get_sources(limit=1000)
        
        if not sources:
            return {
                "total_sources": 0,
                "active_sources": 0,
                "inactive_sources": 0,
                "total_leads": 0,
                "total_conversions": 0,
                "avg_conversion_rate": 0.0,
                "total_cost": 0.0,
                "avg_cost_per_lead": 0.0,
                "by_type": {},
                "top_sources": []
            }
        
        # Основная статистика
        total_sources = len(sources)
        active_sources = len([s for s in sources if s.status == SourceStatus.ACTIVE])
        inactive_sources = total_sources - active_sources
        
        total_leads = sum(s.leads_count for s in sources)
        total_conversions = sum(s.conversion_count for s in sources)
        total_cost = sum(s.total_cost for s in sources)
        
        avg_conversion_rate = (total_conversions / total_leads * 100) if total_leads > 0 else 0.0
        avg_cost_per_lead = (total_cost / total_leads) if total_leads > 0 else 0.0
        
        # Статистика по типам
        by_type = {}
        for source in sources:
            source_type = source.type
            if source_type not in by_type:
                by_type[source_type] = 0
            by_type[source_type] += 1
        
        # Топ источников по конверсии
        top_sources = sorted(sources, key=lambda s: s.conversion_rate, reverse=True)[:5]
        top_sources_data = [
            {
                "id": s.id,
                "name": s.name,
                "type": s.type,
                "conversion_rate": s.conversion_rate,
                "leads_count": s.leads_count
            }
            for s in top_sources
        ]
        
        return {
            "total_sources": total_sources,
            "active_sources": active_sources,
            "inactive_sources": inactive_sources,
            "total_leads": total_leads,
            "total_conversions": total_conversions,
            "avg_conversion_rate": round(avg_conversion_rate, 1),
            "total_cost": round(total_cost, 2),
            "avg_cost_per_lead": round(avg_cost_per_lead, 2),
            "by_type": by_type,
            "top_sources": top_sources_data
        }
    
    async def _update_source_statistics(self, source_id: str):
        """Обновить статистику источника на основе заявок"""
        # Подсчет общего количества заявок (используем source_id вместо source)
        total_leads = await self.leads_collection.count_documents({"source_id": source_id})
        
        # Подсчет заявок за текущий месяц
        month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        leads_this_month = await self.leads_collection.count_documents({
            "source_id": source_id,
            "created_at": {"$gte": month_start}
        })
        
        # Подсчет конверсий (заявки со статусом "converted")
        conversions = await self.leads_collection.count_documents({
            "source_id": source_id,
            "status": "converted"
        })
        
        # Расчет процента конверсии
        conversion_rate = (conversions / total_leads * 100) if total_leads > 0 else 0.0
        
        # Обновляем источник
        await self.collection.update_one(
            {"id": source_id},
            {
                "$set": {
                    "leads_count": total_leads,
                    "leads_this_month": leads_this_month,
                    "conversion_count": conversions,
                    "conversion_rate": round(conversion_rate, 1),
                    "updated_at": datetime.utcnow()
                }
            }
        )
    
    async def update_all_statistics(self):
        """Обновить статистику для всех источников"""
        sources = await self.collection.find({}).to_list(None)
        for source in sources:
            await self._update_source_statistics(source["id"])

