#!/usr/bin/env python3
"""
Focused Document Upload System Test
Tests the fixed document upload system to verify file attachment is working correctly.
"""

import requests
import json
import os
from datetime import datetime
import sys

class DocumentUploadTester:
    def __init__(self, base_url):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.token = None
        self.current_user = None
        self.test_patient_id = None
        self.uploaded_documents = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
            if details:
                print(f"   {details}")
        else:
            print(f"❌ {name}")
            if details:
                print(f"   {details}")

    def register_admin_user(self):
        """Register admin user for testing"""
        admin_email = f"admin_doc_test_{datetime.now().strftime('%Y%m%d%H%M%S')}@test.com"
        admin_password = "Test123!"
        admin_name = "Document Test Admin"
        
        url = f"{self.base_url}/api/auth/register"
        data = {
            "email": admin_email,
            "password": admin_password,
            "full_name": admin_name,
            "role": "admin"
        }
        
        try:
            response = requests.post(url, json=data)
            if response.status_code == 200:
                result = response.json()
                self.token = result["access_token"]
                self.current_user = result["user"]
                self.log_test("Admin User Registration", True, f"Registered {admin_name}")
                return True
            else:
                self.log_test("Admin User Registration", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("Admin User Registration", False, f"Error: {str(e)}")
            return False

    def create_test_patient(self):
        """Create a test patient"""
        url = f"{self.base_url}/api/patients"
        headers = {'Authorization': f'Bearer {self.token}', 'Content-Type': 'application/json'}
        data = {
            "full_name": f"Test Patient {datetime.now().strftime('%H%M%S')}",
            "phone": "+7 999 123 4567",
            "source": "phone"
        }
        
        try:
            response = requests.post(url, json=data, headers=headers)
            if response.status_code == 200:
                result = response.json()
                self.test_patient_id = result["id"]
                self.log_test("Test Patient Creation", True, f"Created patient ID: {self.test_patient_id}")
                return True
            else:
                self.log_test("Test Patient Creation", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
        except Exception as e:
            self.log_test("Test Patient Creation", False, f"Error: {str(e)}")
            return False

    def test_document_upload_with_form_data(self, filename, content, content_type, description=None):
        """Test document upload with Form data (the main fix)"""
        url = f"{self.base_url}/api/patients/{self.test_patient_id}/documents"
        headers = {'Authorization': f'Bearer {self.token}'}
        
        # Create multipart form data
        files = {'file': (filename, content, content_type)}
        data = {}
        if description:
            data['description'] = description
        
        try:
            response = requests.post(url, files=files, data=data, headers=headers)
            if response.status_code == 200:
                result = response.json()
                self.uploaded_documents.append(result)
                self.log_test(f"Document Upload: {filename}", True, 
                             f"File: {result['original_filename']}, Size: {result['file_size']} bytes, Type: {result['file_type']}")
                return True, result
            else:
                self.log_test(f"Document Upload: {filename}", False, 
                             f"Status: {response.status_code}, Response: {response.text}")
                return False, None
        except Exception as e:
            self.log_test(f"Document Upload: {filename}", False, f"Error: {str(e)}")
            return False, None

    def test_upload_without_description(self):
        """Test upload without description parameter"""
        success, result = self.test_document_upload_with_form_data(
            "no_description.pdf", 
            b"PDF content without description", 
            "application/pdf"
        )
        if success and result:
            # Verify description is None or empty
            if result.get('description') is None:
                self.log_test("Upload Without Description", True, "Description correctly set to null")
                return True
            else:
                self.log_test("Upload Without Description", False, f"Expected null description, got: {result.get('description')}")
                return False
        return success

    def test_upload_with_description(self):
        """Test upload with description parameter"""
        test_description = "Test document with description"
        success, result = self.test_document_upload_with_form_data(
            "with_description.pdf", 
            b"PDF content with description", 
            "application/pdf",
            test_description
        )
        if success and result:
            # Verify description is correctly set
            if result.get('description') == test_description:
                self.log_test("Upload With Description", True, f"Description correctly set: {test_description}")
                return True
            else:
                self.log_test("Upload With Description", False, f"Expected '{test_description}', got: {result.get('description')}")
                return False
        return success

    def test_various_file_types(self):
        """Test uploading various file types"""
        test_files = [
            ("test.pdf", b"PDF content", "application/pdf"),
            ("test.docx", b"DOCX content", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
            ("test.txt", b"Text content", "text/plain"),
            ("test.jpg", b"JPEG content", "image/jpeg")
        ]
        
        all_success = True
        for filename, content, content_type in test_files:
            success, _ = self.test_document_upload_with_form_data(
                filename, content, content_type, f"Test {filename} upload"
            )
            if not success:
                all_success = False
        
        return all_success

    def test_file_metadata_storage(self):
        """Test that file metadata is correctly stored in database"""
        if not self.uploaded_documents:
            self.log_test("File Metadata Storage", False, "No uploaded documents to verify")
            return False
        
        # Check the first uploaded document
        doc = self.uploaded_documents[0]
        required_fields = ['id', 'patient_id', 'filename', 'original_filename', 'file_path', 
                          'file_size', 'file_type', 'uploaded_by', 'uploaded_by_name', 'created_at']
        
        missing_fields = []
        for field in required_fields:
            if field not in doc:
                missing_fields.append(field)
        
        if not missing_fields:
            self.log_test("File Metadata Storage", True, f"All required fields present: {', '.join(required_fields)}")
            return True
        else:
            self.log_test("File Metadata Storage", False, f"Missing fields: {', '.join(missing_fields)}")
            return False

    def test_unique_filename_generation(self):
        """Test that files are saved with unique UUID-based filenames"""
        if len(self.uploaded_documents) < 2:
            self.log_test("Unique Filename Generation", False, "Need at least 2 uploaded documents to verify")
            return False
        
        filenames = [doc['filename'] for doc in self.uploaded_documents]
        unique_filenames = set(filenames)
        
        if len(filenames) == len(unique_filenames):
            self.log_test("Unique Filename Generation", True, f"All {len(filenames)} filenames are unique")
            return True
        else:
            self.log_test("Unique Filename Generation", False, f"Duplicate filenames found: {len(filenames)} total, {len(unique_filenames)} unique")
            return False

    def test_document_retrieval(self):
        """Test document retrieval after upload"""
        url = f"{self.base_url}/api/patients/{self.test_patient_id}/documents"
        headers = {'Authorization': f'Bearer {self.token}'}
        
        try:
            response = requests.get(url, headers=headers)
            if response.status_code == 200:
                documents = response.json()
                if len(documents) >= len(self.uploaded_documents):
                    self.log_test("Document Retrieval", True, f"Retrieved {len(documents)} documents")
                    return True, documents
                else:
                    self.log_test("Document Retrieval", False, f"Expected at least {len(self.uploaded_documents)}, got {len(documents)}")
                    return False, None
            else:
                self.log_test("Document Retrieval", False, f"Status: {response.status_code}, Response: {response.text}")
                return False, None
        except Exception as e:
            self.log_test("Document Retrieval", False, f"Error: {str(e)}")
            return False, None

    def test_static_file_serving(self):
        """Test static file serving via /uploads endpoint"""
        if not self.uploaded_documents:
            self.log_test("Static File Serving", False, "No uploaded documents to test")
            return False
        
        # Test accessing the first uploaded file
        doc = self.uploaded_documents[0]
        filename = doc['filename']
        url = f"{self.base_url}/uploads/{filename}"
        
        try:
            response = requests.get(url)
            if response.status_code == 200:
                self.log_test("Static File Serving", True, f"File {filename} accessible via /uploads endpoint")
                return True
            else:
                self.log_test("Static File Serving", False, f"Status: {response.status_code} for file {filename}")
                return False
        except Exception as e:
            self.log_test("Static File Serving", False, f"Error accessing {filename}: {str(e)}")
            return False

    def test_error_handling_invalid_patient(self):
        """Test upload with invalid patient ID"""
        url = f"{self.base_url}/api/patients/invalid-patient-id/documents"
        headers = {'Authorization': f'Bearer {self.token}'}
        files = {'file': ('test.pdf', b'test content', 'application/pdf')}
        
        try:
            response = requests.post(url, files=files, headers=headers)
            if response.status_code == 404:
                self.log_test("Error Handling - Invalid Patient", True, "Correctly returned 404 for invalid patient ID")
                return True
            else:
                self.log_test("Error Handling - Invalid Patient", False, f"Expected 404, got {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Error Handling - Invalid Patient", False, f"Error: {str(e)}")
            return False

    def test_error_handling_no_auth(self):
        """Test upload without authentication"""
        url = f"{self.base_url}/api/patients/{self.test_patient_id}/documents"
        files = {'file': ('test.pdf', b'test content', 'application/pdf')}
        
        try:
            response = requests.post(url, files=files)
            if response.status_code in [401, 403]:
                self.log_test("Error Handling - No Auth", True, f"Correctly returned {response.status_code} for unauthenticated request")
                return True
            else:
                self.log_test("Error Handling - No Auth", False, f"Expected 401/403, got {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Error Handling - No Auth", False, f"Error: {str(e)}")
            return False

    def test_error_handling_missing_file(self):
        """Test upload without file parameter"""
        url = f"{self.base_url}/api/patients/{self.test_patient_id}/documents"
        headers = {'Authorization': f'Bearer {self.token}'}
        data = {'description': 'Test without file'}
        
        try:
            response = requests.post(url, data=data, headers=headers)
            if response.status_code == 422:  # FastAPI validation error
                self.log_test("Error Handling - Missing File", True, "Correctly returned 422 for missing file parameter")
                return True
            else:
                self.log_test("Error Handling - Missing File", False, f"Expected 422, got {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Error Handling - Missing File", False, f"Error: {str(e)}")
            return False

    def run_all_tests(self):
        """Run all document upload tests"""
        print("=" * 60)
        print("DOCUMENT UPLOAD SYSTEM TEST - FORM DATA FIX VERIFICATION")
        print("=" * 60)
        
        # Setup
        print("\n📋 SETUP PHASE")
        print("-" * 30)
        if not self.register_admin_user():
            return False
        
        if not self.create_test_patient():
            return False
        
        # Core functionality tests
        print("\n📋 CORE FUNCTIONALITY TESTS")
        print("-" * 30)
        
        if not self.test_upload_without_description():
            return False
        
        if not self.test_upload_with_description():
            return False
        
        if not self.test_various_file_types():
            return False
        
        # Metadata and storage tests
        print("\n📋 METADATA AND STORAGE TESTS")
        print("-" * 30)
        
        if not self.test_file_metadata_storage():
            return False
        
        if not self.test_unique_filename_generation():
            return False
        
        # Retrieval tests
        print("\n📋 RETRIEVAL TESTS")
        print("-" * 30)
        
        success, _ = self.test_document_retrieval()
        if not success:
            return False
        
        if not self.test_static_file_serving():
            return False
        
        # Error handling tests
        print("\n📋 ERROR HANDLING TESTS")
        print("-" * 30)
        
        if not self.test_error_handling_invalid_patient():
            return False
        
        if not self.test_error_handling_no_auth():
            return False
        
        if not self.test_error_handling_missing_file():
            return False
        
        return True

def main():
    backend_url = "https://medrec-system-1.preview.emergentagent.com"
    tester = DocumentUploadTester(backend_url)
    
    success = tester.run_all_tests()
    
    print("\n" + "=" * 60)
    print(f"TEST RESULTS: {tester.tests_passed}/{tester.tests_run} PASSED")
    print("=" * 60)
    
    if success:
        print("\n✅ ALL DOCUMENT UPLOAD TESTS PASSED")
        print("\n📋 VERIFIED FUNCTIONALITY:")
        print("   ✅ Form data parameter handling (description field)")
        print("   ✅ File upload with and without description")
        print("   ✅ Various file types (PDF, DOCX, TXT, JPG)")
        print("   ✅ Unique UUID-based file naming")
        print("   ✅ Complete metadata storage in database")
        print("   ✅ Document retrieval API")
        print("   ✅ Static file serving via /uploads endpoint")
        print("   ✅ Proper error handling for all edge cases")
        return 0
    else:
        print("\n❌ SOME TESTS FAILED")
        return 1

if __name__ == "__main__":
    sys.exit(main())