"""No real DB, imports of application startup, provider calls or migrations."""
import asyncio
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from crm.models.source import Source
from crm.models.source_dimensions import SourceChannel, SourceCampaign, SourceExpense, SourceTariff, validate_dimensions
from crm.schemas.source_schemas import SourceCreate, SourceUpdate
from crm.services.source_service import SourceService
from crm.services.source_attribution import configured_dimensions, resolve_signals, validate_lead_attribution, detection_status
from crm.services.source_expenses import append_expense, check_expense, expense_summary
from test_event_funnel import Collection

NOW = datetime.now(timezone.utc)


def source():
    return dict(id='custom-origin', name='Произвольное привлечение', type='website', status='active',
                channels=[dict(id='call', name='Звонок с сайта', adapter='phone', active=True),
                          dict(id='web', name='Заявка через форму', adapter='form', active=True),
                          dict(id='chat', name='Чат с меткой', adapter='whatsapp', active=True)],
                campaigns=[dict(id='launch', name='Кампания осени', channel_id='web', active=True,
                                signals={'form_id': 'form-17', 'utm_source': 'network-z', 'utm_campaign': 'launch'})])


def expense(identifier='entry', **patch):
    return SourceExpense(id=identifier, start=NOW-timedelta(days=2), end=NOW-timedelta(days=1),
                         amount=100, currency='KZT', **patch)


def test_unlimited_user_named_channels_ids_and_legacy_compatibility():
    channels = [SourceChannel(id=f'arbitrary-{i}', name=f'Название {i}') for i in range(70)]
    assert len(validate_dimensions(channels, [])[0]) == 70
    assert Source(id='old', name='Сайт', type='website').channels == []
    assert Source(id='old', name='Сайт', type='website').pricing_history == []
    with pytest.raises(ValueError): validate_dimensions([channels[0], channels[0]], [])
    with pytest.raises(ValueError): validate_dimensions(channels, [SourceCampaign(name='x', channel_id='foreign')])
    with pytest.raises(ValidationError): SourceChannel(name=' ', adapter='manual')
    with pytest.raises(ValidationError): SourceChannel(name='Google Ads', adapter='Google Ads')


def test_evidence_matches_all_exact_signals_or_stays_unknown():
    catalog = source()
    evidence = dict(form_id='form-17', utm_source='network-z', utm_campaign='launch')
    result = resolve_signals([catalog], evidence, 'form')
    assert (result['source_id'], result['channel_id'], result['campaign_id']) == ('custom-origin', 'web', 'launch')
    assert resolve_signals([catalog], {}, 'whatsapp') is None
    assert resolve_signals([catalog], evidence, 'whatsapp') is None
    assert resolve_signals([catalog], {**evidence, 'form_id': 'other'}, 'form') is None
    assert resolve_signals([catalog, {**catalog, 'id': 'other'}], evidence, 'form') is None
    catalog['channels'][1]['active'] = False
    assert resolve_signals([catalog], evidence, 'form') is None


def test_manual_dimensions_belong_to_source_and_preserve_existing_on_unrelated_update():
    async def scenario():
        db = SimpleNamespace(crm_sources=Collection([source()]))
        assert (await validate_lead_attribution(db, {'source_id': 'custom-origin', 'campaign_id': 'launch'}))['channel_id'] == 'web'
        with pytest.raises(HTTPException): await validate_lead_attribution(db, {'source_id': None, 'channel_id': 'web'})
        with pytest.raises(HTTPException): await validate_lead_attribution(db, {'source_id': 'custom-origin', 'channel_id': 'call', 'campaign_id': 'launch'})
        with pytest.raises(HTTPException): configured_dimensions(source(), channel_id='foreign')
        before = dict(source_id='custom-origin', channel_id='call', campaign_id=None)
        assert (await validate_lead_attribution(db, {}, before))['channel_id'] == 'call'
        assert (await validate_lead_attribution(db, {'source_id': None}, before))['channel_id'] is None
    asyncio.run(scenario())


def test_rules_show_conflict_and_distinguish_configuration_from_installed_detector():
    catalog = source()
    catalog['channels'][1]['signals'] = {'form_id': 'unique-form'}
    assert resolve_signals([catalog], {'form_id': 'unique-form'}, 'form')['campaign_id'] is None
    duplicate = deepcopy(catalog['channels'][1]); duplicate['id'] = 'competing'
    catalog['channels'].append(duplicate)
    assert resolve_signals([catalog], {'form_id': 'unique-form'}, 'form') is None
    statuses = detection_status([catalog], [{'source_id': catalog['id'], 'channel_id': 'call'}])
    assert next(row for row in statuses if row['id'] == 'call')['status'] == 'настроен'
    assert next(row for row in statuses if row['id'] == 'chat')['status'] == 'детектор не настроен'
    assert len(next(row for row in statuses if row['id'] == 'web')['conflicts']) == 1
    with pytest.raises(ValidationError): SourceCampaign(name='x', start_date='2026-10-22', end_date='2026-10-21')
    campaign = SourceCampaign(name='Independent', tags=['one', 'one', 'two'])
    assert campaign.channel_id is None and campaign.tags == ['one', 'two']


def test_campaign_dates_are_stored_as_bson_compatible_strings():
    from crm.services.source_service import storage
    campaign = SourceCampaign(name='x', start_date='2026-10-01')
    assert storage(campaign.model_dump())['start_date'] == '2026-10-01'


def test_configuration_rename_archive_no_delete_or_adapter_reuse_and_stale_revision():
    async def scenario():
        db = SimpleNamespace(crm_sources=Collection([source()]), crm_leads=Collection())
        service = SourceService(db)
        async def read(identifier): return Source(**(await db.crm_sources.find_one({'id': identifier})))
        service.get_source_by_id = read
        updated = deepcopy(source()['channels']); updated[0]['name'] = 'Переименованный канал'
        await service.update_source('custom-origin', SourceUpdate(channels=updated, dimensions_revision=0))
        assert db.crm_sources.documents[0]['channels'][0]['id'] == 'call'
        assert db.crm_sources.documents[0]['channels'][0]['name'] == 'Переименованный канал'
        with pytest.raises(ValueError): await service.update_source('custom-origin', SourceUpdate(channels=updated, dimensions_revision=0))
        with pytest.raises(ValueError): await service.update_source('custom-origin', SourceUpdate(channels=[]))
        updated[0]['adapter'] = 'whatsapp'
        with pytest.raises(ValueError): await service.update_source('custom-origin', SourceUpdate(channels=updated))
        updated[0]['adapter'] = 'phone'; updated[0]['active'] = False
        result = await service.update_source('custom-origin', SourceUpdate(channels=updated, dimensions_revision=1))
        with pytest.raises(HTTPException): configured_dimensions(result.model_dump(), 'call')
        assert configured_dimensions(result.model_dump(), 'call', active=False)['channel_name'] == 'Переименованный канал'
    asyncio.run(scenario())


def test_tariff_versions_free_unknown_actual_and_not_expenses():
    assert SourceTariff(scheme='free', effective_at=NOW).amount == 0
    assert SourceTariff(scheme='actual', effective_at=NOW).amount is None
    for scheme in ('monthly', 'per_lead'):
        with pytest.raises(ValidationError): SourceTariff(scheme=scheme, effective_at=NOW)
        assert SourceTariff(scheme=scheme, effective_at=NOW, amount=0).amount == 0
    with pytest.raises(ValidationError): SourceTariff(scheme='actual', effective_at=NOW, amount=100)
    with pytest.raises(ValidationError): SourceTariff(scheme='free', effective_at=NOW, amount=100)
    with pytest.raises(ValidationError): SourceTariff(scheme='monthly', effective_at=NOW, amount=float('inf'))
    with pytest.raises(ValueError): SourceService.tariff_version(dict(scheme='free', amount=0, effective_at=NOW-timedelta(days=1)))
    previous = SourceService.tariff_version(dict(scheme='monthly', amount=1000, effective_at=NOW+timedelta(days=1)))
    next_version = SourceService.tariff_version(dict(scheme='actual', amount=None, effective_at=NOW+timedelta(days=2)), [previous])
    assert previous['amount'] == 1000 and next_version['amount'] is None
    with pytest.raises(ValueError): SourceService.tariff_version(dict(scheme='free', amount=0, effective_at=NOW), [previous])


def test_actual_expense_overlap_campaign_details_replay_and_zero():
    candidate = expense().model_dump()
    assert check_expense([candidate], candidate) == candidate
    with pytest.raises(HTTPException): check_expense([candidate], {**candidate, 'amount': 200})
    with pytest.raises(HTTPException): check_expense([candidate], {**candidate, 'id': 'campaign', 'campaign_id': 'launch'})
    campaign = {**candidate, 'campaign_id': 'launch'}
    assert check_expense([campaign], {**candidate, 'id': 'other', 'campaign_id': 'another'}) is None
    with pytest.raises(HTTPException): check_expense([campaign], {**candidate, 'id': 'total'})
    for patch in ({'currency': '???'}, {'clicks': -1}, {'clicks': 0.5}, {'impressions': -1}):
        data = {**candidate, **patch}
        with pytest.raises(ValidationError): SourceExpense(**data)


def test_expense_atomic_concurrency_idempotency_no_financial_writes_and_summary():
    async def scenario():
        leads = SimpleNamespace(distinct=AsyncMock(return_value=[]))
        db = SimpleNamespace(crm_sources=Collection([source()]), crm_leads=leads)
        payload = expense(clicks=0)
        results = await asyncio.gather(append_expense(db, 'custom-origin', payload, 'staff'), append_expense(db, 'custom-origin', payload, 'staff'))
        assert results[0]['id'] == results[1]['id']
        assert len(db.crm_sources.documents[0]['expenses']) == 1
        with pytest.raises(HTTPException): await append_expense(db, 'custom-origin', expense('overlap'), 'staff')
        summaries = await expense_summary(db, 'custom-origin')
        assert summaries[0]['cpc'] is None and summaries[0]['cpl'] is None
        leads.distinct.return_value = ['a', 'b', 'c', 'd', 'a', None]
        db.crm_sources.documents[0]['expenses'][0]['clicks'] = 10
        summaries = await expense_summary(db, 'custom-origin')
        assert summaries[0]['cpc'] == 10 and summaries[0]['cpl'] == 25
        query = leads.distinct.call_args.args[1]
        assert query['source_id'] == 'custom-origin' and query['created_at']['$lt'] == payload.end
        assert query['synthetic_batch_id'] == {'$exists': False}
        assert set(vars(db)) == {'crm_sources', 'crm_leads'}
    asyncio.run(scenario())
