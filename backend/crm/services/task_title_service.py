"""Managed task titles. Archiving never changes existing task history."""
from datetime import datetime
import uuid
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

class TaskTitleService:
    def __init__(self, db):
        self.collection = db.crm_task_titles

    @staticmethod
    def public(document):
        return {key: document.get(key) for key in ('id', 'name', 'is_active')}

    async def list(self, active_only=False):
        documents = await self.collection.find({'is_active': True} if active_only else {}).sort('name', 1).to_list(length=1000)
        return [self.public(document) for document in documents]

    async def create(self, payload):
        # Unique keys protect concurrent double submits, not merely UI checks.
        await self.collection.create_index('name_key', unique=True)
        document = dict(id=str(uuid.uuid4()), name=payload.name, name_key=payload.name.casefold(), is_active=payload.is_active, created_at=datetime.utcnow(), updated_at=datetime.utcnow())
        try:
            await self.collection.insert_one(document)
        except DuplicateKeyError:
            raise HTTPException(409, 'Такое название уже есть в справочнике (включая архив)')
        return self.public(document)

    async def update(self, identifier, payload):
        document = await self.collection.find_one({'id': identifier})
        if not document:
            raise HTTPException(404, 'Название задачи не найдено')
        values = payload.model_dump(exclude_unset=True)
        if any(value is None for value in values.values()):
            raise HTTPException(422, 'Название и активность не могут быть null')
        if 'name' in values:
            values['name_key'] = values['name'].casefold()
            await self.collection.create_index('name_key', unique=True)
        values['updated_at'] = datetime.utcnow()
        try:
            await self.collection.update_one({'id': identifier}, {'$set': values})
        except DuplicateKeyError:
            raise HTTPException(409, 'Такое название уже есть в справочнике')
        return self.public(dict(document, **values))
