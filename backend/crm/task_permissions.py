"""Task grants use the current shared authorization policy, not role copies."""
from fastapi import Depends, HTTPException
from dependencies import get_current_user
from permission_policy import has_permission

def require_task_permission(*keys):
    async def dependency(current_user=Depends(get_current_user)):
        if not any(has_permission(current_user, key) for key in keys):
            raise HTTPException(403, 'Недостаточно прав для работы с задачами')
        return current_user
    return dependency

view_tasks = require_task_permission('crm_tasks_view')
create_tasks = require_task_permission('crm_tasks_create')
edit_tasks = require_task_permission('crm_tasks_edit')
compose_tasks = require_task_permission('crm_tasks_create', 'crm_tasks_edit', 'crm_tasks_view')
read_titles = require_task_permission('directory_view', 'crm_tasks_create', 'crm_tasks_edit')
edit_titles = require_task_permission('directory_edit')
