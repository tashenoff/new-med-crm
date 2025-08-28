#!/usr/bin/env python3
"""
Comprehensive Document Download and Static File Serving Test
Focus on file download functionality as requested in the review
"""

import requests
import json
import os
from datetime import datetime
import sys

class DocumentDownloadTester:
    def __init__(self, base_url):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.token = None
        self.uploaded_files = []
        
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
        return success
    
    def register_admin(self):
        """Register admin user for testing"""
        admin_email = f"admin_download_{datetime.now().strftime('%Y%m%d%H%M%S')}@test.com"
        admin_password = "Test123!"
        
        response = requests.post(f"{self.base_url}/api/auth/register", json={
            "email": admin_email,
            "password": admin_password,
            "full_name": "Download Test Admin",
            "role": "admin"
        })
        
        if response.status_code == 200:
            data = response.json()
            self.token = data["access_token"]
            return self.log_test("Admin Registration", True, f"Email: {admin_email}")
        else:
            return self.log_test("Admin Registration", False, f"Status: {response.status_code}")
    
    def create_test_patient(self):
        """Create test patient"""
        headers = {'Authorization': f'Bearer {self.token}', 'Content-Type': 'application/json'}
        
        response = requests.post(f"{self.base_url}/api/patients", 
                               headers=headers,
                               json={
                                   "full_name": f"Download Test Patient {datetime.now().strftime('%H%M%S')}",
                                   "phone": "+7 999 123 4567",
                                   "source": "phone"
                               })
        
        if response.status_code == 200:
            data = response.json()
            self.patient_id = data["id"]
            return self.log_test("Test Patient Creation", True, f"Patient ID: {self.patient_id}")
        else:
            return self.log_test("Test Patient Creation", False, f"Status: {response.status_code}")
    
    def test_uploads_directory_exists(self):
        """Test that uploads directory is properly configured"""
        # Check if uploads directory exists on the server by trying to access a non-existent file
        response = requests.get(f"{self.base_url}/uploads/nonexistent-file.pdf")
        
        # We expect 404 for non-existent file, which means the endpoint is mounted
        if response.status_code == 404:
            return self.log_test("Uploads Directory Mount", True, "/uploads endpoint is properly mounted")
        else:
            return self.log_test("Uploads Directory Mount", False, f"Unexpected status: {response.status_code}")
    
    def upload_test_documents(self):
        """Upload various document types for testing"""
        headers = {'Authorization': f'Bearer {self.token}'}
        
        test_files = [
            ("test_pdf.pdf", b"PDF test content for download", "application/pdf"),
            ("test_docx.docx", b"DOCX test content for download", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
            ("test_image.jpg", b"JPEG test content for download", "image/jpeg"),
            ("test_text.txt", b"Plain text content for download", "text/plain")
        ]
        
        all_success = True
        
        for filename, content, content_type in test_files:
            files = {'file': (filename, content, content_type)}
            data = {'description': f'Test {filename} for download testing'}
            
            response = requests.post(f"{self.base_url}/api/patients/{self.patient_id}/documents",
                                   files=files, data=data, headers=headers)
            
            if response.status_code == 200:
                doc_data = response.json()
                self.uploaded_files.append({
                    'id': doc_data['id'],
                    'filename': doc_data['filename'],
                    'original_filename': doc_data['original_filename'],
                    'content_type': content_type,
                    'expected_content': content
                })
                self.log_test(f"Upload {filename}", True, f"Stored as: {doc_data['filename']}")
            else:
                self.log_test(f"Upload {filename}", False, f"Status: {response.status_code}")
                all_success = False
        
        return all_success
    
    def test_direct_file_download(self):
        """Test direct file download via /uploads/{filename}"""
        all_success = True
        
        for file_info in self.uploaded_files:
            filename = file_info['filename']
            expected_content = file_info['expected_content']
            content_type = file_info['content_type']
            
            # Test direct download
            response = requests.get(f"{self.base_url}/uploads/{filename}")
            
            if response.status_code == 200:
                # Check content
                if response.content == expected_content:
                    content_check = "Content matches"
                else:
                    content_check = f"Content mismatch (expected {len(expected_content)} bytes, got {len(response.content)} bytes)"
                    all_success = False
                
                # Check content-type header
                response_content_type = response.headers.get('content-type', '')
                if content_type.lower() in response_content_type.lower():
                    type_check = f"Content-Type: {response_content_type}"
                else:
                    type_check = f"Content-Type mismatch: expected {content_type}, got {response_content_type}"
                    all_success = False
                
                self.log_test(f"Direct Download {file_info['original_filename']}", 
                            response.status_code == 200 and response.content == expected_content,
                            f"{content_check}, {type_check}")
            else:
                self.log_test(f"Direct Download {file_info['original_filename']}", False, 
                            f"Status: {response.status_code}")
                all_success = False
        
        return all_success
    
    def test_file_download_with_production_url(self):
        """Test file download using the production URL"""
        all_success = True
        
        for file_info in self.uploaded_files:
            filename = file_info['filename']
            expected_content = file_info['expected_content']
            
            # Test with full production URL
            full_url = f"https://dentalmanager-2.preview.emergentagent.com/uploads/{filename}"
            response = requests.get(full_url)
            
            if response.status_code == 200:
                content_matches = response.content == expected_content
                self.log_test(f"Production URL Download {file_info['original_filename']}", 
                            content_matches,
                            f"URL: {full_url}")
                if not content_matches:
                    all_success = False
            else:
                self.log_test(f"Production URL Download {file_info['original_filename']}", False, 
                            f"Status: {response.status_code}, URL: {full_url}")
                all_success = False
        
        return all_success
    
    def test_cors_headers(self):
        """Test CORS headers for file downloads"""
        if not self.uploaded_files:
            return self.log_test("CORS Headers Test", False, "No uploaded files to test")
        
        filename = self.uploaded_files[0]['filename']
        response = requests.get(f"{self.base_url}/uploads/{filename}")
        
        cors_headers = {
            'access-control-allow-origin': response.headers.get('access-control-allow-origin'),
            'access-control-allow-methods': response.headers.get('access-control-allow-methods'),
            'access-control-allow-headers': response.headers.get('access-control-allow-headers')
        }
        
        has_cors = any(cors_headers.values())
        return self.log_test("CORS Headers for File Downloads", has_cors, 
                           f"CORS headers present: {has_cors}")
    
    def test_file_not_found_error(self):
        """Test 404 error for non-existent files"""
        response = requests.get(f"{self.base_url}/uploads/nonexistent-file-12345.pdf")
        
        return self.log_test("404 Error for Non-existent File", 
                           response.status_code == 404,
                           f"Status: {response.status_code}")
    
    def test_file_download_without_auth(self):
        """Test that file downloads work without authentication"""
        if not self.uploaded_files:
            return self.log_test("Download Without Auth", False, "No uploaded files to test")
        
        filename = self.uploaded_files[0]['filename']
        
        # Make request without Authorization header
        response = requests.get(f"{self.base_url}/uploads/{filename}")
        
        return self.log_test("File Download Without Authentication", 
                           response.status_code == 200,
                           f"Status: {response.status_code} (static files should not require auth)")
    
    def test_document_retrieval_api(self):
        """Test document retrieval via API returns correct download URLs"""
        headers = {'Authorization': f'Bearer {self.token}'}
        
        response = requests.get(f"{self.base_url}/api/patients/{self.patient_id}/documents", 
                              headers=headers)
        
        if response.status_code == 200:
            documents = response.json()
            
            if len(documents) == len(self.uploaded_files):
                # Check that each document has the correct filename for download URL construction
                all_correct = True
                for doc in documents:
                    expected_url = f"{self.base_url}/uploads/{doc['filename']}"
                    # Test that the URL would work
                    test_response = requests.get(expected_url)
                    if test_response.status_code != 200:
                        all_correct = False
                        break
                
                return self.log_test("Document API Returns Valid Download Info", all_correct,
                                   f"All {len(documents)} documents have valid download URLs")
            else:
                return self.log_test("Document API Returns Valid Download Info", False,
                                   f"Expected {len(self.uploaded_files)} docs, got {len(documents)}")
        else:
            return self.log_test("Document API Returns Valid Download Info", False,
                               f"Status: {response.status_code}")
    
    def test_file_cleanup_after_deletion(self):
        """Test that files are properly cleaned up after document deletion"""
        if not self.uploaded_files:
            return self.log_test("File Cleanup After Deletion", False, "No uploaded files to test")
        
        headers = {'Authorization': f'Bearer {self.token}'}
        
        # Get the first uploaded file for deletion test
        test_file = self.uploaded_files[0]
        document_id = test_file['id']
        filename = test_file['filename']
        
        # First, verify file exists
        response = requests.get(f"{self.base_url}/uploads/{filename}")
        if response.status_code != 200:
            return self.log_test("File Cleanup After Deletion", False, 
                               "Test file not accessible before deletion")
        
        # Delete the document
        delete_response = requests.delete(f"{self.base_url}/api/documents/{document_id}", 
                                        headers=headers)
        
        if delete_response.status_code != 200:
            return self.log_test("File Cleanup After Deletion", False, 
                               f"Document deletion failed: {delete_response.status_code}")
        
        # Try to access the file after deletion - should return 404
        post_delete_response = requests.get(f"{self.base_url}/uploads/{filename}")
        
        cleanup_success = post_delete_response.status_code == 404
        return self.log_test("File Cleanup After Deletion", cleanup_success,
                           f"File access after deletion: {post_delete_response.status_code} (should be 404)")
    
    def test_multiple_file_downloads(self):
        """Test downloading multiple files simultaneously"""
        if len(self.uploaded_files) < 2:
            return self.log_test("Multiple File Downloads", False, "Need at least 2 files for this test")
        
        import concurrent.futures
        import threading
        
        def download_file(file_info):
            filename = file_info['filename']
            response = requests.get(f"{self.base_url}/uploads/{filename}")
            return response.status_code == 200 and response.content == file_info['expected_content']
        
        # Download multiple files concurrently
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            futures = [executor.submit(download_file, file_info) for file_info in self.uploaded_files[:4]]
            results = [future.result() for future in concurrent.futures.as_completed(futures)]
        
        all_success = all(results)
        return self.log_test("Multiple Concurrent File Downloads", all_success,
                           f"Downloaded {len(results)} files concurrently")
    
    def run_all_tests(self):
        """Run all document download tests"""
        print("=" * 60)
        print("COMPREHENSIVE DOCUMENT DOWNLOAD FUNCTIONALITY TEST")
        print("=" * 60)
        
        # Setup
        if not self.register_admin():
            return False
        
        if not self.create_test_patient():
            return False
        
        # Core tests
        print(f"\n📁 STATIC FILE SERVING TESTS")
        print("-" * 40)
        self.test_uploads_directory_exists()
        
        print(f"\n📤 DOCUMENT UPLOAD TESTS")
        print("-" * 40)
        if not self.upload_test_documents():
            return False
        
        print(f"\n📥 FILE DOWNLOAD TESTS")
        print("-" * 40)
        self.test_direct_file_download()
        self.test_file_download_with_production_url()
        self.test_file_download_without_auth()
        self.test_multiple_file_downloads()
        
        print(f"\n🔗 API INTEGRATION TESTS")
        print("-" * 40)
        self.test_document_retrieval_api()
        
        print(f"\n🌐 NETWORK & CORS TESTS")
        print("-" * 40)
        self.test_cors_headers()
        
        print(f"\n❌ ERROR HANDLING TESTS")
        print("-" * 40)
        self.test_file_not_found_error()
        
        print(f"\n🗑️ FILE CLEANUP TESTS")
        print("-" * 40)
        self.test_file_cleanup_after_deletion()
        
        # Results
        print(f"\n" + "=" * 60)
        print(f"DOWNLOAD TESTS COMPLETED: {self.tests_passed}/{self.tests_run} PASSED")
        print("=" * 60)
        
        if self.tests_passed == self.tests_run:
            print("🎉 ALL DOCUMENT DOWNLOAD TESTS PASSED!")
            return True
        else:
            print(f"⚠️  {self.tests_run - self.tests_passed} TESTS FAILED")
            return False

def main():
    backend_url = "https://dentalmanager-2.preview.emergentagent.com"
    tester = DocumentDownloadTester(backend_url)
    
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())