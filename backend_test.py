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
        data = {
            "patient_id": patient_id,
            "diagnosis_name": diagnosis_name
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
        data = {
            "patient_id": patient_id,
            "medication_name": medication_name,
            "dosage": dosage,
            "frequency": frequency
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
    backend_url = "https://7d433966-f30b-4b81-bfd7-cc9019b064af.preview.emergentagent.com"
    
    # Setup
    tester = ClinicAPITester(backend_url)
    
    # Get today's and tomorrow's date for appointments in ISO format (YYYY-MM-DD)
    today = datetime.now().strftime("%Y-%m-%d")
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    
    print("=" * 50)
    print("TESTING CLINIC MANAGEMENT SYSTEM AUTHENTICATION")
    print("=" * 50)
    
    # 1. Test authentication
    print("\n" + "=" * 50)
    print("TEST 1: USER REGISTRATION AND LOGIN")
    print("=" * 50)
    
    # Login as admin user (already exists)
    admin_email = "admin@test.com"
    admin_password = "test123"
    if not tester.test_login_user(admin_email, admin_password):
        print("❌ Admin login failed")
        return 1
    
    # Test getting current user
    if not tester.test_get_current_user():
        print("❌ Get current user failed")
        return 1
    
    # Test logout
    if not tester.test_logout():
        print("❌ Logout failed")
        return 1
    
    # Test login
    if not tester.test_login_user(admin_email, admin_password):
        print("❌ Login failed")
        return 1
    
    # Test unauthorized access
    if not tester.test_unauthorized_access("patients"):
        print("❌ Unauthorized access test failed")
        print("❌ ISSUE: API is not properly protecting endpoints")
    else:
        print("✅ API correctly requires authentication")
    
    print("\n" + "=" * 50)
    print("TEST 2: ROLE-BASED ACCESS CONTROL")
    print("=" * 50)
    
    # Test admin access to protected endpoints
    print("\n🔍 Testing admin access to protected endpoints...")
    
    # 2. Create test patient and doctor for our tests
    print("\n🔍 Creating test patient...")
    if not tester.test_create_patient("Тест Пациент", "+7 999 888 7777", "phone"):
        print("❌ Test patient creation failed, stopping tests")
        return 1
    
    test_patient_id = tester.created_patient_id
    
    print("\n🔍 Creating test doctor...")
    if not tester.test_create_doctor("Тест Врач", "Тестолог", "#00FF00"):
        print("❌ Test doctor creation failed, stopping tests")
        return 1
    
    test_doctor_id = tester.created_doctor_id
    
    # Logout admin
    tester.test_logout()
    
    # Login as doctor user (already exists)
    doctor_email = "doctor@test.com"
    doctor_password = "test123"
    if not tester.test_login_user(doctor_email, doctor_password):
        print("❌ Doctor login failed")
        return 1
    
    # Test doctor access (should be able to access patients but not create doctors)
    print("\n🔍 Testing doctor access to patients...")
    if not tester.test_get_patients():
        print("❌ Doctor cannot access patients")
    else:
        print("✅ Doctor can access patients")
    
    # Logout doctor
    tester.test_logout()
    
    # Login as patient user (already exists)
    patient_email = "patient@test.com"
    patient_password = "test123"
    if not tester.test_login_user(patient_email, patient_password):
        print("❌ Patient login failed")
        return 1
    
    # Test patient access (should not be able to access patients list)
    print("\n🔍 Testing patient access restrictions...")
    success, _ = tester.run_test(
        "Patient accessing patients list",
        "GET",
        "patients",
        403  # Expect 403 Forbidden
    )
    if success:
        print("✅ Patient correctly restricted from accessing patients list")
    else:
        print("❌ ISSUE: Patient can access patients list when they shouldn't")
    
    # Login as admin again for remaining tests
    tester.test_logout()
    tester.test_login_user(admin_email, admin_password)
    
    # 3. TEST: Time Conflict Detection
    print("\n" + "=" * 50)
    print("TEST 3: TIME CONFLICT DETECTION")
    print("=" * 50)
    
    # Create first appointment at 14:00
    print("\n🔍 Creating first appointment at 14:00...")
    if not tester.test_create_appointment(test_patient_id, test_doctor_id, today, "14:00"):
        print("❌ First appointment creation failed, stopping tests")
        return 1
    
    # Try to create another appointment at the same time (should fail with 400)
    print("\n🔍 Testing time conflict with second appointment at 14:00...")
    if not tester.test_create_appointment(test_patient_id, test_doctor_id, today, "14:00", expect_conflict=True):
        print("❌ Time conflict detection test failed")
        print("❌ ISSUE: System is not detecting time conflicts correctly")
    else:
        print("✅ Time conflict detection is working correctly")
    
    # 4. Additional tests to verify other functionality
    print("\n" + "=" * 50)
    print("ADDITIONAL FUNCTIONALITY TESTS")
    print("=" * 50)
    
    # Test appointment archiving
    print("\n🔍 Testing appointment archiving...")
    
    # Create another appointment with a non-cancelled status
    if not tester.test_create_appointment(test_patient_id, test_doctor_id, tomorrow, "10:00"):
        print("❌ Appointment creation for archiving test failed")
        return 1
    
    appointment_to_archive = tester.created_appointment_id
    
    # Now archive it (set to cancelled)
    if not tester.test_archive_appointment(appointment_to_archive):
        print("❌ Appointment archiving failed")
        print("❌ ISSUE: Appointment archiving is not working")
    else:
        print("✅ Appointment archiving is working correctly")
    
    # Test patient deletion
    print("\n🔍 Testing patient deletion...")
    if not tester.test_delete_patient(test_patient_id):
        print("❌ Patient deletion failed")
        print("❌ ISSUE: Patient deletion is not working")
    else:
        print("✅ Patient deletion is working correctly")
    
    # Test doctor deletion (deactivation)
    print("\n🔍 Testing doctor deactivation...")
    if not tester.test_delete_doctor(test_doctor_id):
        print("❌ Doctor deletion (deactivation) failed")
        print("❌ ISSUE: Doctor deactivation is not working")
    else:
        print("✅ Doctor deactivation is working correctly")
    
    # Print results
    print("\n" + "=" * 50)
    print(f"BACKEND TESTS PASSED: {tester.tests_passed}/{tester.tests_run}")
    print("=" * 50)
    
    print("\nNOTE: Frontend tests for authentication and role-based access")
    print("will be performed using Playwright browser automation.")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())