"""Exact, evidence-based attribution. Ambiguity never falls back to a name/type."""
from fastapi import HTTPException

DIMENSIONS = ('channel_id', 'campaign_id')


def configured_dimensions(source, channel_id=None, campaign_id=None, *, active=True):
    channels = {row['id']: row for row in source.get('channels', [])}
    campaigns = {row['id']: row for row in source.get('campaigns', [])}
    campaign = campaigns.get(campaign_id) if campaign_id else None
    if campaign_id and (not campaign or (active and not campaign.get('active', True))):
        raise HTTPException(422, 'Кампания недоступна в выбранном источнике')
    if campaign and campaign.get('channel_id'):
        if channel_id and channel_id != campaign['channel_id']:
            raise HTTPException(422, 'Кампания относится к другому каналу')
        channel_id = campaign['channel_id']
    channel = channels.get(channel_id) if channel_id else None
    if channel_id and (not channel or (active and not channel.get('active', True))):
        raise HTTPException(422, 'Канал недоступен в выбранном источнике')
    return dict(channel_id=channel_id, channel_name=channel.get('name') if channel else None,
                campaign_id=campaign_id, campaign_name=campaign.get('name') if campaign else None)


async def validate_lead_attribution(db, fields, before=None):
    """Explicit manual selection only. No inference from the legacy source enum."""
    before = before or {}
    source_id = fields.get('source_id', before.get('source_id'))
    changed_source = 'source_id' in fields and source_id != before.get('source_id')
    channel_id = fields.get('channel_id', None if changed_source else before.get('channel_id'))
    campaign_id = fields.get('campaign_id', None if changed_source else before.get('campaign_id'))
    if not source_id:
        if channel_id or campaign_id:
            raise HTTPException(422, 'Сначала выберите источник')
        return dict(channel_id=None, channel_name=None, campaign_id=None, campaign_name=None)
    source = await db.crm_sources.find_one({'id': source_id})
    if not source:
        if not channel_id and not campaign_id:
            return dict(channel_id=None, channel_name=None, campaign_id=None, campaign_name=None)
        raise HTTPException(422, 'Источник недоступен')
    return configured_dimensions(source, channel_id, campaign_id)


def resolve_signals(sources, evidence, adapter):
    """For supported authenticated adapters only; all configured signals must match.

    Returns unknown for missing/ambiguous signals. Merely selecting an adapter
    in the catalog does not install a form/advertising/WhatsApp integration.
    """
    matches = []
    for source in sources:
        if source.get('status', 'active') != 'active':
            continue
        channels = {row['id']: row for row in source.get('channels', [])}
        for channel in channels.values():
            signals = {key: value for key, value in channel.get('signals', {}).items() if value is not None}
            if (channel.get('active', True) and channel['adapter'] == adapter and signals
                    and all(isinstance(evidence.get(key), str) and evidence[key] == value for key, value in signals.items())):
                matches.append(dict(source_id=source['id'], source_name=source['name'],
                                    **configured_dimensions(source, channel['id'])))
        for campaign in source.get('campaigns', []):
            channel = channels.get(campaign.get('channel_id'))
            signals = {key: value for key, value in campaign.get('signals', {}).items() if value is not None}
            if (not campaign.get('active', True) or not signals
                    or (channel and (not channel.get('active', True) or channel['adapter'] != adapter))):
                continue
            if all(isinstance(evidence.get(key), str) and evidence[key] == value for key, value in signals.items()):
                matches.append(dict(source_id=source['id'], source_name=source['name'],
                                    **configured_dimensions(source, channel['id'] if channel else None, campaign['id'])))
    origins = {row['source_id'] for row in matches}
    channels = {row['channel_id'] for row in matches if row['channel_id']}
    if len(origins) != 1 or len(channels) > 1:
        return None
    campaigns = {row['campaign_id'] for row in matches if row['campaign_id']}
    if len(campaigns) > 1:
        return None
    source = next(source for source in sources if source['id'] in origins)
    return dict(source_id=source['id'], source_name=source['name'],
                **configured_dimensions(source, next(iter(channels), None), next(iter(campaigns), None)))


def detection_status(sources, mappings):
    """Configured rules vs installed input paths, including potential conflicts."""
    rows = []
    for source in sources:
        for field in ('channels', 'campaigns'):
            for item in source.get(field, []):
                signals = {key: value for key, value in item.get('signals', {}).items() if value is not None}
                attached = [row for row in mappings if row.get('source_id') == source['id']
                            and row.get('channel_id' if field == 'channels' else 'campaign_id') == item['id']]
                rows.append({'source_id': source['id'], 'id': item['id'], 'dimension': field,
                             'adapter': item.get('adapter') if field == 'channels' else next((channel['adapter'] for channel in source.get('channels', []) if channel['id'] == item.get('channel_id')), None), 'signals': signals,
                             'active': source.get('status', 'active' if source.get('is_active', True) else 'inactive') == 'active' and item.get('active', True),
                             'status': 'настроен' if attached else 'правило задано; входящий адаптер не подключён' if signals
                             else 'детектор не настроен', 'conflicts': []})
    for row in rows:
        if not row['active']:
            row['status'] = 'отключён'
            continue
        for other in rows:
            if other is row or not other['active'] or not row['signals'] or not other['signals']:
                continue
            if row['dimension'] != other['dimension'] and row['source_id'] == other['source_id']:
                continue
            if row['adapter'] and other['adapter'] and row['adapter'] != other['adapter']:
                continue
            shared = set(row['signals']) & set(other['signals'])
            if all(row['signals'][key] == other['signals'][key] for key in shared):
                row['conflicts'].append({'source_id': other['source_id'], 'id': other['id']})
        if row['conflicts']:
            row['status'] = 'конфликт правил; автоопределение неоднозначно'
    return rows
