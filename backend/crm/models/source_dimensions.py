"""User-named dimensions. Adapter identity never follows a display name."""
from typing import Literal, Optional
from uuid import uuid4
from datetime import datetime, date
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class SourceChannel(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: str = Field(default_factory=lambda: str(uuid4()), min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=100)
    adapter: Literal['manual', 'phone', 'form', 'whatsapp', 'email', 'social'] = 'manual'
    active: bool = True
    signals: 'CampaignSignals' = Field(default_factory=lambda: CampaignSignals())

    @field_validator('name', 'id')
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError('Название и ID не могут быть пустыми')
        return value.strip()


class CampaignSignals(BaseModel):
    model_config = ConfigDict(extra='forbid')
    form_id: Optional[str] = Field(None, min_length=1, max_length=200)
    utm_source: Optional[str] = Field(None, min_length=1, max_length=200)
    utm_medium: Optional[str] = Field(None, min_length=1, max_length=200)
    utm_campaign: Optional[str] = Field(None, min_length=1, max_length=200)
    referral: Optional[str] = Field(None, min_length=1, max_length=500)
    ad_id: Optional[str] = Field(None, min_length=1, max_length=200)

    @field_validator('*')
    @classmethod
    def nonblank(cls, value):
        if value is not None and not value.strip():
            raise ValueError('Пустой признак не определяет атрибуцию')
        return value.strip() if value is not None else None


class SourceCampaign(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: str = Field(default_factory=lambda: str(uuid4()), min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=100)
    active: bool = True
    channel_id: Optional[str] = Field(None, min_length=1, max_length=100)
    signals: CampaignSignals = Field(default_factory=CampaignSignals)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    tags: list[str] = Field(default_factory=list)

    @field_validator('tags')
    @classmethod
    def valid_tags(cls, value):
        if any(not tag.strip() or len(tag) > 100 for tag in value):
            raise ValueError('Метка должна содержать от 1 до 100 символов')
        return list(dict.fromkeys(tag.strip() for tag in value))

    @model_validator(mode='after')
    def valid_dates(self):
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError('Конец кампании не может быть раньше начала')
        return self

    @field_validator('name', 'id')
    @classmethod
    def nonblank(cls, value):
        return SourceChannel.nonblank(value)


SourceChannel.model_rebuild()


def validate_dimensions(channels, campaigns):
    """Validate a whole configuration without touching previously saved leads."""
    channels = [item.model_dump() if isinstance(item, BaseModel) else item for item in channels]
    campaigns = [item.model_dump() if isinstance(item, BaseModel) else item for item in campaigns]
    for rows in (channels, campaigns):
        identifiers = [row['id'] for row in rows]
        if len(identifiers) != len(set(identifiers)):
            raise ValueError('ID каналов и кампаний должны быть уникальны внутри источника')
    ids = {row['id'] for row in channels}
    if any(row.get('channel_id') and row['channel_id'] not in ids for row in campaigns):
        raise ValueError('Канал кампании должен принадлежать этому источнику')
    return channels, campaigns


class SourceTariff(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    scheme: Literal['monthly', 'per_lead', 'free', 'actual']
    amount: Optional[float] = Field(None, ge=0)
    effective_at: datetime

    @model_validator(mode='after')
    def valid_tariff(self):
        if self.effective_at.tzinfo is None:
            raise ValueError('Дата начала тарифа должна содержать часовой пояс')
        if self.scheme == 'free':
            if self.amount not in (None, 0):
                raise ValueError('Бесплатный тариф имеет явную сумму 0')
            self.amount = 0
        elif self.scheme == 'actual':
            if self.amount is not None:
                raise ValueError('Фактические расходы вводятся отдельно за период')
        elif self.amount is None:
            raise ValueError('Укажите договорную сумму тарифа')
        return self


class SourceExpense(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    id: str = Field(min_length=1, max_length=100)
    start: datetime
    end: datetime
    amount: float = Field(ge=0)
    currency: str = Field(pattern=r'^[A-Z]{3}$')
    campaign_id: Optional[str] = Field(None, min_length=1, max_length=100)
    clicks: Optional[int] = Field(None, ge=0, strict=True)
    impressions: Optional[int] = Field(None, ge=0, strict=True)

    @model_validator(mode='after')
    def valid_period(self):
        if self.start.tzinfo is None or self.end.tzinfo is None or self.start >= self.end:
            raise ValueError('Укажите начало и конец периода с часовым поясом; конец позже начала')
        return self
