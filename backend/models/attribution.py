"""Optional source-owned contact-method dimensions shared by patient/booking APIs."""
from typing import Optional
from pydantic import AliasChoices, BaseModel, Field, model_validator


class AttributionDimensions(BaseModel):
    source_name: Optional[str] = None
    channel_id: Optional[str] = Field(None, max_length=100, validation_alias=AliasChoices('channel_id', 'contactmethod_id'))
    channel_name: Optional[str] = None
    campaign_id: Optional[str] = Field(None, max_length=100)
    campaign_name: Optional[str] = None

    @model_validator(mode='before')
    @classmethod
    def consistent_alias(cls, value):
        if isinstance(value, dict) and 'channel_id' in value and 'contactmethod_id' in value and value['channel_id'] != value['contactmethod_id']:
            raise ValueError('channel_id и contactmethod_id обозначают один способ и должны совпадать')
        return value
