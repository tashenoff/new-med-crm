"""Offline task contract regressions. No database/server or WhatsApp calls."""
from copy import deepcopy
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import FastAPI, HTTPException
from httpx import AsyncClient, ASGITransport
from pydantic import ValidationError
from crm.models.task import Task
from crm.schemas.task_schemas import TaskCreate, TaskUpdate, TaskSearchFilters, TaskTitleInput, TaskTitleUpdate
from crm.services.task_service import TaskService
from crm.services.task_title_service import TaskTitleService
from permission_policy import effective_permissions, has_permission
from crm.routes.tasks import router
from crm.routes.task_titles import router as titles_router
from dependencies import get_current_user
from database import get_database

class Cursor:
    def __init__(self, rows): self.rows = rows
    def sort(self, *args): return self
    def skip(self, skip): self.rows = self.rows[skip:]; return self
    def limit(self, limit): self.rows = self.rows[:limit]; return self
    async def to_list(self, length=None): return deepcopy(self.rows[:length])

class Collection:
    def __init__(self, rows=()): self.rows = deepcopy(list(rows))
    def find(self, query, *args): return Cursor([row for row in self.rows if self.matches(row, query)])
    @staticmethod
    def matches(row, query):
        for key, value in query.items():
            if isinstance(value, dict):
                current = row.get(key)
                if '$in' in value and current not in value['$in']: return False
                if '$ne' in value and current == value['$ne']: return False
            elif row.get(key) != value: return False
        return True
    async def find_one(self, query): return next((deepcopy(row) for row in self.rows if self.matches(row,query)),None)
    async def insert_one(self, value): self.rows.append(deepcopy(value))
    async def update_one(self, query, update):
        for row in self.rows:
            if self.matches(row,query): row.update(deepcopy(update['$set'])); return SimpleNamespace(modified_count=1)
        return SimpleNamespace(modified_count=0)
    async def count_documents(self, query): return len(self.find(query).rows)
    async def create_index(self, *args, **kwargs): pass


class Database(SimpleNamespace):
    def __getitem__(self, key): return getattr(self,key)

def database(permissions=()):
    return Database(wazzup_chats=Collection(), crm_tasks=Collection(), crm_task_titles=Collection(), crm_managers=Collection([{'id':'manager', 'status':'active', 'first_name':'Manager'}]), crm_leads=Collection([{'id':'lead'}]), staff=Collection([{'_id':'user', 'role':'admin', 'is_active':True, 'permission_mode':'explicit', 'custom_permissions':list(permissions)}]))


def user(): return SimpleNamespace(id='user', role='admin', is_active=True, permissions=[])

async def test_explicit_admin_does_not_bypass_grants():
    db=database()
    assert effective_permissions(db.staff.rows[0])==[]
    db.staff.rows[0]['custom_permissions']=['crm_tasks_create']
    assert set(effective_permissions(db.staff.rows[0]))=={'crm_tasks_create'}
    db.staff.rows[0]['is_active']=False
    inactive=SimpleNamespace(is_active=False,role='admin',permissions=['crm_tasks_create'])
    assert not has_permission(inactive,'crm_tasks_create')

async def test_create_read_edit_are_independent_permissions():
    db=database(['crm_tasks_create'])
    app=FastAPI(); app.include_router(router,prefix='/api/crm'); app.include_router(titles_router,prefix='/api/crm')
    app.dependency_overrides[get_current_user]=lambda: SimpleNamespace(id='user', role='admin', is_active=True, permissions=db.staff.rows[0]['custom_permissions'])
    app.dependency_overrides[get_database]=lambda:db
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as client:
        assert (await client.get('/api/crm/tasks')).status_code==403
        response=await client.post('/api/crm/tasks',json={'title':'Call','lead_id':'lead','assigned_to':'manager'})
        assert response.status_code==201, response.text
        assert response.json()['created_by']=='user'
        identifier=response.json()['id']
        assert (await client.put('/api/crm/tasks/'+identifier,json={'title':'Denied'})).status_code==403
        assert (await client.post('/api/crm/task-titles',json={'name':'Denied'})).status_code==403
        assert (await client.get('/api/crm/tasks/assignees')).json()=={'assignees':[{'id':'manager','name':'Manager'}]}
        db.staff.rows[0]['custom_permissions']=['crm_tasks_view']
        assert (await client.get('/api/crm/tasks')).status_code==200
        assert (await client.post('/api/crm/tasks',json={'title':'Denied'})).status_code==403
        db.staff.rows[0]['custom_permissions']=['crm_tasks_edit']
        assert (await client.put('/api/crm/tasks/'+identifier,json={'description':None})).status_code==200
        assert (await client.get('/api/crm/tasks/not-found')).status_code==403
        db.staff.rows[0]['custom_permissions']=['crm_tasks_view']
        assert (await client.get('/api/crm/tasks/not-found')).status_code==404
        assert (await client.get('/api/crm/tasks?status=invalid')).status_code==422

async def test_dictionary_assignment_and_clear_optional_fields():
    db=database(); svc=TaskService(db)
    title=await TaskTitleService(db).create(TaskTitleInput(name=' Call '))
    task=await svc.create_task(TaskCreate(title='Untrusted',title_id=title['id'],assigned_to='manager',lead_id='lead',due_date=datetime.now(timezone.utc)+timedelta(days=1)))
    assert task.title=='Call' and task.assigned_to_name=='Manager' and task.due_date.tzinfo is None
    updated=await svc.update_task(task.id,TaskUpdate(kind='note',title_id=None,assigned_to=None))
    assert updated.kind=='note' and updated.due_date is None and updated.assigned_to is None
    assert updated.title_id is None and updated.assigned_to_name is None
    await TaskTitleService(db).update(title['id'],TaskTitleUpdate(is_active=False))
    with pytest.raises(HTTPException): await svc.create_task(TaskCreate(title='Call',title_id=title['id']))
    assert (await svc.get_task_by_id(task.id)).title=='Call'

async def test_invalid_links_do_not_write():
    db=database(); svc=TaskService(db)
    for payload in [TaskCreate(title='x',lead_id='missing'),TaskCreate(title='x',assigned_to='missing'),TaskCreate(title='x',title_id='missing')]:
        with pytest.raises(HTTPException): await svc.create_task(payload)
    assert db.crm_tasks.rows==[]

async def test_chat_identity_is_verified_and_normalized(monkeypatch):
    db=database(); svc=TaskService(db)
    get_chat=AsyncMock(return_value={'contact_name':'Client','linked_lead_id':'lead','linked_patient_id':'patient'})
    monkeypatch.setattr('crm.services.task_service.WazzupChatService.get_chat',get_chat)
    task=await svc.create_task(TaskCreate(title='Call',chat_phone='87011234567'))
    assert task.chat_phone=='+77011234567' and task.chat_name=='Client'
    assert task.lead_id=='lead' and task.client_id=='patient'
    get_chat.return_value=None
    with pytest.raises(HTTPException): await svc.create_task(TaskCreate(title='Call',chat_phone='+77011234568'))
    assert len(db.crm_tasks.rows)==1

def test_schemas_reject_blank_title_invalid_time_and_normalize_utc():
    for values in [dict(title=' '),dict(title='x',due_time='25:99'),dict(title='x',kind='invalid')]:
        with pytest.raises(ValidationError): TaskCreate(**values)
    due=TaskCreate(title='x',due_date='2026-11-12T15:00:00+05:00').due_date
    assert due==datetime(2026,11,12,10)
    assert Task(title='legacy').kind=='task'
    assert not Task(title='note',kind='note',due_date=datetime(2000,1,1)).is_overdue()

def test_search_is_literal_and_status_filters_are_combined():
    query=TaskService._query(TaskSearchFilters(search='.*',status=['new'],show_completed=False))
    assert query['$or'][0]['title']['$regex']==r'\.\*'
    assert query['status']=={'$in':['new'],'$ne':'completed'}
    assert TaskService._query(TaskSearchFilters(kind='task'))['kind']=={'$in':['task',None]}


def test_wire_dates_include_utc_offset():
    task = Task(title='Call', due_date=datetime(2026,11,12,10))
    assert task.model_dump(mode='json')['due_date']=='2026-11-12T10:00:00+00:00'

async def test_patch_compatibility_and_read_only_user_denied_write():
    db=database(['crm_tasks_edit'])
    task=await TaskService(db).create_task(TaskCreate(title='Call'))
    app=FastAPI(); app.include_router(router,prefix='/api/crm')
    app.dependency_overrides[get_current_user]=lambda: SimpleNamespace(id='user', role='admin', is_active=True, permissions=db.staff.rows[0]['custom_permissions'])
    app.dependency_overrides[get_database]=lambda:db
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as client:
        assert (await client.patch('/api/crm/tasks/'+task.id+'/complete')).status_code==200
        assert (await client.patch('/api/crm/tasks/'+task.id+'/cancel')).status_code==200
        db.staff.rows[0]['custom_permissions']=['crm_tasks_view']
        assert (await client.patch('/api/crm/tasks/'+task.id+'/complete')).status_code==403

async def test_staff_creation_edit_and_auth_hydration_roundtrip(monkeypatch):
    from models.staff import StaffMemberCreate, StaffMemberUpdate
    from services.staff_service import StaffService
    from routers.auth import hydrate_access
    db=database(); db.staff=Collection(); db.users=Collection()
    svc=StaffService(db)
    monkeypatch.setattr(svc, '_hash_password', lambda _: 'test-only-hash')
    created=await svc.create_staff_member(StaffMemberCreate(login='task_manager', password='test-password', full_name='Task Manager', role='admin', custom_permissions=['crm_tasks_view','crm_tasks_create']))
    assert set(created.permissions)=={'crm_tasks_view','crm_tasks_create'}
    assert created.permission_mode=='explicit'
    stored_user=deepcopy(db.users.rows[0]); stored_user['id']=created.id
    await hydrate_access(stored_user,db)
    assert set(stored_user['permissions'])=={'crm_tasks_view','crm_tasks_create'}
    edited=await svc.update_staff_member(created.id,StaffMemberUpdate(custom_permissions=[]))
    assert edited.permissions==[] and edited.permission_mode=='explicit'
    await hydrate_access(stored_user,db)
    assert stored_user['permissions']==[]

def test_legacy_note_and_explicit_role_policy():
    from permission_policy import effective_permissions
    from models.staff import StaffMemberCreate, StaffMemberUpdate
    assert Task(title='Old note',type='note').kind=='note'
    assert effective_permissions({'role':'super_admin','permission_mode':'explicit','custom_permissions':[]})==[]
    assert effective_permissions({'role':'admin','permission_mode':'explicit','custom_permissions':['crm_tasks_view']})==['crm_tasks_view']
    assert StaffMemberCreate(login='u',password='x',full_name='U',role='admin').permission_mode=='explicit'
    with pytest.raises(ValidationError): StaffMemberUpdate(custom_permissions=None)


async def test_global_boundary_matches_task_contract(monkeypatch):
    import api_permissions
    from routers.auth import get_current_active_user
    db=database(['crm_tasks_create'])
    app=FastAPI(); app.include_router(router,prefix='/api/crm'); app.include_router(titles_router,prefix='/api/crm')
    def hydrated(): return SimpleNamespace(id='user',role='admin',is_active=True,permissions=db.staff.rows[0]['custom_permissions'])
    app.dependency_overrides[get_current_user]=hydrated
    app.dependency_overrides[get_current_active_user]=hydrated
    app.dependency_overrides[get_database]=lambda:db
    monkeypatch.setattr(api_permissions,'assert_single_clinic',AsyncMock(return_value=None))
    api_permissions.install_api_permissions(app)
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as client:
        assert (await client.post('/api/crm/tasks',json={'title':'Allowed'})).status_code==201
        assert (await client.get('/api/crm/tasks')).status_code==403
        assert (await client.get('/api/crm/tasks/assignees')).status_code==200
        db.staff.rows[0]['custom_permissions']=['crm_tasks_view']
        assert (await client.get('/api/crm/tasks')).status_code==200
        assert (await client.post('/api/crm/tasks',json={'title':'Denied'})).status_code==403
        db.staff.rows[0]['custom_permissions']=['directory_view']
        assert (await client.get('/api/crm/task-titles')).status_code==200
        assert (await client.post('/api/crm/task-titles',json={'name':'Denied'})).status_code==403
        db.staff.rows[0]['custom_permissions']=['directory_edit']
        assert (await client.post('/api/crm/task-titles',json={'name':'Allowed'})).status_code==201

def test_current_super_admin_contract_and_legacy_grants_not_expanded():
    from permission_policy import has_permission,effective_permissions
    from api_permissions import requirements
    assert has_permission(SimpleNamespace(is_active=True,role='super_admin',permissions=[]),'crm_tasks_view')
    assert not has_permission(SimpleNamespace(is_active=True,role='admin',permissions=[]),'crm_tasks_view')
    assert not has_permission(SimpleNamespace(is_active=False,role='super_admin',permissions=[]),'crm_tasks_view')
    assert 'crm_tasks_create' not in effective_permissions({'role':'admin'})
    assert requirements('/api/crm/leads/{lead_id}/tasks','GET')==('crm_tasks_view',)
    assert requirements('/api/crm/task-statuses','GET')==('crm_view|directory_view|crm_tasks_view|crm_tasks_create|crm_tasks_edit',)


async def test_staff_assignment_asgi_and_revocation():
    db=database(['crm_tasks_create'])
    db.staff.rows.extend([
        {'_id':'admin', 'full_name':'Administrator', 'role':'admin', 'is_active':True},
        {'_id':'disabled', 'full_name':'Disabled', 'role':'admin', 'is_active':False},
    ])
    app=FastAPI(redirect_slashes=False); app.include_router(router,prefix='/api/crm')
    app.dependency_overrides[get_current_user]=lambda: SimpleNamespace(id='user', role='admin', is_active=True, permissions=db.staff.rows[0]['custom_permissions'])
    app.dependency_overrides[get_database]=lambda: db
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as client:
        choices=(await client.get('/api/crm/tasks/assignees')).json()['assignees']
        assert {'id':'staff:admin','name':'Administrator'} in choices
        assert not any(x['id']=='staff:disabled' for x in choices)
        response=await client.post('/api/crm/tasks',json={'title':'Follow up','assigned_to':'staff:admin'})
        assert response.status_code==201, response.text
        assert response.json()['assigned_to_name']=='Administrator'
        assert (await client.post('/api/crm/tasks/',json={'title':'Wrong URL'})).status_code==404
        db.staff.rows[1]['is_active']=False
        assert (await client.post('/api/crm/tasks',json={'title':'Inactive','assigned_to':'staff:admin'})).status_code==422
        db.staff.rows[0]['custom_permissions']=[]
        assert (await client.get('/api/crm/tasks/assignees')).status_code==403
        assert (await client.post('/api/crm/tasks',json={'title':'Denied'})).status_code==403
        assert len(db.crm_tasks.rows)==1


async def test_staff_manager_namespace_collision_is_not_assignable():
    db=database()
    db.staff.rows.append({'_id':'admin','full_name':'Admin','is_active':True})
    db.crm_managers.rows.append({'id':'staff:admin','status':'active','first_name':'Other person'})
    svc=TaskService(db)
    assert not any(x['id']=='staff:admin' for x in await svc.assignees())
    with pytest.raises(HTTPException):
        await svc.create_task(TaskCreate(title='Ambiguous',assigned_to='staff:admin'))
    legacy=await svc.create_task(TaskCreate(title='Legacy',assigned_to='manager'))
    assert legacy.assigned_to=='manager' and legacy.assigned_to_name=='Manager'
