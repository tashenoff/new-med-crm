"""Synthetic receipts only; never connect to a real database/payment provider."""
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import FastAPI, HTTPException
from httpx import AsyncClient, ASGITransport
from api_permissions import requirements, check_access, check_financial_side_effects, install_api_permissions
from treatment_payment_access import PAYMENT_ROUTES, check_payment_staff
from models.auth import UserInDB
from routers.auth import get_current_active_user
from database import get_database


def actor(role='admin', permissions=('patients_view',), active=True):
    return UserInDB(id='synthetic',full_name='Synthetic',hashed_password='test',role=role,permissions=list(permissions),is_active=active)

@pytest.mark.parametrize('role',['admin','administrator','doctor','marketer','super_admin'])
@pytest.mark.parametrize('path',sorted(PAYMENT_ROUTES))
async def test_only_collecting_treatment_payments_no_finance_needed(role,path):
    user=actor(role)
    check_access(user,requirements(path,'POST'))
    check_payment_staff(user)
    db=SimpleNamespace(treatment_plans=SimpleNamespace(find_one=AsyncMock(return_value={})))
    await check_financial_side_effects(SimpleNamespace(method='POST',path_params={'plan_id':'p'}),path,user,db)

@pytest.mark.parametrize('user',[actor('patient'),actor(permissions=()),actor(active=False)])
def test_patient_inactive_or_no_patient_access_rejected(user):
    with pytest.raises(HTTPException): check_payment_staff(user)

async def test_full_payment_receipt_keeps_manual_completion_and_other_money_actions_separate():
    user=actor();db=SimpleNamespace(treatment_plans=SimpleNamespace(find_one=AsyncMock(return_value={'payment_completion_policy':'full_payment_v1'})))
    request=SimpleNamespace(method='POST',path_params={'plan_id':'p'})
    for path in PAYMENT_ROUTES:
        await check_financial_side_effects(request,path,user,db)
        await check_financial_side_effects(request,path,actor(permissions=('patients_view','patients_edit')),db)
    for path in ['/api/treatment-plans/{plan_id}/add-deposit','/api/patients/{patient_id}/add-deposit']:
        with pytest.raises(HTTPException):check_access(user,requirements(path,'POST'))
    with pytest.raises(HTTPException):
        check_access(user,requirements('/api/treatment-plans/{plan_id}/service-rows/{service_row_id}/occurrences/{occurrence_id}/complete','POST'))
    with pytest.raises(HTTPException):
        check_access(user,requirements('/api/treatment-plans/{plan_id}','PUT'))
    assert requirements('/api/payment-types','GET')==('directory_view',)
    assert requirements('/api/payment-types','POST')==('directory_view','directory_edit')
    assert requirements('/api/lookups/treatment-payment-types','GET')==('patients_view',)

async def test_real_settle_endpoint_uses_staff_guard_and_never_calls_without_access(monkeypatch):
    import api_permissions
    from routers.treatment_plans import treatment_plans_router
    from services.payment_completion_service import PaymentCompletionService
    mock_receipt=AsyncMock(return_value={'synthetic_receipt':True,'plan':{'accounting_events':[{'amount_kzt':100,'compensation_snapshot':{'payment_value':50},'compensation_amount_kzt':50}]}})
    monkeypatch.setattr(PaymentCompletionService,'settle_remaining',mock_receipt)
    monkeypatch.setattr(api_permissions,'assert_single_clinic',AsyncMock())
    db=SimpleNamespace(treatment_plans=SimpleNamespace(find_one=AsyncMock(return_value={'payment_completion_policy':'full_payment_v1'})))
    app=FastAPI();app.include_router(treatment_plans_router,prefix='/api');install_api_permissions(app)
    current=actor('administrator')
    app.dependency_overrides[get_current_active_user]=lambda:current
    app.dependency_overrides[get_database]=lambda:db
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as client:
        response=await client.post('/api/treatment-plans/test/settle-remaining',json={})
        assert response.status_code==200,response.text
        assert mock_receipt.await_count==1
        assert response.json()['plan']['accounting_events']==[{'amount_kzt':100}]
        current=actor('patient')
        assert (await client.post('/api/treatment-plans/test/settle-remaining',json={})).status_code==403
        current=actor(permissions=())
        assert (await client.post('/api/treatment-plans/test/settle-remaining',json={})).status_code==403
        current=actor(active=False)
        assert (await client.post('/api/treatment-plans/test/settle-remaining',json={})).status_code==403
        assert mock_receipt.await_count==1

async def test_scoped_payment_method_lookup_is_minimal(monkeypatch):
    import api_permissions
    from routers.lookups import router
    class Cursor:
        def limit(self,n):return self
        async def to_list(self,n):return [{'id':'cash','name':'Cash','commission_rate':99,'description':'Hidden'}]
    db=SimpleNamespace(payment_types=SimpleNamespace(find=lambda query,projection:Cursor()))
    monkeypatch.setattr(api_permissions,'assert_single_clinic',AsyncMock())
    app=FastAPI();app.include_router(router);install_api_permissions(app)
    current=actor()
    app.dependency_overrides[get_current_active_user]=lambda:current
    app.dependency_overrides[get_database]=lambda:db
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as client:
        result=await client.get('/api/lookups/treatment-payment-types')
        assert result.status_code==200,result.text
        assert result.json()==[{'id':'cash','name':'Cash'}]
        current=actor('patient')
        assert (await client.get('/api/lookups/treatment-payment-types')).status_code==403


async def test_shared_get_plan_redacts_payroll_but_preserves_patient_amounts(monkeypatch):
    import api_permissions
    payload={'plans':[{'accounting_events':[{'amount_kzt':100,'compensation_snapshot':{'payment_value':50},'compensation_amount_kzt':50}], 'admin_bonus':{'amount':5}}]}
    monkeypatch.setattr(api_permissions,'assert_single_clinic',AsyncMock())
    app=FastAPI()
    @app.get('/api/patients/{patient_id}/treatment-plans')
    async def plans():return payload
    install_api_permissions(app)
    current=actor()
    app.dependency_overrides[get_current_active_user]=lambda:current
    app.dependency_overrides[get_database]=lambda:SimpleNamespace()
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as client:
        response=await client.get('/api/patients/p/treatment-plans')
        assert response.json()=={'plans':[{'accounting_events':[{'amount_kzt':100}]}]}
        current=actor(permissions=('patients_view','payroll_view'))
        response=await client.get('/api/patients/p/treatment-plans')
        assert response.json()['plans'][0]['accounting_events']==payload['plans'][0]['accounting_events']
        assert 'admin_bonus' not in response.json()['plans'][0]


def test_exact_six_real_payment_routes_use_employee_dependency_only():
    from routers.treatment_plans import treatment_plans_router
    from treatment_payment_access import payment_staff
    found=set()
    for route in treatment_plans_router.routes:
        if any(dependency.call is payment_staff for dependency in route.dependant.dependencies):
            assert route.methods=={'POST'}
            found.add('/api'+route.path)
    assert found==PAYMENT_ROUTES
