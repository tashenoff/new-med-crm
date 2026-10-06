from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class CallDirection(str, Enum):
    INBOUND = "inbound"
    OUTBOUND = "outbound"


class CallStatus(str, Enum):
    MISSED = "missed"
    ANSWERED = "answered"
    REJECTED = "rejected"
    BUSY = "busy"
    FAILED = "failed"


class Disposition(str, Enum):
    """Статус завершения звонка от АТС"""
    ANSWERED = "answered"
    BUSY = "busy"
    NO_ANSWER = "no answer"
    CANCEL = "cancel"
    MISSED = "missed"


class TelephonyCall(BaseModel):
    id: Optional[str] = Field(default=None, alias="_id")
    client_id: Optional[str] = None  # ID лида или пациента
    patient_id: Optional[str] = None  # ID пациента, если найден
    lead_id: Optional[str] = None    # ID лида, если создан
    contact_name: Optional[str] = None  # Имя пациента или лида, подтянутое по номеру
    phone_number: str
    direction: CallDirection
    status: CallStatus
    disposition: Optional[Disposition] = None  # Статус завершения от АТС
    pbx_call_id: Optional[str] = None  # ID звонка в Zadarma
    call_id: Optional[str] = None      # ID звонка (сквозной)
    is_recorded: bool = False
    duration: int = 0  # в секундах
    recording_url: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    user_id: Optional[str] = None  # кто принял/сделал звонок
    raw_payload: Optional[Dict[str, Any]] = None  # Сырой payload вебхука для отладки

    class Config:
        use_enum_values = True
        populate_by_name = True


class TelephonyCallCreate(BaseModel):
    client_id: Optional[str] = None
    patient_id: Optional[str] = None
    lead_id: Optional[str] = None
    phone_number: str
    direction: CallDirection
    status: CallStatus
    disposition: Optional[Disposition] = None
    pbx_call_id: Optional[str] = None
    call_id: Optional[str] = None
    is_recorded: bool = False
    duration: int = 0
    recording_url: Optional[str] = None
    notes: Optional[str] = None

    class Config:
        use_enum_values = True


class TelephonyCallUpdate(BaseModel):
    status: Optional[CallStatus] = None
    disposition: Optional[Disposition] = None
    duration: Optional[int] = None
    recording_url: Optional[str] = None
    notes: Optional[str] = None

    class Config:
        use_enum_values = True


class TelephonyStats(BaseModel):
    total_calls: int = 0
    inbound_calls: int = 0
    outbound_calls: int = 0
    missed_calls: int = 0
    answered_calls: int = 0
    avg_call_duration: float = 0.0
    total_call_duration: int = 0


class TelephonyIntegration(BaseModel):
    id: Optional[str] = None
    provider: str  # например: "mango", "zadarma", "asterisk"
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    webhook_url: Optional[str] = None
    is_active: bool = True
    settings: Optional[dict] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class TelephonyIntegrationCreate(BaseModel):
    provider: str
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    webhook_url: Optional[str] = None
    is_active: bool = True

