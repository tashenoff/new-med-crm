import importlib.util
from pathlib import Path
from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from test_event_funnel import reports

spec = importlib.util.spec_from_file_location('isolated_funnel_seed', Path(__file__).parents[2] / 'tools' / 'funnel_seed.py')
seed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seed)
AT = datetime(2026, 10, 21, 12, tzinfo=timezone.utc)
# Arbitrary IDs/names: neither definitions nor seed may infer a business meaning.
COLUMNS = [dict(id='custom-last', name='Заключение', is_system=False, manual_move_allowed=True),
           dict(id='new', name='Начало переименовано', is_system=True, manual_move_allowed=True),
           dict(id='custom-entry', name='Вход', is_system=False, manual_move_allowed=True),
           dict(id='custom-middle', name='Промежуточный', is_system=False, manual_move_allowed=True),
           dict(id='custom-extra', name='Необязательный', is_system=False, manual_move_allowed=True)]
STEPS = ['custom-entry', 'custom-middle', 'custom-last']


def plan():
    return seed.seed_plan(COLUMNS, STEPS, 'custom-extra', batch='crm-funnel-demo-unit', anchor=AT, clinic='isolated-fixture')


def test_seed_manifest_exact_expected_counts_and_both_report_definitions():
    data = plan()
    assert {name: len(rows) for name, rows in data.items()} == {'crm_sources': 4, 'crm_leads': 13, 'crm_funnel_events': 37, 'crm_seed_manifests': 1}
    manifest = data['crm_seed_manifests'][0]
    result = reports.build_report(data['crm_leads'], data['crm_funnel_events'], COLUMNS, data['crm_sources'], steps=STEPS,
                                  start=manifest['cohort_start'], end=manifest['cohort_end'], window_days=7, as_of=AT)
    assert result['totals']['total'] == 13
    assert [stage['count'] for stage in result['totals']['stages']] == [13, 9, 5]
    assert result['totals']['conversion'] == 38.5
    assert result['totals']['open_windows'] == 1
    assert [row['total'] for row in result['sources']] == [6, 5, 0, 0, 1, 1]
    a, b = result['sources'][:2]
    assert [item['count'] for item in a['stages']] == [6, 5, 2] and a['conversion'] == 33.3
    assert [item['count'] for item in b['stages']] == [5, 2, 2] and b['conversion'] == 40
    snapshot = reports.build_report(data['crm_leads'], data['crm_funnel_events'], COLUMNS, data['crm_sources'], steps=STEPS,
                                   start=manifest['cohort_start'], end=manifest['cohort_end'], mode='snapshot', as_of=AT)
    counts = {stage['id']: stage['count'] for stage in snapshot['totals']['stages']}
    assert counts['custom-entry'] == 1 and counts['custom-middle'] == 3 and counts['custom-last'] == 9 and counts['custom-extra'] == 0
    assert snapshot['totals']['outside_current_columns'] == 0
    assert all(not row['phone'] and row['email'] is None and not row.get('converted_to_client_id') for row in data['crm_leads'])


class Database:
    def __init__(self):
        self.rows = {name: [] for name in ('crm_sources', 'crm_leads', 'crm_funnel_events', 'crm_seed_manifests')}
        self.writes = []

    def __getitem__(self, name):
        assert name in self.rows, 'Seed must never access patient, appointment, price, payment or messaging collections'
        def find(query):
            return next((deepcopy(row) for row in self.rows[name] if any(all(row.get(k) == v for k, v in branch.items()) for branch in query['$or'])), None)
        def update(query, mutation, upsert):
            self.writes.append(name)
            assert set(mutation) == {'$setOnInsert'} and upsert
            if not any(row['_id'] == query['_id'] for row in self.rows[name]):
                self.rows[name].append(deepcopy(mutation['$setOnInsert']))
        return SimpleNamespace(find_one=find, update_one=update)


def test_seed_apply_is_idempotent_and_does_not_touch_existing_sources():
    db = Database()
    existing = {'_id': 'real-source', 'id': 'real', 'name': 'Existing source'}
    db.rows['crm_sources'].append(deepcopy(existing))
    data = plan()
    seed.apply_plan(db, data)
    first = deepcopy(db.rows)
    seed.apply_plan(db, data)
    assert db.rows == first
    assert db.rows['crm_sources'][0] == existing
    assert seed.manifest_summary(data, 'isolated-fixture')['counts']['crm_funnel_events'] == 37


def test_namespace_collision_fails_before_any_writes_and_never_overwrites():
    db, data = Database(), plan()
    db.rows['crm_sources'].append({'_id': data['crm_sources'][1]['_id'], 'id': 'real', 'name': 'User source'})
    with pytest.raises(ValueError, match='unrelated'):
        seed.apply_plan(db, data)
    assert db.writes == []


def test_changed_seed_record_is_not_repaired_or_overwritten():
    db, data = Database(), plan()
    seed.apply_plan(db, data)
    db.rows['crm_leads'][0]['first_name'] = 'User edited this record'
    db.writes.clear()
    with pytest.raises(ValueError, match='no overwrite'):
        seed.apply_plan(db, data)
    assert not db.writes


@pytest.mark.parametrize('steps,extra', [(['missing', *STEPS[1:]], 'custom-extra'), ([STEPS[0]] * 3, 'custom-extra'), (STEPS, STEPS[0])])
def test_seed_rejects_ambiguous_or_changed_configuration(steps, extra):
    with pytest.raises(ValueError):
        seed.seed_plan(COLUMNS, steps, extra, batch='crm-funnel-demo-unit', anchor=AT, clinic='fixture')


def test_names_and_order_never_define_business_semantics():
    columns = [{**column, 'name': 'Dojim renamed arbitrary text'} for column in reversed(COLUMNS)]
    renamed = seed.seed_plan(columns, STEPS, 'custom-extra', batch='crm-funnel-demo-unit', anchor=AT, clinic='isolated-fixture')
    assert renamed == plan()
