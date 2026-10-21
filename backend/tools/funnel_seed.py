"""Synthetic CRM-only batch. Dry-run by default; never imports application code.

Explicit runtime steps must match the inspected Kanban configuration. No cleanup,
patients, appointments, tasks, payments, providers or notification calls exist.
Run only after reviewing target/manifest. Mongo credentials stay in server env.
"""
import argparse
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sys
from uuid import NAMESPACE_URL, uuid5


def identifier(batch, kind, index):
    return str(uuid5(NAMESPACE_URL, f'medcrm-synthetic-funnel:{batch}:{kind}:{index}'))


def seed_plan(columns, steps, unselected_step, *, batch, anchor, clinic):
    if not re.fullmatch(r'crm-funnel-demo-[a-zA-Z0-9_-]{1,70}', batch):
        raise ValueError('Batch must use crm-funnel-demo- namespace')
    by_id = {column['id']: column for column in columns}
    if len(steps) != 3 or len(set([*steps, unselected_step])) != 4 or any(key not in by_id for key in [*steps, unselected_step]):
        raise ValueError('Choose exactly 3 explicit different current steps and one different unselected current step; configuration is never changed')
    base = [column for column in columns if column.get('is_system') and column.get('manual_move_allowed')]
    if len(base) != 1:
        raise ValueError('Cannot unambiguously identify the existing manual-entry base state')
    if anchor.tzinfo is None:
        raise ValueError('Anchor requires timezone')
    anchor = anchor.astimezone(timezone.utc)
    start = anchor - timedelta(days=14)
    first, middle, last = steps
    sources = [dict(_id=f'crm_demo:{batch}:source:{index}', id=identifier(batch, 'source', index),
                    name=f'[TEST {batch}] Канал {index + 1}', type='other', status='active',
                    synthetic_batch_id=batch, clinic_id=clinic, description='Синтетический сценарий воронки; не реальный канал',
                    cost_per_lead=0, monthly_budget=None, created_at=start, updated_at=start)
               for index in range(4)]
    paths = [
        (0, [(first, 0), (unselected_step, .5), (middle, 1), (last, 3)], 'полный путь с необязательным этапом'),
        (0, [(first, 0), (middle, 2)], 'частичный путь'),
        (0, [(first, 0), (unselected_step, 1), (last, 2)], 'пропущен выбранный шаг'),
        (0, [(first, 0), (middle, 1), (first, 2), (middle, 3), (last, 4)], 'возврат и повтор'),
        (0, [(first, 0), (middle, 1), (last, 10)], 'последний шаг вне окна'),
        (1, [(first, 0), (middle, 1), (last, 2)], 'полный путь'),
        (1, [(first, 0)], 'только вход'),
        (1, [(first, 0), (last, 1)], 'пропущен выбранный шаг'),
        (1, [(first, 0), (middle, 8), (last, 9)], 'переходы вне окна'),
        (1, [(first, 0), (last, 1), (middle, 2), (last, 3)], 'поздний порядок с повторным последним шагом'),
        (None, [(first, 0), (middle, 1), (last, 2)], 'источник не указан'),
        ('unknown', [(first, 0), (middle, 1)], 'ID источника вне справочника'),
        (0, [(first, 12), (middle, 13)], 'окно ещё открыто'),
    ]
    deals, ledger = [], []
    for index, (source, path, title) in enumerate(paths):
        source_id = None if source is None else identifier(batch, 'unknown-source', 0) if source == 'unknown' else sources[source]['id']
        deal = dict(_id=f'crm_demo:{batch}:deal:{index}', id=identifier(batch, 'deal', index),
                    first_name=f'[TEST {batch}] {index + 1}: {title}', last_name='', phone='', email=None,
                    source='other', source_id=source_id, priority='medium', created_by='synthetic_funnel_seed',
                    synthetic_batch_id=batch, clinic_id=clinic, created_at=start + timedelta(days=path[0][1]),
                    description='Искусственное обращение. Без пациента, записи, платежа и получателя сообщений.',
                    budget=0, contact_attempts=0, _funnel_events=[], _funnel_version=len(path))
        previous = None
        for sequence, (stage, day) in enumerate(path, 1):
            stamp = start + timedelta(days=day)
            item = dict(_id=f'{deal["id"]}:{sequence}', deal_id=deal['id'], sequence=sequence,
                        occurred_at=stamp, kind='created' if sequence == 1 else 'transition',
                        from_stage_id=previous, to_stage_id=stage, source_id=source_id, source_type='other',
                        source_name=None, cause='synthetic_seed', synthetic_batch_id=batch, clinic_id=clinic)
            deal['_funnel_events'].append(item)
            ledger.append(item)
            previous = stage
        final = by_id[path[-1][0]]
        deal['status'] = final['id'] if final.get('is_system') else base[0]['id']
        if not final.get('is_system'):
            deal['kanban_column_id'] = final['id']
        deal['updated_at'] = path and deal['_funnel_events'][-1]['occurred_at']
        deals.append(deal)
    manifest = dict(_id=batch, batch_id=batch, namespace='crm-funnel-demo', clinic_id=clinic,
                    anchor=anchor, cohort_start=start, cohort_end=anchor + timedelta(seconds=1),
                    steps=steps, unselected_step=unselected_step, window_days=7,
                    collection_ids={name: [row['_id'] for row in rows] for name, rows in
                                    [('crm_sources', sources), ('crm_leads', deals), ('crm_funnel_events', ledger)]},
                    expected={'cohort': 13, 'reached': [13, 9, 5], 'conversion': 38.5, 'open_windows': 1,
                              'source_a': {'cohort': 6, 'reached': [6, 5, 2], 'conversion': 33.3},
                              'source_b': {'cohort': 5, 'reached': [5, 2, 2], 'conversion': 40},
                              'zero_sources': [sources[2]['id'], sources[3]['id']],
                              'missing_source': {'cohort': 1, 'reached': [1, 1, 1]},
                              'unknown_source': {'cohort': 1, 'reached': [1, 1, 0]},
                              'snapshot': {'total': 13, 'by_stage': {first: 1, middle: 3, last: 9, unselected_step: 0}}})
    return {'crm_sources': sources, 'crm_leads': deals, 'crm_funnel_events': ledger, 'crm_seed_manifests': [manifest]}


def canonical(value):
    return json.dumps(value, default=lambda obj: obj.isoformat() if isinstance(obj, datetime) else str(obj), sort_keys=True, ensure_ascii=False)


def manifest_summary(plan, database):
    return {'database': database, 'counts': {name: len(rows) for name, rows in plan.items()},
            'manifest': plan['crm_seed_manifests'][0],
            'sha256': hashlib.sha256(canonical(plan).encode()).hexdigest(),
            'external_calls': 0, 'patients': 0, 'appointments': 0, 'payments': 0,
            'cleanup': 'Not included. Requires separate authorization and manifest-only scope.'}


def apply_plan(db, plan):
    # Validate the entire namespace first. Existing unrelated documents abort.
    for name, rows in plan.items():
        for row in rows:
            existing = db[name].find_one({'$or': [{'_id': row['_id']}, *([{'id': row['id']}] if row.get('id') else [])]})
            if existing:
                if existing.get('synthetic_batch_id', existing.get('batch_id')) != row.get('synthetic_batch_id', row.get('batch_id')):
                    raise ValueError('Existing unrelated document collision; no writes allowed')
                # Mongo may decode UTC as naive. Normalize before comparing.
                normalize = lambda value: json.loads(canonical(value).replace('+00:00', ''))
                if normalize({key: existing.get(key) for key in row}) != normalize(row):
                    raise ValueError('Existing batch differs from manifest; no overwrite allowed')
    for name, rows in plan.items():
        for row in rows:
            db[name].update_one({'_id': row['_id']}, {'$setOnInsert': deepcopy(row)}, upsert=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--batch', required=True)
    parser.add_argument('--steps', nargs=3, required=True)
    parser.add_argument('--unselected-step', required=True)
    parser.add_argument('--anchor', required=True)
    parser.add_argument('--expect-db', required=True)
    parser.add_argument('--expect-clinic', required=True)
    parser.add_argument('--columns-file', required=True, help='Reviewed non-secret canonical columns export with configuration_sha256')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    from dotenv import load_dotenv
    from pymongo import MongoClient
    load_dotenv(Path(__file__).parents[1] / '.env')
    database = os.environ.get('DB_NAME')
    clinic = os.environ.get('APP_CLINIC_ID', os.environ.get('CONSENT_CLINIC_ID', 'clinic'))
    if not database or database != args.expect_db or clinic != args.expect_clinic:
        raise ValueError('Target database/clinic does not match reviewed plan')
    client = MongoClient(os.environ['MONGO_URL'], serverSelectionTimeoutMS=5000, tz_aware=True)
    db = client[database]
    try:
        config = db.system_settings.find_one({'_id': 'crm_kanban_columns'})
        if not config:
            raise ValueError('No persisted Kanban configuration; inspect and configure explicitly first')
        # Read canonical settings with no app imports or automatic initialization.
        # Exact API column configuration must be supplied by the reviewed export.
        exported = json.loads(Path(args.columns_file).read_text(encoding='utf-8-sig'))
        if exported.get('configuration_sha256') != hashlib.sha256(canonical(config).encode()).hexdigest():
            raise ValueError('Persisted Kanban configuration changed since reviewed export; stop and re-review')
        columns = exported['columns']
        if {item['id'] for item in columns} != set(config.get('order', [])):
            raise ValueError('Canonical configuration changed since review; stop and re-review')
        plan = seed_plan(columns, args.steps, args.unselected_step, batch=args.batch,
                         anchor=datetime.fromisoformat(args.anchor.replace('Z', '+00:00')), clinic=clinic)
        summary = manifest_summary(plan, database)
        summary['preflight_counts'] = {name: db[name].count_documents({}) for name in
                                       ('patients', 'users', 'service_prices', 'crm_sources', 'crm_leads', 'appointments', 'crm_funnel_events')}
        summary['dry_run'] = not args.apply
        if args.apply:
            apply_plan(db, plan)
            summary['batch_counts'] = {name: db[name].count_documents({'_id': {'$in': [row['_id'] for row in rows]}}) for name, rows in plan.items()}
        print(canonical(summary))
    finally:
        client.close()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Never print connection strings or environment values from driver errors.
        print(str(error) if isinstance(error, ValueError) else f'Seed stopped: {type(error).__name__}; inspect target/auth without revealing credentials', file=sys.stderr)
        raise SystemExit(1)
