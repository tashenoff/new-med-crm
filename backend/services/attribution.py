"""Validate one record's attribution. No patient acquisition/history writes."""
from fastapi import HTTPException

IDENTITY = ('source_id', 'channel_id', 'campaign_id')
NAMES = ('source_name', 'channel_name', 'campaign_name')


def dimensions(record):
    return {key: record.get(key) for key in (*IDENTITY, *NAMES)}


async def checked_attribution(db, payload, before=None):
    from crm.services.source_attribution import configured_dimensions
    from crm.services.source_service import SourceService
    before = before or {}
    source_id = payload.get('source_id', before.get('source_id')) or None
    changed_source = source_id != before.get('source_id')
    channel_id = payload.get('channel_id', None if changed_source else before.get('channel_id')) or None
    campaign_id = payload.get('campaign_id', None if changed_source else before.get('campaign_id')) or None
    identity = dict(source_id=source_id, channel_id=channel_id, campaign_id=campaign_id)
    if any(value is not None and (not isinstance(value, str) or not value.strip() or len(value) > 100) for value in identity.values()):
        raise HTTPException(422, 'Некорректный ID источника, способа обращения или кампании')
    # Existing archived/removed links remain displayable and can survive an
    # unrelated edit. A changed choice must be a valid, active source-owned link.
    if before and all(identity[key] == (before.get(key) or None) for key in IDENTITY):
        return {**identity, **{key: before.get(key) for key in NAMES}, 'source': before.get('source')}
    if not source_id:
        if channel_id or campaign_id:
            raise HTTPException(422, 'Сначала выберите источник для способа обращения и кампании')
        return {**identity, **{key: None for key in NAMES}, 'source': payload.get('source') or None}
    source = await db.crm_sources.find_one({'id': source_id})
    if not source:
        raise HTTPException(422, 'Источник недоступен; выберите другой или оставьте неизвестным')
    source = SourceService._normalize_source_doc(source)
    if source.get('status') != 'active':
        raise HTTPException(422, 'Источник отключён; выберите активный или оставьте неизвестным')
    return {'source_id': source_id, 'source': source['type'], 'source_name': source.get('name'),
            **configured_dimensions(source, channel_id, campaign_id)}
