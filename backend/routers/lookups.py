"""Minimal shared physician identity lookup, never an HMS record/compensation API."""
from fastapi import APIRouter, Depends
from database import get_database
from dependencies import get_current_active_user

router = APIRouter(prefix='/api/lookups', tags=['Shared lookups'])


@router.get('/doctors')
async def doctors(db=Depends(get_database), user=Depends(get_current_active_user)):
    fields = {'_id': 0, 'id': 1, 'full_name': 1, 'specialty': 1, 'specialties': 1, 'calendar_color': 1}
    return await db.doctors.find({'is_active': True}, fields).limit(500).to_list(500)
