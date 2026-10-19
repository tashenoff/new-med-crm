"""CRM stage for the WhatsApp widget; uses the same canonical cards as Kanban."""
from fastapi import HTTPException

from .kanban_service import KanbanService, normalized_columns, canonical_column_id
from .lead_identity import normalize_identity_phone, patient_link


class ChatKanbanService:
    def __init__(self, db):
        self.db = db
        self.kanban = KanbanService(db)

    async def context(self, phone):
        key = normalize_identity_phone(phone)
        if not key:
            raise HTTPException(422, 'Некорректный телефон чата')
        # Read raw persisted links. Enriched chat projections can infer a first
        # phone match; that is insufficient evidence for moving a CRM card.
        chat = await self.db.wazzup_chats.find_one({'phone': '+' + key})
        groups = await self.kanban.groups()
        columns = normalized_columns(await self.kanban.configuration() or {})
        result = dict(link_state='missing', lead_id=None, current_column_id=None,
                      current_label='Сделка не связана', columns=columns, can_move=False,
                      reason='Нет однозначной связи со сделкой CRM')
        if chat and chat.get('linked_lead_id'):
            candidates = [group for group in groups if any(touch.get('id') == chat['linked_lead_id'] for touch in group)]
            if not candidates:
                return {**result, 'link_state': 'stale', 'current_label': 'Связанная сделка не найдена'}
        elif chat and chat.get('linked_patient_id'):
            candidates = [group for group in groups if any(patient_link(touch) == chat['linked_patient_id'] for touch in group)]
        else:
            candidates = [group for group in groups if any(normalize_identity_phone(touch.get('phone')) == key for touch in group)]
        if len(candidates) > 1:
            return {**result, 'link_state': 'ambiguous', 'current_label': 'Несколько связанных сделок',
                    'reason': 'Уточните связь со сделкой CRM; случайный выбор отключён'}
        if not candidates:
            return result
        if chat and chat.get('linked_lead_id') and chat.get('linked_patient_id') and not any(
            patient_link(touch) == chat['linked_patient_id'] for touch in candidates[0]
        ):
            return {**result, 'link_state': 'ambiguous', 'current_label': 'Связи чата противоречат друг другу',
                    'reason': 'Уточните связь пациента и сделки CRM'}
        canonical = candidates[0][0]
        identifier = canonical_column_id(canonical)
        current = next((column for column in columns if column['id'] == identifier), None)
        custom = [column for column in columns if not column['is_system'] and column['manual_move_allowed']]
        movable = current is not None and bool(custom)
        reason = '' if movable else 'Нет пользовательских этапов' if not custom else 'Текущий этап CRM недоступен'
        return {**result, 'link_state': 'resolved', 'lead_id': canonical['id'],
                'current_column_id': identifier, 'current_label': current['name'] if current else 'Неизвестный этап CRM',
                'can_move': movable, 'reason': reason}

    async def move(self, phone, payload):
        context = await self.context(phone)
        if context['link_state'] != 'resolved':
            raise HTTPException(409, context['reason'])
        if context['lead_id'] != payload.lead_id or context['current_column_id'] != payload.expected_column_id:
            raise HTTPException(409, 'Связь или этап сделки изменились. Обновите данные.')
        target = next((column for column in context['columns'] if column['id'] == payload.column_id), None)
        if target is None:
            raise HTTPException(404, 'Этап CRM больше не существует')
        if target['is_system'] or not target['manual_move_allowed']:
            raise HTTPException(400, 'Системные этапы нельзя выбирать вручную')
        if not context['can_move']:
            raise HTTPException(400, context['reason'])
        if payload.column_id != context['current_column_id']:
            await self.kanban.move(context['lead_id'], payload.column_id, custom_only=True,
                                   expected_column_id=payload.expected_column_id)
        return await self.context(phone)
