"""
Staff Router Module

API роуты для управления персоналом
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from motor.motor_asyncio import AsyncIOMotorDatabase

from database import get_database
from dependencies import get_current_user
from models.auth import User
from models.staff import (
    StaffMemberCreate,
    StaffMemberUpdate,
    StaffMemberResponse,
    StaffRole,
    Permission
)
from services.staff_service import StaffService

router = APIRouter(prefix="/api/staff", tags=["staff"])


def get_staff_service(db: AsyncIOMotorDatabase = Depends(get_database)) -> StaffService:
    """Dependency для получения сервиса персонала"""
    return StaffService(db)


def require_staff_permission(current_user: User = Depends(get_current_user)):
    """Проверка прав доступа к управлению персоналом"""
    # Только admin и super_admin могут управлять персоналом
    if current_user.role not in ["admin", "super_admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для управления персоналом"
        )
    return current_user


@router.get("/", response_model=List[StaffMemberResponse])
async def get_all_staff(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(require_staff_permission),
    staff_service: StaffService = Depends(get_staff_service)
):
    """
    Получить список всего персонала
    
    Требует: admin или super_admin роль
    """
    try:
        return await staff_service.get_all_staff(skip=skip, limit=limit)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при получении списка персонала: {str(e)}"
        )


@router.get("/{staff_id}", response_model=StaffMemberResponse)
async def get_staff_member(
    staff_id: str,
    current_user: User = Depends(require_staff_permission),
    staff_service: StaffService = Depends(get_staff_service)
):
    """
    Получить информацию о сотруднике по ID
    
    Требует: admin или super_admin роль
    """
    staff_member = await staff_service.get_staff_by_id(staff_id)
    
    if not staff_member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Сотрудник не найден"
        )
    
    return staff_member


@router.post("/", response_model=StaffMemberResponse, status_code=status.HTTP_201_CREATED)
async def create_staff_member(
    staff_data: StaffMemberCreate,
    current_user: User = Depends(require_staff_permission),
    staff_service: StaffService = Depends(get_staff_service)
):
    """
    Создать нового сотрудника
    
    Требует: admin или super_admin роль
    """
    try:
        return await staff_service.create_staff_member(staff_data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при создании сотрудника: {str(e)}"
        )


@router.put("/{staff_id}", response_model=StaffMemberResponse)
async def update_staff_member(
    staff_id: str,
    staff_update: StaffMemberUpdate,
    current_user: User = Depends(require_staff_permission),
    staff_service: StaffService = Depends(get_staff_service)
):
    """
    Обновить данные сотрудника
    
    Требует: admin или super_admin роль
    """
    try:
        updated_staff = await staff_service.update_staff_member(staff_id, staff_update)
        
        if not updated_staff:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Сотрудник не найден"
            )
        
        return updated_staff
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при обновлении данных сотрудника: {str(e)}"
        )


@router.delete("/{staff_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_staff_member(
    staff_id: str,
    current_user: User = Depends(require_staff_permission),
    staff_service: StaffService = Depends(get_staff_service)
):
    """
    Удалить сотрудника (мягкое удаление)
    
    Требует: admin или super_admin роль
    """
    # Защита от самоудаления
    if current_user.id == staff_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя удалить свой собственный аккаунт"
        )
    
    success = await staff_service.delete_staff_member(staff_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Сотрудник не найден"
        )
    
    return None


@router.get("/{staff_id}/permissions", response_model=List[str])
async def get_staff_permissions(
    staff_id: str,
    current_user: User = Depends(get_current_user),
    staff_service: StaffService = Depends(get_staff_service)
):
    """
    Получить список прав сотрудника
    
    Пользователь может запросить свои собственные права или
    admin/super_admin могут запросить права любого сотрудника
    """
    # Проверяем права доступа
    if current_user.id != staff_id and current_user.role not in ["admin", "super_admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для просмотра прав другого пользователя"
        )
    
    staff_member = await staff_service.get_staff_by_id(staff_id)
    
    if not staff_member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Сотрудник не найден"
        )
    
    return [p.value for p in staff_member.permissions]


@router.post("/{staff_id}/check-permission")
async def check_staff_permission(
    staff_id: str,
    permission: Permission,
    current_user: User = Depends(get_current_user),
    staff_service: StaffService = Depends(get_staff_service)
):
    """
    Проверить наличие конкретного права у сотрудника
    
    Доступно для проверки своих прав или admin/super_admin
    """
    # Проверяем права доступа
    if current_user.id != staff_id and current_user.role not in ["admin", "super_admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав"
        )
    
    has_permission = await staff_service.check_permission(staff_id, permission)
    
    return {
        "staff_id": staff_id,
        "permission": permission.value,
        "has_permission": has_permission
    }


@router.get("/roles/permissions/{role}", response_model=List[str])
async def get_role_permissions(
    role: StaffRole,
    current_user: User = Depends(get_current_user),
    staff_service: StaffService = Depends(get_staff_service)
):
    """
    Получить список прав для конкретной роли
    
    Доступно всем авторизованным пользователям
    """
    permissions = await staff_service.get_role_permissions(role)
    return [p.value for p in permissions]


@router.get("/personnel/all", response_model=List[dict])
async def get_all_personnel(
    skip: int = 0,
    limit: int = 500,
    current_user: User = Depends(require_staff_permission),
    staff_service: StaffService = Depends(get_staff_service)
):
    """
    Получить весь персонал включая врачей
    
    Возвращает объединенный список:
    - Сотрудников из коллекции staff (admin, marketer и т.д.)
    - Врачей из коллекции doctors
    
    Требует: admin или super_admin роль
    """
    try:
        return await staff_service.get_all_personnel(skip=skip, limit=limit)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при получении списка персонала: {str(e)}"
        )


@router.post("/doctors/{doctor_id}/assign-access", status_code=status.HTTP_200_OK)
async def assign_access_to_doctor(
    doctor_id: str,
    email: str,
    password: str,
    current_user: User = Depends(require_staff_permission),
    staff_service: StaffService = Depends(get_staff_service)
):
    """
    Назначить врачу логин и пароль для доступа в систему
    
    Врач создается в разделе "Врачи", но доступ ему можно назначить здесь
    
    Требует: admin или super_admin роль
    """
    try:
        result = await staff_service.assign_access_to_doctor(doctor_id, email, password)
        return {
            "success": True,
            "message": "Доступ успешно назначен врачу",
            "data": result
        }
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при назначении доступа: {str(e)}"
        )


@router.delete("/doctors/{doctor_id}/revoke-access", status_code=status.HTTP_200_OK)
async def revoke_doctor_access(
    doctor_id: str,
    current_user: User = Depends(require_staff_permission),
    staff_service: StaffService = Depends(get_staff_service)
):
    """
    Отозвать доступ врача к системе
    
    Удаляет учетные данные врача, но сам врач остается в системе
    
    Требует: admin или super_admin роль
    """
    try:
        success = await staff_service.revoke_doctor_access(doctor_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Доступ врача не найден"
            )
        return {
            "success": True,
            "message": "Доступ врача отозван"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при отзыве доступа: {str(e)}"
        )
