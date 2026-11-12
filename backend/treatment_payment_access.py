"""Narrow staff access to collecting an existing treatment plan payment."""
from fastapi import Depends, HTTPException
from routers.auth import get_current_active_user
from permission_policy import has_permission

EMPLOYEE_ROLES = frozenset({'admin','super_admin','administrator','doctor','marketer'})
PAYMENT_ROUTES = frozenset({
    '/api/treatment-plans/{plan_id}/settle-remaining',
    '/api/treatment-plans/{plan_id}/service-rows/{service_row_id}/receipts',
    '/api/treatment-plans/{plan_id}/complex-services/{service_id}/pay-remaining',
    '/api/treatment-plans/{plan_id}/complex-services/{service_id}/components/{component_service_id}/mark-paid',
    '/api/treatment-plans/{plan_id}/services/{service_id}/mark-paid',
    '/api/treatment-plans/{plan_id}/services/{service_id}/sessions/{session_id}/mark-paid',
})

def check_payment_staff(user):
    if not user.is_active or user.role not in EMPLOYEE_ROLES or not has_permission(user,'patients_view'):
        raise HTTPException(403, 'Treatment payment access denied')

async def payment_staff(user=Depends(get_current_active_user)):
    check_payment_staff(user)
    return user
