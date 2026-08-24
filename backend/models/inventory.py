"""
Inventory models for warehouse inventory checks.
"""

from datetime import datetime
from typing import List, Optional
import uuid
from enum import Enum

from pydantic import BaseModel, Field


class InventoryStatus(str, Enum):
    """Статус инвентаризации"""
    IN_PROGRESS = "На заполнении"
    COMPLETED = "Заполнено"


class InventoryItemBase(BaseModel):
    """Базовая модель элемента инвентаризации"""
    material_id: str
    material_name: str
    expected_quantity: float = Field(0.0, ge=0)
    actual_quantity: Optional[float] = Field(None, ge=0)
    difference: Optional[float] = None
    notes: Optional[str] = None


class InventoryItem(InventoryItemBase):
    """Элемент инвентаризации"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))


class InventoryBase(BaseModel):
    """Базовая модель инвентаризации"""
    warehouse_name: str
    status: InventoryStatus = InventoryStatus.IN_PROGRESS
    employee: Optional[str] = None  # ФИО сотрудника (автозаполняется из текущего пользователя)
    notes: Optional[str] = None


class Inventory(InventoryBase):
    """Полная модель инвентаризации"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    number: int  # Порядковый номер инвентаризации
    inventory_date: datetime = Field(default_factory=datetime.utcnow)
    completion_date: Optional[datetime] = None
    items: List[InventoryItem] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str  # email пользователя


class InventoryCreate(InventoryBase):
    """Создание инвентаризации"""
    items: List[InventoryItemBase] = Field(default_factory=list)


class InventoryUpdate(BaseModel):
    """Обновление инвентаризации"""
    warehouse_name: Optional[str] = None
    status: Optional[InventoryStatus] = None
    employee: Optional[str] = None
    notes: Optional[str] = None
    items: Optional[List[InventoryItemBase]] = None


class MaterialNeedsAttention(BaseModel):
    """Материал, требующий внимания"""
    material_id: str
    material_name: str
    warehouse_name: str
    current_stock: float
    min_stock: float
    shortage: float
    unit: Optional[str] = None
    last_inventory_date: Optional[datetime] = None
