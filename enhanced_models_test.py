import requests
import json
from datetime import datetime, timedelta
import sys

class EnhancedModelsAPITester:
    def __init__(self, base_url):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.token = None
        self.current_user = None
        self.created_patient_id = None
        self.created_doctor_id = None
        self.created_assistant_id = None
        self.created_second_doctor_id = None
        self.created_appointment_id = None

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

    def test_register_admin(self):
        """Register admin user for testing"""
        admin_email = f"admin_{datetime.now().strftime('%Y%m%d%H%M%S')}@test.com"
        admin_password = "Test123!"
        admin_name = "Enhanced Models Test Admin"
        
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

    def test_create_enhanced_patient(self):
        """Test creating a patient with enhanced fields"""
        patient_data = {
            "full_name": f"Анна Петрова {datetime.now().strftime('%H%M%S')}",
            "phone": "+7 999 123 4567",
            "iin": "123456789012",
            "birth_date": "1990-05-15",
            "gender": "female",
            "source": "referral",
            "referrer": "Доктор Иванов",
            "notes": "Пациент направлен на консультацию кардиолога"
        }
        
        success, response = self.run_test(
            "Create Patient with Enhanced Fields",
            "POST",
            "patients",
            200,
            data=patient_data
        )
        
        if success and response and "id" in response:
            self.created_patient_id = response["id"]
            print(f"✅ Created enhanced patient with ID: {self.created_patient_id}")
            
            # Verify all enhanced fields are present and correct
            enhanced_fields = ["birth_date", "gender", "referrer", "revenue", "debt", "overpayment", "appointments_count", "records_count"]
            all_fields_present = True
            
            for field in enhanced_fields:
                if field not in response:
                    print(f"❌ Missing enhanced field: {field}")
                    all_fields_present = False
                else:
                    print(f"✅ Enhanced field '{field}': {response[field]}")
            
            # Verify financial fields are properly initialized
            if response.get("revenue") == 0.0 and response.get("debt") == 0.0 and response.get("overpayment") == 0.0:
                print("✅ Financial fields properly initialized to 0.0")
            else:
                print(f"❌ Financial fields not properly initialized: revenue={response.get('revenue')}, debt={response.get('debt')}, overpayment={response.get('overpayment')}")
                all_fields_present = False
            
            # Verify count fields are properly initialized
            if response.get("appointments_count") == 0 and response.get("records_count") == 0:
                print("✅ Count fields properly initialized to 0")
            else:
                print(f"❌ Count fields not properly initialized: appointments_count={response.get('appointments_count')}, records_count={response.get('records_count')}")
                all_fields_present = False
            
            # Verify input fields match
            input_fields = ["birth_date", "gender", "referrer"]
            for field in input_fields:
                if response.get(field) != patient_data[field]:
                    print(f"❌ Field mismatch for {field}: expected {patient_data[field]}, got {response.get(field)}")
                    all_fields_present = False
            
            if all_fields_present:
                print("✅ All enhanced patient fields verified successfully")
            else:
                success = False
        
        return success

    def test_update_enhanced_patient(self):
        """Test updating a patient with enhanced fields"""
        if not self.created_patient_id:
            print("❌ No patient ID available for update test")
            return False
        
        update_data = {
            "birth_date": "1990-06-20",
            "gender": "female",
            "referrer": "Доктор Сидоров",
            "revenue": 15000.50,
            "debt": 2500.00,
            "overpayment": 500.00,
            "appointments_count": 5,
            "records_count": 3
        }
        
        success, response = self.run_test(
            "Update Patient with Enhanced Fields",
            "PUT",
            f"patients/{self.created_patient_id}",
            200,
            data=update_data
        )
        
        if success and response:
            print(f"✅ Updated patient: {response['full_name']}")
            
            # Verify all updates were applied
            all_updates_correct = True
            for field, expected_value in update_data.items():
                actual_value = response.get(field)
                if actual_value != expected_value:
                    print(f"❌ Update failed for {field}: expected {expected_value}, got {actual_value}")
                    all_updates_correct = False
                else:
                    print(f"✅ Updated field '{field}': {actual_value}")
            
            if all_updates_correct:
                print("✅ All enhanced patient field updates verified successfully")
            else:
                success = False
        
        return success

    def test_get_patients_with_enhanced_fields(self):
        """Test retrieving patients with all enhanced fields"""
        success, response = self.run_test(
            "Get Patients with Enhanced Fields",
            "GET",
            "patients",
            200
        )
        
        if success and response and len(response) > 0:
            patient = response[0]  # Check first patient
            enhanced_fields = ["birth_date", "gender", "referrer", "revenue", "debt", "overpayment", "appointments_count", "records_count"]
            
            all_fields_present = True
            for field in enhanced_fields:
                if field not in patient:
                    print(f"❌ Enhanced field '{field}' missing from GET response")
                    all_fields_present = False
                else:
                    print(f"✅ Enhanced field '{field}' present: {patient[field]}")
            
            if all_fields_present:
                print("✅ All enhanced patient fields present in GET response")
            else:
                success = False
        
        return success

    def test_create_doctors_for_appointments(self):
        """Create doctors for appointment testing"""
        # Create main doctor
        doctor_data = {
            "full_name": "Доктор Главный",
            "specialty": "Кардиолог",
            "calendar_color": "#3B82F6"
        }
        
        success, response = self.run_test(
            "Create Main Doctor",
            "POST",
            "doctors",
            200,
            data=doctor_data
        )
        
        if success and response and "id" in response:
            self.created_doctor_id = response["id"]
            print(f"✅ Created main doctor with ID: {self.created_doctor_id}")
        else:
            return False
        
        # Create assistant doctor
        assistant_data = {
            "full_name": "Доктор Ассистент",
            "specialty": "Медсестра",
            "calendar_color": "#10B981"
        }
        
        success, response = self.run_test(
            "Create Assistant Doctor",
            "POST",
            "doctors",
            200,
            data=assistant_data
        )
        
        if success and response and "id" in response:
            self.created_assistant_id = response["id"]
            print(f"✅ Created assistant doctor with ID: {self.created_assistant_id}")
        else:
            return False
        
        # Create second doctor
        second_doctor_data = {
            "full_name": "Доктор Второй",
            "specialty": "Невролог",
            "calendar_color": "#F59E0B"
        }
        
        success, response = self.run_test(
            "Create Second Doctor",
            "POST",
            "doctors",
            200,
            data=second_doctor_data
        )
        
        if success and response and "id" in response:
            self.created_second_doctor_id = response["id"]
            print(f"✅ Created second doctor with ID: {self.created_second_doctor_id}")
            return True
        
        return False

    def test_create_enhanced_appointment(self):
        """Test creating an appointment with enhanced fields"""
        if not self.created_patient_id or not self.created_doctor_id:
            print("❌ Missing patient or doctor ID for appointment test")
            return False
        
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        appointment_data = {
            "patient_id": self.created_patient_id,
            "doctor_id": self.created_doctor_id,
            "appointment_date": tomorrow,
            "appointment_time": "14:30",
            "end_time": "15:30",
            "chair_number": "Кабинет 5",
            "assistant_id": self.created_assistant_id,
            "second_doctor_id": self.created_second_doctor_id,
            "extra_hours": True,
            "reason": "Консультация кардиолога",
            "notes": "Плановый осмотр",
            "patient_notes": "Пациент жалуется на боли в груди"
        }
        
        success, response = self.run_test(
            "Create Appointment with Enhanced Fields",
            "POST",
            "appointments",
            200,
            data=appointment_data
        )
        
        if success and response and "id" in response:
            self.created_appointment_id = response["id"]
            print(f"✅ Created enhanced appointment with ID: {self.created_appointment_id}")
            
            # Verify all enhanced fields are present and correct
            enhanced_fields = ["end_time", "chair_number", "assistant_id", "second_doctor_id", "extra_hours", "patient_notes"]
            all_fields_present = True
            
            for field in enhanced_fields:
                if field not in response:
                    print(f"❌ Missing enhanced appointment field: {field}")
                    all_fields_present = False
                else:
                    expected_value = appointment_data[field]
                    actual_value = response[field]
                    if actual_value != expected_value:
                        print(f"❌ Field mismatch for {field}: expected {expected_value}, got {actual_value}")
                        all_fields_present = False
                    else:
                        print(f"✅ Enhanced field '{field}': {actual_value}")
            
            if all_fields_present:
                print("✅ All enhanced appointment fields verified successfully")
            else:
                success = False
        
        return success

    def test_update_enhanced_appointment(self):
        """Test updating an appointment with enhanced fields"""
        if not self.created_appointment_id:
            print("❌ No appointment ID available for update test")
            return False
        
        update_data = {
            "end_time": "16:00",
            "chair_number": "Кабинет 7",
            "extra_hours": False,
            "patient_notes": "Пациент чувствует себя лучше после лечения"
        }
        
        success, response = self.run_test(
            "Update Appointment with Enhanced Fields",
            "PUT",
            f"appointments/{self.created_appointment_id}",
            200,
            data=update_data
        )
        
        if success and response:
            print(f"✅ Updated appointment with ID: {self.created_appointment_id}")
            
            # Verify all updates were applied
            all_updates_correct = True
            for field, expected_value in update_data.items():
                actual_value = response.get(field)
                if actual_value != expected_value:
                    print(f"❌ Update failed for {field}: expected {expected_value}, got {actual_value}")
                    all_updates_correct = False
                else:
                    print(f"✅ Updated field '{field}': {actual_value}")
            
            if all_updates_correct:
                print("✅ All enhanced appointment field updates verified successfully")
            else:
                success = False
        
        return success

    def test_get_appointments_with_enhanced_fields(self):
        """Test retrieving appointments with enhanced fields including assistant and second doctor names"""
        success, response = self.run_test(
            "Get Appointments with Enhanced Fields",
            "GET",
            "appointments",
            200
        )
        
        if success and response and len(response) > 0:
            appointment = None
            # Find our created appointment
            for apt in response:
                if apt.get("id") == self.created_appointment_id:
                    appointment = apt
                    break
            
            if not appointment:
                print("❌ Created appointment not found in response")
                return False
            
            enhanced_fields = ["end_time", "chair_number", "assistant_id", "second_doctor_id", "extra_hours", "patient_notes"]
            aggregated_fields = ["assistant_name", "second_doctor_name"]
            
            all_fields_present = True
            
            # Check enhanced fields
            for field in enhanced_fields:
                if field not in appointment:
                    print(f"❌ Enhanced field '{field}' missing from GET response")
                    all_fields_present = False
                else:
                    print(f"✅ Enhanced field '{field}' present: {appointment[field]}")
            
            # Check aggregated fields (assistant and second doctor names)
            for field in aggregated_fields:
                if field not in appointment:
                    print(f"❌ Aggregated field '{field}' missing from GET response")
                    all_fields_present = False
                else:
                    value = appointment[field]
                    if value is not None:
                        print(f"✅ Aggregated field '{field}' present: {value}")
                    else:
                        print(f"⚠️ Aggregated field '{field}' is null (may be expected if no assistant/second doctor)")
            
            # Verify assistant_name and second_doctor_name are populated correctly
            if appointment.get("assistant_id") and appointment.get("assistant_name"):
                print("✅ Assistant name correctly populated from assistant_id")
            elif appointment.get("assistant_id") and not appointment.get("assistant_name"):
                print("❌ Assistant ID present but assistant name not populated")
                all_fields_present = False
            
            if appointment.get("second_doctor_id") and appointment.get("second_doctor_name"):
                print("✅ Second doctor name correctly populated from second_doctor_id")
            elif appointment.get("second_doctor_id") and not appointment.get("second_doctor_name"):
                print("❌ Second doctor ID present but second doctor name not populated")
                all_fields_present = False
            
            if all_fields_present:
                print("✅ All enhanced appointment fields and aggregations verified successfully")
            else:
                success = False
        
        return success

    def test_appointment_time_conflict_detection(self):
        """Test that appointment time conflict detection still works with enhanced fields"""
        if not self.created_patient_id or not self.created_doctor_id:
            print("❌ Missing patient or doctor ID for conflict test")
            return False
        
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        # Try to create appointment at same time as existing one
        conflict_appointment_data = {
            "patient_id": self.created_patient_id,
            "doctor_id": self.created_doctor_id,
            "appointment_date": tomorrow,
            "appointment_time": "14:30",  # Same time as the enhanced appointment
            "end_time": "15:00",
            "chair_number": "Кабинет 3",
            "reason": "Повторная консультация"
        }
        
        success, response = self.run_test(
            "Test Appointment Time Conflict Detection",
            "POST",
            "appointments",
            400,  # Expecting conflict error
            data=conflict_appointment_data
        )
        
        if success:
            print("✅ Time conflict correctly detected with enhanced appointment fields")
        else:
            print("❌ Time conflict detection failed with enhanced fields")
        
        return success

    def test_backward_compatibility(self):
        """Test that existing functionality still works (backward compatibility)"""
        # Create a simple patient without enhanced fields
        simple_patient_data = {
            "full_name": f"Простой Пациент {datetime.now().strftime('%H%M%S')}",
            "phone": "+7 999 888 7777",
            "source": "phone"
        }
        
        success, response = self.run_test(
            "Create Simple Patient (Backward Compatibility)",
            "POST",
            "patients",
            200,
            data=simple_patient_data
        )
        
        if success and response and "id" in response:
            simple_patient_id = response["id"]
            print(f"✅ Created simple patient with ID: {simple_patient_id}")
            
            # Verify enhanced fields are still present with default values
            enhanced_fields = ["birth_date", "gender", "referrer", "revenue", "debt", "overpayment", "appointments_count", "records_count"]
            all_defaults_correct = True
            
            for field in enhanced_fields:
                if field not in response:
                    print(f"❌ Enhanced field '{field}' missing from simple patient")
                    all_defaults_correct = False
                else:
                    value = response[field]
                    if field in ["birth_date", "gender", "referrer"] and value is not None:
                        print(f"⚠️ Optional field '{field}' should be None but got: {value}")
                    elif field in ["revenue", "debt", "overpayment"] and value != 0.0:
                        print(f"❌ Financial field '{field}' should default to 0.0 but got: {value}")
                        all_defaults_correct = False
                    elif field in ["appointments_count", "records_count"] and value != 0:
                        print(f"❌ Count field '{field}' should default to 0 but got: {value}")
                        all_defaults_correct = False
                    else:
                        print(f"✅ Field '{field}' has correct default: {value}")
            
            if all_defaults_correct:
                print("✅ Backward compatibility verified - enhanced fields have correct defaults")
            else:
                success = False
        
        return success

    def test_automatic_medical_record_creation(self):
        """Test that automatic medical record creation still works with enhanced patient model"""
        if not self.created_patient_id:
            print("❌ No patient ID available for medical record test")
            return False
        
        success, response = self.run_test(
            "Get Automatically Created Medical Record",
            "GET",
            f"medical-records/{self.created_patient_id}",
            200
        )
        
        if success and response and "id" in response:
            print(f"✅ Medical record automatically created for enhanced patient")
            print(f"Medical Record ID: {response['id']}")
            
            # Verify patient_id matches
            if response['patient_id'] == self.created_patient_id:
                print("✅ Medical record contains correct patient_id")
            else:
                print(f"❌ Medical record patient_id mismatch: expected {self.created_patient_id}, got {response['patient_id']}")
                success = False
        else:
            print("❌ Automatic medical record creation failed for enhanced patient")
            success = False
        
        return success

def main():
    # Get the backend URL from the environment
    backend_url = "https://medrec-system-1.preview.emergentagent.com"
    
    # Setup
    tester = EnhancedModelsAPITester(backend_url)
    
    print("=" * 60)
    print("TESTING ENHANCED PATIENT AND APPOINTMENT MODELS")
    print("=" * 60)
    
    # 1. Register admin user
    print("\n" + "=" * 50)
    print("TEST 1: REGISTER ADMIN USER")
    print("=" * 50)
    
    if not tester.test_register_admin():
        print("❌ Admin user registration failed")
        return 1
    
    # 2. Test enhanced patient model
    print("\n" + "=" * 50)
    print("TEST 2: ENHANCED PATIENT MODEL")
    print("=" * 50)
    
    if not tester.test_create_enhanced_patient():
        print("❌ Enhanced patient creation failed")
        return 1
    
    if not tester.test_update_enhanced_patient():
        print("❌ Enhanced patient update failed")
        return 1
    
    if not tester.test_get_patients_with_enhanced_fields():
        print("❌ Get patients with enhanced fields failed")
        return 1
    
    # 3. Test automatic medical record creation with enhanced patient
    print("\n" + "=" * 50)
    print("TEST 3: AUTOMATIC MEDICAL RECORD CREATION")
    print("=" * 50)
    
    if not tester.test_automatic_medical_record_creation():
        print("❌ Automatic medical record creation test failed")
        return 1
    
    # 4. Create doctors for appointment testing
    print("\n" + "=" * 50)
    print("TEST 4: CREATE DOCTORS FOR APPOINTMENT TESTING")
    print("=" * 50)
    
    if not tester.test_create_doctors_for_appointments():
        print("❌ Doctor creation for appointment testing failed")
        return 1
    
    # 5. Test enhanced appointment model
    print("\n" + "=" * 50)
    print("TEST 5: ENHANCED APPOINTMENT MODEL")
    print("=" * 50)
    
    if not tester.test_create_enhanced_appointment():
        print("❌ Enhanced appointment creation failed")
        return 1
    
    if not tester.test_update_enhanced_appointment():
        print("❌ Enhanced appointment update failed")
        return 1
    
    if not tester.test_get_appointments_with_enhanced_fields():
        print("❌ Get appointments with enhanced fields failed")
        return 1
    
    # 6. Test existing functionality
    print("\n" + "=" * 50)
    print("TEST 6: EXISTING FUNCTIONALITY")
    print("=" * 50)
    
    if not tester.test_appointment_time_conflict_detection():
        print("❌ Appointment time conflict detection failed")
        return 1
    
    if not tester.test_backward_compatibility():
        print("❌ Backward compatibility test failed")
        return 1
    
    # Print results
    print("\n" + "=" * 60)
    print(f"ENHANCED MODELS TESTS PASSED: {tester.tests_passed}/{tester.tests_run}")
    print("=" * 60)
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 ALL ENHANCED MODEL TESTS PASSED!")
        return 0
    else:
        print("❌ SOME TESTS FAILED")
        return 1

if __name__ == "__main__":
    sys.exit(main())