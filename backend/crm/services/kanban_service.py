from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from pydantic import ValidationError
from pymongo.errors import DuplicateKeyError, OperationFailure
from pymongo.read_concern import ReadConcern
from pymongo.write_concern import WriteConcern

from ..schemas.kanban_schemas import ColumnName
from .lead_identity import group_lead_touches


SETTINGS_ID = 'crm_kanban_columns'
SYSTEM_COLUMNS = {
    'new': 'Неразобранные',
    'contacted': 'Записан на прием',
    'in_progress': 'Запись подтверждена',
    'converted': 'Пациент пришел',
    'closed': 'Оплачено',
}


def normalized_columns(document):
    custom = {}
    reserved_names = {name.casefold() for name in SYSTEM_COLUMNS.values()}
    stored = document.get('custom_columns', [])
    for column in stored if isinstance(stored, list) else []:
        if not isinstance(column, dict):
            continue
        identifier = column.get('id')
        if not isinstance(identifier, str) or not identifier.startswith('custom_') or identifier in custom:
            continue
        try:
            name = ColumnName(name=column.get('name')).name
        except ValidationError:
            continue
        if name.casefold() in reserved_names:
            continue
        reserved_names.add(name.casefold())
        custom[identifier] = name
    names = {**SYSTEM_COLUMNS, **custom}
    order = []
    stored_order = document.get('order', [])
    for identifier in stored_order if isinstance(stored_order, list) else []:
        if isinstance(identifier, str) and identifier in names and identifier not in order:
            order.append(identifier)
    order.extend(identifier for identifier in names if identifier not in order)
    return [dict(id=identifier, name=names[identifier], is_system=identifier in SYSTEM_COLUMNS,
                 manual_move_allowed=identifier == 'new' or identifier in custom, affected_count=0)
            for identifier in order]


class KanbanService:
    def __init__(self, db):
        self.db = db
        self.settings = db.system_settings

    async def ensure_settings(self):
        try:
            await self.settings.update_one(
                {'_id': SETTINGS_ID},
                {'$setOnInsert': {'custom_columns': [], 'order': list(SYSTEM_COLUMNS), 'revision': 0}},
                upsert=True,
            )
        except DuplicateKeyError:
            if await self.configuration() is None:
                raise

    async def configuration(self, session=None):
        return await self.settings.find_one({'_id': SETTINGS_ID}, session=session)

    async def groups(self, session=None):
        return group_lead_touches(await self.db.crm_leads.find({}, session=session).to_list(length=None))

    async def columns(self):
        await self.ensure_settings()
        columns = normalized_columns(await self.configuration())
        return await self.with_counts(columns)

    async def with_counts(self, columns):
        counts = {}
        for group in await self.groups():
            canonical = group[0]
            status = canonical.get('status')
            if status in SYSTEM_COLUMNS:
                identifier = (canonical.get('kanban_column_id') or 'new') if status == 'new' else status
                counts[identifier] = counts.get(identifier, 0) + 1
        for column in columns:
            column['affected_count'] = counts.get(column['id'], 0)
        return columns

    def custom_column(self, columns, identifier):
        if identifier in SYSTEM_COLUMNS:
            raise HTTPException(400, 'System columns cannot be renamed or deleted')
        column = next((column for column in columns if column['id'] == identifier), None)
        if column is None:
            raise HTTPException(404, 'Kanban column not found')
        return column

    def checked_name(self, name, columns, excluding=None):
        try:
            name = ColumnName(name=name).name
        except ValidationError as error:
            raise HTTPException(422, 'Invalid column name') from error
        if any(column['id'] != excluding and column['name'].casefold() == name.casefold() for column in columns):
            raise HTTPException(400, 'Column names must be unique')
        return name

    async def save(self, document, columns, session=None):
        result = await self.settings.update_one(
            {'_id': SETTINGS_ID, 'revision': document.get('revision')},
            {'$set': {'custom_columns': [dict(id=column['id'], name=column['name'])
                                         for column in columns if not column['is_system']],
                      'order': [column['id'] for column in columns]}, '$inc': {'revision': 1}},
            session=session,
        )
        return result.matched_count == 1

    async def mutate(self, operation):
        await self.ensure_settings()
        for attempt in range(5):
            document = await self.configuration()
            columns = normalized_columns(document)
            result = operation(columns)
            if await self.save(document, columns):
                return result
        raise HTTPException(409, 'Columns changed concurrently; reload and retry')

    async def create(self, name):
        identifier = 'custom_' + str(uuid4())

        def operation(columns):
            column = dict(id=identifier, name=self.checked_name(name, columns), is_system=False,
                          manual_move_allowed=True, affected_count=0)
            columns.append(column)
            return column

        return await self.mutate(operation)

    async def rename(self, identifier, name):
        def operation(columns):
            column = self.custom_column(columns, identifier)
            column['name'] = self.checked_name(name, columns, identifier)
            return column

        column = await self.mutate(operation)
        return (await self.with_counts([column]))[0]

    async def reorder(self, identifiers):
        def operation(columns):
            current = {column['id']: column for column in columns}
            if len(identifiers) != len(current) or len(set(identifiers)) != len(identifiers) or set(identifiers) != set(current):
                raise HTTPException(400, 'Order must contain every current column ID exactly once')
            columns[:] = [current[identifier] for identifier in identifiers]
            return columns

        return await self.with_counts(await self.mutate(operation))

    async def transaction(self, callback):
        await self.ensure_settings()
        try:
            async with await self.db.client.start_session() as session:
                return await session.with_transaction(
                    callback, read_concern=ReadConcern('snapshot'), write_concern=WriteConcern('majority'),
                )
        except OperationFailure as error:
            if error.code in (20, 303):
                raise HTTPException(503, 'Kanban move/delete requires MongoDB transaction support (replica set or mongos)') from error
            raise

    async def move(self, lead_id, identifier):
        async def operation(session):
            document = await self.configuration(session)
            columns = normalized_columns(document)
            target = next((column for column in columns if column['id'] == identifier), None)
            if target is None:
                raise HTTPException(404, 'Kanban column not found')
            if not target['manual_move_allowed']:
                raise HTTPException(400, 'System destination is event-driven')
            group = next((group for group in await self.groups(session)
                          if any(touch.get('id') == lead_id for touch in group)), None)
            if group is None:
                raise HTTPException(404, 'Lead not found')
            canonical = group[0]
            current = canonical.get('kanban_column_id') or 'new'
            movable_ids = {column['id'] for column in columns if column['manual_move_allowed']}
            if canonical.get('status') != 'new' or current not in movable_ids:
                raise HTTPException(400, 'Only Unparsed/custom cards can move manually')
            if not await self.save(document, columns, session):
                raise HTTPException(409, 'Columns changed concurrently; reload and retry')
            update = {'$set': {'updated_at': datetime.utcnow()}}
            if identifier == 'new':
                update['$unset'] = {'kanban_column_id': ''}
            else:
                update['$set']['kanban_column_id'] = identifier
            await self.db.crm_leads.update_one({'id': canonical['id']}, update, session=session)
            return dict(lead_id=canonical['id'], column_id=identifier, status='new')

        return await self.transaction(operation)

    async def delete(self, identifier):
        if identifier in SYSTEM_COLUMNS:
            raise HTTPException(400, 'System columns cannot be renamed or deleted')

        async def operation(session):
            document = await self.configuration(session)
            columns = normalized_columns(document)
            column = self.custom_column(columns, identifier)
            columns.remove(column)
            if not await self.save(document, columns, session):
                raise HTTPException(409, 'Columns changed concurrently; reload and retry')
            affected_count = 0
            for group in await self.groups(session):
                canonical = group[0]
                if canonical.get('status') == 'new' and canonical.get('kanban_column_id') == identifier:
                    await self.db.crm_leads.update_one(
                        {'id': canonical['id']},
                        {'$set': {'status': 'new', 'updated_at': datetime.utcnow()},
                         '$unset': {'kanban_column_id': ''}}, session=session,
                    )
                    affected_count += 1
            return dict(id=identifier, affected_count=affected_count)

        return await self.transaction(operation)
