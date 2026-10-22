"""One stable inquiry ID per unit. Observed journeys and current stock are distinct."""
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from .funnel_journal import stage_id


def utc(value):
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError:
            return None
    if not isinstance(value, datetime):
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def rate(numerator, denominator):
    return round(numerator / denominator * 100, 1) if denominator else None


def source_key(identifier, known):
    if not identifier:
        return 'missing-source'
    # Keep distinct deleted IDs distinct, too; no attribution is guessed by type.
    return 'source:' + str(identifier)


def observed_events(documents, ledger):
    unique = {}
    for item in [*ledger, *(item for doc in documents for item in doc.get('_funnel_events', []))]:
        at = utc(item.get('occurred_at'))
        if not item.get('_id') or not item.get('deal_id') or at is None:
            continue
        unique.setdefault(item['_id'], {**item, 'occurred_at': at})
    grouped = defaultdict(list)
    for item in unique.values():
        grouped[str(item['deal_id'])].append(item)
    for rows in grouped.values():
        rows.sort(key=lambda item: (item.get('sequence', 0), item['occurred_at'], item['_id']))
    return grouped


def build_report(documents, ledger, columns, sources, *, steps, start, end, window_days=30,
                 source_ids=None, channel_id=None, mode='history', as_of=None):
    as_of = utc(as_of) or datetime.now(timezone.utc)
    start, end = utc(start), utc(end)
    known = {source['id']: source for source in sources}
    configured = {column['id']: column['name'] for column in columns}
    current_ids = set(configured)
    selected = set(source_ids) if source_ids is not None else None
    events = observed_events(documents, ledger)
    units = []
    observed_ids = {item.get('to_stage_id') for journey in events.values() for item in journey if item.get('to_stage_id')}
    stage_options = [*columns, *[{'id': identifier, 'name': 'Архивный этап (' + identifier + ')', 'archived': True} for identifier in sorted(observed_ids - set(configured))]]
    configured.update({column['id']: column['name'] for column in stage_options})
    if mode == 'snapshot':
        seen = set()
        for doc in documents:
            created = utc(doc.get('created_at'))
            if not doc.get('id') or created is None or not start <= created < end:
                continue
            if str(doc['id']) in seen:
                continue
            seen.add(str(doc['id']))
            key = source_key(doc.get('source_id'), known)
            units.append({'id': str(doc['id']), 'key': key, 'channel_id': doc.get('channel_id'), 'stage': stage_id(doc)})
    else:
        for identifier, journey in events.items():
            entries = [item for item in journey if item.get('kind') in ('created', 'transition')
                       and item.get('to_stage_id') == steps[0] and item['occurred_at'] <= as_of]
            if not entries:
                continue
            entry = entries[0]
            if not start <= entry['occurred_at'] < end:
                continue
            key = source_key(entry.get('source_id'), known)
            deadline = entry['occurred_at'] + timedelta(days=window_days)
            reached = 1
            for item in journey:
                if (item.get('sequence', 0) <= entry.get('sequence', 0) or
                        item['occurred_at'] < entry['occurred_at'] or
                        item['occurred_at'] > min(deadline, as_of)):
                    continue
                if reached < len(steps) and item.get('to_stage_id') == steps[reached]:
                    reached += 1
            units.append({'id': identifier, 'key': key, 'channel_id': entry.get('channel_id'), 'reached': reached,
                          'window_open': as_of < deadline})

    all_units = units
    if selected is not None:
        units = [unit for unit in units if unit['key'] in selected]
    if channel_id is not None:
        units = [unit for unit in units if unit['channel_id'] == channel_id]
    available = [{'key': 'source:' + source['id'], 'name': source['name']} for source in sources]
    unavailable = sorted({unit['key'] for unit in all_units} - {item['key'] for item in available})
    for key in unavailable:
        available.append({'key': key, 'name': 'Источник не указан' if key == 'missing-source'
                          else 'Недоступный источник (' + key.removeprefix('source:') + ')'})
    # Explicitly selected zero-result groups remain visible; excluded groups do not.
    for key in sorted(selected or set()):
        if key not in {item['key'] for item in available}:
            available.append({'key': key, 'name': 'Источник не указан' if key == 'missing-source'
                              else 'Недоступный источник (' + key.removeprefix('source:') + ')'})
    source_options = list(available)
    if selected is not None:
        available = [item for item in available if item['key'] in selected]

    def summarize(rows):
        total = len(rows)
        if mode == 'snapshot':
            stages = [{'id': column['id'], 'name': column['name'],
                       'count': sum(unit['stage'] == column['id'] for unit in rows)} for column in columns]
            for stage in stages:
                stage['share'] = rate(stage['count'], total)
            outside = sum(unit['stage'] not in current_ids for unit in rows)
            return {'total': total, 'stages': stages, 'outside_current_columns': outside}
        counts = [sum(unit['reached'] > index for unit in rows) for index in range(len(steps))]
        stages = [{'id': identifier, 'name': configured.get(identifier, 'Недоступный этап'),
                   'count': counts[index], 'cohort_rate': rate(counts[index], total),
                   'previous_rate': rate(counts[index], counts[index - 1]) if index else None,
                   'previous_id': steps[index - 1] if index else None}
                  for index, identifier in enumerate(steps)]
        return {'total': total, 'stages': stages, 'converted': counts[-1],
                'conversion': rate(counts[-1], total),
                'open_windows': sum(unit['window_open'] for unit in rows)}

    return {'mode': mode, 'unit': 'crm_leads.id', 'start': start.isoformat(), 'end': end.isoformat(),
            'as_of': as_of.isoformat(), 'window_days': window_days,
            'stage_options': stage_options, 'source_options': source_options, 'totals': summarize(units),
            'sources': [{**source, **summarize([unit for unit in units if unit['key'] == source['key']])}
                        for source in available],
            'coverage': {'current_records': len(documents),
                         'current_without_observed_events': sum(str(doc.get('id')) not in events for doc in documents),
                         'observed_units': len(events),
                         'observed_since': min((item['occurred_at'] for rows in events.values() for item in rows), default=None)},
            'rules': {'entry': 'first_observed_entry_ever', 'sequence': 'selected_steps_in_order',
                      'skips': 'unselected_allowed_selected_not_inferred',
                      'returns': 'keep_progress', 'repeats': 'one_reach_per_deal',
                      'source': 'frozen_at_cohort_entry', 'channel': 'current_record' if mode == 'snapshot' else 'same_event_as_source_at_cohort_entry',
                      'window': 'entry_plus_days_inclusive'}}


async def load_report(db, columns, sources, *, synthetic_batch=None, **options):
    options.setdefault('as_of', datetime.now(timezone.utc))
    query = {'synthetic_batch_id': synthetic_batch} if synthetic_batch else {'synthetic_batch_id': {'$exists': False}}
    # No patient identities, phone numbers or financial data leave this report.
    documents = await db.crm_leads.find(query, {
        'id': 1, 'status': 1, 'kanban_column_id': 1, 'kanban_override_source': 1,
        'source_id': 1, 'channel_id': 1, 'created_at': 1, '_funnel_events': 1,
    }).to_list(length=None)
    ledger = await db.crm_funnel_events.find(query).to_list(length=None)
    return {**build_report(documents, ledger, columns, sources, **options), 'synthetic_batch': synthetic_batch}
