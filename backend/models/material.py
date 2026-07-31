"""
Material models for warehouse inventory management.
"""

from datetime import datetime
from typing import List, Optional
import uuid

from pydantic import BaseModel, Field, PositiveFloat, validator


class WarehouseThreshold(BaseModel):
    warehouse_name: str
    min_stock: float = Field(0.0, ge=0)


class MaterialBase(BaseModel):
    name: str
    unit: Optional[str] = None
    barcode: Optional[str] = None
    material_type: str = "Материал"
    is_product: bool = False
    start_period: float = Field(0.0, ge=0)
    incoming: float = Field(0.0, ge=0)
    outgoing: float = Field(0.0, ge=0)
    inventory: float = Field(0.0, ge=0)
    balance: float = Field(0.0, ge=0)
    warehouses: List[WarehouseThreshold] = Field(default_factory=list)

    @validator("start_period", "incoming", "outgoing", "inventory", "balance")
    def non_negative(cls, value):
        if value < 0:
            raise ValueError("Значение не может быть отрицательным")
        return value


class Material(MaterialBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    deleted_at: Optional[datetime] = None
    deleted_by: Optional[str] = None


class MaterialCreate(MaterialBase):
    pass


class MaterialUpdate(BaseModel):
    name: Optional[str] = None
    unit: Optional[str] = None
    barcode: Optional[str] = None
    material_type: Optional[str] = None
    is_product: Optional[bool] = None
    start_period: Optional[float] = Field(None, ge=0)
    incoming: Optional[float] = Field(None, ge=0)
    outgoing: Optional[float] = Field(None, ge=0)
    inventory: Optional[float] = Field(None, ge=0)
    balance: Optional[float] = Field(None, ge=0)
    warehouses: Optional[List[WarehouseThreshold]] = None

    @validator("start_period", "incoming", "outgoing", "inventory", "balance")
    def non_negative_optional(cls, value):
        if value is not None and value < 0:
            raise ValueError("Значение не может быть отрицательным")
        return value
