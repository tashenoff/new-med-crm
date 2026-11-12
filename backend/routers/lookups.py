"""Minimal shared physician identity lookup, never an HMS record/compensation API."""
from fastapi import APIRouter, Depends
from database import get_database
from dependencies import get_current_active_user
from treatment_payment_access import payment_staff

router = APIRouter(prefix='/api/lookups', tags=['Shared lookups'])


@router.get('/doctors')
async def doctors(db=Depends(get_database), user=Depends(get_current_active_user)):
    fields = {'_id': 0, 'id': 1, 'full_name': 1, 'specialty': 1, 'specialties': 1, 'calendar_color': 1}
    return await db.doctors.find({'is_active': True}, fields).limit(500).to_list(500)


@router.get('/treatment-payment-types')
async def treatment_payment_types(db=Depends(get_database), user=Depends(payment_staff)):
    """Names/IDs for recording treatment payments, no commissions or settings."""
    rows = await db.payment_types.find({'is_active': True}, {'_id':0,'id':1,'name':1}).limit(500).to_list(500)
    return [{'id':row['id'],'name':row['name']} for row in rows if row.get('id') and row.get('name')]
