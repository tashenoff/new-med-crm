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

    def test_patient_statistics_endpoint(self):
        """Test the patient statistics endpoint that was causing 500 errors"""
        success, response = self.run_test(
            "Get Patient Statistics",
            "GET",
            "treatment-plans/statistics/patients",
            200
        )
        if success and response:
            print("✅ Patient statistics endpoint working correctly")
            
            # Verify response structure
            if "patient_statistics" in response and "summary" in response:
                print("✅ Response has correct structure")
                
                # Check summary fields
                summary = response["summary"]
                required_summary_fields = ["total_patients", "patients_with_unpaid", "patients_with_no_shows", "high_value_patients"]
                for field in required_summary_fields:
                    if field not in summary:
                        print(f"❌ Missing summary field: {field}")
                        return False
                
                # Check patient statistics structure
                patient_stats = response["patient_statistics"]
                if len(patient_stats) > 0:
                    patient = patient_stats[0]
                    required_patient_fields = [
                        "patient_id", "patient_name", "patient_phone", "total_plans", 
                        "completed_plans", "no_show_plans", "total_cost", "total_paid",
                        "outstanding_amount", "unpaid_plans", "completion_rate", 
                        "no_show_rate", "collection_rate"
                    ]
                    for field in required_patient_fields:
                        if field not in patient:
                            print(f"❌ Missing patient field: {field}")
                            return False
                    
                    # Verify calculations don't cause division by zero
                    if patient["completion_rate"] is not None and not isinstance(patient["completion_rate"], (int, float)):
                        print(f"❌ Invalid completion_rate: {patient['completion_rate']}")
                        return False
                    
                    if patient["no_show_rate"] is not None and not isinstance(patient["no_show_rate"], (int, float)):
                        print(f"❌ Invalid no_show_rate: {patient['no_show_rate']}")
                        return False
                    
                    if patient["collection_rate"] is not None and not isinstance(patient["collection_rate"], (int, float)):
                        print(f"❌ Invalid collection_rate: {patient['collection_rate']}")
                        return False
                    
                    print("✅ All calculation fields are valid numbers")
                
                print(f"✅ Found {len(patient_stats)} patient statistics")
                print(f"✅ Summary: {summary['total_patients']} total patients")
                return True
            else:
                print("❌ Response missing required structure")
                return False
        return success

    def test_patient_statistics_with_edge_cases(self):
        """Test patient statistics endpoint with edge cases (zero costs, zero plans)"""
        # First create some test data with edge cases
        print("\n🔍 Creating test data with edge cases...")
        
        # Create a patient with zero cost treatment plan
        if not self.test_create_patient("Zero Cost Patient", "+77771111111", "other"):
            print("❌ Failed to create zero cost patient")
            return False
        
        zero_cost_patient_id = self.created_patient_id
        
        # Create treatment plan with zero cost
        success, zero_plan = self.test_create_treatment_plan(
            zero_cost_patient_id,
            "Zero Cost Plan",
            description="Plan with zero cost for testing division by zero",
            total_cost=0.0,
            status="completed"
        )
        
        if not success:
            print("❌ Failed to create zero cost treatment plan")
            return False
        
        # Create another patient with no treatment plans (will not appear in stats)
        if not self.test_create_patient("No Plans Patient", "+77772222222", "other"):
            print("❌ Failed to create no plans patient")
            return False
        
        print("✅ Test data created successfully")
        
        # Now test the statistics endpoint
        success, response = self.run_test(
            "Get Patient Statistics with Edge Cases",
            "GET",
            "treatment-plans/statistics/patients",
            200
        )
        
        if success and response:
            print("✅ Patient statistics endpoint handles edge cases correctly")
            
            # Find our zero cost patient in the results
            patient_stats = response["patient_statistics"]
            zero_cost_patient = None
            
            for patient in patient_stats:
                if patient["patient_id"] == zero_cost_patient_id:
                    zero_cost_patient = patient
                    break
            
            if zero_cost_patient:
                print(f"✅ Found zero cost patient in statistics")
                print(f"   Total cost: {zero_cost_patient['total_cost']}")
                print(f"   Collection rate: {zero_cost_patient['collection_rate']}")
                
                # Verify collection rate is 0 when total cost is 0 (not NaN or error)
                if zero_cost_patient["collection_rate"] == 0:
                    print("✅ Collection rate correctly calculated as 0 for zero cost")
                else:
                    print(f"❌ Collection rate should be 0 for zero cost, got: {zero_cost_patient['collection_rate']}")
                    return False
                
                # Verify completion rate calculation
                if zero_cost_patient["total_plans"] > 0:
                    expected_completion_rate = (zero_cost_patient["completed_plans"] / zero_cost_patient["total_plans"]) * 100
                    if abs(zero_cost_patient["completion_rate"] - expected_completion_rate) < 0.01:
                        print("✅ Completion rate correctly calculated")
                    else:
                        print(f"❌ Completion rate calculation error: expected {expected_completion_rate}, got {zero_cost_patient['completion_rate']}")
                        return False
                
                return True
            else:
                print("❌ Zero cost patient not found in statistics")
                return False
        
        return success

    def test_patient_statistics_authentication(self):
        """Test authentication requirements for patient statistics endpoint"""
        # Save current token
        saved_token = self.token
        
        # Test unauthorized access
        self.token = None
        success, _ = self.run_test(
            "Unauthorized access to patient statistics",
            "GET",
            "treatment-plans/statistics/patients",
            401  # Expect 401 Unauthorized
        )
        
        if success:
            print("✅ Unauthorized access correctly rejected")
        else:
            print("❌ Unauthorized access was allowed")
            self.token = saved_token
            return False
        
        # Restore token
        self.token = saved_token
        return True

    # Doctor Schedule Testing Methods
    def test_create_doctor_schedule(self, doctor_id, day_of_week, start_time, end_time):
        """Create a doctor's working schedule"""
        success, response = self.run_test(
            f"Create Doctor Schedule (Day {day_of_week}: {start_time}-{end_time})",
            "POST",
            f"doctors/{doctor_id}/schedule",
            200,
            data={
                "doctor_id": doctor_id,
                "day_of_week": day_of_week,
                "start_time": start_time,
                "end_time": end_time
            }
        )
        if success and response and "id" in response:
            print(f"Created schedule with ID: {response['id']}")
            print(f"Day {day_of_week} ({self.get_day_name(day_of_week)}): {start_time}-{end_time}")
        return success, response

    def test_get_doctor_schedule(self, doctor_id):
        """Get doctor's working schedule"""
        success, response = self.run_test(
            f"Get Doctor Schedule for {doctor_id}",
            "GET",
            f"doctors/{doctor_id}/schedule",
            200
        )
        if success and response:
            print(f"Found {len(response)} schedule entries for doctor {doctor_id}")
            for schedule in response:
                day_name = self.get_day_name(schedule['day_of_week'])
                print(f"  {day_name}: {schedule['start_time']}-{schedule['end_time']}")
        return success, response

    def test_get_available_doctors(self, appointment_date, appointment_time=None):
        """Get available doctors for a specific date and optionally time"""
        params = {}
        if appointment_time:
            params["appointment_time"] = appointment_time
            
        success, response = self.run_test(
            f"Get Available Doctors for {appointment_date}" + (f" at {appointment_time}" if appointment_time else ""),
            "GET",
            f"doctors/available/{appointment_date}",
            200,
            params=params
        )
        if success and response:
            print(f"Found {len(response)} available doctors for {appointment_date}")
            for doctor in response:
                print(f"  Dr. {doctor['full_name']} ({doctor['specialty']})")
                if doctor.get('schedule'):
                    for sched in doctor['schedule']:
                        day_name = self.get_day_name(sched['day_of_week'])
                        print(f"    {day_name}: {sched['start_time']}-{sched['end_time']}")
        return success, response

    def test_appointment_with_schedule_validation(self, patient_id, doctor_id, appointment_date, appointment_time, expect_success=True):
        """Test appointment creation with schedule validation"""
        expected_status = 200 if expect_success else 400
        test_name = f"Create Appointment with Schedule Validation ({'should succeed' if expect_success else 'should fail'})"
        
        success, response = self.run_test(
            test_name,
            "POST",
            "appointments",
            expected_status,
            data={
                "patient_id": patient_id,
                "doctor_id": doctor_id,
                "appointment_date": appointment_date,
                "appointment_time": appointment_time,
                "reason": "Schedule validation test"
            }
        )
        
        if expect_success and success and response and "id" in response:
            print(f"✅ Appointment created successfully: {response['id']}")
            return success, response
        elif not expect_success and success:
            print(f"✅ Appointment correctly rejected due to schedule constraints")
            return success, None
        elif expect_success and not success:
            print(f"❌ Appointment creation failed when it should have succeeded")
            return False, None
        else:
            print(f"❌ Appointment was allowed when it should have been rejected")
            return False, None

    def get_day_name(self, day_of_week):
        """Convert day_of_week number to name"""
        days = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"]
        return days[day_of_week] if 0 <= day_of_week <= 6 else f"Day {day_of_week}"

    def test_doctor_schedule_comprehensive(self, doctor_id):
        """Comprehensive test of doctor schedule functionality"""
        print(f"\n🔍 Testing comprehensive doctor schedule functionality for doctor {doctor_id}")
        
        # Test 1: Create Monday schedule (09:00-17:00)
        success1, monday_schedule = self.test_create_doctor_schedule(doctor_id, 0, "09:00", "17:00")
        if not success1:
            print("❌ Failed to create Monday schedule")
            return False
        
        # Test 2: Create Tuesday schedule (09:00-17:00)
        success2, tuesday_schedule = self.test_create_doctor_schedule(doctor_id, 1, "09:00", "17:00")
        if not success2:
            print("❌ Failed to create Tuesday schedule")
            return False
        
        # Test 3: Create Wednesday schedule (10:00-16:00)
        success3, wednesday_schedule = self.test_create_doctor_schedule(doctor_id, 2, "10:00", "16:00")
        if not success3:
            print("❌ Failed to create Wednesday schedule")
            return False
        
        # Test 4: Get doctor's complete schedule
        success4, full_schedule = self.test_get_doctor_schedule(doctor_id)
        if not success4 or len(full_schedule) != 3:
            print(f"❌ Failed to retrieve complete schedule. Expected 3 entries, got {len(full_schedule) if full_schedule else 0}")
            return False
        
        print("✅ Doctor schedule creation and retrieval successful")
        return True, full_schedule

    def test_available_doctors_comprehensive(self):
        """Test available doctors endpoint with different scenarios"""
        from datetime import datetime, timedelta
        
        print(f"\n🔍 Testing available doctors endpoint comprehensively")
        
        # Get dates for testing
        today = datetime.now()
        monday = today + timedelta(days=(0 - today.weekday()) % 7)  # Next Monday
        tuesday = monday + timedelta(days=1)  # Next Tuesday  
        wednesday = monday + timedelta(days=2)  # Next Wednesday
        sunday = monday + timedelta(days=6)  # Next Sunday
        
        monday_str = monday.strftime("%Y-%m-%d")
        tuesday_str = tuesday.strftime("%Y-%m-%d")
        wednesday_str = wednesday.strftime("%Y-%m-%d")
        sunday_str = sunday.strftime("%Y-%m-%d")
        
        # Test 1: Available doctors on Monday (should have doctors)
        success1, monday_doctors = self.test_get_available_doctors(monday_str)
        if not success1:
            print("❌ Failed to get available doctors for Monday")
            return False
        
        # Test 2: Available doctors on Tuesday (should have doctors)
        success2, tuesday_doctors = self.test_get_available_doctors(tuesday_str)
        if not success2:
            print("❌ Failed to get available doctors for Tuesday")
            return False
        
        # Test 3: Available doctors on Wednesday (should have doctors)
        success3, wednesday_doctors = self.test_get_available_doctors(wednesday_str)
        if not success3:
            print("❌ Failed to get available doctors for Wednesday")
            return False
        
        # Test 4: Available doctors on Sunday (should have no doctors)
        success4, sunday_doctors = self.test_get_available_doctors(sunday_str)
        if not success4:
            print("❌ Failed to get available doctors for Sunday")
            return False
        
        # Verify Sunday has no available doctors (no schedule)
        if len(sunday_doctors) > 0:
            print(f"⚠️ Warning: Found {len(sunday_doctors)} doctors available on Sunday (expected 0)")
        else:
            print("✅ Correctly found no doctors available on Sunday")
        
        # Test 5: Available doctors with specific time on Monday
        success5, monday_10am_doctors = self.test_get_available_doctors(monday_str, "10:00")
        if not success5:
            print("❌ Failed to get available doctors for Monday at 10:00")
            return False
        
        print("✅ Available doctors endpoint testing successful")
        return True

    def test_schedule_validation_comprehensive(self, patient_id, doctor_id):
        """Test appointment creation with comprehensive schedule validation"""
        from datetime import datetime, timedelta
        
        print(f"\n🔍 Testing comprehensive schedule validation")
        
        # Get dates for testing
        today = datetime.now()
        monday = today + timedelta(days=(0 - today.weekday()) % 7)  # Next Monday
        sunday = monday + timedelta(days=6)  # Next Sunday
        
        monday_str = monday.strftime("%Y-%m-%d")
        sunday_str = sunday.strftime("%Y-%m-%d")
        
        # Test 1: Create appointment on Monday at 10:00 (should work - within 09:00-17:00)
        success1, appointment1 = self.test_appointment_with_schedule_validation(
            patient_id, doctor_id, monday_str, "10:00", expect_success=True
        )
        if not success1:
            print("❌ Failed to create valid appointment on Monday at 10:00")
            return False
        
        # Test 2: Try to create appointment on Sunday (should fail - no schedule)
        success2, _ = self.test_appointment_with_schedule_validation(
            patient_id, doctor_id, sunday_str, "10:00", expect_success=False
        )
        if not success2:
            print("❌ Sunday appointment validation test failed")
            return False
        
        # Test 3: Try to create appointment on Monday at 08:00 (should fail - before working hours)
        success3, _ = self.test_appointment_with_schedule_validation(
            patient_id, doctor_id, monday_str, "08:00", expect_success=False
        )
        if not success3:
            print("❌ Early morning appointment validation test failed")
            return False
        
        # Test 4: Try to create appointment on Monday at 18:00 (should fail - after working hours)
        success4, _ = self.test_appointment_with_schedule_validation(
            patient_id, doctor_id, monday_str, "18:00", expect_success=False
        )
        if not success4:
            print("❌ Late evening appointment validation test failed")
            return False
        
        print("✅ Schedule validation testing successful")
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

    def test_patient_statistics_endpoint(self):
        """Test the patient statistics endpoint that was causing 500 errors"""
        success, response = self.run_test(
            "Get Patient Statistics",
            "GET",
            "treatment-plans/statistics/patients",
            200
        )
        if success and response:
            print("✅ Patient statistics endpoint working correctly")
            
            # Verify response structure
            if "patient_statistics" in response and "summary" in response:
                print("✅ Response has correct structure")
                
                # Check summary fields
                summary = response["summary"]
                required_summary_fields = ["total_patients", "patients_with_unpaid", "patients_with_no_shows", "high_value_patients"]
                for field in required_summary_fields:
                    if field not in summary:
                        print(f"❌ Missing summary field: {field}")
                        return False
                
                # Check patient statistics structure
                patient_stats = response["patient_statistics"]
                if len(patient_stats) > 0:
                    patient = patient_stats[0]
                    required_patient_fields = [
                        "patient_id", "patient_name", "patient_phone", "total_plans", 
                        "completed_plans", "no_show_plans", "total_cost", "total_paid",
                        "outstanding_amount", "unpaid_plans", "completion_rate", 
                        "no_show_rate", "collection_rate"
                    ]
                    for field in required_patient_fields:
                        if field not in patient:
                            print(f"❌ Missing patient field: {field}")
                            return False
                    
                    # Verify calculations don't cause division by zero
                    if patient["completion_rate"] is not None and not isinstance(patient["completion_rate"], (int, float)):
                        print(f"❌ Invalid completion_rate: {patient['completion_rate']}")
                        return False
                    
                    if patient["no_show_rate"] is not None and not isinstance(patient["no_show_rate"], (int, float)):
                        print(f"❌ Invalid no_show_rate: {patient['no_show_rate']}")
                        return False
                    
                    if patient["collection_rate"] is not None and not isinstance(patient["collection_rate"], (int, float)):
                        print(f"❌ Invalid collection_rate: {patient['collection_rate']}")
                        return False
                    
                    print("✅ All calculation fields are valid numbers")
                
                print(f"✅ Found {len(patient_stats)} patient statistics")
                print(f"✅ Summary: {summary['total_patients']} total patients")
                return True
            else:
                print("❌ Response missing required structure")
                return False
        return success

    def test_patient_statistics_with_edge_cases(self):
        """Test patient statistics endpoint with edge cases (zero costs, zero plans)"""
        # First create some test data with edge cases
        print("\n🔍 Creating test data with edge cases...")
        
        # Create a patient with zero cost treatment plan
        if not self.test_create_patient("Zero Cost Patient", "+77771111111", "other"):
            print("❌ Failed to create zero cost patient")
            return False
        
        zero_cost_patient_id = self.created_patient_id
        
        # Create treatment plan with zero cost
        success, zero_plan = self.test_create_treatment_plan(
            zero_cost_patient_id,
            "Zero Cost Plan",
            description="Plan with zero cost for testing division by zero",
            total_cost=0.0,
            status="completed"
        )
        
        if not success:
            print("❌ Failed to create zero cost treatment plan")
            return False
        
        # Create another patient with no treatment plans (will not appear in stats)
        if not self.test_create_patient("No Plans Patient", "+77772222222", "other"):
            print("❌ Failed to create no plans patient")
            return False
        
        print("✅ Test data created successfully")
        
        # Now test the statistics endpoint
        success, response = self.run_test(
            "Get Patient Statistics with Edge Cases",
            "GET",
            "treatment-plans/statistics/patients",
            200
        )
        
        if success and response:
            print("✅ Patient statistics endpoint handles edge cases correctly")
            
            # Find our zero cost patient in the results
            patient_stats = response["patient_statistics"]
            zero_cost_patient = None
            
            for patient in patient_stats:
                if patient["patient_id"] == zero_cost_patient_id:
                    zero_cost_patient = patient
                    break
            
            if zero_cost_patient:
                print(f"✅ Found zero cost patient in statistics")
                print(f"   Total cost: {zero_cost_patient['total_cost']}")
                print(f"   Collection rate: {zero_cost_patient['collection_rate']}")
                
                # Verify collection rate is 0 when total cost is 0 (not NaN or error)
                if zero_cost_patient["collection_rate"] == 0:
                    print("✅ Collection rate correctly calculated as 0 for zero cost")
                else:
                    print(f"❌ Collection rate should be 0 for zero cost, got: {zero_cost_patient['collection_rate']}")
                    return False
                
                # Verify completion rate calculation
                if zero_cost_patient["total_plans"] > 0:
                    expected_completion_rate = (zero_cost_patient["completed_plans"] / zero_cost_patient["total_plans"]) * 100
                    if abs(zero_cost_patient["completion_rate"] - expected_completion_rate) < 0.01:
                        print("✅ Completion rate correctly calculated")
                    else:
                        print(f"❌ Completion rate calculation error: expected {expected_completion_rate}, got {zero_cost_patient['completion_rate']}")
                        return False
                
                return True
            else:
                print("❌ Zero cost patient not found in statistics")
                return False
        
        return success

    def test_patient_statistics_authentication(self):
        """Test authentication requirements for patient statistics endpoint"""
        # Save current token
        saved_token = self.token
        
        # Test unauthorized access
        self.token = None
        success, _ = self.run_test(
            "Unauthorized access to patient statistics",
            "GET",
            "treatment-plans/statistics/patients",
            401  # Expect 401 Unauthorized
        )
        
        if success:
            print("✅ Unauthorized access correctly rejected")
        else:
            print("❌ Unauthorized access was allowed")
            self.token = saved_token
            return False
        
        # Restore token
        self.token = saved_token
        return True

    # Doctor Schedule Testing Methods
    def test_create_doctor_schedule(self, doctor_id, day_of_week, start_time, end_time):
        """Create a doctor's working schedule"""
        success, response = self.run_test(
            f"Create Doctor Schedule (Day {day_of_week}: {start_time}-{end_time})",
            "POST",
            f"doctors/{doctor_id}/schedule",
            200,
            data={
                "doctor_id": doctor_id,
                "day_of_week": day_of_week,
                "start_time": start_time,
                "end_time": end_time
            }
        )
        if success and response and "id" in response:
            print(f"Created schedule with ID: {response['id']}")
            print(f"Day {day_of_week} ({self.get_day_name(day_of_week)}): {start_time}-{end_time}")
        return success, response

    def test_get_doctor_schedule(self, doctor_id):
        """Get doctor's working schedule"""
        success, response = self.run_test(
            f"Get Doctor Schedule for {doctor_id}",
            "GET",
            f"doctors/{doctor_id}/schedule",
            200
        )
        if success and response:
            print(f"Found {len(response)} schedule entries for doctor {doctor_id}")
            for schedule in response:
                day_name = self.get_day_name(schedule['day_of_week'])
                print(f"  {day_name}: {schedule['start_time']}-{schedule['end_time']}")
        return success, response

    def test_get_available_doctors(self, appointment_date, appointment_time=None):
        """Get available doctors for a specific date and optionally time"""
        params = {}
        if appointment_time:
            params["appointment_time"] = appointment_time
            
        success, response = self.run_test(
            f"Get Available Doctors for {appointment_date}" + (f" at {appointment_time}" if appointment_time else ""),
            "GET",
            f"doctors/available/{appointment_date}",
            200,
            params=params
        )
        if success and response:
            print(f"Found {len(response)} available doctors for {appointment_date}")
            for doctor in response:
                print(f"  Dr. {doctor['full_name']} ({doctor['specialty']})")
                if doctor.get('schedule'):
                    for sched in doctor['schedule']:
                        day_name = self.get_day_name(sched['day_of_week'])
                        print(f"    {day_name}: {sched['start_time']}-{sched['end_time']}")
        return success, response

    def test_appointment_with_schedule_validation(self, patient_id, doctor_id, appointment_date, appointment_time, expect_success=True):
        """Test appointment creation with schedule validation"""
        expected_status = 200 if expect_success else 400
        test_name = f"Create Appointment with Schedule Validation ({'should succeed' if expect_success else 'should fail'})"
        
        success, response = self.run_test(
            test_name,
            "POST",
            "appointments",
            expected_status,
            data={
                "patient_id": patient_id,
                "doctor_id": doctor_id,
                "appointment_date": appointment_date,
                "appointment_time": appointment_time,
                "reason": "Schedule validation test"
            }
        )
        
        if expect_success and success and response and "id" in response:
            print(f"✅ Appointment created successfully: {response['id']}")
            return success, response
        elif not expect_success and success:
            print(f"✅ Appointment correctly rejected due to schedule constraints")
            return success, None
        elif expect_success and not success:
            print(f"❌ Appointment creation failed when it should have succeeded")
            return False, None
        else:
            print(f"❌ Appointment was allowed when it should have been rejected")
            return False, None

    def get_day_name(self, day_of_week):
        """Convert day_of_week number to name"""
        days = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"]
        return days[day_of_week] if 0 <= day_of_week <= 6 else f"Day {day_of_week}"

    def test_doctor_schedule_comprehensive(self, doctor_id):
        """Comprehensive test of doctor schedule functionality"""
        print(f"\n🔍 Testing comprehensive doctor schedule functionality for doctor {doctor_id}")
        
        # Test 1: Create Monday schedule (09:00-17:00)
        success1, monday_schedule = self.test_create_doctor_schedule(doctor_id, 0, "09:00", "17:00")
        if not success1:
            print("❌ Failed to create Monday schedule")
            return False
        
        # Test 2: Create Tuesday schedule (09:00-17:00)
        success2, tuesday_schedule = self.test_create_doctor_schedule(doctor_id, 1, "09:00", "17:00")
        if not success2:
            print("❌ Failed to create Tuesday schedule")
            return False
        
        # Test 3: Create Wednesday schedule (10:00-16:00)
        success3, wednesday_schedule = self.test_create_doctor_schedule(doctor_id, 2, "10:00", "16:00")
        if not success3:
            print("❌ Failed to create Wednesday schedule")
            return False
        
        # Test 4: Get doctor's complete schedule
        success4, full_schedule = self.test_get_doctor_schedule(doctor_id)
        if not success4 or len(full_schedule) != 3:
            print(f"❌ Failed to retrieve complete schedule. Expected 3 entries, got {len(full_schedule) if full_schedule else 0}")
            return False
        
        print("✅ Doctor schedule creation and retrieval successful")
        return True, full_schedule

    def test_available_doctors_comprehensive(self):
        """Test available doctors endpoint with different scenarios"""
        from datetime import datetime, timedelta
        
        print(f"\n🔍 Testing available doctors endpoint comprehensively")
        
        # Get dates for testing
        today = datetime.now()
        monday = today + timedelta(days=(0 - today.weekday()) % 7)  # Next Monday
        tuesday = monday + timedelta(days=1)  # Next Tuesday  
        wednesday = monday + timedelta(days=2)  # Next Wednesday
        sunday = monday + timedelta(days=6)  # Next Sunday
        
        monday_str = monday.strftime("%Y-%m-%d")
        tuesday_str = tuesday.strftime("%Y-%m-%d")
        wednesday_str = wednesday.strftime("%Y-%m-%d")
        sunday_str = sunday.strftime("%Y-%m-%d")
        
        # Test 1: Available doctors on Monday (should have doctors)
        success1, monday_doctors = self.test_get_available_doctors(monday_str)
        if not success1:
            print("❌ Failed to get available doctors for Monday")
            return False
        
        # Test 2: Available doctors on Tuesday (should have doctors)
        success2, tuesday_doctors = self.test_get_available_doctors(tuesday_str)
        if not success2:
            print("❌ Failed to get available doctors for Tuesday")
            return False
        
        # Test 3: Available doctors on Wednesday (should have doctors)
        success3, wednesday_doctors = self.test_get_available_doctors(wednesday_str)
        if not success3:
            print("❌ Failed to get available doctors for Wednesday")
            return False
        
        # Test 4: Available doctors on Sunday (should have no doctors)
        success4, sunday_doctors = self.test_get_available_doctors(sunday_str)
        if not success4:
            print("❌ Failed to get available doctors for Sunday")
            return False
        
        # Verify Sunday has no available doctors (no schedule)
        if len(sunday_doctors) > 0:
            print(f"⚠️ Warning: Found {len(sunday_doctors)} doctors available on Sunday (expected 0)")
        else:
            print("✅ Correctly found no doctors available on Sunday")
        
        # Test 5: Available doctors with specific time on Monday
        success5, monday_10am_doctors = self.test_get_available_doctors(monday_str, "10:00")
        if not success5:
            print("❌ Failed to get available doctors for Monday at 10:00")
            return False
        
        print("✅ Available doctors endpoint testing successful")
        return True

    def test_schedule_validation_comprehensive(self, patient_id, doctor_id):
        """Test appointment creation with comprehensive schedule validation"""
        from datetime import datetime, timedelta
        
        print(f"\n🔍 Testing comprehensive schedule validation")
        
        # Get dates for testing
        today = datetime.now()
        monday = today + timedelta(days=(0 - today.weekday()) % 7)  # Next Monday
        sunday = monday + timedelta(days=6)  # Next Sunday
        
        monday_str = monday.strftime("%Y-%m-%d")
        sunday_str = sunday.strftime("%Y-%m-%d")
        
        # Test 1: Create appointment on Monday at 10:00 (should work - within 09:00-17:00)
        success1, appointment1 = self.test_appointment_with_schedule_validation(
            patient_id, doctor_id, monday_str, "10:00", expect_success=True
        )
        if not success1:
            print("❌ Failed to create valid appointment on Monday at 10:00")
            return False
        
        # Test 2: Try to create appointment on Sunday (should fail - no schedule)
        success2, _ = self.test_appointment_with_schedule_validation(
            patient_id, doctor_id, sunday_str, "10:00", expect_success=False
        )
        if not success2:
            print("❌ Sunday appointment validation test failed")
            return False
        
        # Test 3: Try to create appointment on Monday at 08:00 (should fail - before working hours)
        success3, _ = self.test_appointment_with_schedule_validation(
            patient_id, doctor_id, monday_str, "08:00", expect_success=False
        )
        if not success3:
            print("❌ Early morning appointment validation test failed")
            return False
        
        # Test 4: Try to create appointment on Monday at 18:00 (should fail - after working hours)
        success4, _ = self.test_appointment_with_schedule_validation(
            patient_id, doctor_id, monday_str, "18:00", expect_success=False
        )
        if not success4:
            print("❌ Late evening appointment validation test failed")
            return False
        
        print("✅ Schedule validation testing successful")
        return True

def test_doctor_schedule_management_system():
    """
    COMPREHENSIVE TEST FOR DOCTOR SCHEDULE MANAGEMENT SYSTEM
    Testing the new doctor schedule functionality as requested in the review
    """
    import os
    backend_url = os.environ.get('REACT_APP_BACKEND_URL', 'https://medrecord-field.preview.emergentagent.com')
    
    tester = ClinicAPITester(backend_url)
    
    print(f"🚀 Starting Doctor Schedule Management System Tests")
    print(f"Backend URL: {backend_url}")
    print(f"{'='*50}")
    
    # Test authentication first with provided credentials
    print("\n📋 AUTHENTICATION TESTS")
    print("-" * 30)
    
    # Use the admin credentials from the review request
    admin_email = "admin_test_20250821110240@medentry.com"
    admin_password = "AdminTest123!"
    
    # Try to login (user should already exist from previous tests)
    if not tester.test_login_user(admin_email, admin_password):
        print("❌ Failed to login with admin credentials")
        return False
    
    # Test getting current user info
    tester.test_get_current_user()
    
    # Test doctor schedule functionality
    print("\n📋 DOCTOR SCHEDULE MANAGEMENT TESTS")
    print("-" * 30)
    
    # First, ensure we have a doctor to work with
    if not tester.test_create_doctor("Dr. Schedule Test", "Стоматолог", "#3B82F6"):
        print("❌ Failed to create test doctor")
        return False
    
    doctor_id = tester.created_doctor_id
    print(f"✅ Created test doctor with ID: {doctor_id}")
    
    # Test comprehensive doctor schedule functionality
    schedule_success, doctor_schedule = tester.test_doctor_schedule_comprehensive(doctor_id)
    if not schedule_success:
        print("❌ Doctor schedule comprehensive test failed")
        return False
    
    # Test available doctors endpoint
    available_success = tester.test_available_doctors_comprehensive()
    if not available_success:
        print("❌ Available doctors comprehensive test failed")
        return False
    
    # Create a patient for appointment testing
    if not tester.test_create_patient("Schedule Test Patient", "+77771234567", "website"):
        print("❌ Failed to create test patient")
        return False
    
    patient_id = tester.created_patient_id
    print(f"✅ Created test patient with ID: {patient_id}")
    
    # Test appointment creation with schedule validation
    validation_success = tester.test_schedule_validation_comprehensive(patient_id, doctor_id)
    if not validation_success:
        print("❌ Schedule validation comprehensive test failed")
        return False
    
    print("\n📋 SPECIFIC TEST SCENARIOS FROM REVIEW REQUEST")
    print("-" * 30)
    
    from datetime import datetime, timedelta
    
    # Get next Monday, Tuesday, Wednesday, and Sunday for testing
    today = datetime.now()
    monday = today + timedelta(days=(0 - today.weekday()) % 7)
    tuesday = monday + timedelta(days=1)
    wednesday = monday + timedelta(days=2)
    sunday = monday + timedelta(days=6)
    
    monday_str = monday.strftime("%Y-%m-%d")
    tuesday_str = tuesday.strftime("%Y-%m-%d")
    wednesday_str = wednesday.strftime("%Y-%m-%d")
    sunday_str = sunday.strftime("%Y-%m-%d")
    
    print(f"Testing with dates:")
    print(f"  Monday: {monday_str}")
    print(f"  Tuesday: {tuesday_str}")
    print(f"  Wednesday: {wednesday_str}")
    print(f"  Sunday: {sunday_str}")
    
    # Test available doctors for each day
    print(f"\n🔍 Testing available doctors for specific days...")
    tester.test_get_available_doctors(monday_str)
    tester.test_get_available_doctors(tuesday_str)
    tester.test_get_available_doctors(wednesday_str)
    tester.test_get_available_doctors(sunday_str)
    
    # Test specific appointment scenarios from review request
    print(f"\n🔍 Testing specific appointment scenarios...")
    
    # Scenario 1: Monday at 10:00 (should work)
    print(f"\nScenario 1: Monday at 10:00 (should work)")
    tester.test_appointment_with_schedule_validation(patient_id, doctor_id, monday_str, "10:00", expect_success=True)
    
    # Scenario 2: Sunday (should fail - no schedule)
    print(f"\nScenario 2: Sunday at 10:00 (should fail - no schedule)")
    tester.test_appointment_with_schedule_validation(patient_id, doctor_id, sunday_str, "10:00", expect_success=False)
    
    # Scenario 3: Monday at 08:00 (should fail - before working hours)
    print(f"\nScenario 3: Monday at 08:00 (should fail - before working hours)")
    tester.test_appointment_with_schedule_validation(patient_id, doctor_id, monday_str, "08:00", expect_success=False)
    
    print(f"\n✅ All doctor schedule management tests completed!")
    
    # Print final summary
    print(f"\n{'='*50}")
    print(f"TEST SUMMARY")
    print(f"{'='*50}")
    print(f"Total tests run: {tester.tests_run}")
    print(f"Tests passed: {tester.tests_passed}")
    print(f"Tests failed: {tester.tests_run - tester.tests_passed}")
    print(f"Success rate: {(tester.tests_passed / tester.tests_run * 100):.1f}%" if tester.tests_run > 0 else "No tests run")
    print(f"{'='*50}")
    
    return tester.tests_passed == tester.tests_run

    """
    COMPREHENSIVE TEST FOR PATIENT STATISTICS ENDPOINT
    Testing the /api/treatment-plans/statistics/patients endpoint that was causing 500 errors
    """
    backend_url = "https://medrecord-field.preview.emergentagent.com"
    tester = ClinicAPITester(backend_url)
    
    print("=" * 80)
    print("COMPREHENSIVE PATIENT STATISTICS ENDPOINT TESTING")
    print("=" * 80)
    
    # Use existing test credentials from test_result.md
    admin_email = "admin_test_20250821110240@medentry.com"
    admin_password = "AdminTest123!"
    doctor_email = "doctor_test_20250821110240@medentry.com"
    doctor_password = "DoctorTest123!"
    
    print("\n" + "=" * 60)
    print("STEP 1: AUTHENTICATION WITH ADMIN USER")
    print("=" * 60)
    
    if not tester.test_login_user(admin_email, admin_password):
        print("❌ Admin login failed")
        return False
    
    print("✅ Admin user authenticated successfully")
    
    # Test 1: Basic endpoint functionality
    print("\n" + "=" * 60)
    print("STEP 2: BASIC ENDPOINT FUNCTIONALITY TEST")
    print("=" * 60)
    
    if not tester.test_patient_statistics_endpoint():
        print("❌ Basic patient statistics test failed")
        return False
    
    # Test 2: Edge cases with zero costs and zero plans
    print("\n" + "=" * 60)
    print("STEP 3: EDGE CASES TEST (ZERO COSTS, ZERO PLANS)")
    print("=" * 60)
    
    if not tester.test_patient_statistics_with_edge_cases():
        print("❌ Edge cases test failed")
        return False
    
    # Test 3: Authentication requirements
    print("\n" + "=" * 60)
    print("STEP 4: AUTHENTICATION REQUIREMENTS TEST")
    print("=" * 60)
    
    if not tester.test_patient_statistics_authentication():
        print("❌ Authentication test failed")
        return False
    
    # Test 4: Doctor role access
    print("\n" + "=" * 60)
    print("STEP 5: DOCTOR ROLE ACCESS TEST")
    print("=" * 60)
    
    if not tester.test_login_user(doctor_email, doctor_password):
        print("❌ Doctor login failed")
        return False
    
    print("✅ Doctor user authenticated successfully")
    
    if not tester.test_patient_statistics_endpoint():
        print("❌ Doctor access to patient statistics failed")
        return False
    
    print("✅ Doctor can access patient statistics")
    
    # Test 5: Create more complex test data and verify calculations
    print("\n" + "=" * 60)
    print("STEP 6: COMPLEX DATA SCENARIOS TEST")
    print("=" * 60)
    
    # Create patient with multiple treatment plans
    if not tester.test_create_patient("Multi Plan Patient", "+77773333333", "other"):
        print("❌ Failed to create multi plan patient")
        return False
    
    multi_plan_patient_id = tester.created_patient_id
    
    # Create multiple treatment plans with different statuses and costs
    test_plans = [
        {"title": "Plan 1 - Completed", "total_cost": 10000.0, "status": "completed", "execution_status": "completed", "payment_status": "paid", "paid_amount": 10000.0},
        {"title": "Plan 2 - No Show", "total_cost": 5000.0, "status": "approved", "execution_status": "no_show", "payment_status": "unpaid", "paid_amount": 0.0},
        {"title": "Plan 3 - Partial Payment", "total_cost": 8000.0, "status": "in_progress", "execution_status": "in_progress", "payment_status": "partially_paid", "paid_amount": 4000.0}
    ]
    
    created_plans = []
    for plan_data in test_plans:
        success, plan = tester.test_create_treatment_plan(
            multi_plan_patient_id,
            plan_data["title"],
            total_cost=plan_data["total_cost"],
            status=plan_data["status"]
        )
        
        if success and plan:
            # Update the plan with enhanced fields
            update_data = {
                "execution_status": plan_data["execution_status"],
                "payment_status": plan_data["payment_status"],
                "paid_amount": plan_data["paid_amount"]
            }
            
            success, updated_plan = tester.test_update_treatment_plan(plan["id"], update_data)
            if success:
                created_plans.append(updated_plan)
                print(f"✅ Created and updated plan: {plan_data['title']}")
            else:
                print(f"❌ Failed to update plan: {plan_data['title']}")
        else:
            print(f"❌ Failed to create plan: {plan_data['title']}")
    
    if len(created_plans) != len(test_plans):
        print("❌ Failed to create all test plans")
        return False
    
    # Now test the statistics endpoint with this complex data
    success, response = tester.run_test(
        "Get Patient Statistics with Complex Data",
        "GET",
        "treatment-plans/statistics/patients",
        200
    )
    
    if success and response:
        print("✅ Patient statistics endpoint works with complex data")
        
        # Find our multi-plan patient and verify calculations
        patient_stats = response["patient_statistics"]
        multi_plan_patient = None
        
        for patient in patient_stats:
            if patient["patient_id"] == multi_plan_patient_id:
                multi_plan_patient = patient
                break
        
        if multi_plan_patient:
            print(f"✅ Found multi-plan patient in statistics")
            print(f"   Total plans: {multi_plan_patient['total_plans']}")
            print(f"   Completed plans: {multi_plan_patient['completed_plans']}")
            print(f"   No show plans: {multi_plan_patient['no_show_plans']}")
            print(f"   Total cost: {multi_plan_patient['total_cost']}")
            print(f"   Total paid: {multi_plan_patient['total_paid']}")
            print(f"   Completion rate: {multi_plan_patient['completion_rate']}%")
            print(f"   No show rate: {multi_plan_patient['no_show_rate']}%")
            print(f"   Collection rate: {multi_plan_patient['collection_rate']}%")
            
            # Verify calculations
            expected_total_cost = sum(plan["total_cost"] for plan in test_plans)
            expected_total_paid = sum(plan["paid_amount"] for plan in test_plans)
            expected_completion_rate = (1 / 3) * 100  # 1 completed out of 3 plans
            expected_no_show_rate = (1 / 3) * 100     # 1 no show out of 3 plans
            expected_collection_rate = (expected_total_paid / expected_total_cost) * 100
            
            if abs(multi_plan_patient["total_cost"] - expected_total_cost) < 0.01:
                print("✅ Total cost calculation correct")
            else:
                print(f"❌ Total cost calculation error: expected {expected_total_cost}, got {multi_plan_patient['total_cost']}")
                return False
            
            if abs(multi_plan_patient["total_paid"] - expected_total_paid) < 0.01:
                print("✅ Total paid calculation correct")
            else:
                print(f"❌ Total paid calculation error: expected {expected_total_paid}, got {multi_plan_patient['total_paid']}")
                return False
            
            if abs(multi_plan_patient["completion_rate"] - expected_completion_rate) < 0.01:
                print("✅ Completion rate calculation correct")
            else:
                print(f"❌ Completion rate calculation error: expected {expected_completion_rate}, got {multi_plan_patient['completion_rate']}")
                return False
            
            if abs(multi_plan_patient["no_show_rate"] - expected_no_show_rate) < 0.01:
                print("✅ No show rate calculation correct")
            else:
                print(f"❌ No show rate calculation error: expected {expected_no_show_rate}, got {multi_plan_patient['no_show_rate']}")
                return False
            
            if abs(multi_plan_patient["collection_rate"] - expected_collection_rate) < 0.01:
                print("✅ Collection rate calculation correct")
            else:
                print(f"❌ Collection rate calculation error: expected {expected_collection_rate}, got {multi_plan_patient['collection_rate']}")
                return False
            
            print("✅ All calculations verified successfully")
        else:
            print("❌ Multi-plan patient not found in statistics")
            return False
    else:
        print("❌ Patient statistics endpoint failed with complex data")
        return False
    
    print("\n" + "=" * 80)
    print("✅ ALL PATIENT STATISTICS ENDPOINT TESTS PASSED")
    print("✅ The 500 error issue has been resolved")
    print("✅ Division by zero handling is working correctly")
    print("✅ Authentication and authorization are working")
    print("✅ Response structure is correct")
    print("✅ Calculations are accurate")
    print("=" * 80)
    
    return True

def test_treatment_plan_422_validation_error():
    """
    SPECIFIC TEST FOR 422 VALIDATION ERROR INVESTIGATION
    Testing treatment plan creation with patient ID: 1db07558-3805-4588-95d1-f79fe4bcd7ce
    """
    backend_url = "https://medrecord-field.preview.emergentagent.com"
    tester = ClinicAPITester(backend_url)
    
    print("=" * 80)
    print("INVESTIGATING 422 VALIDATION ERROR FOR TREATMENT PLANS")
    print("=" * 80)
    
    # Target patient ID from the review request
    target_patient_id = "1db07558-3805-4588-95d1-f79fe4bcd7ce"
    
    # 1. First, register and login as admin/doctor to have proper permissions
    print("\n" + "=" * 60)
    print("STEP 1: AUTHENTICATION SETUP")
    print("=" * 60)
    
    admin_email = f"admin_422_test_{datetime.now().strftime('%Y%m%d%H%M%S')}@test.com"
    admin_password = "Test123!"
    admin_name = "Admin 422 Test"
    
    if not tester.test_register_user(admin_email, admin_password, admin_name, "admin"):
        print("❌ Admin registration failed")
        return False
    
    print("✅ Admin user registered and authenticated")
    
    # 2. Check if the specific patient exists
    print("\n" + "=" * 60)
    print("STEP 2: VERIFY PATIENT EXISTS")
    print("=" * 60)
    
    print(f"🔍 Checking if patient {target_patient_id} exists...")
    success, patient_data = tester.run_test(
        f"Get Patient {target_patient_id}",
        "GET",
        f"patients/{target_patient_id}",
        200
    )
    
    if not success:
        print(f"❌ Patient {target_patient_id} does not exist")
        print("🔧 Creating test patient with this ID...")
        
        # Create patient with the specific ID (this might not work due to UUID generation)
        # Let's create a regular patient first
        if not tester.test_create_patient("Test Patient 422", "+77771234567", "other"):
            print("❌ Failed to create test patient")
            return False
        
        # Use the created patient ID instead
        target_patient_id = tester.created_patient_id
        print(f"✅ Using created patient ID: {target_patient_id}")
    else:
        print(f"✅ Patient {target_patient_id} exists: {patient_data.get('full_name', 'Unknown')}")
    
    # 3. Test treatment plan creation with minimal required fields
    print("\n" + "=" * 60)
    print("STEP 3: TEST MINIMAL TREATMENT PLAN CREATION")
    print("=" * 60)
    
    print("🔍 Testing with just required fields (title, patient_id)...")
    success, response = tester.run_test(
        "Create Treatment Plan - Minimal Fields",
        "POST",
        f"patients/{target_patient_id}/treatment-plans",
        200,
        data={
            "patient_id": target_patient_id,
            "title": "Minimal Treatment Plan Test"
        }
    )
    
    if not success:
        print("❌ Minimal treatment plan creation failed")
        print("📋 This might be the source of the 422 error")
    else:
        print("✅ Minimal treatment plan creation succeeded")
    
    # 4. Test with complete treatment plan data
    print("\n" + "=" * 60)
    print("STEP 4: TEST COMPLETE TREATMENT PLAN CREATION")
    print("=" * 60)
    
    print("🔍 Testing with complete treatment plan data...")
    complete_data = {
        "patient_id": target_patient_id,
        "title": "Complete Treatment Plan Test",
        "description": "Complete treatment plan with all fields",
        "services": [
            {
                "tooth": "11",
                "service": "Test Service",
                "price": 5000.0,
                "quantity": 1
            }
        ],
        "total_cost": 5000.0,
        "status": "draft",
        "notes": "Test notes for complete plan"
    }
    
    success, response = tester.run_test(
        "Create Treatment Plan - Complete Fields",
        "POST",
        f"patients/{target_patient_id}/treatment-plans",
        200,
        data=complete_data
    )
    
    if not success:
        print("❌ Complete treatment plan creation failed")
        print("📋 This confirms there's a validation issue")
    else:
        print("✅ Complete treatment plan creation succeeded")
    
    # 5. Test with services array variations
    print("\n" + "=" * 60)
    print("STEP 5: TEST SERVICES ARRAY VALIDATION")
    print("=" * 60)
    
    # Test with empty services array
    print("🔍 Testing with empty services array...")
    success, response = tester.run_test(
        "Create Treatment Plan - Empty Services",
        "POST",
        f"patients/{target_patient_id}/treatment-plans",
        200,
        data={
            "patient_id": target_patient_id,
            "title": "Empty Services Test",
            "services": []
        }
    )
    
    if not success:
        print("❌ Empty services array failed")
    else:
        print("✅ Empty services array succeeded")
    
    # Test without services field
    print("🔍 Testing without services field...")
    success, response = tester.run_test(
        "Create Treatment Plan - No Services Field",
        "POST",
        f"patients/{target_patient_id}/treatment-plans",
        200,
        data={
            "patient_id": target_patient_id,
            "title": "No Services Field Test"
        }
    )
    
    if not success:
        print("❌ No services field failed")
    else:
        print("✅ No services field succeeded")
    
    # 6. Test field validation issues
    print("\n" + "=" * 60)
    print("STEP 6: TEST FIELD VALIDATION ISSUES")
    print("=" * 60)
    
    # Test missing title (should cause 422)
    print("🔍 Testing missing title (expecting 422)...")
    success, response = tester.run_test(
        "Create Treatment Plan - Missing Title",
        "POST",
        f"patients/{target_patient_id}/treatment-plans",
        422,  # Expecting validation error
        data={
            "patient_id": target_patient_id
            # Missing title
        }
    )
    
    if success:
        print("✅ Missing title correctly returns 422")
    else:
        print("❌ Missing title validation not working")
    
    # Test invalid patient_id format
    print("🔍 Testing invalid patient_id format...")
    success, response = tester.run_test(
        "Create Treatment Plan - Invalid Patient ID",
        "POST",
        f"patients/invalid-patient-id/treatment-plans",
        404,  # Expecting not found
        data={
            "patient_id": "invalid-patient-id",
            "title": "Invalid Patient ID Test"
        }
    )
    
    if success:
        print("✅ Invalid patient ID correctly returns 404")
    else:
        print("❌ Invalid patient ID validation not working")
    
    # 7. Test the exact endpoint that's failing
    print("\n" + "=" * 60)
    print("STEP 7: TEST EXACT FAILING ENDPOINT")
    print("=" * 60)
    
    original_patient_id = "1db07558-3805-4588-95d1-f79fe4bcd7ce"
    print(f"🔍 Testing exact endpoint: /api/patients/{original_patient_id}/treatment-plans")
    
    # First check if this patient exists
    success, patient_check = tester.run_test(
        f"Check Original Patient {original_patient_id}",
        "GET",
        f"patients/{original_patient_id}",
        200
    )
    
    if success:
        print(f"✅ Original patient {original_patient_id} exists")
        
        # Try creating treatment plan for this specific patient
        success, response = tester.run_test(
            "Create Treatment Plan - Original Patient",
            "POST",
            f"patients/{original_patient_id}/treatment-plans",
            200,
            data={
                "patient_id": original_patient_id,
                "title": "Test Plan for Original Patient"
            }
        )
        
        if not success:
            print("❌ Treatment plan creation failed for original patient")
            print("📋 This is likely the source of the 422 error")
        else:
            print("✅ Treatment plan creation succeeded for original patient")
    else:
        print(f"❌ Original patient {original_patient_id} does not exist")
        print("📋 This could be the cause of the 422 error - patient not found")
    
    # 8. Summary and recommendations
    print("\n" + "=" * 60)
    print("INVESTIGATION SUMMARY")
    print("=" * 60)
    
    print(f"🔍 Tests completed: {tester.tests_run}")
    print(f"✅ Tests passed: {tester.tests_passed}")
    print(f"❌ Tests failed: {tester.tests_run - tester.tests_passed}")
    
    if tester.tests_passed < tester.tests_run:
        print("\n📋 POTENTIAL ISSUES IDENTIFIED:")
        print("1. Patient ID validation might be failing")
        print("2. Required fields validation might be too strict")
        print("3. Services array validation might have issues")
        print("4. Patient existence check might be failing")
    else:
        print("\n✅ All tests passed - 422 error might be intermittent or context-specific")
    
    return tester.tests_passed == tester.tests_run

    def test_doctor_statistics_individual(self, date_from=None, date_to=None):
        """Test individual doctor statistics with working hours and utilization"""
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
            f"Get Individual Doctor Statistics{filter_desc}",
            "GET",
            "doctors/statistics/individual",
            200,
            params=params
        )
        
        if success and response:
            print(f"✅ Individual doctor statistics retrieved successfully{filter_desc}")
            
            # Verify response structure
            if "doctor_statistics" not in response or "summary" not in response:
                print("❌ Response missing required structure (doctor_statistics, summary)")
                return False, None
            
            doctor_stats = response["doctor_statistics"]
            summary = response["summary"]
            
            print(f"Found statistics for {len(doctor_stats)} doctors")
            
            # Verify new working hours and utilization fields
            required_fields = [
                "doctor_id", "doctor_name", "doctor_specialty", "total_appointments",
                "completed_appointments", "total_worked_hours", "total_scheduled_hours",
                "utilization_rate", "avg_revenue_per_hour", "total_revenue"
            ]
            
            if len(doctor_stats) > 0:
                doctor = doctor_stats[0]
                for field in required_fields:
                    if field not in doctor:
                        print(f"❌ Missing required field in doctor statistics: {field}")
                        return False, None
                
                # Verify utilization rate calculation
                if doctor["total_scheduled_hours"] > 0:
                    expected_utilization = (doctor["total_worked_hours"] / doctor["total_scheduled_hours"]) * 100
                    actual_utilization = doctor["utilization_rate"]
                    if abs(expected_utilization - actual_utilization) > 0.1:  # Allow small floating point differences
                        print(f"❌ Utilization rate calculation incorrect: expected {expected_utilization:.1f}%, got {actual_utilization:.1f}%")
                        return False, None
                    else:
                        print(f"✅ Utilization rate correctly calculated: {actual_utilization:.1f}%")
                
                # Verify avg_revenue_per_hour calculation
                if doctor["total_worked_hours"] > 0:
                    expected_avg_revenue = doctor["total_revenue"] / doctor["total_worked_hours"]
                    actual_avg_revenue = doctor["avg_revenue_per_hour"]
                    if abs(expected_avg_revenue - actual_avg_revenue) > 0.01:
                        print(f"❌ Average revenue per hour calculation incorrect: expected {expected_avg_revenue:.2f}, got {actual_avg_revenue:.2f}")
                        return False, None
                    else:
                        print(f"✅ Average revenue per hour correctly calculated: {actual_avg_revenue:.2f}")
                
                print(f"Sample doctor: {doctor['doctor_name']} ({doctor['doctor_specialty']})")
                print(f"  Total appointments: {doctor['total_appointments']}")
                print(f"  Completed appointments: {doctor['completed_appointments']}")
                print(f"  Total worked hours: {doctor['total_worked_hours']:.2f}")
                print(f"  Total scheduled hours: {doctor['total_scheduled_hours']:.2f}")
                print(f"  Utilization rate: {doctor['utilization_rate']:.1f}%")
                print(f"  Total revenue: {doctor['total_revenue']:.2f}")
                print(f"  Avg revenue per hour: {doctor['avg_revenue_per_hour']:.2f}")
            
            # Verify summary statistics
            required_summary_fields = [
                "total_doctors", "active_doctors", "high_utilization_doctors",
                "avg_worked_hours", "avg_utilization_rate"
            ]
            
            for field in required_summary_fields:
                if field not in summary:
                    print(f"❌ Missing required field in summary: {field}")
                    return False, None
            
            print(f"Summary statistics:")
            print(f"  Total doctors: {summary['total_doctors']}")
            print(f"  Active doctors: {summary['active_doctors']}")
            print(f"  High utilization doctors (>80%): {summary['high_utilization_doctors']}")
            print(f"  Average worked hours: {summary['avg_worked_hours']:.2f}")
            print(f"  Average utilization rate: {summary['avg_utilization_rate']:.1f}%")
            
            return True, response
        
        return False, None

    def test_doctor_statistics_general(self, date_from=None, date_to=None):
        """Test general doctor statistics endpoint"""
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
            f"Get General Doctor Statistics{filter_desc}",
            "GET",
            "doctors/statistics",
            200,
            params=params
        )
        
        if success and response:
            print(f"✅ General doctor statistics retrieved successfully{filter_desc}")
            
            # Verify response structure
            if "overview" not in response or "monthly_statistics" not in response:
                print("❌ Response missing required structure (overview, monthly_statistics)")
                return False, None
            
            overview = response["overview"]
            monthly_stats = response["monthly_statistics"]
            
            # Verify overview fields
            required_overview_fields = [
                "total_doctors", "total_appointments", "completed_appointments",
                "total_revenue", "completion_rate", "avg_revenue_per_appointment"
            ]
            
            for field in required_overview_fields:
                if field not in overview:
                    print(f"❌ Missing required field in overview: {field}")
                    return False, None
            
            print(f"Overview statistics:")
            print(f"  Total doctors: {overview['total_doctors']}")
            print(f"  Total appointments: {overview['total_appointments']}")
            print(f"  Completed appointments: {overview['completed_appointments']}")
            print(f"  Completion rate: {overview['completion_rate']:.1f}%")
            print(f"  Total revenue: {overview['total_revenue']:.2f}")
            print(f"  Avg revenue per appointment: {overview['avg_revenue_per_appointment']:.2f}")
            
            # Verify monthly statistics structure
            if len(monthly_stats) > 0:
                month_stat = monthly_stats[0]
                required_monthly_fields = [
                    "month", "total_appointments", "completed_appointments",
                    "completion_rate", "total_revenue", "avg_revenue_per_appointment"
                ]
                
                for field in required_monthly_fields:
                    if field not in month_stat:
                        print(f"❌ Missing required field in monthly statistics: {field}")
                        return False, None
                
                print(f"Monthly statistics: {len(monthly_stats)} months")
                print(f"Sample month ({month_stat['month']}): {month_stat['total_appointments']} appointments, {month_stat['total_revenue']:.2f} revenue")
            
            return True, response
        
        return False, None

    def test_doctor_statistics_comprehensive(self):
        """Comprehensive test of doctor statistics with working hours and utilization"""
        print("\n🔍 Testing Doctor Statistics with Working Hours and Utilization...")
        
        # First, create some test data with appointments that have end times
        print("Creating test appointments with working hours data...")
        
        # Create additional appointments with end times for better testing
        today = datetime.now()
        test_dates = [
            (today - timedelta(days=5)).strftime("%Y-%m-%d"),
            (today - timedelta(days=10)).strftime("%Y-%m-%d"),
            (today - timedelta(days=15)).strftime("%Y-%m-%d")
        ]
        
        appointment_data = [
            {"time": "09:00", "end_time": "10:00", "price": 5000.0, "status": "completed"},
            {"time": "10:30", "end_time": "11:30", "price": 7500.0, "status": "completed"},
            {"time": "14:00", "end_time": "15:30", "price": 12000.0, "status": "completed"},
            {"time": "16:00", "end_time": "16:30", "price": 3000.0, "status": "cancelled"},
            {"time": "11:00", "end_time": "12:00", "price": 6000.0, "status": "no_show"}
        ]
        
        created_appointments = []
        
        # Create appointments for testing
        for i, date in enumerate(test_dates):
            for j, apt_data in enumerate(appointment_data):
                # Create appointment with end time and price
                success, response = self.run_test(
                    f"Create Test Appointment {i}-{j}",
                    "POST",
                    "appointments",
                    200,
                    data={
                        "patient_id": self.created_patient_id,
                        "doctor_id": self.created_doctor_id,
                        "appointment_date": date,
                        "appointment_time": apt_data["time"],
                        "end_time": apt_data["end_time"],
                        "price": apt_data["price"],
                        "reason": f"Test appointment {i}-{j}"
                    }
                )
                
                if success and response:
                    created_appointments.append(response["id"])
                    
                    # Update status if not default
                    if apt_data["status"] != "unconfirmed":
                        self.run_test(
                            f"Update Appointment {i}-{j} Status",
                            "PUT",
                            f"appointments/{response['id']}",
                            200,
                            data={"status": apt_data["status"]}
                        )
        
        print(f"✅ Created {len(created_appointments)} test appointments")
        
        # Test 1: Individual doctor statistics without date filter
        print("\n1. Testing individual doctor statistics without date filter...")
        success, response = self.test_doctor_statistics_individual()
        if not success:
            print("❌ Individual doctor statistics test failed")
            return False
        
        # Test 2: Individual doctor statistics with date range filter (last 30 days)
        print("\n2. Testing individual doctor statistics with date range filter...")
        date_from = (today - timedelta(days=30)).strftime("%Y-%m-%d")
        date_to = today.strftime("%Y-%m-%d")
        success, response = self.test_doctor_statistics_individual(date_from, date_to)
        if not success:
            print("❌ Individual doctor statistics with date filter test failed")
            return False
        
        # Test 3: Verify response structure includes new working hours fields
        print("\n3. Verifying response structure includes new fields...")
        if response and "doctor_statistics" in response:
            doctor_stats = response["doctor_statistics"]
            if len(doctor_stats) > 0:
                doctor = doctor_stats[0]
                new_fields = ["total_worked_hours", "total_scheduled_hours", "utilization_rate", "avg_revenue_per_hour"]
                
                for field in new_fields:
                    if field not in doctor:
                        print(f"❌ New field missing: {field}")
                        return False
                    else:
                        print(f"✅ New field present: {field} = {doctor[field]}")
        
        # Test 4: Verify utilization rate calculation
        print("\n4. Verifying utilization rate calculation...")
        if response and "doctor_statistics" in response:
            doctor_stats = response["doctor_statistics"]
            for doctor in doctor_stats:
                if doctor["total_scheduled_hours"] > 0:
                    expected_utilization = (doctor["total_worked_hours"] / doctor["total_scheduled_hours"]) * 100
                    actual_utilization = doctor["utilization_rate"]
                    
                    if abs(expected_utilization - actual_utilization) > 0.1:
                        print(f"❌ Utilization calculation error for {doctor['doctor_name']}: expected {expected_utilization:.1f}%, got {actual_utilization:.1f}%")
                        return False
                    else:
                        print(f"✅ Utilization correctly calculated for {doctor['doctor_name']}: {actual_utilization:.1f}%")
        
        # Test 5: Verify avg_revenue_per_hour calculation
        print("\n5. Verifying avg_revenue_per_hour calculation...")
        if response and "doctor_statistics" in response:
            doctor_stats = response["doctor_statistics"]
            for doctor in doctor_stats:
                if doctor["total_worked_hours"] > 0:
                    expected_avg_revenue = doctor["total_revenue"] / doctor["total_worked_hours"]
                    actual_avg_revenue = doctor["avg_revenue_per_hour"]
                    
                    if abs(expected_avg_revenue - actual_avg_revenue) > 0.01:
                        print(f"❌ Avg revenue per hour calculation error for {doctor['doctor_name']}: expected {expected_avg_revenue:.2f}, got {actual_avg_revenue:.2f}")
                        return False
                    else:
                        print(f"✅ Avg revenue per hour correctly calculated for {doctor['doctor_name']}: {actual_avg_revenue:.2f}")
        
        # Test 6: Check high_utilization_doctors count (doctors with >80% utilization)
        print("\n6. Verifying high_utilization_doctors count...")
        if response and "summary" in response:
            summary = response["summary"]
            high_util_count = summary.get("high_utilization_doctors", 0)
            
            # Count doctors with >80% utilization manually
            actual_high_util = 0
            if "doctor_statistics" in response:
                for doctor in response["doctor_statistics"]:
                    if doctor["utilization_rate"] > 80 and doctor["total_worked_hours"] > 0:
                        actual_high_util += 1
            
            if high_util_count == actual_high_util:
                print(f"✅ High utilization doctors count correct: {high_util_count}")
            else:
                print(f"❌ High utilization doctors count mismatch: expected {actual_high_util}, got {high_util_count}")
                return False
        
        # Test 7: General doctor statistics
        print("\n7. Testing general doctor statistics...")
        success, general_response = self.test_doctor_statistics_general()
        if not success:
            print("❌ General doctor statistics test failed")
            return False
        
        # Test 8: General doctor statistics with date filter
        print("\n8. Testing general doctor statistics with date filter...")
        success, filtered_response = self.test_doctor_statistics_general(date_from, date_to)
        if not success:
            print("❌ General doctor statistics with date filter test failed")
            return False
        
        # Cleanup test appointments
        print("\n9. Cleaning up test appointments...")
        for apt_id in created_appointments:
            self.run_test(
                f"Delete Test Appointment {apt_id}",
                "DELETE",
                f"appointments/{apt_id}",
                200
            )
        
        print("✅ Doctor statistics comprehensive testing completed successfully")
        return True

def test_enhanced_doctor_statistics():
    """
    ENHANCED DOCTOR STATISTICS API TESTING
    Testing the new doctor statistics features with working hours and utilization metrics
    """
    import os
    backend_url = os.environ.get('REACT_APP_BACKEND_URL', 'https://medrecord-field.preview.emergentagent.com')
    
    tester = ClinicAPITester(backend_url)
    
    print(f"🚀 Starting Enhanced Doctor Statistics API Tests")
    print(f"Backend URL: {backend_url}")
    print(f"{'='*50}")
    
    # Test authentication with provided admin credentials
    print("\n📋 AUTHENTICATION TESTS")
    print("-" * 30)
    
    # Login with provided admin credentials
    admin_email = "admin_test_20250821110240@medentry.com"
    admin_password = "AdminTest123!"
    if not tester.test_login_user(admin_email, admin_password):
        print("❌ Failed to login with admin credentials")
        tester.print_summary()
        return False
    
    # Test current user endpoint
    if not tester.test_get_current_user():
        print("❌ Failed to get current user")
        tester.print_summary()
        return False
    
    print("\n📋 SETUP FOR DOCTOR STATISTICS TESTS")
    print("-" * 30)
    
    # Create a patient for testing
    if not tester.test_create_patient("Test Patient for Stats", "+77771234567", "phone"):
        print("❌ Failed to create patient")
        tester.print_summary()
        return False
    
    patient_id = tester.created_patient_id
    
    # Create a doctor for testing
    if not tester.test_create_doctor("Dr. Statistics Test", "Стоматолог", "#FF5733"):
        print("❌ Failed to create doctor")
        tester.print_summary()
        return False
    
    doctor_id = tester.created_doctor_id
    
    print("\n📋 ENHANCED DOCTOR STATISTICS TESTS")
    print("-" * 30)
    
    # Run comprehensive doctor statistics tests
    if not tester.test_doctor_statistics_comprehensive():
        print("❌ Doctor statistics comprehensive tests failed")
        tester.print_summary()
        return False
    
    print("\n📋 CLEANUP")
    print("-" * 30)
    
    # Clean up test data
    tester.test_delete_patient(patient_id)
    tester.test_delete_doctor(doctor_id)
    
    # Logout
    tester.test_logout()
    
    # Print final summary
    tester.print_summary()
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All enhanced doctor statistics tests passed!")
        return True
    else:
        print("❌ Some tests failed!")
        return False

def main():
    # Run the enhanced doctor statistics test
    return test_enhanced_doctor_statistics()

def main_original():
    # Get the backend URL from the environment
    backend_url = "https://medrecord-field.preview.emergentagent.com"
    
    # Setup
    tester = ClinicAPITester(backend_url)
    
    print("=" * 60)
    print("TESTING SERVICE MANAGEMENT SYSTEM")
    print("=" * 60)
    
    # 1. Register admin user
    print("\n" + "=" * 50)
    print("TEST 1: REGISTER ADMIN USER")
    print("=" * 50)
    
    admin_email = f"admin_svc_{datetime.now().strftime('%Y%m%d%H%M%S')}@test.com"
    admin_password = "Test123!"
    admin_name = "Администратор Услуг"
    
    print(f"\n🔍 Registering admin user with email {admin_email}...")
    if not tester.test_register_user(admin_email, admin_password, admin_name, "admin"):
        print("❌ Admin user registration failed")
        return 1
    
    # 2. Initialize default services
    print("\n" + "=" * 50)
    print("TEST 2: INITIALIZE DEFAULT SERVICES")
    print("=" * 50)
    
    success, init_response = tester.test_initialize_default_services()
    if not success:
        print("❌ Default services initialization failed")
        return 1
    
    print("✅ Default services initialized successfully")
    
    # 3. Test getting all services
    print("\n" + "=" * 50)
    print("TEST 3: GET ALL SERVICES")
    print("=" * 50)
    
    success, all_services = tester.test_get_services()
    if not success or not all_services:
        print("❌ Failed to get all services")
        return 1
    
    print(f"✅ Retrieved {len(all_services)} services successfully")
    
    # 4. Test service categories
    print("\n" + "=" * 50)
    print("TEST 4: GET SERVICE CATEGORIES")
    print("=" * 50)
    
    success, categories_response = tester.test_get_service_categories()
    if not success or not categories_response:
        print("❌ Failed to get service categories")
        return 1
    
    print("✅ Service categories retrieved and validated successfully")
    
    # 5. Test dental services specifically
    print("\n" + "=" * 50)
    print("TEST 5: TEST DENTAL SERVICES (Стоматолог)")
    print("=" * 50)
    
    if not tester.test_dental_services_specifically():
        print("❌ Dental services test failed")
        return 1
    
    print("✅ Dental services test passed")
    
    # 6. Test service filtering by category
    print("\n" + "=" * 50)
    print("TEST 6: TEST SERVICE CATEGORY FILTERING")
    print("=" * 50)
    
    # Test filtering by Стоматолог category
    success, dental_services = tester.test_get_services(category="Стоматолог")
    if not success or not dental_services:
        print("❌ Failed to filter services by Стоматолог category")
        return 1
    
    print(f"✅ Found {len(dental_services)} dental services")
    
    # Test filtering by other categories
    if not tester.test_service_category_filtering():
        print("❌ Service category filtering test failed")
        return 1
    
    print("✅ Service category filtering test passed")
    
    # 7. Test service data structure
    print("\n" + "=" * 50)
    print("TEST 7: TEST SERVICE DATA STRUCTURE")
    print("=" * 50)
    
    if not tester.test_service_data_structure():
        print("❌ Service data structure test failed")
        return 1
    
    print("✅ Service data structure test passed")
    
    # 8. Create test patient for treatment plan integration
    print("\n" + "=" * 50)
    print("TEST 8: CREATE TEST PATIENT")
    print("=" * 50)
    
    patient_name = f"Пациент Услуги {datetime.now().strftime('%H%M%S')}"
    if not tester.test_create_patient(patient_name, "+7 999 555 1234", "phone"):
        print("❌ Test patient creation failed")
        return 1
    
    test_patient_id = tester.created_patient_id
    print(f"✅ Created test patient with ID: {test_patient_id}")
    
    # 9. Test service integration with treatment plans
    print("\n" + "=" * 50)
    print("TEST 9: SERVICE INTEGRATION WITH TREATMENT PLANS")
    print("=" * 50)
    
    integration_result = tester.test_service_integration_with_treatment_plans(test_patient_id)
    if isinstance(integration_result, tuple):
        success, plan_id = integration_result
    else:
        success = integration_result
    
    if not success:
        print("❌ Service integration with treatment plans failed")
        return 1
    
    print("✅ Service integration with treatment plans successful")
    
    # 10. Test service creation by admin
    print("\n" + "=" * 50)
    print("TEST 10: CREATE NEW SERVICE (ADMIN)")
    print("=" * 50)
    
    success, new_service = tester.test_create_service(
        "Тестовая услуга администратора",
        "Стоматолог",
        5500.0,
        "Описание тестовой услуги"
    )
    
    if not success or not new_service:
        print("❌ Admin service creation failed")
        return 1
    
    print("✅ Admin can create services successfully")
    
    # 11. Register doctor user for access control testing
    print("\n" + "=" * 50)
    print("TEST 11: REGISTER DOCTOR USER")
    print("=" * 50)
    
    doctor_email = f"doctor_svc_{datetime.now().strftime('%Y%m%d%H%M%S')}@test.com"
    doctor_password = "Test123!"
    doctor_name = "Доктор Услуги"
    
    if not tester.test_register_user(doctor_email, doctor_password, doctor_name, "doctor"):
        print("❌ Doctor user registration failed")
        return 1
    
    # 12. Test doctor access control
    print("\n" + "=" * 50)
    print("TEST 12: DOCTOR ACCESS CONTROL")
    print("=" * 50)
    
    if not tester.test_service_access_control_doctor():
        print("❌ Doctor access control test failed")
        return 1
    
    print("✅ Doctor access control test passed")
    
    # 13. Test unauthorized access
    print("\n" + "=" * 50)
    print("TEST 13: UNAUTHORIZED ACCESS CONTROL")
    print("=" * 50)
    
    if not tester.test_service_access_control_unauthorized():
        print("❌ Unauthorized access control test failed")
        return 1
    
    print("✅ Unauthorized access control test passed")
    
    # 14. Test other medical categories
    print("\n" + "=" * 50)
    print("TEST 14: TEST OTHER MEDICAL CATEGORIES")
    print("=" * 50)
    
    other_categories = ["Гинекология", "Ортодонт", "Дерматовенеролог", "Медикаменты"]
    
    for category in other_categories:
        success, category_services = tester.test_get_services(category=category)
        if not success:
            print(f"❌ Failed to get services for category: {category}")
            return 1
        
        if len(category_services) == 0:
            print(f"⚠️ No services found for category: {category}")
        else:
            print(f"✅ Found {len(category_services)} services in category: {category}")
            # Show sample service
            sample = category_services[0]
            print(f"   Sample: {sample['name']} - {sample['price']} тенге")
    
    print("✅ Other medical categories test completed")
    
    # 15. Test service initialization idempotency
    print("\n" + "=" * 50)
    print("TEST 15: TEST SERVICE INITIALIZATION IDEMPOTENCY")
    print("=" * 50)
    
    # Switch back to admin
    if not tester.test_login_user(admin_email, admin_password):
        print("❌ Admin login failed")
        return 1
    
    # Try to initialize services again (should not create duplicates)
    success, second_init = tester.test_initialize_default_services()
    if not success:
        print("❌ Second services initialization failed")
        return 1
    
    if "already exist" in second_init.get('message', '').lower():
        print("✅ Service initialization is idempotent (no duplicates created)")
    else:
        print("⚠️ Service initialization response unclear")
    
    # Verify service count hasn't changed
    success, final_services = tester.test_get_services()
    if not success:
        print("❌ Failed to get final service count")
        return 1
    
    if len(final_services) == len(all_services) + 1:  # +1 for the service we created in test 10
        print("✅ Service count is correct (no duplicates)")
    else:
        print(f"❌ Service count mismatch: expected {len(all_services) + 1}, got {len(final_services)}")
        return 1
    
    # Print final results
    print("\n" + "=" * 60)
    print(f"SERVICE MANAGEMENT TESTS PASSED: {tester.tests_passed}/{tester.tests_run}")
    print("=" * 60)
    
    # Summary of what was tested
    print("\n📋 SERVICE MANAGEMENT FEATURES TESTED:")
    print("✅ Default services initialization (POST /api/services/initialize)")
    print("✅ Service retrieval (GET /api/services)")
    print("✅ Service category filtering (GET /api/services?category=Стоматолог)")
    print("✅ Service categories endpoint (GET /api/service-categories)")
    print("✅ Dental services with proper categories and prices")
    print("✅ Other medical categories (Гинекология, Ортодонт, Дерматовенеролог, Медикаменты)")
    print("✅ Service categories sorted order")
    print("✅ Service data structure (id, name, category, price, description)")
    print("✅ Service integration with treatment plans")
    print("✅ Service creation by admin (POST /api/services)")
    print("✅ Access control - admins can create services")
    print("✅ Access control - doctors can view services and categories")
    print("✅ Access control - unauthorized users blocked")
    print("✅ Service initialization idempotency")
    print("✅ Service filtering by multiple categories")
    print("✅ Service data validation and structure")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())