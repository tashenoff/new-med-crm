"""
Document service - business logic for document operations
"""
from motor.motor_asyncio import AsyncIOMotorDatabase
from fastapi import HTTPException, UploadFile
from pathlib import Path
from typing import List
import shutil
import uuid
import os
import logging
from bson import ObjectId

from models.document import Document

logger = logging.getLogger(__name__)


class DocumentService:
    """Service for document-related business logic"""
    
    def __init__(self, db: AsyncIOMotorDatabase, upload_dir: Path):
        self.db = db
        self.upload_dir = upload_dir
        # Ensure upload directory exists
        self.upload_dir.mkdir(exist_ok=True)
    
    async def upload_document(
        self,
        patient_id: str,
        file: UploadFile,
        uploaded_by: str,
        uploaded_by_name: str,
        description: str = None
    ) -> Document:
        """Upload a document for a patient"""
        # Check if patient exists (support both new patients with id and old patients with only _id)
        try:
            patient = await self.db.patients.find_one({
                "$or": [
                    {"id": patient_id},
                    {"_id": patient_id},
                    {"_id": ObjectId(patient_id)}
                ]
            })
        except:
            patient = await self.db.patients.find_one({"id": patient_id})
        
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        
        # Generate unique filename
        file_extension = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = self.upload_dir / unique_filename
        
        try:
            # Save file
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            # Create document record
            document = Document(
                patient_id=patient_id,
                filename=unique_filename,
                original_filename=file.filename,
                file_path=str(file_path),
                file_size=file_path.stat().st_size,
                file_type=file.content_type or "application/octet-stream",
                uploaded_by=uploaded_by,
                uploaded_by_name=uploaded_by_name,
                description=description
            )
            
            # Insert to database
            await self.db.documents.insert_one(document.dict())
            
            logger.info(f"Document uploaded: {file.filename} for patient {patient_id}")
            return document
            
        except Exception as e:
            # Clean up file if database insert fails
            if file_path.exists():
                file_path.unlink()
            logger.error(f"Error uploading document: {e}")
            raise HTTPException(status_code=500, detail="Error uploading document")
    
    async def get_patient_documents(self, patient_id: str) -> List[Document]:
        """Get all documents for a patient"""
        # Check if patient exists (support both new patients with id and old patients with only _id)
        try:
            patient = await self.db.patients.find_one({
                "$or": [
                    {"id": patient_id},
                    {"_id": patient_id},
                    {"_id": ObjectId(patient_id)}
                ]
            })
        except:
            patient = await self.db.patients.find_one({"id": patient_id})
        
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        
        documents = await self.db.documents.find({"patient_id": patient_id}).sort("created_at", -1).to_list(100)
        return [Document(**doc) for doc in documents]
    
    async def delete_document(self, document_id: str) -> dict:
        """Delete a document"""
        document = await self.db.documents.find_one({"id": document_id})
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Delete file from disk
        file_path = Path(document["file_path"])
        if file_path.exists():
            file_path.unlink()
        
        # Delete from database
        await self.db.documents.delete_one({"id": document_id})
        
        logger.info(f"Document deleted: {document_id}")
        return {"message": "Document deleted successfully"}
    
    async def update_document(self, document_id: str, description: str = None) -> Document:
        """Update document description"""
        document = await self.db.documents.find_one({"id": document_id})
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Update document
        update_data = {}
        if description is not None:
            update_data["description"] = description
        
        if update_data:
            await self.db.documents.update_one(
                {"id": document_id},
                {"$set": update_data}
            )
        
        # Return updated document
        updated_document = await self.db.documents.find_one({"id": document_id})
        return Document(**updated_document)
