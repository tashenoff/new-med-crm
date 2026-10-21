"""Clinic-database-scoped DID mappings; no source catalog or history migration."""
import re
from datetime import datetime

import phonenumbers
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError
from .source_service import SourceService
from ..models.lead import LeadSource
from .source_attribution import configured_dimensions


def active_source(source):
    if not source:
        return None
    source = SourceService._normalize_source_doc(source)
    return source if source.get('status') == 'active' and source.get('type') in {item.value for item in LeadSource} else None


def international_number(value, *, provider=False):
    if not isinstance(value, str) or len(value) > 50:
        raise ValueError('Укажите международный номер с + и кодом страны')
    value = value.strip()
    # Zadarma supplies a complete international DID, sometimes without '+'.
    # Never infer a country, use caller_id, or rewrite national 8/0 prefixes.
    if provider and re.fullmatch(r'[1-9][0-9]{6,14}', value):
        value = '+' + value
    if not re.fullmatch(r'\+[0-9 ().-]+', value):
        raise ValueError('Укажите международный номер с + и кодом страны')
    compact = re.sub(r'[ ().-]', '', value)
    if not re.fullmatch(r'\+[1-9][0-9]{6,14}', compact):
        raise ValueError('Некорректный международный номер')
    try:
        number = phonenumbers.parse(compact, None)
    except phonenumbers.NumberParseException as error:
        raise ValueError('Некорректный международный номер') from error
    if not phonenumbers.is_valid_number(number) or phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164) != compact:
        raise ValueError('Некорректный международный номер')
    return compact


class InboundSourceService:
    def __init__(self, db):
        self.db = db
        # This application's existing CRM isolation is one database per installation.
        # Native _id uniqueness makes formatted aliases and concurrent creates safe.
        self.mappings = db.crm_inbound_source_mappings
        self.sources = db.crm_sources

    async def list(self):
        mappings = await self.mappings.find({}).sort('_id', 1).to_list(length=None)
        return [dict(phone_number=mapping['_id'], source_id=mapping['source_id'],
                     **{key: mapping[key] for key in ('channel_id', 'campaign_id') if mapping.get(key)}) for mapping in mappings]

    async def dimensions(self, source_id, channel_id, campaign_id):
        source = await self.checked_source(source_id)
        dimensions = configured_dimensions(source, channel_id, campaign_id)
        if dimensions['channel_id']:
            channel = next(row for row in source['channels'] if row['id'] == dimensions['channel_id'])
            if channel['adapter'] != 'phone':
                raise HTTPException(422, 'Входящий номер требует телефонного адаптера канала')
        return {key: value for key, value in dimensions.items() if key.endswith('_id') and value}

    async def checked_source(self, identifier):
        source = await self.sources.find_one({'id': identifier})
        source = active_source(source)
        if not source:
            raise HTTPException(422, 'Выберите существующий активный источник')
        return source

    async def create(self, phone, source_id, actor, channel_id=None, campaign_id=None):
        phone = international_number(phone)
        dimensions = await self.dimensions(source_id, channel_id, campaign_id)
        try:
            await self.mappings.insert_one(dict(_id=phone, source_id=source_id, **dimensions,
                created_at=datetime.utcnow(), updated_at=datetime.utcnow(), updated_by=actor))
        except DuplicateKeyError as error:
            raise HTTPException(409, 'Этот номер уже привязан к источнику') from error
        return dict(phone_number=phone, source_id=source_id, **dimensions)

    async def update(self, phone, source_id, actor, channel_id=None, campaign_id=None):
        phone = international_number(phone)
        dimensions = await self.dimensions(source_id, channel_id, campaign_id)
        result = await self.mappings.update_one({'_id': phone}, {'$set': dict(
            source_id=source_id, channel_id=dimensions.get('channel_id'), campaign_id=dimensions.get('campaign_id'), updated_at=datetime.utcnow(), updated_by=actor)})
        if not result.matched_count:
            raise HTTPException(404, 'Привязка номера не найдена')
        return dict(phone_number=phone, source_id=source_id, **dimensions)

    async def delete(self, phone):
        result = await self.mappings.delete_one({'_id': international_number(phone)})
        if not result.deleted_count:
            raise HTTPException(404, 'Привязка номера не найдена')

    async def attribution(self, called_did):
        try:
            phone = international_number(called_did, provider=True)
        except ValueError:
            return dict(called_did=None, source_id=None, source_name=None, source_type=None)
        result = dict(called_did=phone, source_id=None, source_name=None, source_type=None)
        mapping = await self.mappings.find_one({'_id': phone})
        if mapping:
            source = await self.sources.find_one({'id': mapping['source_id']})
            source = active_source(source)
            if source:
                result.update(source_id=source['id'], source_name=source['name'], source_type=source['type'])
                try:
                    dimensions = configured_dimensions(source, mapping.get('channel_id'), mapping.get('campaign_id'))
                    if dimensions['channel_id'] or dimensions['campaign_id']:
                        result.update(dimensions)
                except HTTPException:
                    # Retired dimensions do not invent a replacement. Preserve the
                    # valid source mapping, leave the unknown channel unassigned.
                    pass
        return result
