import asyncio
import importlib
from types import SimpleNamespace
from unittest.mock import AsyncMock

from httpx import ASGITransport, AsyncClient
import pytest

from test_inbound_sources import fixture, Collection
from test_funnel_seed import plan, COLUMNS, STEPS, AT


@pytest.fixture
def app(fixture, monkeypatch):
    routes = importlib.import_module('crm.routes.funnel')
    data = plan()
    for name, documents in data.items():
        setattr(fixture.db, name, Collection(documents))
    monkeypatch.setattr(routes, 'load_columns', AsyncMock(return_value=COLUMNS))
    fixture.app.include_router(routes.funnel_router, prefix='/api/crm')
    fixture.app.dependency_overrides[routes.get_database] = lambda: fixture.db
    return fixture.app, data


def test_real_report_api_uses_only_selected_sources_and_exact_seed_counts(app):
    async def scenario():
        application, data = app
        manifest = data['crm_seed_manifests'][0]
        params = [('start', manifest['cohort_start'].isoformat()), ('end', manifest['cohort_end'].isoformat()),
                  ('mode', 'history'), ('window_days', '7'), ('synthetic_batch', manifest['batch_id']),
                  *[('steps', step) for step in STEPS]]
        async with AsyncClient(transport=ASGITransport(app=application), base_url='http://fixture') as client:
            response = await client.get('/api/crm/funnel/report', params=params, headers={'Authorization': 'Bearer admin'})
            assert response.status_code == 200, response.text
            result = response.json()
            assert result['totals']['total'] == 13 and result['totals']['conversion'] == 38.5
            assert [stage['count'] for stage in result['totals']['stages']] == [13, 9, 5]
            key = 'source:' + data['crm_sources'][0]['id']
            zero = 'source:' + data['crm_sources'][2]['id']
            response = await client.get('/api/crm/funnel/report', params=[*params, ('source_selection', 'selected'), ('source_ids', key), ('source_ids', zero)], headers={'Authorization': 'Bearer admin'})
            result = response.json()
            assert [row['key'] for row in result['sources']] == [key, zero]
            assert result['totals']['total'] == 6 and result['sources'][1]['conversion'] is None
            response = await client.get('/api/crm/funnel/report', params=[*params, ('source_selection', 'selected')], headers={'Authorization': 'Bearer admin'})
            assert response.json()['sources'] == [] and response.json()['totals']['total'] == 0
            # Default report cannot silently include the demonstration batch.
            response = await client.get('/api/crm/funnel/report', params=[(k, v) for k, v in params if k != 'synthetic_batch'], headers={'Authorization': 'Bearer admin'})
            assert response.json()['totals']['total'] == 0
    asyncio.run(scenario())


def test_api_validation_and_existing_permission_boundary(app):
    async def scenario():
        application, data = app
        async with AsyncClient(transport=ASGITransport(app=application), base_url='http://fixture') as client:
            for query in [dict(start='2026-01-01', end='2026-02-01'), dict(start='2026-10-02T00:00:00Z', end='2026-10-01T00:00:00Z'),
                          dict(start='2026-01-01T00:00:00Z', end='2026-02-01T00:00:00Z', steps=['same', 'same']),
                          dict(start='2026-01-01T00:00:00Z', end='2026-02-01T00:00:00Z', window_days=0)]:
                response = await client.get('/api/crm/funnel/report', params=query, headers={'Authorization': 'Bearer admin'})
                assert response.status_code == 422
            assert (await client.get('/api/crm/funnel/options')).status_code in (401, 403)
            assert (await client.get('/api/crm/funnel/options', headers={'Authorization': 'Bearer patient'})).status_code == 403
            assert (await client.get('/api/crm/funnel/options', headers={'Authorization': 'Bearer admin'})).status_code == 200
    asyncio.run(scenario())
    import api_permissions
    assert api_permissions.requirements('/api/crm/funnel/report', 'GET') == ('crm_view',)
    assert api_permissions.requirements('/api/crm/funnel/options', 'GET') == ('crm_view',)
    assert api_permissions.requirements('/api/crm/funnel/methods', 'GET') == ('crm_view',)


def test_method_options_scope_archives_validation_and_real_report_filter(app):
    async def scenario():
        application, data = app
        manifest = data['crm_seed_manifests'][0]
        # This Collection holds mutable isolated copies. No real database is instantiated.
        routes = importlib.import_module('crm.routes.funnel')
        db = application.dependency_overrides[routes.get_database]()
        source = db.crm_sources.documents[0]
        source['status'] = 'inactive'  # Archived parents/methods remain readable for history.
        source['channels'] = [{'id': 'method-live', 'name': 'Custom contact'},
                              {'id': 'method-archive', 'name': 'Old contact', 'active': False}]
        other = db.crm_sources.documents[1]
        other['channels'] = [{'id': 'foreign-method', 'name': 'Other source only'}]
        leads = [row for row in db.crm_leads.documents if row.get('source_id') == source['id']]
        for index, row in enumerate(leads):
            # Snapshot differs from cohort attribution; unknown entry stays unknown.
            row['channel_id'] = 'method-archive'
            for item in [*row.get('_funnel_events', []), *db.crm_funnel_events.documents]:
                if item['deal_id'] == row['id'] and index < 2:
                    item['channel_id'] = 'method-live'
        params = [('start', manifest['cohort_start'].isoformat()), ('end', manifest['cohort_end'].isoformat()),
                  ('mode', 'history'), ('window_days', '7'), ('synthetic_batch', manifest['batch_id']),
                  *[('steps', step) for step in STEPS]]
        scope = [('source_selection', 'selected'), ('source_ids', 'source:' + source['id'])]
        headers = {'Authorization': 'Bearer admin'}
        async with AsyncClient(transport=ASGITransport(app=application), base_url='http://fixture') as client:
            method_params = {'source_id': source['id'], 'synthetic_batch': manifest['batch_id']}
            response = await client.get('/api/crm/funnel/methods', params=method_params, headers=headers)
            assert response.status_code == 200, response.text
            assert response.json() == {'source_id': source['id'], 'methods': [
                {'id': 'method-live', 'name': 'Custom contact', 'active': True},
                {'id': 'method-archive', 'name': 'Old contact', 'active': False}]}
            assert (await client.get('/api/crm/funnel/methods', params={'source_id': source['id']}, headers=headers)).status_code == 404
            assert (await client.get('/api/crm/funnel/methods', params=method_params)).status_code in (401, 403)
            assert (await client.get('/api/crm/funnel/methods', params=method_params, headers={'Authorization': 'Bearer patient'})).status_code == 403
            for extra in [[('channel_id', 'method-live')], [*scope, ('channel_id', 'foreign-method')],
                          [*scope, ('channel_id', 'unknown')], [*scope, ('source_ids', 'source:' + other['id']), ('channel_id', 'method-live')],
                          [('source_selection', 'selected'), ('source_ids', 'missing-source'), ('channel_id', 'method-live')]]:
                response = await client.get('/api/crm/funnel/report', params=[*params, *extra], headers=headers)
                assert response.status_code == 422, response.text
            response = await client.get('/api/crm/funnel/report', params=[*params, *scope, ('channel_id', 'method-live')], headers=headers)
            result = response.json()
            assert response.status_code == 200, result
            assert result['totals']['total'] == 2
            assert [stage['count'] for stage in result['totals']['stages']] == [2, 2, 1]
            assert result['totals']['conversion'] == 50 and result['sources'][0]['total'] == 2
            snapshot = [(key, 'snapshot' if key == 'mode' else value) for key, value in params]
            response = await client.get('/api/crm/funnel/report', params=[*snapshot, *scope, ('channel_id', 'method-archive')], headers=headers)
            assert response.status_code == 200 and response.json()['totals']['total'] == 6
            response = await client.get('/api/crm/funnel/report', params=[*params, *scope, ('channel_id', 'method-archive')], headers=headers)
            assert response.json()['totals']['total'] == 0 and response.json()['totals']['conversion'] is None
            # The real loader must request the snapshot method field from MongoDB.
            from unittest.mock import Mock
            db.crm_leads.find = Mock(wraps=db.crm_leads.find)
            await client.get('/api/crm/funnel/report', params=[*snapshot, *scope], headers=headers)
            assert db.crm_leads.find.call_args.args[1]['channel_id'] == 1
            source['channels'].append(dict(source['channels'][0]))
            assert (await client.get('/api/crm/funnel/methods', params=method_params, headers=headers)).status_code == 409
            source['channels'] = 123
            assert (await client.get('/api/crm/funnel/methods', params=method_params, headers=headers)).status_code == 409
    asyncio.run(scenario())
