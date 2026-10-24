"""Durable observed stage history. No reconstruction of legacy journeys.

The append and card change are one Mongo update, guarded by an optimistic version
and the actual prior stage/source. The separate immutable ledger is a mirror;
its outage cannot lose an event because reports also read the card's outbox.
Deletion must archive that outbox first. No notifications are emitted here.
"""
from copy import deepcopy
from datetime import datetime, timezone
import logging

from fastapi import HTTPException
from pymongo.results import UpdateResult
from .lead_identity import canonical_stage_id

log = logging.getLogger(__name__)
WATCHED = ('status', 'kanban_column_id', 'kanban_override_source')
GUARDED = (*WATCHED, 'source_id', 'source', 'source_name', 'channel_id', 'campaign_id', '_funnel_version')


def stage_id(document):
    return canonical_stage_id(document)

def event(document, sequence, previous, kind, cause, at=None):
    identifier = str(document['id'])
    return {
        '_id': f'{identifier}:{sequence}', 'deal_id': identifier, 'sequence': sequence,
        'occurred_at': at or datetime.now(timezone.utc), 'kind': kind,
        'from_stage_id': previous, 'to_stage_id': stage_id(document),
        'source_id': document.get('source_id'), 'source_type': document.get('source'),
        'source_name': document.get('source_name'), 'cause': cause,
        **{key: document.get(key) for key in ('channel_id', 'channel_name', 'campaign_id', 'campaign_name')},
        **({'clinic_id': document['clinic_id']} if document.get('clinic_id') else {}),
        **({'synthetic_batch_id': document['synthetic_batch_id']} if document.get('synthetic_batch_id') else {}),
    }


def creation_document(document, cause='create', at=None):
    result = deepcopy(document)
    result['_funnel_version'] = 1
    result['_funnel_events'] = [event(result, 1, None, 'created', cause, at)]
    return result


def apply_update(document, update):
    result = deepcopy(document)
    if set(update) - {'$set', '$unset', '$inc', '$push', '$setOnInsert'}:
        raise ValueError('Unsupported journal update operator')
    for field, value in update.get('$set', {}).items():
        result[field] = deepcopy(value)
    for field in update.get('$unset', {}):
        result.pop(field, None)
    for field, value in update.get('$inc', {}).items():
        result[field] = result.get(field, 0) + value
    return result


class FunnelLeadCollection:
    def __init__(self, db, collection=None, cause='crm'):
        self.raw = collection if collection is not None else db.crm_leads
        self.db = db
        self.cause = cause

    @property
    def ledger(self):
        return self.db.crm_funnel_events

    def __getattr__(self, name):
        return getattr(self.raw, name)

    async def archive(self, events):
        for item in events:
            # Mongo's unique _id supplies idempotency, with no replacement writes.
            await self.ledger.update_one({'_id': item['_id']}, {'$setOnInsert': item}, upsert=True)

    async def mirror(self, events):
        try:
            await self.archive(events)
        except Exception:
            log.exception('Funnel ledger mirror pending; durable card outbox retained')

    async def insert_one(self, document, **kwargs):
        prepared = creation_document(document, self.cause)
        result = await self.raw.insert_one(prepared, **kwargs)
        await self.mirror(prepared['_funnel_events'])
        return result

    async def update_one(self, query, update, **kwargs):
        fields = set(update.get('$set', {})) | set(update.get('$unset', {}))
        if not fields.intersection(WATCHED):
            return await self.raw.update_one(query, update, **kwargs)
        if kwargs.get('upsert'):
            raise ValueError('Create journaled deals using insert_one')
        for attempt in range(12):
            before = await self.raw.find_one(query)
            if not before:
                return UpdateResult({'n': 0, 'nModified': 0, 'ok': 1}, True)
            after = apply_update(before, update)
            changed = stage_id(before) != stage_id(after)
            guarded = {**query, **{field: before.get(field) for field in GUARDED}}
            prepared = deepcopy(update)
            events = before.get('_funnel_events', [])
            if changed:
                sequence = (before.get('_funnel_version') or 0) + 1
                item = event(after, sequence, stage_id(before), 'transition', self.cause)
                prepared.setdefault('$set', {})['_funnel_version'] = sequence
                if '_funnel_events' in prepared.get('$push', {}):
                    raise ValueError('Journal is server-owned')
                prepared.setdefault('$push', {})['_funnel_events'] = item
                events = [*events, item]
            result = await self.raw.update_one(guarded, prepared, **kwargs)
            if result.matched_count:
                await self.mirror(events)
                return result
        raise HTTPException(409, 'Card changed concurrently; reload and retry')

    async def delete_one(self, query, **kwargs):
        # Concurrent transitions after archiving must prevent this deletion.
        for attempt in range(12):
            document = await self.raw.find_one(query)
            if not document:
                return await self.raw.delete_one(query, **kwargs)
            await self.archive(document.get('_funnel_events', []))
            guarded = {**query, **{field: document.get(field) for field in GUARDED}}
            result = await self.raw.delete_one(guarded, **kwargs)
            if result.deleted_count:
                return result
        raise HTTPException(409, 'Card changed concurrently; reload and retry')
