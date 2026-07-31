from pydantic import BaseModel, Field
from typing import Optional, List
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

class TelephonyCall(BaseModel):
    id: Optional[str] = None
    client_id: Optional[str] = None
    phone_number: str
    direction: CallDirection
    status: CallStatus
    duration: int = 0  # в секундах
    recording_url: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    user_id: Optional[str] = None  # кто принял/сделал звонок
    
    class Config:
        use_enum_values = True

class TelephonyCallCreate(BaseModel):
    client_id: Optional[str] = None
    phone_number: str
    direction: CallDirection
    status: CallStatus
    duration: int = 0
    recording_url: Optional[str] = None
    notes: Optional[str] = None
    
    class Config:
        use_enum_values = True

class TelephonyCallUpdate(BaseModel):
    status: Optional[CallStatus] = None
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
