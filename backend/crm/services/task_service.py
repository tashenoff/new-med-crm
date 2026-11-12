"""Task persistence shared by CRM lists and WhatsApp activity composer."""
import re
import uuid
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from ..models.task import Task, TaskStatus
from ..schemas.task_schemas import TaskCreate, TaskUpdate, TaskSearchFilters
from services.wazzup_chat_service import WazzupChatService

class TaskService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.crm_tasks

    async def _prepare(self, values, existing=None):
        existing = existing or {}
        for required in ('title', 'kind', 'type', 'status', 'priority'):
            if required in values and values[required] is None:
                raise HTTPException(422, f'{required} cannot be null')
        if values.get('lead_id') and values.get('lead_id') != existing.get('lead_id'):
            if not await self.db.crm_leads.find_one({'id': values['lead_id']}):
                raise HTTPException(422, 'Заявка не найдена')
        if 'title_id' in values and values['title_id']:
            title = await self.db.crm_task_titles.find_one({'id': values['title_id']})
            if not title or (not title.get('is_active', True) and values['title_id'] != existing.get('title_id')):
                raise HTTPException(422, 'Название задачи отсутствует в активном справочнике')
            values['title'] = title['name']
        if 'assigned_to' in values:
            if values['assigned_to']:
                manager = await self.db.crm_managers.find_one({'id': values['assigned_to']})
                if not manager or manager.get('status', 'active') != 'active':
                    raise HTTPException(422, 'Ответственный менеджер не найден или неактивен')
                values['assigned_to_name'] = ' '.join(filter(None, [manager.get('last_name'), manager.get('first_name'), manager.get('middle_name')]))
            else:
                values['assigned_to_name'] = None
        if 'chat_phone' in values:
            if values['chat_phone']:
                phone = WazzupChatService._norm_phone(values['chat_phone'])
                if not re.fullmatch(r'\+\d{7,15}', phone):
                    raise HTTPException(422, 'Некорректный телефон чата')
                chat = await WazzupChatService(self.db).get_chat(phone)
                if not chat:
                    raise HTTPException(404, 'Чат не найден')
                values.update(chat_phone=phone, chat_name=chat.get('contact_name') or chat.get('patient_name') or phone)
                # Link only from the verified chat, never from a client supplied name.
                values['lead_id'] = chat.get('linked_lead_id') or chat.get('lead_id')
                values['client_id'] = chat.get('linked_patient_id') or chat.get('patient_id')
            else:
                values['chat_name'] = None
        if values.get('kind', existing.get('kind', 'task')) != 'task':
            values.update(due_date=None, due_time=None)
        return values

    async def create_task(self, task_data: TaskCreate, created_by=None) -> Task:
        values = await self._prepare(task_data.model_dump())
        now = datetime.utcnow()
        task = Task(**dict(values, id=str(uuid.uuid4()), created_by=created_by, created_at=now, updated_at=now))
        if task.is_overdue():
            task.status = TaskStatus.OVERDUE
        await self.collection.insert_one(task.model_dump())
        return task

    async def get_task_by_id(self, task_id) -> Optional[Task]:
        document = await self.collection.find_one({'id': task_id})
        return Task(**document) if document else None

    async def update_task(self, task_id, update_data: TaskUpdate) -> Optional[Task]:
        existing = await self.get_task_by_id(task_id)
        if not existing:
            return None
        values = await self._prepare(update_data.model_dump(exclude_unset=True), existing.model_dump())
        values['updated_at'] = datetime.utcnow()
        if values.get('status') == TaskStatus.COMPLETED:
            values['completed_at'] = datetime.utcnow()
        elif 'status' in values:
            values['completed_at'] = None
        await self.collection.update_one({'id': task_id}, {'$set': values})
        return await self.get_task_by_id(task_id)

    async def delete_task(self, task_id):
        result = await self.collection.delete_one({'id': task_id})
        return result.deleted_count > 0

    @staticmethod
    def _query(filters=None):
        if not filters:
            return {}
        query = {}
        for field in ('status', 'type', 'priority'):
            if getattr(filters, field):
                query[field] = {'$in': getattr(filters, field)}
        for field in ('assigned_to', 'created_by', 'lead_id', 'client_id', 'deal_id', 'doctor_id'):
            if getattr(filters, field):
                query[field] = getattr(filters, field)
        if filters.chat_phone:
            query['chat_phone'] = WazzupChatService._norm_phone(filters.chat_phone)
        if filters.kind:
            if filters.kind == 'note':
                query['$and'] = [{'$or': [{'kind': 'note'}, {'kind': None, 'type': 'note'}]}]
            else:
                query['kind'] = {'$in': ['task', None]} if filters.kind == 'task' else filters.kind
                if filters.kind == 'task':
                    query.setdefault('type', {})['$ne'] = 'note'
        for field, start, end in [('due_date', filters.due_from, filters.due_to), ('created_at', filters.created_from, filters.created_to)]:
            if start or end:
                query[field] = {}
                if start: query[field]['$gte'] = start
                if end: query[field]['$lte'] = end
        if filters.search:
            query['$or'] = [{field: {'$regex': re.escape(filters.search), '$options': 'i'}} for field in ('title', 'description', 'comment', 'chat_name')]
        if filters.show_overdue:
            query.setdefault('due_date', {})['$lt'] = datetime.utcnow()
            query.setdefault('status', {})['$nin'] = [TaskStatus.COMPLETED, TaskStatus.CANCELLED]
            query['kind'] = {'$in': ['task', None]}
            query.setdefault('type', {})['$ne'] = 'note'
        if not filters.show_completed:
            query.setdefault('status', {})['$ne'] = TaskStatus.COMPLETED
        return query

    async def get_tasks(self, skip=0, limit=50, filters=None) -> List[Task]:
        documents = await self.collection.find(self._query(filters)).sort([('due_date', 1), ('created_at', -1), ('id', 1)]).skip(skip).limit(limit).to_list(length=limit)
        return [Task(**document) for document in documents]

    async def count_tasks(self, filters=None):
        return await self.collection.count_documents(self._query(filters))

    async def complete_task(self, task_id):
        return await self.update_task(task_id, TaskUpdate(status=TaskStatus.COMPLETED))

    async def cancel_task(self, task_id):
        return await self.update_task(task_id, TaskUpdate(status=TaskStatus.CANCELLED))

    async def get_tasks_by_lead(self, lead_id):
        return await self.get_tasks(limit=200, filters=TaskSearchFilters(lead_id=lead_id))

    async def get_tasks_by_client(self, client_id):
        return await self.get_tasks(limit=200, filters=TaskSearchFilters(client_id=client_id))

    async def get_overdue_tasks(self, assigned_to=None):
        return await self.get_tasks(limit=200, filters=TaskSearchFilters(assigned_to=assigned_to, show_overdue=True))

    async def get_today_tasks(self, assigned_to=None):
        start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        return await self.get_tasks(limit=200, filters=TaskSearchFilters(assigned_to=assigned_to, due_from=start, due_to=start + timedelta(days=1, microseconds=-1), show_completed=False, kind='task'))

    async def update_overdue_tasks(self):
        result = await self.collection.update_many({'due_date': {'$lt': datetime.utcnow()}, 'kind': {'$in': ['task', None]}, 'type': {'$ne': 'note'}, 'status': {'$nin': [TaskStatus.COMPLETED, TaskStatus.CANCELLED, TaskStatus.OVERDUE]}}, {'$set': {'status': TaskStatus.OVERDUE, 'updated_at': datetime.utcnow()}})
        return result.modified_count

    async def assignees(self):
        documents = await self.db.crm_managers.find({'status': 'active'}, {'id': 1, 'first_name': 1, 'last_name': 1, 'middle_name': 1}).sort('last_name', 1).to_list(length=1000)
        return [{'id': document['id'], 'name': ' '.join(filter(None, [document.get('last_name'), document.get('first_name'), document.get('middle_name')]))} for document in documents if document.get('id')]
