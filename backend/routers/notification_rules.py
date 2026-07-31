from fastapi import APIRouter, HTTPException, Depends
from typing import List
from database import get_database
from models.notification_rule import (
    NotificationRule,
    NotificationRuleCreate,
    NotificationRuleUpdate
)
from services.notification_rule_service import NotificationRuleService
from dependencies import get_current_user
from models.auth import User

router = APIRouter(prefix="/api/notification-rules", tags=["Notification Rules"])


@router.post("", response_model=NotificationRule)
async def create_notification_rule(
    rule_data: NotificationRuleCreate,
    current_user: User = Depends(get_current_user),
    db=Depends(get_database)
):
    """Создать новое правило уведомления"""
    service = NotificationRuleService(db)
    return await service.create_rule(rule_data)


@router.get("", response_model=List[NotificationRule])
async def get_all_notification_rules(
    current_user: User = Depends(get_current_user),
    db=Depends(get_database)
):
    """Получить все правила уведомлений"""
    service = NotificationRuleService(db)
    return await service.get_all_rules()


@router.get("/{rule_id}", response_model=NotificationRule)
async def get_notification_rule(
    rule_id: str,
    current_user: User = Depends(get_current_user),
    db=Depends(get_database)
):
    """Получить правило уведомления по ID"""
    service = NotificationRuleService(db)
    rule = await service.get_rule_by_id(rule_id)
    
    if not rule:
        raise HTTPException(status_code=404, detail="Правило не найдено")
    
    return rule


@router.put("/{rule_id}", response_model=NotificationRule)
async def update_notification_rule(
    rule_id: str,
    rule_update: NotificationRuleUpdate,
    current_user: User = Depends(get_current_user),
    db=Depends(get_database)
):
    """Обновить правило уведомления"""
    service = NotificationRuleService(db)
    rule = await service.update_rule(rule_id, rule_update)
    
    if not rule:
        raise HTTPException(status_code=404, detail="Правило не найдено")
    
    return rule


@router.post("/{rule_id}/toggle", response_model=NotificationRule)
async def toggle_notification_rule(
    rule_id: str,
    current_user: User = Depends(get_current_user),
    db=Depends(get_database)
):
    """Переключить статус правила (включено/выключено)"""
    service = NotificationRuleService(db)
    rule = await service.toggle_rule_status(rule_id)
    
    if not rule:
        raise HTTPException(status_code=404, detail="Правило не найдено")
    
    return rule


@router.delete("/{rule_id}")
async def delete_notification_rule(
    rule_id: str,
    current_user: User = Depends(get_current_user),
    db=Depends(get_database)
):
    """Удалить правило уведомления"""
    service = NotificationRuleService(db)
    success = await service.delete_rule(rule_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="Правило не найдено")
    
    return {"message": "Правило успешно удалено"}
