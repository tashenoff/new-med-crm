from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, StrictStr, field_validator
from models.auth import UserRole
from routers.auth import require_role
from ..dependencies import get_database
from ..services.inbound_source_service import InboundSourceService, international_number


class MappingSource(BaseModel):
    model_config = ConfigDict(extra='forbid')
    source_id: StrictStr = Field(min_length=1, max_length=100)


class MappingCreate(MappingSource):
    phone_number: StrictStr = Field(min_length=1, max_length=50)

    @field_validator('phone_number')
    @classmethod
    def valid_number(cls, value):
        return international_number(value)


class MappingResponse(MappingCreate):
    pass


staff = require_role([role for role in UserRole if role != UserRole.PATIENT])
manage = require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN])
inbound_sources_router = APIRouter(prefix='/inbound-source-mappings', tags=['CRM Inbound Sources'])


def checked_phone(phone):
    try:
        return international_number(phone)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@inbound_sources_router.get('', response_model=List[MappingResponse], dependencies=[Depends(staff)])
async def list_mappings(db=Depends(get_database)):
    return await InboundSourceService(db).list()


@inbound_sources_router.post('/validate', dependencies=[Depends(manage)])
async def validate_mapping(payload: MappingCreate, db=Depends(get_database)):
    # Validate before the UI creates a source. The actual insert still handles
    # a competing reservation with HTTP 409; no unique-index migration needed.
    if await db.crm_inbound_source_mappings.find_one({'_id': payload.phone_number}):
        raise HTTPException(409, 'Этот номер уже привязан к источнику')
    return {'phone_number': payload.phone_number}


@inbound_sources_router.post('', response_model=MappingResponse, status_code=201)
async def create_mapping(payload: MappingCreate, user=Depends(manage), db=Depends(get_database)):
    return await InboundSourceService(db).create(payload.phone_number, payload.source_id, user.id)


@inbound_sources_router.put('/{phone}', response_model=MappingResponse)
async def update_mapping(phone: str, payload: MappingSource, user=Depends(manage), db=Depends(get_database)):
    # The path has the same explicit international format requirement as POST.
    phone = checked_phone(phone)
    return await InboundSourceService(db).update(phone, payload.source_id, user.id)


@inbound_sources_router.delete('/{phone}', status_code=204)
async def delete_mapping(phone: str, user=Depends(manage), db=Depends(get_database)):
    phone = checked_phone(phone)
    await InboundSourceService(db).delete(phone)
    return Response(status_code=204)
