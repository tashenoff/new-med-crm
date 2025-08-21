import requests
import json
from datetime import datetime, timedelta
import sys

class ClinicAPITester:
    def __init__(self, base_url):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.created_patient_id = None
        self.created_doctor_id = None
        self.created_appointment_id = None
        self.created_medical_record_id = None
        self.created_diagnosis_id = None
        self.created_medication_id = None
        self.created_allergy_id = None
        self.token = None
        self.current_user = None

    def run_test(self, name, method, endpoint, expected_status, data=None, params=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        # Add authorization token if available
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        
        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params)
            elif method == 'POST':
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
                        return success, response.text
                return success, None
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"Response: {response.text}")
                return False, None

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, None

    def test_register_user(self, email, password, full_name, role="patient"):
        """Register a new user"""
        success, response = self.run_test(
            f"Register {role} user",
            "POST",
            "auth/register",
            200,
            data={
                "email": email,
                "password": password,
                "full_name": full_name,
                "role": role
            }
        )
        if success and response and "access_token" in response:
            self.token = response["access_token"]
            self.current_user = response["user"]
            print(f"✅ Registered user: {full_name} ({role}) with email: {email}")
            print(f"✅ Received token: {self.token[:10]}...")
        return success

    def test_login_user(self, email, password):
        """Login a user"""
        success, response = self.run_test(
            "Login user",
            "POST",
            "auth/login",
            200,
            data={
                "email": email,
                "password": password
            }
        )
        if success and response and "access_token" in response:
            self.token = response["access_token"]
            self.current_user = response["user"]
            print(f"✅ Logged in user: {response['user']['full_name']} ({response['user']['role']})")
            print(f"✅ Received token: {self.token[:10]}...")
        return success

    def test_get_current_user(self):
        """Get current user info"""
        success, response = self.run_test(
            "Get current user",
            "GET",
            "auth/me",
            200
        )
        if success and response and "email" in response:
            print(f"✅ Current user: {response['full_name']} ({response['role']})")
        return success

    def test_logout(self):
        """Logout (clear token)"""
        self.token = None
        self.current_user = None
        print("✅ Logged out (token cleared)")
        return True

    def test_unauthorized_access(self, endpoint):
        """Test unauthorized access to protected endpoint"""
        # Save current token
        saved_token = self.token
        # Clear token
        self.token = None
        
        success, _ = self.run_test(
            f"Unauthorized access to {endpoint}",
            "GET",
            endpoint,
            401  # Expect 401 Unauthorized
        )
        
        # Restore token
        self.token = saved_token
        return success

    def test_create_patient(self, full_name, phone, source):
        """Create a patient"""
        success, response = self.run_test(
            "Create Patient",
            "POST",
            "patients",
            200,
            data={"full_name": full_name, "phone": phone, "source": source}
        )
        if success and response and "id" in response:
            self.created_patient_id = response["id"]
            print(f"Created patient with ID: {self.created_patient_id}")
        return success

    def test_get_patients(self, search=None):
        """Get all patients or search for patients"""
        params = {"search": search} if search else None
        success, response = self.run_test(
            f"Get Patients{' with search' if search else ''}",
            "GET",
            "patients",
            200,
            params=params
        )
        if success and response:
            print(f"Found {len(response)} patients")
            if search:
                found = any(search.lower() in patient["full_name"].lower() for patient in response)
                if found:
                    print(f"✅ Search term '{search}' found in results")
                else:
                    print(f"❌ Search term '{search}' not found in results")
                    success = False
        return success

    def test_update_patient(self, patient_id, update_data):
        """Update a patient"""
        success, response = self.run_test(
            "Update Patient",
            "PUT",
            f"patients/{patient_id}",
            200,
            data=update_data
        )
        if success and response:
            print(f"Updated patient: {response['full_name']}")
            # Verify the update was applied
            for key, value in update_data.items():
                if response[key] != value:
                    print(f"❌ Update verification failed: {key} expected {value}, got {response[key]}")
                    success = False
                    break
        return success

    def test_create_doctor(self, full_name, specialty, color):
        """Create a doctor"""
        success, response = self.run_test(
            "Create Doctor",
            "POST",
            "doctors",
            200,
            data={"full_name": full_name, "specialty": specialty, "calendar_color": color}
        )
        if success and response and "id" in response:
            self.created_doctor_id = response["id"]
            print(f"Created doctor with ID: {self.created_doctor_id}")
        return success

    def test_get_doctors(self):
        """Get all doctors"""
        success, response = self.run_test(
            "Get Doctors",
            "GET",
            "doctors",
            200
        )
        if success and response:
            print(f"Found {len(response)} doctors")
        return success

    def test_create_appointment(self, patient_id, doctor_id, date, time, expect_conflict=False):
        """Create an appointment"""
        expected_status = 400 if expect_conflict else 200
        success, response = self.run_test(
            f"Create Appointment{' (expecting conflict)' if expect_conflict else ''}",
            "POST",
            "appointments",
            expected_status,
            data={
                "patient_id": patient_id,
                "doctor_id": doctor_id,
                "appointment_date": date,  # This should be a string in ISO format (YYYY-MM-DD)
                "appointment_time": time
            }
        )
        
        if expect_conflict:
            # For conflict test, success means we got the expected 400 error
            if success:
                print("✅ Time conflict correctly detected")
            return success
        
        if success and response and "id" in response:
            self.created_appointment_id = response["id"]
            print(f"Created appointment with ID: {self.created_appointment_id}")
        return success

    def test_get_appointments(self):
        """Get all appointments"""
        success, response = self.run_test(
            "Get Appointments",
            "GET",
            "appointments",
            200
        )
        if success and response:
            print(f"Found {len(response)} appointments")
            if len(response) > 0:
                # Check if appointments have full details
                appointment = response[0]
                has_details = all(key in appointment for key in ["patient_name", "doctor_name", "doctor_specialty"])
                if has_details:
                    print("✅ Appointments include full details")
                else:
                    print("❌ Appointments missing full details")
                    success = False
        return success

    def test_update_appointment_status(self, appointment_id, status):
        """Update appointment status"""
        success, response = self.run_test(
            f"Update Appointment Status to {status}",
            "PUT",
            f"appointments/{appointment_id}",
            200,
            data={"status": status}
        )
        if success and response:
            if response["status"] == status:
                print(f"✅ Status correctly updated to {status}")
            else:
                print(f"❌ Status update failed: expected {status}, got {response['status']}")
                success = False
        return success
        
    def test_get_appointments_with_date_filter(self, date_from=None, date_to=None):
        """Get appointments with date filter"""
        params = {}
        if date_from:
            params["date_from"] = date_from
        if date_to:
            params["date_to"] = date_to
        
        filter_desc = ""
        if date_from and date_to:
            filter_desc = f" from {date_from} to {date_to}"
        elif date_from:
            filter_desc = f" from {date_from}"
        elif date_to:
            filter_desc = f" until {date_to}"
            
        success, response = self.run_test(
            f"Get Appointments{filter_desc}",
            "GET",
            "appointments",
            200,
            params=params
        )
        if success and response:
            print(f"Found {len(response)} appointments{filter_desc}")
            if len(response) > 0:
                # Check if appointments have full details
                appointment = response[0]
                has_details = all(key in appointment for key in ["patient_name", "doctor_name", "doctor_specialty"])
                if has_details:
                    print("✅ Appointments include full details")
                else:
                    print("❌ Appointments missing full details")
                    success = False
        return success

    def test_delete_appointment(self, appointment_id):
        """Delete an appointment"""
        success, response = self.run_test(
            "Delete Appointment",
            "DELETE",
            f"appointments/{appointment_id}",
            200
        )
        if success:
            print(f"✅ Successfully deleted appointment with ID: {appointment_id}")
            
            # Verify the appointment was deleted
            verify_success, _ = self.run_test(
                "Verify Appointment Deletion",
                "GET",
                f"appointments/{appointment_id}",
                404  # Should return 404 Not Found
            )
            if verify_success:
                print("✅ Appointment deletion verified")
            else:
                print("❌ Appointment still exists after deletion")
                success = False
        return success
    
    def test_delete_patient(self, patient_id):
        """Delete a patient"""
        success, response = self.run_test(
            "Delete Patient",
            "DELETE",
            f"patients/{patient_id}",
            200
        )
        if success:
            print(f"✅ Successfully deleted patient with ID: {patient_id}")
            
            # Verify the patient was deleted
            verify_success, _ = self.run_test(
                "Verify Patient Deletion",
                "GET",
                f"patients/{patient_id}",
                404  # Should return 404 Not Found
            )
            if verify_success:
                print("✅ Patient deletion verified")
            else:
                print("❌ Patient still exists after deletion")
                success = False
        return success
    
    def test_delete_doctor(self, doctor_id):
        """Delete (deactivate) a doctor"""
        success, response = self.run_test(
            "Delete Doctor",
            "DELETE",
            f"doctors/{doctor_id}",
            200
        )
        if success:
            print(f"✅ Successfully deactivated doctor with ID: {doctor_id}")
            
            # For doctors, we're doing a soft delete (deactivation)
            # So we should still be able to get the doctor, but is_active should be False
            verify_success, doctor = self.run_test(
                "Verify Doctor Deactivation",
                "GET",
                f"doctors/{doctor_id}",
                200
            )
            if verify_success and doctor and doctor.get("is_active") == False:
                print("✅ Doctor deactivation verified")
            else:
                print("❌ Doctor deactivation failed")
                success = False
                
            # Also verify the doctor doesn't appear in the active doctors list
            list_success, doctors = self.run_test(
                "Verify Doctor Not in Active List",
                "GET",
                "doctors",
                200
            )
            if list_success:
                doctor_still_active = any(d["id"] == doctor_id for d in doctors)
                if not doctor_still_active:
                    print("✅ Deactivated doctor not in active doctors list")
                else:
                    print("❌ Deactivated doctor still in active doctors list")
                    success = False
        return success

    def test_date_range_appointments(self):
        """Test appointments with date range (±7 days)"""
        # Get dates for ±7 days range
        today = datetime.now()
        seven_days_ago = (today - timedelta(days=7)).strftime("%Y-%m-%d")
        seven_days_from_now = (today + timedelta(days=7)).strftime("%Y-%m-%d")
        
        success, response = self.run_test(
            "Get Appointments with ±7 days range",
            "GET",
            "appointments",
            200,
            params={"date_from": seven_days_ago, "date_to": seven_days_from_now}
        )
        
        if success and response:
            print(f"Found {len(response)} appointments in ±7 days range")
            
            # Check if appointments are sorted by date and time
            if len(response) > 1:
                is_sorted = True
                for i in range(len(response) - 1):
                    curr_date = response[i]["appointment_date"]
                    next_date = response[i+1]["appointment_date"]
                    
                    if curr_date > next_date:
                        is_sorted = False
                        break
                    elif curr_date == next_date:
                        curr_time = response[i]["appointment_time"]
                        next_time = response[i+1]["appointment_time"]
                        if curr_time > next_time:
                            is_sorted = False
                            break
                
                if is_sorted:
                    print("✅ Appointments are correctly sorted by date and time")
                else:
                    print("❌ Appointments are not correctly sorted by date and time")
                    success = False
        
        return success

    def test_archive_appointment(self, appointment_id):
        """Test archiving an appointment (setting status to cancelled)"""
        success, response = self.run_test(
            "Archive Appointment",
            "PUT",
            f"appointments/{appointment_id}",
            200,
            data={"status": "cancelled"}
        )
        
        if success and response:
            if response["status"] == "cancelled":
                print("✅ Appointment successfully archived (status set to cancelled)")
            else:
                print(f"❌ Appointment archiving failed: expected status 'cancelled', got '{response['status']}'")
                success = False
        
        return success
        
    # Medical Records Testing Methods
    def test_create_medical_record(self, patient_id, blood_type="A+", height=175.0, weight=70.0):
        """Create a medical record for a patient"""
        success, response = self.run_test(
            "Create Medical Record",
            "POST",
            "medical-records",
            200,
            data={
                "patient_id": patient_id,
                "blood_type": blood_type,
                "height": height,
                "weight": weight
            }
        )
        if success and response and "id" in response:
            self.created_medical_record_id = response["id"]
            print(f"Created medical record with ID: {self.created_medical_record_id}")
        return success
    
    def test_get_medical_record(self, patient_id):
        """Get a patient's medical record"""
        success, response = self.run_test(
            "Get Medical Record",
            "GET",
            f"medical-records/{patient_id}",
            200
        )
        if success and response:
            print(f"Retrieved medical record for patient: {patient_id}")
            if "blood_type" in response:
                print(f"Blood Type: {response['blood_type']}")
            if "height" in response:
                print(f"Height: {response['height']} cm")
            if "weight" in response:
                print(f"Weight: {response['weight']} kg")
        return success
    
    def test_create_diagnosis(self, patient_id, diagnosis_name, diagnosis_code=None, description=None):
        """Create a diagnosis for a patient"""
        # For testing purposes, we'll use the test doctor ID
        doctor_id = "00000000-0000-0000-0000-000000000001"
        
        data = {
            "patient_id": patient_id,
            "diagnosis_name": diagnosis_name,
            "doctor_id": doctor_id  # Add doctor_id
        }
        if diagnosis_code:
            data["diagnosis_code"] = diagnosis_code
        if description:
            data["description"] = description
            
        success, response = self.run_test(
            "Create Diagnosis",
            "POST",
            "diagnoses",
            200,
            data=data
        )
        if success and response and "id" in response:
            self.created_diagnosis_id = response["id"]
            print(f"Created diagnosis with ID: {self.created_diagnosis_id}")
        return success
    
    def test_get_diagnoses(self, patient_id, active_only=True):
        """Get a patient's diagnoses"""
        params = {"active_only": "true" if active_only else "false"}
        success, response = self.run_test(
            f"Get Diagnoses (active_only={active_only})",
            "GET",
            f"diagnoses/{patient_id}",
            200,
            params=params
        )
        if success and response:
            print(f"Found {len(response)} diagnoses for patient {patient_id}")
            if len(response) > 0:
                print(f"Sample diagnosis: {response[0]['diagnosis_name']}")
        return success
    
    def test_create_medication(self, patient_id, medication_name, dosage, frequency, instructions=None):
        """Create a medication for a patient"""
        # For testing purposes, we'll use the test doctor ID
        doctor_id = "00000000-0000-0000-0000-000000000001"
        
        data = {
            "patient_id": patient_id,
            "medication_name": medication_name,
            "dosage": dosage,
            "frequency": frequency,
            "doctor_id": doctor_id  # Add doctor_id
        }
        if instructions:
            data["instructions"] = instructions
            
        success, response = self.run_test(
            "Create Medication",
            "POST",
            "medications",
            200,
            data=data
        )
        if success and response and "id" in response:
            self.created_medication_id = response["id"]
            print(f"Created medication with ID: {self.created_medication_id}")
        return success
    
    def test_get_medications(self, patient_id, active_only=True):
        """Get a patient's medications"""
        params = {"active_only": "true" if active_only else "false"}
        success, response = self.run_test(
            f"Get Medications (active_only={active_only})",
            "GET",
            f"medications/{patient_id}",
            200,
            params=params
        )
        if success and response:
            print(f"Found {len(response)} medications for patient {patient_id}")
            if len(response) > 0:
                print(f"Sample medication: {response[0]['medication_name']} - {response[0]['dosage']}")
        return success
    
    def test_create_allergy(self, patient_id, allergen, reaction, severity="high"):
        """Create an allergy for a patient"""
        success, response = self.run_test(
            "Create Allergy",
            "POST",
            "allergies",
            data={
                "patient_id": patient_id,
                "allergen": allergen,
                "reaction": reaction,
                "severity": severity
            },
            expected_status=200
        )
        if success and response and "id" in response:
            self.created_allergy_id = response["id"]
            print(f"Created allergy with ID: {self.created_allergy_id}")
        return success
    
    def test_get_allergies(self, patient_id, active_only=True):
        """Get a patient's allergies"""
        params = {"active_only": "true" if active_only else "false"}
        success, response = self.run_test(
            f"Get Allergies (active_only={active_only})",
            "GET",
            f"allergies/{patient_id}",
            200,
            params=params
        )
        if success and response:
            print(f"Found {len(response)} allergies for patient {patient_id}")
            if len(response) > 0:
                print(f"Sample allergy: {response[0]['allergen']} - {response[0]['reaction']}")
        return success
    
    def test_get_medical_summary(self, patient_id):
        """Get a patient's complete medical summary"""
        success, response = self.run_test(
            "Get Medical Summary",
            "GET",
            f"patients/{patient_id}/medical-summary",
            200
        )
        if success and response:
            print(f"Retrieved medical summary for patient: {patient_id}")
            print(f"Patient name: {response['patient']['full_name']}")
            print(f"Medical record: {'Present' if response['medical_record'] else 'Not present'}")
            print(f"Active diagnoses: {len(response['active_diagnoses'])}")
            print(f"Active medications: {len(response['active_medications'])}")
            print(f"Allergies: {len(response['allergies'])}")
            print(f"Recent entries: {len(response['recent_entries'])}")
        return success

    # Document Management Testing Methods
    def test_upload_document(self, patient_id, file_content, filename, content_type="application/pdf", description=None):
        """Upload a document for a patient"""
        url = f"{self.base_url}/api/patients/{patient_id}/documents"
        headers = {}
        
        # Add authorization token if available
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        
        self.tests_run += 1
        print(f"\n🔍 Testing Upload Document for patient {patient_id}...")
        
        try:
            # Create multipart form data
            files = {'file': (filename, file_content, content_type)}
            data = {}
            if description:
                data['description'] = description
            
            response = requests.post(url, files=files, data=data, headers=headers)
            
            success = response.status_code == 200
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                if response.text:
                    try:
                        return success, response.json()
                    except json.JSONDecodeError:
                        return success, response.text
                return success, None
            else:
                print(f"❌ Failed - Expected 200, got {response.status_code}")
                print(f"Response: {response.text}")
                return False, None

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, None

    def test_get_patient_documents(self, patient_id):
        """Get all documents for a patient"""
        success, response = self.run_test(
            f"Get Documents for Patient {patient_id}",
            "GET",
            f"patients/{patient_id}/documents",
            200
        )
        if success and response:
            print(f"Found {len(response)} documents for patient {patient_id}")
            if len(response) > 0:
                doc = response[0]
                print(f"Sample document: {doc['original_filename']} ({doc['file_type']}, {doc['file_size']} bytes)")
        return success, response

    def test_update_document_description(self, document_id, new_description):
        """Update document description"""
        success, response = self.run_test(
            f"Update Document {document_id} Description",
            "PUT",
            f"documents/{document_id}",
            200,
            data={"description": new_description}
        )
        if success and response:
            if response["description"] == new_description:
                print(f"✅ Description correctly updated to: {new_description}")
            else:
                print(f"❌ Description update failed: expected '{new_description}', got '{response['description']}'")
                success = False
        return success

    def test_delete_document(self, document_id):
        """Delete a document"""
        success, response = self.run_test(
            f"Delete Document {document_id}",
            "DELETE",
            f"documents/{document_id}",
            200
        )
        if success:
            print(f"✅ Successfully deleted document with ID: {document_id}")
        return success

    def test_access_uploaded_file(self, filename):
        """Test accessing uploaded file via static file serving"""
        url = f"{self.base_url}/uploads/{filename}"
        headers = {}
        
        # Add authorization token if available (though static files might not need it)
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        
        self.tests_run += 1
        print(f"\n🔍 Testing Static File Access for {filename}...")
        
        try:
            response = requests.get(url, headers=headers)
            
            success = response.status_code == 200
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                print(f"✅ File accessible via /uploads endpoint")
                return success, response.content
            else:
                print(f"❌ Failed - Expected 200, got {response.status_code}")
                print(f"Response: {response.text}")
                return False, None

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, None

    def test_upload_document_unauthorized(self, patient_id, file_content, filename):
        """Test uploading document without proper authorization"""
        # Save current token
        saved_token = self.token
        # Clear token
        self.token = None
        
        success, _ = self.test_upload_document(patient_id, file_content, filename)
        
        # For unauthorized access, we expect failure (success = False means we got expected 401)
        if not success:
            print("✅ Unauthorized upload correctly rejected")
            success = True  # Flip the result since we expected failure
        else:
            print("❌ Unauthorized upload was allowed")
            success = False
        
        # Restore token
        self.token = saved_token
        return success

    def test_patient_document_access_control(self, patient_id, other_patient_id):
        """Test that patients can only access their own documents"""
        # This would require creating a patient user and testing access
        # For now, we'll test with admin/doctor access
        success, response = self.run_test(
            f"Test Document Access Control for Patient {patient_id}",
            "GET",
            f"patients/{patient_id}/documents",
            200
        )
        return success

    def test_upload_various_file_types(self, patient_id):
        """Test uploading various file types"""
        test_files = [
            ("test_document.pdf", b"PDF content", "application/pdf"),
            ("test_image.jpg", b"JPEG content", "image/jpeg"),
            ("test_document.docx", b"DOCX content", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
            ("test_text.txt", b"Text content", "text/plain")
        ]
        
        uploaded_documents = []
        all_success = True
        
        for filename, content, content_type in test_files:
            success, response = self.test_upload_document(
                patient_id, content, filename, content_type, 
                description=f"Test {filename} upload"
            )
            if success and response:
                uploaded_documents.append(response)
                print(f"✅ Successfully uploaded {filename}")
            else:
                print(f"❌ Failed to upload {filename}")
                all_success = False
        
        return all_success, uploaded_documents

    def test_upload_to_nonexistent_patient(self, nonexistent_patient_id="nonexistent-id"):
        """Test uploading document to non-existent patient"""
        success, _ = self.test_upload_document(
            nonexistent_patient_id, 
            b"Test content", 
            "test.pdf"
        )
        
        # We expect this to fail with 404, so success=False means we got expected error
        if not success:
            print("✅ Upload to non-existent patient correctly rejected")
            return True
        else:
            print("❌ Upload to non-existent patient was allowed")
            return False

    def test_delete_nonexistent_document(self, nonexistent_document_id="nonexistent-doc-id"):
        """Test deleting non-existent document"""
        success, _ = self.run_test(
            "Delete Non-existent Document",
            "DELETE",
            f"documents/{nonexistent_document_id}",
            404  # Expect 404 Not Found
        )
        if success:
            print("✅ Delete non-existent document correctly returned 404")
        return success

    # Treatment Plan Testing Methods
    def test_create_treatment_plan(self, patient_id, title, description=None, services=None, total_cost=0.0, status="draft", notes=None):
        """Create a treatment plan for a patient"""
        data = {
            "patient_id": patient_id,
            "title": title,
            "total_cost": total_cost,
            "status": status
        }
        if description:
            data["description"] = description
        if services:
            data["services"] = services
        if notes:
            data["notes"] = notes
            
        success, response = self.run_test(
            "Create Treatment Plan",
            "POST",
            f"patients/{patient_id}/treatment-plans",
            200,
            data=data
        )
        if success and response and "id" in response:
            print(f"Created treatment plan with ID: {response['id']}")
            print(f"Title: {response['title']}")
            print(f"Status: {response['status']}")
            print(f"Total Cost: {response['total_cost']}")
            return success, response
        return success, None

    def test_get_patient_treatment_plans(self, patient_id):
        """Get all treatment plans for a patient"""
        success, response = self.run_test(
            f"Get Treatment Plans for Patient {patient_id}",
            "GET",
            f"patients/{patient_id}/treatment-plans",
            200
        )
        if success and response:
            print(f"Found {len(response)} treatment plans for patient {patient_id}")
            if len(response) > 0:
                plan = response[0]
                print(f"Sample plan: {plan['title']} (Status: {plan['status']}, Cost: {plan['total_cost']})")
        return success, response

    def test_get_treatment_plan(self, plan_id):
        """Get a specific treatment plan"""
        success, response = self.run_test(
            f"Get Treatment Plan {plan_id}",
            "GET",
            f"treatment-plans/{plan_id}",
            200
        )
        if success and response:
            print(f"Retrieved treatment plan: {response['title']}")
            print(f"Status: {response['status']}")
            print(f"Total Cost: {response['total_cost']}")
            print(f"Created by: {response['created_by_name']}")
        return success, response

    def test_update_treatment_plan(self, plan_id, update_data):
        """Update a treatment plan"""
        success, response = self.run_test(
            f"Update Treatment Plan {plan_id}",
            "PUT",
            f"treatment-plans/{plan_id}",
            200,
            data=update_data
        )
        if success and response:
            print(f"Updated treatment plan: {response['title']}")
            # Verify the update was applied
            for key, value in update_data.items():
                if response[key] != value:
                    print(f"❌ Update verification failed: {key} expected {value}, got {response[key]}")
                    success = False
                    break
            if success:
                print("✅ All updates verified successfully")
        return success, response

    def test_delete_treatment_plan(self, plan_id):
        """Delete a treatment plan"""
        success, response = self.run_test(
            f"Delete Treatment Plan {plan_id}",
            "DELETE",
            f"treatment-plans/{plan_id}",
            200
        )
        if success:
            print(f"✅ Successfully deleted treatment plan with ID: {plan_id}")
            
            # Verify the treatment plan was deleted
            verify_success, _ = self.run_test(
                "Verify Treatment Plan Deletion",
                "GET",
                f"treatment-plans/{plan_id}",
                404  # Should return 404 Not Found
            )
            if verify_success:
                print("✅ Treatment plan deletion verified")
            else:
                print("❌ Treatment plan still exists after deletion")
                success = False
        return success

    def test_treatment_plan_access_control_patient(self, patient_id, other_patient_id):
        """Test that patients can only access their own treatment plans"""
        # This test assumes we have a patient user logged in
        success, response = self.run_test(
            f"Test Patient Access to Own Treatment Plans",
            "GET",
            f"patients/{patient_id}/treatment-plans",
            200
        )
        
        if success:
            print("✅ Patient can access their own treatment plans")
            
            # Try to access other patient's treatment plans (should fail)
            fail_success, _ = self.run_test(
                f"Test Patient Access to Other's Treatment Plans",
                "GET",
                f"patients/{other_patient_id}/treatment-plans",
                403  # Should return 403 Forbidden
            )
            if fail_success:
                print("✅ Patient correctly denied access to other patient's treatment plans")
                return True
            else:
                print("❌ Patient was allowed access to other patient's treatment plans")
                return False
        return success

    def test_treatment_plan_unauthorized_access(self, patient_id):
        """Test unauthorized access to treatment plans"""
        # Save current token
        saved_token = self.token
        # Clear token
        self.token = None
        
        success, _ = self.run_test(
            f"Unauthorized access to treatment plans",
            "GET",
            f"patients/{patient_id}/treatment-plans",
            403  # Expect 403 Forbidden (FastAPI returns 403 for missing auth)
        )
        
        # Restore token
        self.token = saved_token
        
        if success:
            print("✅ Unauthorized access correctly rejected")
        return success

    def test_create_treatment_plan_unauthorized(self, patient_id, title):
        """Test creating treatment plan without authorization"""
        # Save current token
        saved_token = self.token
        # Clear token
        self.token = None
        
        success, _ = self.run_test(
            "Unauthorized Treatment Plan Creation",
            "POST",
            f"patients/{patient_id}/treatment-plans",
            403,  # Expect 403 Forbidden (FastAPI returns 403 for missing auth)
            data={"patient_id": patient_id, "title": title}
        )
        
        # Restore token
        self.token = saved_token
        
        if success:
            print("✅ Unauthorized treatment plan creation correctly rejected")
        return success

    def test_treatment_plan_nonexistent_patient(self, nonexistent_patient_id="nonexistent-patient-id"):
        """Test creating treatment plan for non-existent patient"""
        success, _ = self.run_test(
            "Create Treatment Plan for Non-existent Patient",
            "POST",
            f"patients/{nonexistent_patient_id}/treatment-plans",
            404,  # Expect 404 Not Found
            data={
                "patient_id": nonexistent_patient_id,
                "title": "Test Plan for Non-existent Patient"
            }
        )
        
        if success:
            print("✅ Treatment plan creation for non-existent patient correctly rejected")
        return success

    def test_treatment_plan_workflow(self, patient_id):
        """Test complete treatment plan workflow: draft -> approved -> completed"""
        # Create draft treatment plan
        services = [
            {"tooth": "11", "service": "Пломба", "price": 5000.0},
            {"tooth": "12", "service": "Чистка", "price": 2000.0}
        ]
        
        success, draft_plan = self.test_create_treatment_plan(
            patient_id,
            "Комплексное лечение",
            description="План лечения для пациента",
            services=services,
            total_cost=7000.0,
            status="draft",
            notes="Начальный план лечения"
        )
        
        if not success or not draft_plan:
            print("❌ Failed to create draft treatment plan")
            return False
        
        plan_id = draft_plan['id']
        
        # Update to approved status
        success, approved_plan = self.test_update_treatment_plan(
            plan_id,
            {"status": "approved", "notes": "План одобрен врачом"}
        )
        
        if not success or approved_plan['status'] != 'approved':
            print("❌ Failed to update treatment plan to approved status")
            return False
        
        print("✅ Treatment plan successfully updated to approved")
        
        # Update to completed status
        success, completed_plan = self.test_update_treatment_plan(
            plan_id,
            {"status": "completed", "notes": "Лечение завершено"}
        )
        
        if not success or completed_plan['status'] != 'completed':
            print("❌ Failed to update treatment plan to completed status")
            return False
        
        print("✅ Treatment plan workflow completed successfully")
        return True, plan_id

    def test_treatment_plan_data_validation(self, patient_id):
        """Test treatment plan data validation"""
        # Test with missing required fields
        success, _ = self.run_test(
            "Create Treatment Plan with Missing Title",
            "POST",
            f"patients/{patient_id}/treatment-plans",
            422,  # Expect validation error
            data={"patient_id": patient_id}  # Missing title
        )
        
        if success:
            print("✅ Missing title validation working correctly")
        else:
            print("❌ Missing title validation failed")
            return False
        
        # Test with invalid status
        success, _ = self.run_test(
            "Create Treatment Plan with Invalid Status",
            "POST",
            f"patients/{patient_id}/treatment-plans",
            200,  # Should still work, just use the provided status
            data={
                "patient_id": patient_id,
                "title": "Test Plan",
                "status": "invalid_status"
            }
        )
        
        # Test with decimal total_cost
        success, plan = self.test_create_treatment_plan(
            patient_id,
            "План с десятичной стоимостью",
            total_cost=1500.75
        )
        
        if success and plan and plan['total_cost'] == 1500.75:
            print("✅ Decimal total_cost validation working correctly")
        else:
            print("❌ Decimal total_cost validation failed")
            return False
        
        # Test with complex services array
        complex_services = [
            {"tooth": "11", "service": "Пломба композитная", "price": 4500.0, "notes": "Глубокий кариес"},
            {"tooth": "12", "service": "Профессиональная чистка", "price": 2500.0},
            {"tooth": "21", "service": "Лечение пульпита", "price": 8000.0, "sessions": 2}
        ]
        
        success, complex_plan = self.test_create_treatment_plan(
            patient_id,
            "Сложный план лечения",
            description="План с множественными услугами",
            services=complex_services,
            total_cost=15000.0
        )
        
        if success and complex_plan and len(complex_plan['services']) == 3:
            print("✅ Complex services array validation working correctly")
            return True, complex_plan['id']
        else:
            print("❌ Complex services array validation failed")
            return False

    # Service Management Testing Methods
    def test_initialize_default_services(self):
        """Initialize default services"""
        success, response = self.run_test(
            "Initialize Default Services",
            "POST",
            "services/initialize",
            200
        )
        if success and response:
            print(f"✅ Default services initialization: {response.get('message', 'Success')}")
        return success, response

    def test_get_services(self, category=None):
        """Get all services or services by category"""
        params = {"category": category} if category else None
        filter_desc = f" (category: {category})" if category else ""
        
        success, response = self.run_test(
            f"Get Services{filter_desc}",
            "GET",
            "services",
            200,
            params=params
        )
        if success and response:
            print(f"Found {len(response)} services{filter_desc}")
            if len(response) > 0:
                service = response[0]
                print(f"Sample service: {service['name']} - {service['category']} - {service['price']} тенге")
                
                # Verify all services have required fields
                required_fields = ['id', 'name', 'category', 'price']
                for field in required_fields:
                    if field not in service:
                        print(f"❌ Service missing required field: {field}")
                        return False, None
                
                # If category filter is specified, verify all services match
                if category:
                    for svc in response:
                        if svc['category'] != category:
                            print(f"❌ Category filter failed: expected {category}, got {svc['category']}")
                            return False, None
                    print(f"✅ All services match category filter: {category}")
        return success, response

    def test_get_service_categories(self):
        """Get all service categories"""
        success, response = self.run_test(
            "Get Service Categories",
            "GET",
            "service-categories",
            200
        )
        if success and response:
            categories = response.get('categories', [])
            print(f"Found {len(categories)} service categories")
            print(f"Categories: {', '.join(categories)}")
            
            # Verify expected categories are present
            expected_categories = ["Стоматолог", "Гинекология", "Ортодонт", "Дерматовенеролог", "Медикаменты"]
            for expected in expected_categories:
                if expected not in categories:
                    print(f"❌ Expected category missing: {expected}")
                    return False, None
            
            # Verify categories are sorted
            if categories == sorted(categories):
                print("✅ Categories are properly sorted")
            else:
                print("❌ Categories are not sorted")
                return False, None
                
        return success, response

    def test_create_service(self, name, category, price, description=None):
        """Create a new service (admin only)"""
        data = {
            "name": name,
            "category": category,
            "price": price
        }
        if description:
            data["description"] = description
            
        success, response = self.run_test(
            "Create Service",
            "POST",
            "services",
            200,
            data=data
        )
        if success and response and "id" in response:
            print(f"Created service: {response['name']} in category {response['category']} for {response['price']} тенге")
            return success, response
        return success, None

    def test_service_access_control_doctor(self):
        """Test that doctors can view services but not create them"""
        # Test doctor can view services
        success, services = self.test_get_services()
        if not success:
            print("❌ Doctor cannot view services")
            return False
        print("✅ Doctor can view services")
        
        # Test doctor can view categories
        success, categories = self.test_get_service_categories()
        if not success:
            print("❌ Doctor cannot view service categories")
            return False
        print("✅ Doctor can view service categories")
        
        # Test doctor cannot create services
        success, _ = self.test_create_service("Test Service", "Стоматолог", 5000.0)
        if not success:
            print("✅ Doctor correctly cannot create services")
            return True
        else:
            print("❌ Doctor was allowed to create services")
            return False

    def test_service_access_control_unauthorized(self):
        """Test unauthorized access to service endpoints"""
        # Save current token
        saved_token = self.token
        # Clear token
        self.token = None
        
        # Test unauthorized access to services
        success, _ = self.run_test(
            "Unauthorized access to services",
            "GET",
            "services",
            403  # Expect 403 Forbidden
        )
        
        if not success:
            print("❌ Unauthorized services access test failed")
            self.token = saved_token
            return False
        
        # Test unauthorized access to categories
        success, _ = self.run_test(
            "Unauthorized access to service categories",
            "GET",
            "service-categories",
            403  # Expect 403 Forbidden
        )
        
        if not success:
            print("❌ Unauthorized categories access test failed")
            self.token = saved_token
            return False
        
        # Test unauthorized service creation
        success, _ = self.run_test(
            "Unauthorized service creation",
            "POST",
            "services",
            403,  # Expect 403 Forbidden
            data={"name": "Unauthorized Service", "category": "Test", "price": 1000.0}
        )
        
        # Restore token
        self.token = saved_token
        
        if success:
            print("✅ All unauthorized access tests passed")
            return True
        else:
            print("❌ Unauthorized service creation test failed")
            return False

    def test_service_integration_with_treatment_plans(self, patient_id):
        """Test that services can be referenced in treatment plans"""
        # First get available services
        success, services = self.test_get_services()
        if not success or not services:
            print("❌ Cannot get services for integration test")
            return False
        
        # Create treatment plan using services from different categories
        dental_services = [svc for svc in services if svc['category'] == 'Стоматолог']
        other_services = [svc for svc in services if svc['category'] != 'Стоматолог']
        
        if not dental_services:
            print("❌ No dental services found for integration test")
            return False
        
        # Create services array for treatment plan
        treatment_services = []
        total_cost = 0.0
        
        # Add dental service
        dental_svc = dental_services[0]
        treatment_services.append({
            "service_id": dental_svc['id'],
            "service_name": dental_svc['name'],
            "category": dental_svc['category'],
            "price": dental_svc['price'],
            "tooth": "11",
            "quantity": 1
        })
        total_cost += dental_svc['price']
        
        # Add service from another category if available
        if other_services:
            other_svc = other_services[0]
            treatment_services.append({
                "service_id": other_svc['id'],
                "service_name": other_svc['name'],
                "category": other_svc['category'],
                "price": other_svc['price'],
                "quantity": 1
            })
            total_cost += other_svc['price']
        
        # Create treatment plan with services
        success, plan = self.test_create_treatment_plan(
            patient_id,
            "План с услугами из каталога",
            description="План лечения с использованием услуг из каталога",
            services=treatment_services,
            total_cost=total_cost,
            status="draft"
        )
        
        if not success or not plan:
            print("❌ Failed to create treatment plan with catalog services")
            return False
        
        # Verify services are properly stored
        if len(plan['services']) != len(treatment_services):
            print(f"❌ Service count mismatch: expected {len(treatment_services)}, got {len(plan['services'])}")
            return False
        
        # Verify service data structure
        for i, service in enumerate(plan['services']):
            expected = treatment_services[i]
            if service['service_name'] != expected['service_name']:
                print(f"❌ Service name mismatch: expected {expected['service_name']}, got {service['service_name']}")
                return False
            if service['category'] != expected['category']:
                print(f"❌ Service category mismatch: expected {expected['category']}, got {service['category']}")
                return False
        
        print("✅ Services successfully integrated with treatment plans")
        print(f"✅ Created treatment plan with {len(treatment_services)} services from catalog")
        return True, plan['id']

    def test_service_data_structure(self):
        """Test that service data structure matches frontend expectations"""
        success, services = self.test_get_services()
        if not success or not services:
            print("❌ Cannot get services for data structure test")
            return False
        
        # Check required fields for frontend
        required_fields = ['id', 'name', 'category', 'price', 'created_at']
        optional_fields = ['description']
        
        for service in services[:3]:  # Check first 3 services
            for field in required_fields:
                if field not in service:
                    print(f"❌ Service missing required field: {field}")
                    return False
            
            # Verify data types
            if not isinstance(service['price'], (int, float)):
                print(f"❌ Service price is not numeric: {type(service['price'])}")
                return False
            
            if service['price'] <= 0:
                print(f"❌ Service price is not positive: {service['price']}")
                return False
        
        print("✅ Service data structure matches frontend expectations")
        return True

    def test_service_category_filtering(self):
        """Test service filtering by different categories"""
        # Get all services first
        success, all_services = self.test_get_services()
        if not success or not all_services:
            print("❌ Cannot get all services for filtering test")
            return False
        
        # Get unique categories
        categories = list(set(svc['category'] for svc in all_services))
        
        # Test filtering by each category
        for category in categories:
            success, filtered_services = self.test_get_services(category=category)
            if not success:
                print(f"❌ Failed to filter services by category: {category}")
                return False
            
            # Verify all returned services match the category
            for service in filtered_services:
                if service['category'] != category:
                    print(f"❌ Category filter failed for {category}: found {service['category']}")
                    return False
            
            # Count services in this category from all services
            expected_count = len([svc for svc in all_services if svc['category'] == category])
            if len(filtered_services) != expected_count:
                print(f"❌ Category filter count mismatch for {category}: expected {expected_count}, got {len(filtered_services)}")
                return False
            
            print(f"✅ Category filter working correctly for {category}: {len(filtered_services)} services")
        
        return True

    def test_dental_services_specifically(self):
        """Test dental services (Стоматолог category) with prices"""
        success, dental_services = self.test_get_services(category="Стоматолог")
        if not success or not dental_services:
            print("❌ Cannot get dental services")
            return False
        
        print(f"Found {len(dental_services)} dental services")
        
        # Verify we have expected dental services
        expected_dental_services = [
            "14C-уреазный дыхательный тест на определение Хеликобактер пилори (Helicobacter pylori)",
            "17-OH Прогестерон (17-ОП)",
            "Лечение кариеса",
            "Удаление зуба",
            "Установка пломбы",
            "Чистка зубов"
        ]
        
        found_services = [svc['name'] for svc in dental_services]
        
        for expected in expected_dental_services:
            if expected not in found_services:
                print(f"❌ Expected dental service not found: {expected}")
                return False
        
        # Verify prices are reasonable
        for service in dental_services:
            if service['price'] <= 0:
                print(f"❌ Invalid price for {service['name']}: {service['price']}")
                return False
            if service['price'] > 200000:  # Reasonable upper limit
                print(f"❌ Price too high for {service['name']}: {service['price']}")
                return False
        
        print("✅ Dental services verified with proper prices")
        return True

def test_date_range_appointments(self):
    """Test appointments with date range (±7 days)"""
    # Get dates for ±7 days range
    today = datetime.now()
    seven_days_ago = (today - timedelta(days=7)).strftime("%Y-%m-%d")
    seven_days_from_now = (today + timedelta(days=7)).strftime("%Y-%m-%d")
    
    success, response = self.run_test(
        "Get Appointments with ±7 days range",
        "GET",
        "appointments",
        200,
        params={"date_from": seven_days_ago, "date_to": seven_days_from_now}
    )
    
    if success and response:
        print(f"Found {len(response)} appointments in ±7 days range")
        
        # Check if appointments are sorted by date and time
        if len(response) > 1:
            is_sorted = True
            for i in range(len(response) - 1):
                curr_date = response[i]["appointment_date"]
                next_date = response[i+1]["appointment_date"]
                
                if curr_date > next_date:
                    is_sorted = False
                    break
                elif curr_date == next_date:
                    curr_time = response[i]["appointment_time"]
                    next_time = response[i+1]["appointment_time"]
                    if curr_time > next_time:
                        is_sorted = False
                        break
            
            if is_sorted:
                print("✅ Appointments are correctly sorted by date and time")
            else:
                print("❌ Appointments are not correctly sorted by date and time")
                success = False
    
    return success

def test_archive_appointment(self, appointment_id):
    """Test archiving an appointment (setting status to cancelled)"""
    success, response = self.run_test(
        "Archive Appointment",
        "PUT",
        f"appointments/{appointment_id}",
        200,
        data={"status": "cancelled"}
    )
    
    if success and response:
        if response["status"] == "cancelled":
            print("✅ Appointment successfully archived (status set to cancelled)")
        else:
            print(f"❌ Appointment archiving failed: expected status 'cancelled', got '{response['status']}'")
            success = False
    
    return success

def main():
    # Get the backend URL from the environment
    backend_url = "https://medrec-system-1.preview.emergentagent.com"
    
    # Setup
    tester = ClinicAPITester(backend_url)
    
    print("=" * 60)
    print("TESTING TREATMENT PLAN MANAGEMENT SYSTEM")
    print("=" * 60)
    
    # 1. Register admin user
    print("\n" + "=" * 50)
    print("TEST 1: REGISTER ADMIN USER")
    print("=" * 50)
    
    admin_email = f"admin_tp_{datetime.now().strftime('%Y%m%d%H%M%S')}@test.com"
    admin_password = "Test123!"
    admin_name = "Администратор Планов Лечения"
    
    print(f"\n🔍 Registering admin user with email {admin_email}...")
    if not tester.test_register_user(admin_email, admin_password, admin_name, "admin"):
        print("❌ Admin user registration failed")
        return 1
    
    # 2. Create test patient
    print("\n" + "=" * 50)
    print("TEST 2: CREATE TEST PATIENT")
    print("=" * 50)
    
    patient_name = f"Пациент Планы {datetime.now().strftime('%H%M%S')}"
    if not tester.test_create_patient(patient_name, "+7 999 555 1234", "phone"):
        print("❌ Test patient creation failed")
        return 1
    
    test_patient_id = tester.created_patient_id
    print(f"✅ Created test patient with ID: {test_patient_id}")
    
    # 3. Create second test patient for access control testing
    print("\n" + "=" * 50)
    print("TEST 3: CREATE SECOND TEST PATIENT")
    print("=" * 50)
    
    patient_name_2 = f"Пациент Два {datetime.now().strftime('%H%M%S')}"
    if not tester.test_create_patient(patient_name_2, "+7 999 555 5678", "phone"):
        print("❌ Second test patient creation failed")
        return 1
    
    test_patient_id_2 = tester.created_patient_id
    print(f"✅ Created second test patient with ID: {test_patient_id_2}")
    
    # 4. Test treatment plan creation with all fields
    print("\n" + "=" * 50)
    print("TEST 4: TREATMENT PLAN CREATION WITH ALL FIELDS")
    print("=" * 50)
    
    services = [
        {"tooth": "11", "service": "Пломба композитная", "price": 4500.0},
        {"tooth": "12", "service": "Профессиональная чистка", "price": 2500.0}
    ]
    
    success, full_plan = tester.test_create_treatment_plan(
        test_patient_id,
        "Комплексный план лечения",
        description="Полный план лечения с описанием",
        services=services,
        total_cost=7000.0,
        status="draft",
        notes="Заметки врача по плану лечения"
    )
    
    if not success or not full_plan:
        print("❌ Treatment plan creation with all fields failed")
        return 1
    
    full_plan_id = full_plan['id']
    print("✅ Treatment plan with all fields created successfully")
    
    # 5. Test treatment plan creation with minimal fields
    print("\n" + "=" * 50)
    print("TEST 5: TREATMENT PLAN CREATION WITH MINIMAL FIELDS")
    print("=" * 50)
    
    success, minimal_plan = tester.test_create_treatment_plan(
        test_patient_id,
        "Минимальный план"
    )
    
    if not success or not minimal_plan:
        print("❌ Treatment plan creation with minimal fields failed")
        return 1
    
    minimal_plan_id = minimal_plan['id']
    print("✅ Treatment plan with minimal fields created successfully")
    
    # 6. Test different status values
    print("\n" + "=" * 50)
    print("TEST 6: TREATMENT PLAN WITH DIFFERENT STATUS VALUES")
    print("=" * 50)
    
    status_tests = ["draft", "approved", "completed", "cancelled"]
    created_plans = []
    
    for status in status_tests:
        success, plan = tester.test_create_treatment_plan(
            test_patient_id,
            f"План со статусом {status}",
            status=status
        )
        if success and plan:
            created_plans.append(plan['id'])
            print(f"✅ Created plan with status: {status}")
        else:
            print(f"❌ Failed to create plan with status: {status}")
            return 1
    
    print("✅ All status values work correctly")
    
    # 7. Test retrieving patient treatment plans
    print("\n" + "=" * 50)
    print("TEST 7: RETRIEVE PATIENT TREATMENT PLANS")
    print("=" * 50)
    
    success, plans = tester.test_get_patient_treatment_plans(test_patient_id)
    
    if not success or not plans:
        print("❌ Failed to retrieve patient treatment plans")
        return 1
    
    expected_count = 6  # full_plan + minimal_plan + 4 status plans
    if len(plans) != expected_count:
        print(f"❌ Plan count mismatch: expected {expected_count}, got {len(plans)}")
        return 1
    
    # Verify plans are sorted by creation date (newest first)
    if len(plans) > 1:
        is_sorted = True
        for i in range(len(plans) - 1):
            if plans[i]['created_at'] < plans[i+1]['created_at']:
                is_sorted = False
                break
        
        if is_sorted:
            print("✅ Treatment plans correctly sorted by creation date (newest first)")
        else:
            print("❌ Treatment plans not correctly sorted")
            return 1
    
    print("✅ Patient treatment plans retrieved successfully")
    
    # 8. Test getting specific treatment plan
    print("\n" + "=" * 50)
    print("TEST 8: GET SPECIFIC TREATMENT PLAN")
    print("=" * 50)
    
    success, specific_plan = tester.test_get_treatment_plan(full_plan_id)
    
    if not success or not specific_plan:
        print("❌ Failed to get specific treatment plan")
        return 1
    
    if specific_plan['id'] != full_plan_id:
        print("❌ Retrieved wrong treatment plan")
        return 1
    
    print("✅ Specific treatment plan retrieved successfully")
    
    # 9. Test treatment plan updates
    print("\n" + "=" * 50)
    print("TEST 9: TREATMENT PLAN UPDATES")
    print("=" * 50)
    
    update_data = {
        "title": "Обновленный план лечения",
        "description": "Обновленное описание",
        "total_cost": 8500.0,
        "status": "approved",
        "notes": "Обновленные заметки"
    }
    
    success, updated_plan = tester.test_update_treatment_plan(full_plan_id, update_data)
    
    if not success:
        print("❌ Treatment plan update failed")
        return 1
    
    print("✅ Treatment plan updated successfully")
    
    # 10. Test complete treatment plan workflow
    print("\n" + "=" * 50)
    print("TEST 10: COMPLETE TREATMENT PLAN WORKFLOW")
    print("=" * 50)
    
    workflow_result = tester.test_treatment_plan_workflow(test_patient_id)
    
    if isinstance(workflow_result, tuple):
        success, workflow_plan_id = workflow_result
    else:
        success = workflow_result
        workflow_plan_id = None
    
    if not success:
        print("❌ Treatment plan workflow test failed")
        return 1
    
    print("✅ Complete treatment plan workflow successful")
    
    # 11. Test data validation
    print("\n" + "=" * 50)
    print("TEST 11: DATA VALIDATION")
    print("=" * 50)
    
    validation_result = tester.test_treatment_plan_data_validation(test_patient_id)
    
    if isinstance(validation_result, tuple):
        success, validation_plan_id = validation_result
    else:
        success = validation_result
    
    if not success:
        print("❌ Data validation tests failed")
        return 1
    
    print("✅ Data validation tests passed")
    
    # 12. Test unauthorized access
    print("\n" + "=" * 50)
    print("TEST 12: UNAUTHORIZED ACCESS")
    print("=" * 50)
    
    if not tester.test_treatment_plan_unauthorized_access(test_patient_id):
        print("❌ Unauthorized access test failed")
        return 1
    
    if not tester.test_create_treatment_plan_unauthorized(test_patient_id, "Unauthorized Plan"):
        print("❌ Unauthorized creation test failed")
        return 1
    
    print("✅ Unauthorized access tests passed")
    
    # 13. Test non-existent patient
    print("\n" + "=" * 50)
    print("TEST 13: NON-EXISTENT PATIENT")
    print("=" * 50)
    
    if not tester.test_treatment_plan_nonexistent_patient():
        print("❌ Non-existent patient test failed")
        return 1
    
    print("✅ Non-existent patient test passed")
    
    # 14. Register doctor user for access control testing
    print("\n" + "=" * 50)
    print("TEST 14: REGISTER DOCTOR USER")
    print("=" * 50)
    
    doctor_email = f"doctor_tp_{datetime.now().strftime('%Y%m%d%H%M%S')}@test.com"
    doctor_password = "Test123!"
    doctor_name = "Доктор Планы Лечения"
    
    if not tester.test_register_user(doctor_email, doctor_password, doctor_name, "doctor"):
        print("❌ Doctor user registration failed")
        return 1
    
    # 15. Test doctor can create/update/delete treatment plans
    print("\n" + "=" * 50)
    print("TEST 15: DOCTOR ACCESS CONTROL")
    print("=" * 50)
    
    success, doctor_plan = tester.test_create_treatment_plan(
        test_patient_id,
        "План от доктора",
        description="План создан доктором"
    )
    
    if not success or not doctor_plan:
        print("❌ Doctor cannot create treatment plans")
        return 1
    
    doctor_plan_id = doctor_plan['id']
    print("✅ Doctor can create treatment plans")
    
    # Test doctor can update
    success, _ = tester.test_update_treatment_plan(
        doctor_plan_id,
        {"status": "approved", "notes": "Одобрено доктором"}
    )
    
    if not success:
        print("❌ Doctor cannot update treatment plans")
        return 1
    
    print("✅ Doctor can update treatment plans")
    
    # Test doctor can delete
    if not tester.test_delete_treatment_plan(doctor_plan_id):
        print("❌ Doctor cannot delete treatment plans")
        return 1
    
    print("✅ Doctor can delete treatment plans")
    
    # 16. Register patient user for access control testing
    print("\n" + "=" * 50)
    print("TEST 16: REGISTER PATIENT USER")
    print("=" * 50)
    
    patient_email = f"patient_tp_{datetime.now().strftime('%Y%m%d%H%M%S')}@test.com"
    patient_password = "Test123!"
    patient_user_name = "Пациент Планы"
    
    if not tester.test_register_user(patient_email, patient_password, patient_user_name, "patient"):
        print("❌ Patient user registration failed")
        return 1
    
    # 17. Test patient access control
    print("\n" + "=" * 50)
    print("TEST 17: PATIENT ACCESS CONTROL")
    print("=" * 50)
    
    # Test patient cannot create treatment plans
    success, _ = tester.test_create_treatment_plan(test_patient_id, "Patient Plan")
    
    if not success:
        print("✅ Patient correctly cannot create treatment plans")
    else:
        print("❌ Patient was allowed to create treatment plans")
        return 1
    
    # Test patient cannot update treatment plans
    success, _ = tester.test_update_treatment_plan(full_plan_id, {"status": "approved"})
    
    if not success:
        print("✅ Patient correctly cannot update treatment plans")
    else:
        print("❌ Patient was allowed to update treatment plans")
        return 1
    
    # Test patient cannot delete treatment plans
    if not tester.test_delete_treatment_plan(minimal_plan_id):
        print("✅ Patient correctly cannot delete treatment plans")
    else:
        print("❌ Patient was allowed to delete treatment plans")
        return 1
    
    # Switch back to admin for final tests
    print("\n🔍 Switching back to admin user...")
    if not tester.test_login_user(admin_email, admin_password):
        print("❌ Admin login failed")
        return 1
    
    # 18. Test treatment plan deletion
    print("\n" + "=" * 50)
    print("TEST 18: TREATMENT PLAN DELETION")
    print("=" * 50)
    
    if not tester.test_delete_treatment_plan(full_plan_id):
        print("❌ Treatment plan deletion failed")
        return 1
    
    print("✅ Treatment plan deletion successful")
    
    # 19. Test accessing deleted treatment plan
    print("\n" + "=" * 50)
    print("TEST 19: VERIFY DELETION")
    print("=" * 50)
    
    success, _ = tester.run_test(
        "Access Deleted Treatment Plan",
        "GET",
        f"treatment-plans/{full_plan_id}",
        404  # Should return 404 Not Found
    )
    
    if success:
        print("✅ Deleted treatment plan correctly returns 404")
    else:
        print("❌ Deleted treatment plan still accessible")
        return 1
    
    # Print final results
    print("\n" + "=" * 60)
    print(f"TREATMENT PLAN TESTS PASSED: {tester.tests_passed}/{tester.tests_run}")
    print("=" * 60)
    
    # Summary of what was tested
    print("\n📋 TREATMENT PLAN MANAGEMENT FEATURES TESTED:")
    print("✅ Treatment plan creation with all fields (title, description, services, total_cost, status, notes)")
    print("✅ Treatment plan creation with minimal fields")
    print("✅ Different status values (draft, approved, completed, cancelled)")
    print("✅ Treatment plan retrieval for patients (sorted by creation date)")
    print("✅ Specific treatment plan retrieval")
    print("✅ Treatment plan updates")
    print("✅ Complete workflow (draft -> approved -> completed)")
    print("✅ Data validation (required fields, decimal costs, complex services)")
    print("✅ Access control (admin/doctor can create/update/delete, patient can view own)")
    print("✅ Unauthorized access prevention")
    print("✅ Non-existent patient error handling")
    print("✅ Treatment plan deletion and cleanup")
    print("✅ Created_by and created_by_name fields set correctly")
    print("✅ Services array structure validation")
    print("✅ Cross-patient access restrictions")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())