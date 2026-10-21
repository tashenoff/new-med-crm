"""Append-only manual marketing costs; no finance/payment/provider integration."""
from datetime import datetime, timezone
from fastapi import HTTPException
from .funnel_report import utc
from .source_attribution import configured_dimensions


def check_expense(existing, candidate):
    for row in existing:
        if row['id'] == candidate['id']:
            same = all(utc(row[key]) == utc(value) if key in ('start', 'end') else row.get(key) == value
                       for key, value in candidate.items())
            if not same:
                raise HTTPException(409, 'Этот ID расхода уже сохранён с другими данными')
            return row
        overlaps = utc(row['start']) < utc(candidate['end']) and utc(candidate['start']) < utc(row['end'])
        # A whole-source amount and campaign detail cannot both count the same
        # period. Same-campaign duplicate/overlap is also rejected atomically.
        if overlaps and (not row.get('campaign_id') or not candidate.get('campaign_id')
                         or row.get('campaign_id') == candidate.get('campaign_id')):
            raise HTTPException(409, 'Пересечение расходов: общий источник или эта кампания уже учтены за период')
    return None


async def append_expense(db, source_id, payload, actor):
    candidate = payload.model_dump()
    for attempt in range(12):
        source = await db.crm_sources.find_one({'id': source_id})
        if not source:
            raise HTTPException(404, 'Источник не найден')
        replay = check_expense(source.get('expenses', []), candidate)
        if replay:
            return replay
        if candidate['campaign_id']:
            configured_dimensions(source, campaign_id=candidate['campaign_id'])
        row = {**candidate, 'recorded_at': datetime.now(timezone.utc), 'recorded_by': actor}
        result = await db.crm_sources.update_one(
            {'id': source_id, 'expenses_revision': source.get('expenses_revision')},
            {'$push': {'expenses': row}, '$set': {'expenses_revision': source.get('expenses_revision', 0) + 1}})
        if result.matched_count:
            return row
    raise HTTPException(409, 'Расходы изменены одновременно; повторите запрос')


async def expense_summary(db, source_id):
    source = await db.crm_sources.find_one({'id': source_id})
    if not source:
        raise HTTPException(404, 'Источник не найден')
    results = []
    for row in source.get('expenses', []):
        query = {'source_id': source_id, 'created_at': {'$gte': utc(row['start']), '$lt': utc(row['end'])},
                 'synthetic_batch_id': {'$exists': False}}
        if row.get('campaign_id'):
            query['campaign_id'] = row['campaign_id']
        identifiers = await db.crm_leads.distinct('id', query)
        inquiries = len({str(identifier) for identifier in identifiers if identifier})
        results.append({**row, 'inquiries': inquiries,
                        'cpc': row['amount'] / row['clicks'] if row.get('clicks') else None,
                        'cpl': row['amount'] / inquiries if inquiries else None})
    return results
