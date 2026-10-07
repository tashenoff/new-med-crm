from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException
from pydantic import ValidationError
from pymongo.errors import DuplicateKeyError
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
        write_concern = WriteConcern('majority', j=True)
        self.settings = db.system_settings.with_options(write_concern=write_concern)
        self.leads = db.crm_leads.with_options(write_concern=write_concern)

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
        return group_lead_touches(await self.leads.find({}, session=session).to_list(length=None))

    async def columns(self):
        await self.ensure_settings()
        columns = normalized_columns(await self.ready_configuration())
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
            {'_id': SETTINGS_ID, 'revision': document.get('revision'), 'pending_operation': None},
            {'$set': {'custom_columns': [dict(id=column['id'], name=column['name'])
                                         for column in columns if not column['is_system']],
                      'order': [column['id'] for column in columns]}, '$inc': {'revision': 1}},
            session=session,
        )
        return result.matched_count == 1

    async def mutate(self, operation):
        await self.ensure_settings()
        for attempt in range(5):
            document = await self.ready_configuration()
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

    async def ready_configuration(self):
        for attempt in range(5):
            document = await self.configuration()
            if not document.get('pending_operation'):
                return document
            await self.recover(document)
        raise HTTPException(409, 'Columns changed concurrently; reload and retry')

    async def reserve(self, document, operation):
        result = await self.settings.update_one(
            {'_id': SETTINGS_ID, 'revision': document.get('revision'), 'pending_operation': None},
            {'$set': {'pending_operation': operation}, '$inc': {'revision': 1}},
        )
        return result.matched_count == 1

    async def recover(self, document):
        operation = document['pending_operation']
        receipt = await self.settings.find_one({'_id': operation['id']})
        if receipt is None:
            if operation['kind'] == 'move':
                query = operation['source']
                update = {'$set': {'updated_at': operation['updated_at'],
                                   '_kanban_operation': operation['id']}}
                if operation['column_id'] == 'new':
                    update['$unset'] = {'kanban_column_id': ''}
                else:
                    update['$set']['kanban_column_id'] = operation['column_id']
                result = await self.leads.update_one(query, update)
                if result.matched_count == 0:
                    await self.leads.update_one(
                        {'id': query['id'], '_kanban_operation': query['_kanban_operation']},
                        {'$set': {'_kanban_operation': operation['id'] + '_cancelled'}},
                    )
                lead = await self.leads.find_one({'id': query['id']})
                applied = result.matched_count == 1 or (lead and lead.get('_kanban_operation') == operation['id'])
                if applied:
                    outcome = {'result': dict(lead_id=query['id'], column_id=operation['column_id'], status='new')}
                else:
                    outcome = {'error': 'Lead changed concurrently; reload and retry'}
            else:
                for attempt in range(5):
                    candidates = [group[0] for group in await self.groups()
                                  if group[0].get('status') == 'new'
                                  and group[0].get('kanban_column_id') == operation['column_id']]
                    if not candidates:
                        break
                    for canonical in candidates:
                        await self.leads.update_one(
                            {'id': canonical['id'], 'status': 'new',
                             'kanban_column_id': operation['column_id'],
                             '_kanban_operation': canonical.get('_kanban_operation')},
                            {'$set': {'updated_at': operation['updated_at'],
                                      '_kanban_operation': operation['id']},
                             '$unset': {'kanban_column_id': ''}},
                        )
                else:
                    raise HTTPException(409, 'Leads changed concurrently; retry deletion')
                applied = await self.leads.find({'_kanban_operation': operation['id']}).to_list(length=None)
                outcome = {'result': dict(id=operation['column_id'], affected_count=len(applied))}
            try:
                await self.settings.update_one(
                    {'_id': operation['id']}, {'$setOnInsert': {'outcome': outcome}}, upsert=True,
                )
            except DuplicateKeyError:
                if await self.settings.find_one({'_id': operation['id']}) is None:
                    raise
            receipt = await self.settings.find_one({'_id': operation['id']})

        current = await self.configuration()
        pending = current.get('pending_operation')
        if pending and pending['id'] == operation['id']:
            update = {'$unset': {'pending_operation': ''}, '$inc': {'revision': 1}}
            if operation['kind'] == 'delete':
                columns = [column for column in normalized_columns(current)
                           if column['id'] != operation['column_id']]
                update['$set'] = {
                    'custom_columns': [dict(id=column['id'], name=column['name'])
                                       for column in columns if not column['is_system']],
                    'order': [column['id'] for column in columns],
                }
            await self.settings.update_one(
                {'_id': SETTINGS_ID, 'revision': current.get('revision'), 'pending_operation': pending}, update,
            )
        return receipt['outcome']

    async def move(self, lead_id, identifier):
        await self.ensure_settings()
        for attempt in range(5):
            document = await self.ready_configuration()
            columns = normalized_columns(document)
            target = next((column for column in columns if column['id'] == identifier), None)
            if target is None:
                raise HTTPException(404, 'Kanban column not found')
            if not target['manual_move_allowed']:
                raise HTTPException(400, 'System destination is event-driven')
            group = next((group for group in await self.groups()
                          if any(touch.get('id') == lead_id for touch in group)), None)
            if group is None:
                raise HTTPException(404, 'Lead not found')
            canonical = group[0]
            current = canonical.get('kanban_column_id') or 'new'
            movable_ids = {column['id'] for column in columns if column['manual_move_allowed']}
            if canonical.get('status') != 'new' or current not in movable_ids:
                raise HTTPException(400, 'Only Unparsed/custom cards can move manually')
            operation = dict(id='crm_kanban_move_' + str(uuid4()), kind='move', column_id=identifier,
                             updated_at=datetime.utcnow(),
                             source={'id': canonical['id'], 'status': 'new',
                                     'kanban_column_id': canonical.get('kanban_column_id'),
                                     '_kanban_operation': canonical.get('_kanban_operation')})
            if await self.reserve(document, operation):
                outcome = await self.recover({'pending_operation': operation})
                if 'error' in outcome:
                    raise HTTPException(409, outcome['error'])
                return outcome['result']
        raise HTTPException(409, 'Columns changed concurrently; reload and retry')

    async def delete(self, identifier):
        if identifier in SYSTEM_COLUMNS:
            raise HTTPException(400, 'System columns cannot be renamed or deleted')

        await self.ensure_settings()
        receipt_id = 'crm_kanban_delete_' + identifier
        for attempt in range(5):
            document = await self.ready_configuration()
            receipt = await self.settings.find_one({'_id': receipt_id})
            if receipt is not None:
                return receipt['outcome']['result']
            columns = normalized_columns(document)
            self.custom_column(columns, identifier)
            operation = dict(id=receipt_id, kind='delete', column_id=identifier, updated_at=datetime.utcnow())
            if await self.reserve(document, operation):
                return (await self.recover({'pending_operation': operation}))['result']
        raise HTTPException(409, 'Columns changed concurrently; reload and retry')
