from typing import List
import unicodedata

from pydantic import BaseModel, ConfigDict, Field, StrictStr, field_validator


class StrictPayload(BaseModel):
    model_config = ConfigDict(extra='forbid')


class ColumnName(StrictPayload):
    name: StrictStr = Field(min_length=1, max_length=100)

    @field_validator('name')
    @classmethod
    def valid_name(cls, name):
        name = name.strip()
        if not name or any(unicodedata.category(character).startswith('C') for character in name):
            raise ValueError('Column name must contain 1–100 visible characters without control characters')
        return name


class ColumnOrder(StrictPayload):
    column_ids: List[StrictStr]


class ColumnMove(StrictPayload):
    column_id: StrictStr = Field(min_length=1)


class KanbanColumn(BaseModel):
    id: str
    name: str
    is_system: bool
    manual_move_allowed: bool
    affected_count: int = 0


class ColumnDeleted(BaseModel):
    id: str
    affected_count: int


class ColumnMoved(BaseModel):
    lead_id: str
    column_id: str
    status: str
