"""Idempotent task dictionary/index migration. Run explicitly on deployment.

    python migrations/20261112_crm_task_titles.py --apply

Does not grant users permissions or rewrite existing tasks.
"""
import argparse
import asyncio
from datetime import datetime
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from database import get_database

DEFAULT_TITLES = (
    ('contact', 'Связаться'), ('meeting', 'Встреча'), ('followup', 'Дожим'),
    ('payment-check', 'Проверка оплаты'), ('other', 'Другой'),
)

async def migrate(db):
    await db.crm_task_titles.create_index('name_key', unique=True)
    await db.crm_task_titles.create_index('id', unique=True)
    for code, name in DEFAULT_TITLES:
        await db.crm_task_titles.update_one({'name_key': name.casefold()}, {'$setOnInsert': {
            'id': 'task-title-' + code, 'name': name, 'name_key': name.casefold(),
            'is_active': True, 'created_at': datetime.utcnow(), 'updated_at': datetime.utcnow(),
        }}, upsert=True)
    await db.crm_tasks.create_index([('chat_phone', 1), ('created_at', -1)])
    await db.crm_tasks.create_index([('lead_id', 1), ('due_date', 1)])
    await db.crm_tasks.create_index([('assigned_to', 1), ('status', 1), ('due_date', 1)])

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args=parser.parse_args()
    if not args.apply:
        parser.error('Explicit --apply required; no changes made')
    asyncio.run(migrate(get_database()))
