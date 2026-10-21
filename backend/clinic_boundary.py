"""Fail closed when a legacy single-clinic database contains other tenants.

This is deliberately a quarantine boundary, not multi-tenant support. Existing
unlabelled documents belong to the configured clinic; sharing a database between
clinics requires a separate reviewed query/aggregation migration.
"""
import os
from fastapi import HTTPException

CLINICAL_COLLECTIONS = (
    'patients', 'doctors', 'appointments', 'documents', 'treatment_plans',
    'consultation_sheets', 'doctor_schedules', 'rooms', 'room_schedules',
    'materials', 'inventories', 'inventory_movements', 'service_prices',
    'crm_leads', 'crm_clients', 'crm_deals', 'crm_contacts', 'crm_tasks',
    'crm_sources', 'crm_managers', 'wazzup_chats', 'wazzup_messages',
    'telephony_calls', 'staff', 'users',
)


async def assert_single_clinic(db):
    clinic = os.environ.get('APP_CLINIC_ID', os.environ.get('CONSENT_CLINIC_ID', 'clinic'))
    for name in CLINICAL_COLLECTIONS:
        if await db[name].find_one({'clinic_id': {'$exists': True, '$ne': clinic}}, {'_id': 1}):
            raise HTTPException(403, 'Mixed-clinic database requires isolated storage')
