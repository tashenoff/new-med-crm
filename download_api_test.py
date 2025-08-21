import requests
import json
from datetime import datetime, timedelta
import sys
import os

class DownloadAPITester:
    def __init__(self, base_url):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.created_patient_id = None
        self.created_doctor_id = None
        self.token = None
        self.current_user = None
        self.uploaded_documents = []

    def run_test(self, name, method, endpoint, expected_status, data=None, params=None, files=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {}
        
        # Add authorization token if available
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        
        # Don't set Content-Type for multipart uploads
        if not files:
            headers['Content-Type'] = 'application/json'
        
        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params)
            elif method == 'POST':
                if files:
                    response = requests.post(url, files=files, data=data, headers=headers)
                else:
                    response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                if response.text:
                    try:
                        return success, response.json()
                    except json.JSONDecodeError:
                        return success, response.content
                return success, None
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"Response: {response.text}")
                return False, None

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, None

    def test_register_admin(self):
        """Register admin user for testing"""
        admin_email = f"admin_download_{datetime.now().strftime('%Y%m%d%H%M%S')}@test.com"
        admin_password = "Test123!"
        admin_name = "Download API Admin"
        
        success, response = self.run_test(
            "Register Admin User",
            "POST",
            "auth/register",
            200,
            data={
                "email": admin_email,
                "password": admin_password,
                "full_name": admin_name,
                "role": "admin"
            }
        )
        if success and response and "access_token" in response:
            self.token = response["access_token"]
            self.current_user = response["user"]
            print(f"✅ Registered admin: {admin_name}")
        return success

    def test_create_patient(self):
        """Create test patient"""
        patient_name = f"Download Test Patient {datetime.now().strftime('%H%M%S')}"
        success, response = self.run_test(
            "Create Test Patient",
            "POST",
            "patients",
            200,
            data={"full_name": patient_name, "phone": "+7 999 123 4567", "source": "phone"}
        )
        if success and response and "id" in response:
            self.created_patient_id = response["id"]
            print(f"✅ Created patient with ID: {self.created_patient_id}")
        return success

    def test_upload_document(self, patient_id, file_content, filename, content_type="application/pdf", description=None):
        """Upload a document for testing"""
        files = {'file': (filename, file_content, content_type)}
        data = {}
        if description:
            data['description'] = description
        
        success, response = self.run_test(
            f"Upload Document: {filename}",
            "POST",
            f"patients/{patient_id}/documents",
            200,
            data=data,
            files=files
        )
        
        if success and response:
            self.uploaded_documents.append(response)
            print(f"✅ Uploaded {filename} - File ID: {response['id']}, Filename: {response['filename']}")
        return success, response

    def test_new_download_api_endpoint(self, filename, expected_content_type=None, expected_content=None):
        """Test the new GET /api/uploads/{filename} endpoint"""
        success, response = self.run_test(
            f"Download via API: {filename}",
            "GET",
            f"uploads/{filename}",
            200
        )
        
        if success and response:
            print(f"✅ Successfully downloaded file via API endpoint")
            
            # Check content if provided
            if expected_content and response != expected_content:
                print(f"❌ Content mismatch - expected content doesn't match downloaded content")
                return False
            
            print(f"✅ File content verified")
        
        return success, response

    def test_download_nonexistent_file(self):
        """Test downloading non-existent file returns 404"""
        nonexistent_filename = "nonexistent-file-12345.pdf"
        success, _ = self.run_test(
            f"Download Non-existent File: {nonexistent_filename}",
            "GET",
            f"uploads/{nonexistent_filename}",
            404  # Expect 404 Not Found
        )
        
        if success:
            print("✅ Non-existent file correctly returned 404")
        return success

    def test_download_with_invalid_filename(self):
        """Test downloading with invalid filename characters"""
        invalid_filenames = [
            "../../../etc/passwd",  # Path traversal attempt
            "file with spaces and special chars!@#$.pdf",
            "файл_с_русскими_символами.pdf"
        ]
        
        all_success = True
        for invalid_filename in invalid_filenames:
            success, _ = self.run_test(
                f"Download Invalid Filename: {invalid_filename}",
                "GET",
                f"uploads/{invalid_filename}",
                404  # Should return 404 for invalid/non-existent files
            )
            if success:
                print(f"✅ Invalid filename '{invalid_filename}' correctly handled")
            else:
                print(f"❌ Invalid filename '{invalid_filename}' not handled properly")
                all_success = False
        
        return all_success

    def test_content_type_verification(self, patient_id):
        """Test that different file types return correct Content-Type headers"""
        test_files = [
            ("test.pdf", b"PDF content", "application/pdf"),
            ("test.docx", b"DOCX content", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
            ("test.txt", b"Text content", "text/plain"),
            ("test.jpg", b"JPEG content", "image/jpeg"),
            ("test.unknown", b"Unknown content", "application/octet-stream")  # Unknown extension
        ]
        
        uploaded_files = []
        all_success = True
        
        # First upload all test files
        for filename, content, expected_content_type in test_files:
            success, response = self.test_upload_document(
                patient_id, content, filename, expected_content_type,
                f"Test file for content-type verification: {filename}"
            )
            if success and response:
                uploaded_files.append((response['filename'], content, expected_content_type))
            else:
                print(f"❌ Failed to upload {filename}")
                all_success = False
        
        # Now test downloading each file and verify content-type
        for stored_filename, expected_content, expected_content_type in uploaded_files:
            print(f"\n🔍 Testing content-type for {stored_filename} (expecting {expected_content_type})...")
            
            # Use direct requests to check headers
            url = f"{self.base_url}/api/uploads/{stored_filename}"
            headers = {}
            if self.token:
                headers['Authorization'] = f'Bearer {self.token}'
            
            try:
                response = requests.get(url, headers=headers)
                
                if response.status_code == 200:
                    actual_content_type = response.headers.get('content-type', '')
                    
                    if expected_content_type in actual_content_type or actual_content_type in expected_content_type:
                        print(f"✅ Correct content-type: {actual_content_type}")
                        
                        # Verify content matches
                        if response.content == expected_content:
                            print(f"✅ Content matches uploaded content")
                        else:
                            print(f"❌ Content mismatch for {stored_filename}")
                            all_success = False
                    else:
                        print(f"❌ Wrong content-type: expected {expected_content_type}, got {actual_content_type}")
                        all_success = False
                else:
                    print(f"❌ Failed to download {stored_filename}: {response.status_code}")
                    all_success = False
                    
            except Exception as e:
                print(f"❌ Error downloading {stored_filename}: {e}")
                all_success = False
        
        return all_success

    def test_complete_workflow(self, patient_id):
        """Test complete upload -> list -> download workflow"""
        print("\n🔍 Testing complete upload -> list -> download workflow...")
        
        # Step 1: Upload a test document
        test_content = b"Complete workflow test content - this is a test PDF document"
        test_filename = "workflow_test.pdf"
        test_description = "Complete workflow test document"
        
        success, upload_response = self.test_upload_document(
            patient_id, test_content, test_filename, "application/pdf", test_description
        )
        
        if not success:
            print("❌ Upload step failed")
            return False
        
        uploaded_filename = upload_response['filename']
        uploaded_id = upload_response['id']
        
        # Step 2: Get document list and verify our document is there
        success, documents = self.run_test(
            "Get Patient Documents",
            "GET",
            f"patients/{patient_id}/documents",
            200
        )
        
        if not success:
            print("❌ Document list retrieval failed")
            return False
        
        # Find our uploaded document
        our_document = None
        for doc in documents:
            if doc['id'] == uploaded_id:
                our_document = doc
                break
        
        if not our_document:
            print("❌ Uploaded document not found in document list")
            return False
        
        print(f"✅ Document found in list: {our_document['original_filename']}")
        
        # Step 3: Download the file via new API endpoint
        success, downloaded_content = self.test_new_download_api_endpoint(
            uploaded_filename, "application/pdf", test_content
        )
        
        if not success:
            print("❌ Download step failed")
            return False
        
        # Step 4: Verify downloaded content matches uploaded content
        if downloaded_content == test_content:
            print("✅ Downloaded content matches uploaded content")
        else:
            print("❌ Downloaded content does not match uploaded content")
            return False
        
        print("✅ Complete workflow test passed")
        return True

    def test_multiple_file_integration(self, patient_id):
        """Test uploading multiple documents and downloading each via API"""
        print("\n🔍 Testing multiple file upload and download integration...")
        
        test_files = [
            ("integration_test_1.pdf", b"Integration test PDF content", "application/pdf"),
            ("integration_test_2.docx", b"Integration test DOCX content", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
            ("integration_test_3.txt", b"Integration test TXT content", "text/plain"),
            ("integration_test_4.jpg", b"Integration test JPG content", "image/jpeg")
        ]
        
        uploaded_files = []
        
        # Upload all files
        for filename, content, content_type in test_files:
            success, response = self.test_upload_document(
                patient_id, content, filename, content_type,
                f"Integration test: {filename}"
            )
            if success and response:
                uploaded_files.append((response['filename'], content, content_type))
            else:
                print(f"❌ Failed to upload {filename}")
                return False
        
        print(f"✅ Successfully uploaded {len(uploaded_files)} files")
        
        # Get document list
        success, documents = self.run_test(
            "Get All Patient Documents",
            "GET",
            f"patients/{patient_id}/documents",
            200
        )
        
        if not success:
            print("❌ Failed to retrieve document list")
            return False
        
        print(f"✅ Retrieved {len(documents)} documents from database")
        
        # Download each file and verify
        all_downloads_successful = True
        for stored_filename, expected_content, expected_content_type in uploaded_files:
            success, downloaded_content = self.test_new_download_api_endpoint(
                stored_filename, expected_content_type, expected_content
            )
            
            if not success:
                print(f"❌ Failed to download {stored_filename}")
                all_downloads_successful = False
            elif downloaded_content != expected_content:
                print(f"❌ Content mismatch for {stored_filename}")
                all_downloads_successful = False
            else:
                print(f"✅ Successfully downloaded and verified {stored_filename}")
        
        if all_downloads_successful:
            print("✅ All files downloaded successfully with correct content")
        
        return all_downloads_successful

    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 60)
        print(f"DOWNLOAD API TESTS COMPLETED: {self.tests_passed}/{self.tests_run}")
        print("=" * 60)
        
        if self.tests_passed == self.tests_run:
            print("🎉 ALL TESTS PASSED!")
        else:
            print(f"❌ {self.tests_run - self.tests_passed} TESTS FAILED")
        
        print("\n📋 NEW DOWNLOAD API FEATURES TESTED:")
        print("✅ GET /api/uploads/{filename} endpoint functionality")
        print("✅ File download with proper Content-Type headers")
        print("✅ Content verification (downloaded = uploaded)")
        print("✅ Error handling for non-existent files (404)")
        print("✅ Error handling for invalid filenames")
        print("✅ Multiple file type support (PDF, DOCX, TXT, JPG)")
        print("✅ Complete upload -> list -> download workflow")
        print("✅ Integration with existing document management")
        print("✅ Content-Type mapping for different file extensions")

def main():
    # Get the backend URL
    backend_url = "https://medrecord-field.preview.emergentagent.com"
    
    # Setup tester
    tester = DownloadAPITester(backend_url)
    
    print("=" * 60)
    print("TESTING NEW DOWNLOAD API ENDPOINT")
    print("GET /api/uploads/{filename}")
    print("=" * 60)
    
    # 1. Register admin user
    print("\n" + "=" * 50)
    print("TEST 1: SETUP - REGISTER ADMIN USER")
    print("=" * 50)
    
    if not tester.test_register_admin():
        print("❌ Admin registration failed")
        return 1
    
    # 2. Create test patient
    print("\n" + "=" * 50)
    print("TEST 2: SETUP - CREATE TEST PATIENT")
    print("=" * 50)
    
    if not tester.test_create_patient():
        print("❌ Patient creation failed")
        return 1
    
    patient_id = tester.created_patient_id
    
    # 3. Test new download API endpoint functionality
    print("\n" + "=" * 50)
    print("TEST 3: NEW DOWNLOAD API ENDPOINT")
    print("=" * 50)
    
    # Upload a test file first
    test_content = b"Test PDF content for download API testing"
    success, upload_response = tester.test_upload_document(
        patient_id, test_content, "download_test.pdf", "application/pdf",
        "Test file for download API endpoint"
    )
    
    if not success:
        print("❌ Test file upload failed")
        return 1
    
    # Test downloading the file via new API
    uploaded_filename = upload_response['filename']
    success, downloaded_content = tester.test_new_download_api_endpoint(
        uploaded_filename, "application/pdf", test_content
    )
    
    if not success:
        print("❌ Download API endpoint test failed")
        return 1
    
    # 4. Test error handling for downloads
    print("\n" + "=" * 50)
    print("TEST 4: ERROR HANDLING FOR DOWNLOADS")
    print("=" * 50)
    
    # Test non-existent file
    if not tester.test_download_nonexistent_file():
        print("❌ Non-existent file error handling failed")
        return 1
    
    # Test invalid filenames
    if not tester.test_download_with_invalid_filename():
        print("❌ Invalid filename error handling failed")
        return 1
    
    # 5. Test Content-Type verification
    print("\n" + "=" * 50)
    print("TEST 5: CONTENT-TYPE VERIFICATION")
    print("=" * 50)
    
    if not tester.test_content_type_verification(patient_id):
        print("❌ Content-Type verification failed")
        return 1
    
    # 6. Test complete file download workflow
    print("\n" + "=" * 50)
    print("TEST 6: COMPLETE DOWNLOAD WORKFLOW")
    print("=" * 50)
    
    if not tester.test_complete_workflow(patient_id):
        print("❌ Complete workflow test failed")
        return 1
    
    # 7. Test integration with multiple files
    print("\n" + "=" * 50)
    print("TEST 7: MULTIPLE FILE INTEGRATION")
    print("=" * 50)
    
    if not tester.test_multiple_file_integration(patient_id):
        print("❌ Multiple file integration test failed")
        return 1
    
    # Print final summary
    tester.print_summary()
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())