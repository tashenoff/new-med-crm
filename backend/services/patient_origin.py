"""Patient provenance is separate from editable notes and message content."""


def _field(record, name):
    return record.get(name) if isinstance(record, dict) else getattr(record, name, None)


def _generated_description(lead):
    description = _field(lead, 'description') or ''
    creator = _field(lead, 'created_by')
    return (creator == 'wazzup_webhook' and description.startswith('Обращение через WhatsApp: ')
            or creator == 'telephony_webhook' and description == 'Обращение через Zadarma-звонок')


def patient_notes_from_lead(lead):
    # Manual CRM descriptions remain literal notes. Message snippets stay in CRM.
    return '' if _generated_description(lead) else (_field(lead, 'description') or '')


def crm_lead_origin(lead):
    source = _field(lead, 'source')
    return dict(kind='crm_lead', entity_id=_field(lead, 'id'),
        source=getattr(source, 'value', source), source_id=_field(lead, 'source_id'),
        **{key: _field(lead, key) for key in ('source_name', 'channel_id', 'channel_name', 'campaign_id', 'campaign_name') if _field(lead, key)},
        channel='whatsapp' if _field(lead, 'created_by') == 'wazzup_webhook' else None)


async def with_patient_origin(db, patient):
    """Project proven legacy generated notes without changing stored records.

    Never split notes on punctuation or infer that arbitrary text is a message.
    The entire note must match the linked CRM record's generation template.
    """
    if patient.get('origin') or not patient.get('crm_client_id'):
        return project_first_acquisition(patient)
    notes = patient.get('notes') or ''
    if not notes.startswith(('Создан из заявки CRM. ', 'Конвертирован из лида ', 'Конвертирован из CRM клиента ')):
        return patient
    identifier = patient['crm_client_id']
    lead = await db.crm_leads.find_one({'id': identifier})
    client = None
    if not lead:
        client = await db.crm_clients.find_one({'id': identifier})
        if client and client.get('source_lead_id'):
            lead = await db.crm_leads.find_one({'id': client['source_lead_id']})
    origin = None
    if lead and _generated_description(lead):
        description = lead.get('description') or ''
        if notes in (f'Создан из заявки CRM. {description}',
                     f'Конвертирован из лида {lead["id"]}. {description}'):
            origin = crm_lead_origin(lead)
    if not origin and client and notes == f'Конвертирован из CRM клиента {identifier}':
        origin = dict(kind='crm_client', entity_id=identifier)
    return project_first_acquisition({**patient, 'origin': {**origin, 'legacy_generated_note': True}} if origin else patient)


def project_first_acquisition(patient):
    # The conversion already saved these exact IDs. Project absent legacy
    # fields, without writing/reclassifying history or overriding explicit null.
    origin = patient.get('origin') or {}
    if 'source_id' not in patient and origin.get('source_id'):
        return {**patient, **{key: origin[key] for key in ('source_id', 'source_name', 'channel_id', 'channel_name', 'campaign_id', 'campaign_name') if key in origin}}
    return patient
