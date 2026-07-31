from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import uuid


class Document(BaseModel):
    """Document model for patient files"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    filename: str
    original_filename: str
    file_path: str
    file_size: int
    file_type: str
    uploaded_by: str  # User ID who uploaded the file
    uploaded_by_name: str  # Name of the user who uploaded
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class DocumentCreate(BaseModel):
    """Schema for creating document"""
    patient_id: str
    description: Optional[str] = None


class DocumentUpdate(BaseModel):
    """Schema for updating document"""
    description: Optional[str] = None
