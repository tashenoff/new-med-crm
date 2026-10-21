"""No server startup, sockets, database clients or notification integrations."""
import asyncio
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import importlib.util
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace

import pytest
from pymongo.results import UpdateResult, DeleteResult

ROOT = Path(__file__).parents[2]
# Import the two pure modules without importing CRM's server/router package.
PACKAGE = '_event_funnel_fixture'
package = ModuleType(PACKAGE)
package.__path__ = [str(ROOT / 'crm' / 'services')]
sys.modules[PACKAGE] = package
journal = __import__(PACKAGE + '.funnel_journal', fromlist=['*'])
reports = __import__(PACKAGE + '.funnel_report', fromlist=['*'])
AT = datetime(2026, 10, 1, tzinfo=timezone.utc)


class Collection:
    def __init__(self, documents=()):
        self.documents = deepcopy(list(documents))
        self.fail = False
        self.conflicts = 0

    async def find_one(self, query):
        result = next((deepcopy(row) for row in self.documents if all(row.get(k) == v for k, v in query.items())), None)
        await asyncio.sleep(0)
        return result

    async def insert_one(self, row, **kwargs):
        self.documents.append(deepcopy(row))
        return SimpleNamespace(inserted_id=row.get('id'))

    async def update_one(self, query, update, upsert=False):
        if self.fail:
            raise RuntimeError('Atomic write failed')
        row = next((row for row in self.documents if all(row.get(k) == v for k, v in query.items())), None)
        if row is None:
            if upsert:
                self.documents.append(deepcopy(update['$setOnInsert']))
            else:
                self.conflicts += 1
            return UpdateResult({'n': int(upsert), 'nModified': int(upsert)}, True)
        row.update(deepcopy(update.get('$set', {})))
        for key in update.get('$unset', {}):
            row.pop(key, None)
        for key, value in update.get('$push', {}).items():
            row.setdefault(key, []).append(deepcopy(value))
        return UpdateResult({'n': 1, 'nModified': 1}, True)

    async def delete_one(self, query, **kwargs):
        row = next((row for row in self.documents if all(row.get(k) == v for k, v in query.items())), None)
        if row is not None:
            self.documents.remove(row)
        return DeleteResult({'n': int(row is not None)}, True)


def fixture():
    db = SimpleNamespace(crm_leads=Collection(), crm_funnel_events=Collection())
    return db, journal.FunnelLeadCollection(db)


def run(coroutine):
    return asyncio.run(coroutine)


def test_creation_and_duplicate_transition_have_stable_ids_and_source_snapshot():
    async def scenario():
        db, collection = fixture()
        await collection.insert_one({'id': 'deal', 'status': 'new', 'source_id': '2gis', 'source': 'phone'})
        for attempt in range(2):
            await collection.update_one({'id': 'deal'}, {'$set': {'status': 'contacted'}})
        rows = db.crm_leads.documents[0]['_funnel_events']
        assert [(row['_id'], row['to_stage_id']) for row in rows] == [('deal:1', 'new'), ('deal:2', 'contacted')]
        assert rows[1]['from_stage_id'] == 'new'
        assert all(row['source_id'] == '2gis' and row['occurred_at'].tzinfo for row in rows)
        assert len(db.crm_funnel_events.documents) == 2
    run(scenario())


def test_concurrent_writes_form_one_ordered_chain_without_lost_events():
    async def scenario():
        db, collection = fixture()
        await collection.insert_one({'id': 'deal', 'status': 'new'})
        await asyncio.gather(*[collection.update_one({'id': 'deal'}, {'$set': {'status': status}}) for status in ['contacted', 'converted']])
        document = db.crm_leads.documents[0]
        rows = document['_funnel_events']
        assert db.crm_leads.conflicts >= 1
        assert [row['sequence'] for row in rows] == [1, 2, 3]
        assert rows[2]['from_stage_id'] == rows[1]['to_stage_id']
        assert rows[-1]['to_stage_id'] == document['status']
    run(scenario())


def test_concurrent_duplicate_target_records_only_one_transition():
    async def scenario():
        db, collection = fixture()
        await collection.insert_one({'id': 'deal', 'status': 'new'})
        await asyncio.gather(*[collection.update_one({'id': 'deal'}, {'$set': {'status': 'contacted'}}) for _ in range(5)])
        assert len(db.crm_leads.documents[0]['_funnel_events']) == 2
    run(scenario())


def test_failed_atomic_change_and_stale_query_never_emit_phantom_events():
    async def scenario():
        db, collection = fixture()
        await collection.insert_one({'id': 'deal', 'status': 'new'})
        db.crm_leads.fail = True
        with pytest.raises(RuntimeError):
            await collection.update_one({'id': 'deal'}, {'$set': {'status': 'converted'}})
        db.crm_leads.fail = False
        result = await collection.update_one({'id': 'deal', 'status': 'contacted'}, {'$set': {'status': 'converted'}})
        assert result.matched_count == 0
        assert db.crm_leads.documents[0]['status'] == 'new'
        assert len(db.crm_funnel_events.documents) == 1
    run(scenario())


def test_legacy_record_gets_observed_transition_only_not_fabricated_creation():
    async def scenario():
        db, collection = fixture()
        db.crm_leads.documents.append({'id': 'old', 'status': 'contacted', 'created_at': AT})
        await collection.update_one({'id': 'old'}, {'$set': {'status': 'converted'}})
        rows = db.crm_leads.documents[0]['_funnel_events']
        assert len(rows) == 1 and rows[0]['kind'] == 'transition'
        assert rows[0]['from_stage_id'] == 'contacted'
        assert rows[0]['occurred_at'] > AT
    run(scenario())


def test_mirror_failure_keeps_durable_outbox_and_deletion_requires_archive():
    async def scenario():
        db, collection = fixture()
        db.crm_funnel_events.fail = True
        await collection.insert_one({'id': 'deal', 'status': 'new'})
        assert len(db.crm_leads.documents[0]['_funnel_events']) == 1
        with pytest.raises(RuntimeError):
            await collection.delete_one({'id': 'deal'})
        assert len(db.crm_leads.documents) == 1
        db.crm_funnel_events.fail = False
        await collection.delete_one({'id': 'deal'})
        assert not db.crm_leads.documents and len(db.crm_funnel_events.documents) == 1
    run(scenario())


def journey(identifier, path, source='a', patient='same-patient'):
    document = {'id': identifier, 'status': path[-1][0], 'source_id': source,
                'created_at': AT, 'converted_to_client_id': patient}
    events = []
    previous = None
    for index, (stage, day) in enumerate(path):
        events.append(journal.event({**document, 'status': stage}, index + 1, previous,
                                    'created' if index == 0 else 'transition', 'fixture', AT + timedelta(days=day)))
        previous = stage
    document['_funnel_events'] = events
    return document


def report(documents, **options):
    defaults = dict(steps=['new', 'contacted', 'converted'], start=AT, end=AT + timedelta(days=1),
                    window_days=7, as_of=AT + timedelta(days=14))
    return reports.build_report(documents, [], [{'id': id, 'name': id} for id in ['new', 'contacted', 'converted', 'dojim']],
                                [{'id': 'a', 'name': '2GIS'}, {'id': 'b', 'name': 'Site'}, {'id': 'zero', 'name': 'Zero'}], **{**defaults, **options})


def test_ordered_cohort_skips_returns_repeats_window_and_distinct_inquiries():
    documents = [journey('full', [('new', 0), ('contacted', 1), ('converted', 2)]),
                 journey('skip', [('new', 0), ('converted', 1)]),
                 journey('return', [('new', 0), ('contacted', 1), ('new', 2), ('contacted', 3), ('converted', 4)]),
                 journey('late', [('new', 0), ('contacted', 1), ('converted', 8)]),
                 journey('revisit', [('new', 0), ('converted', 1), ('contacted', 2), ('converted', 3)])]
    result = report(documents)
    assert result['totals']['total'] == 5  # Same patient never merges separate deal IDs.
    assert [stage['count'] for stage in result['totals']['stages']] == [5, 4, 3]
    assert result['totals']['conversion'] == 60
    assert result['totals']['stages'][-1]['previous_rate'] == 75
    assert all(stage['id'] != 'dojim' for stage in result['totals']['stages'])
    # Removing an optional selected middle step changes the explicitly defined path.
    assert report(documents, steps=['new', 'converted'])['totals']['converted'] == 4


def test_first_entry_ever_is_not_recounted_on_return_in_another_period():
    document = journey('return', [('new', -2), ('contacted', -1), ('new', 0), ('converted', 1)])
    assert report([document])['totals']['total'] == 0


def test_source_at_entry_is_frozen_and_selected_zero_is_not_dropped():
    document = journey('deal', [('new', 0), ('contacted', 1), ('converted', 2)])
    document['source_id'] = 'b'
    document['_funnel_events'][1]['source_id'] = 'b'
    result = report([document], source_ids=['source:a', 'source:zero'])
    assert [row['key'] for row in result['sources']] == ['source:a', 'source:zero']
    assert result['sources'][0]['total'] == 1
    assert result['sources'][1]['total'] == 0 and result['sources'][1]['conversion'] is None


def test_missing_and_deleted_source_ids_are_explicit_and_legacy_coverage_is_honest():
    documents = [journey('missing', [('new', 0)], None), journey('unknown', [('new', 0)], 'deleted'),
                 {'id': 'legacy', 'status': 'converted', 'created_at': AT}]
    result = report(documents)
    assert result['totals']['total'] == 2
    assert result['coverage']['current_without_observed_events'] == 1
    assert {row['key'] for row in result['sources']} >= {'missing-source', 'source:deleted'}
    snapshot = report(documents, mode='snapshot')
    assert snapshot['totals']['total'] == 3
    assert snapshot['totals']['stages'][1]['count'] == 0


def test_ledger_and_outbox_deduplicate_and_deleted_deal_history_survives():
    document = journey('deal', [('new', 0), ('contacted', 1), ('converted', 2)])
    result = reports.build_report([], document['_funnel_events'], [{'id': x, 'name': x} for x in ['new', 'contacted', 'converted']], [],
                                 steps=['new', 'contacted', 'converted'], start=AT, end=AT + timedelta(days=1), window_days=7, as_of=AT + timedelta(days=14))
    assert result['totals']['converted'] == 1
    assert len(reports.observed_events([document], document['_funnel_events'])['deal']) == 3
