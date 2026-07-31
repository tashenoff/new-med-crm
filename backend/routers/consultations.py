from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from models.consultation import (
    ConsultationSheet, 
    ConsultationSheetCreate, 
    ConsultationSheetUpdate,
    ICD10Code
)
from services.consultation_service import consultation_service
from dependencies import get_current_user
from models.auth import User

router = APIRouter(prefix="/api", tags=["consultations"])


@router.get("/icd10/search")
async def search_icd10_codes(
    query: str,
    current_user: User = Depends(get_current_user)
) -> List[ICD10Code]:
    """Поиск кодов МКБ-10"""
    if not query or len(query) < 1:
        return []
    
    results = consultation_service.search_icd10_codes(query)
    return results


@router.get("/icd10/{code}")
async def get_icd10_code(
    code: str,
    current_user: User = Depends(get_current_user)
) -> ICD10Code:
    """Получить код МКБ-10"""
    icd_code = consultation_service.get_icd10_code(code)
    if not icd_code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="ICD-10 code not found"
        )
    return icd_code


@router.post("/patients/{patient_id}/consultation-sheets")
async def create_consultation_sheet(
    patient_id: str,
    data: ConsultationSheetCreate,
    current_user: User = Depends(get_current_user)
) -> ConsultationSheet:
    """Создать консультационный лист"""
    if data.patient_id != patient_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Patient ID mismatch"
        )
    
    sheet = await consultation_service.create_consultation_sheet(
        data=data,
        user_id=current_user.id,
        user_name=current_user.full_name
    )
    return sheet


@router.get("/patients/{patient_id}/consultation-sheets")
async def get_patient_consultation_sheets(
    patient_id: str,
    current_user: User = Depends(get_current_user)
) -> List[ConsultationSheet]:
    """Получить все консультационные листы пациента"""
    sheets = await consultation_service.get_patient_consultation_sheets(patient_id)
    return sheets


@router.get("/consultation-sheets/{sheet_id}")
async def get_consultation_sheet(
    sheet_id: str,
    current_user: User = Depends(get_current_user)
) -> ConsultationSheet:
    """Получить консультационный лист по ID"""
    sheet = await consultation_service.get_consultation_sheet(sheet_id)
    if not sheet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Consultation sheet not found"
        )
    return sheet


@router.put("/consultation-sheets/{sheet_id}")
async def update_consultation_sheet(
    sheet_id: str,
    data: ConsultationSheetUpdate,
    current_user: User = Depends(get_current_user)
) -> ConsultationSheet:
    """Обновить консультационный лист"""
    sheet = await consultation_service.update_consultation_sheet(sheet_id, data)
    if not sheet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Consultation sheet not found"
        )
    return sheet


@router.delete("/consultation-sheets/{sheet_id}")
async def delete_consultation_sheet(
    sheet_id: str,
    current_user: User = Depends(get_current_user)
):
    """Удалить консультационный лист"""
    success = await consultation_service.delete_consultation_sheet(sheet_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Consultation sheet not found"
        )
    return {"message": "Consultation sheet deleted successfully"}
