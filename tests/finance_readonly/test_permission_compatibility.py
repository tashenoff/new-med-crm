"""Read-only evidence of resolver compatibility; all identities/grants are memory-only.

This documents the unchanged reporting resolver, not an authorization workaround.
No production resolver/grant store/configuration is changed or read.
"""
from datetime import datetime, timezone
from hashlib import sha256
from types import SimpleNamespace
import sys
from pathlib import Path

import pytest
from starlette.datastructures import Headers

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
from permission_policy import effective_permissions
from reporting.access import authorize
from reporting.contract import PATH, SCOPE, ReportError
from reporting.payroll import PATH as PAYROLL_PATH, SCOPE as PAYROLL_SCOPE
from reporting.live_access import DeploymentBinding, LiveResolver, StoredGrant

TOKEN = 'mcr_' + 'S' * 43
BINDING = DeploymentBinding('synthetic-clinic', 'synthetic-owner', 'synthetic-db', True)


class Collection:
    def __init__(self, row):
        self.row = row

    def find(self, query, projection):
        values = [{key: value for key, value in self.row.items() if projection.get(key)}]
        class Cursor:
            def max_time_ms(self, value): return self
            def limit(self, value): return self
            async def to_list(self, value): return values
        return Cursor()


def fixture(role, custom):
    member = {'_id': BINDING.owner_id, 'is_active': True, 'role': role,
              'permission_mode': 'explicit', 'custom_permissions': custom}
    db = SimpleNamespace(name=BINDING.database_namespace,
                         users=Collection({'_id': BINDING.owner_id, 'is_active': True}), staff=Collection(member))
    grants = [StoredGrant(sha256(TOKEN.encode()).hexdigest(), BINDING.owner_id, BINDING.clinic_id,
                          BINDING.agent_id, BINDING.api_origin, BINDING.paperclip_runtime, scope, True,
                          datetime(2099, 1, 1, tzinfo=timezone.utc)) for scope in (SCOPE, PAYROLL_SCOPE)]
    request = SimpleNamespace(headers=Headers({'Authorization': 'Bearer ' + TOKEN}))
    return member, db, SimpleNamespace(read=lambda: grants), request


@pytest.mark.asyncio
async def test_crm_only_marketer_cannot_use_finance_even_with_fabricated_grant():
    member, db, store, request = fixture('marketer', ['crm_view'])
    context = await LiveResolver(db, BINDING, store, PATH)(request)
    assert 'finance_view' not in effective_permissions(member)
    with pytest.raises(ReportError):
        authorize(context)


@pytest.mark.asyncio
@pytest.mark.parametrize('role', ['admin', 'super_admin'])
async def test_known_explicit_admin_mismatch_is_conditional_on_a_separate_valid_grant(role):
    member, db, store, request = fixture(role, ['crm_view'])
    assert effective_permissions(member) == ['crm_view']
    context = await LiveResolver(db, BINDING, store, PATH)(request)
    assert authorize(context).clinic_id == BINDING.clinic_id
    # Removing the in-memory grant denies access even though role defaults exist.
    with pytest.raises(ReportError):
        await LiveResolver(db, BINDING, SimpleNamespace(read=lambda: []), PATH)(request)


@pytest.mark.asyncio
@pytest.mark.parametrize('role', ['marketer', 'admin', 'super_admin'])
async def test_unchanged_reporting_resolver_never_invents_payroll(role):
    member, db, store, request = fixture(role, ['crm_view'])
    context = await LiveResolver(db, BINDING, store, PAYROLL_PATH)(request)
    with pytest.raises(ReportError):
        authorize(context, required_scope=PAYROLL_SCOPE, required_permission='payroll_view')
