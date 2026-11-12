"""Minimal contact lookup and verified task bindings; no contact writes."""
import re
from fastapi import HTTPException
from permission_policy import has_permission

class TaskContactService:
    SOURCES = {'patient': ('patients', 'patients_view'), 'lead': ('crm_leads', 'crm_view')}

    def __init__(self, db):
        self.db = db

    @staticmethod
    def item(source, doc):
        name = doc.get('full_name') if source == 'patient' else ' '.join(filter(None, [doc.get('first_name'), doc.get('last_name'), doc.get('middle_name')])) or doc.get('name')
        return {'id': source + ':' + str(doc['id']), 'name': name or '', 'phone': doc.get('phone') or '', 'source': source}

    async def resolve(self, identifier, user):
        source, separator, raw_id = (identifier or '').partition(':')
        if source not in self.SOURCES or not separator or not raw_id:
            raise HTTPException(422, 'Invalid contact identity')
        collection, permission = self.SOURCES[source]
        if user is not None and not has_permission(user, permission):
            raise HTTPException(403, 'Contact source access denied')
        doc = await self.db[collection].find_one({'id': raw_id})
        if not doc:
            raise HTTPException(404, 'Contact not found')
        return self.item(source, doc)

    async def search(self, query, user, limit=20):
        allowed = [source for source, (_, permission) in self.SOURCES.items() if has_permission(user, permission)]
        if not allowed:
            raise HTTPException(403, 'Contact source access denied')
        query = query.strip()
        if len(query) < 2:
            return []
        expression = re.escape(query)
        digits = re.sub(r'\D', '', query)
        phone_expression = r'\D*'.join(digits) if len(digits) >= 2 else expression
        result = {}
        for source in allowed:
            fields = ['full_name'] if source == 'patient' else ['first_name','last_name','middle_name','name']
            conditions = [{field:{'$regex':expression,'$options':'i'}} for field in fields]
            conditions.append({'phone':{'$regex':phone_expression,'$options':'i'}})
            projection = {field:1 for field in fields + ['id','phone','converted_to_client_id']}
            docs = await self.db[self.SOURCES[source][0]].find({'$or':conditions}, projection).sort('id',1).to_list(length=limit)
            for doc in docs:
                if not doc.get('id'):
                    continue
                item = self.item(source, doc)
                # Only a verified conversion is a duplicate, never a shared phone.
                if source == 'lead' and 'patient' in allowed and doc.get('converted_to_client_id'):
                    patient = await self.db.patients.find_one({'id':doc['converted_to_client_id']})
                    if patient:
                        item = self.item('patient',patient)
                result[item['id']] = item
        return sorted(result.values(), key=lambda item:(item['name'].casefold(),item['id']))[:limit]
