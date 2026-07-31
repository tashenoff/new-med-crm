"""
Documents router - HTTP endpoints for document operations
Uses DocumentService for business logic
"""
from fastapi import APIRouter, HTTPException, Depends, status, File, UploadFile, Form
from fastapi.responses import FileResponse
from typing import List, Optional
from pathlib import Path

# Import document models
from models.document import Document, DocumentUpdate

# Import auth dependencies
from models.auth import UserInDB, UserRole
from routers.auth import get_current_active_user, require_role
from database import db

# Import service
from services.document_service import DocumentService

# Router
documents_router = APIRouter(tags=["Documents"])

# Upload directory
UPLOAD_DIR = Path("uploads")


# Dependency to get service
def get_document_service():
    return DocumentService(db, UPLOAD_DIR)


# ============================================================================
# Document Endpoints
# ============================================================================

@documents_router.post("/patients/{patient_id}/documents", response_model=Document)
async def upload_document(
    patient_id: str,
    file: UploadFile = File(...),
    description: Optional[str] = Form(None),
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR])),
    service: DocumentService = Depends(get_document_service)
):
    """Upload a document for a patient"""
    return await service.upload_document(
        patient_id=patient_id,
        file=file,
        uploaded_by=current_user.id,
        uploaded_by_name=current_user.full_name,
        description=description
    )


@documents_router.get("/patients/{patient_id}/documents", response_model=List[Document])
async def get_patient_documents(
    patient_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR, UserRole.PATIENT])),
    service: DocumentService = Depends(get_document_service)
):
    """Get all documents for a patient"""
    # Patients can only access their own documents
    if current_user.role == UserRole.PATIENT and current_user.patient_id != patient_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return await service.get_patient_documents(patient_id)


@documents_router.delete("/documents/{document_id}")
async def delete_document(
    document_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR])),
    service: DocumentService = Depends(get_document_service)
):
    """Delete a document"""
    return await service.delete_document(document_id)


@documents_router.put("/documents/{document_id}", response_model=Document)
async def update_document(
    document_id: str,
    update_data: DocumentUpdate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR])),
    service: DocumentService = Depends(get_document_service)
):
    """Update document description"""
    return await service.update_document(document_id, update_data.description)


@documents_router.get("/uploads/{filename}")
async def download_file(filename: str):
    """Serve uploaded files through API endpoint (workaround for ingress routing)"""
    file_path = UPLOAD_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Determine content type based on file extension
    content_type_map = {
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.txt': 'text/plain',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif'
    }
    
    file_extension = file_path.suffix.lower()
    media_type = content_type_map.get(file_extension, 'application/octet-stream')
    
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=filename
    )
