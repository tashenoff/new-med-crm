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

    def run_test(self, name, method, endpoint, expected_status, data=None, params=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
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

    def test_api_root(self):
        """Test the API root endpoint"""
        success, response = self.run_test(
            "API Root",
            "GET",
            "",
            200
        )
        if success and response and "message" in response:
            print(f"API Message: {response['message']}")
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

def main():
    # Get the backend URL from the environment
    backend_url = "https://7d433966-f30b-4b81-bfd7-cc9019b064af.preview.emergentagent.com"
    
    # Setup
    tester = ClinicAPITester(backend_url)
    
    # Get tomorrow's date for appointments in ISO format (YYYY-MM-DD)
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    
    print("=" * 50)
    print("TESTING CLINIC MANAGEMENT SYSTEM API")
    print("=" * 50)
    
    # 1. Test basic API endpoints
    if not tester.test_api_root():
        print("❌ API root test failed, stopping tests")
        return 1
    
    # 2. Test CRUD operations for patients
    if not tester.test_create_patient("Иван Иванов", "+7 123 456 7890", "phone"):
        print("❌ Patient creation failed, stopping tests")
        return 1
    
    if not tester.test_get_patients():
        print("❌ Get patients failed")
    
    if not tester.test_get_patients(search="Иван"):
        print("❌ Patient search failed")
    
    if not tester.test_update_patient(tester.created_patient_id, {"notes": "Тестовая заметка"}):
        print("❌ Patient update failed")
    
    # 3. Test CRUD operations for doctors
    if not tester.test_create_doctor("Доктор Петров", "Терапевт", "#FF5733"):
        print("❌ Doctor creation failed, stopping tests")
        return 1
    
    if not tester.test_get_doctors():
        print("❌ Get doctors failed")
    
    # 4. Test appointment operations
    print("\n🔍 Testing appointment functionality...")
    
    # Create an appointment
    if not tester.test_create_appointment(tester.created_patient_id, tester.created_doctor_id, tomorrow, "10:00"):
        print("❌ Appointment creation failed, stopping tests")
        return 1
    
    # Get all appointments
    if not tester.test_get_appointments():
        print("❌ Get appointments failed")
    
    # Test appointment date filtering
    if not tester.test_get_appointments_with_date_filter(date_from=tomorrow):
        print("❌ Get appointments with date filter failed")
    
    # Update appointment status
    if not tester.test_update_appointment_status(tester.created_appointment_id, "confirmed"):
        print("❌ Appointment status update failed")
    
    # Test time conflict detection
    if not tester.test_create_appointment(tester.created_patient_id, tester.created_doctor_id, tomorrow, "10:00", expect_conflict=True):
        print("❌ Time conflict test failed")
    
    # 5. Test deletion operations
    print("\n🔍 Testing deletion functionality...")
    
    # Test appointment deletion
    if not tester.test_delete_appointment(tester.created_appointment_id):
        print("❌ Appointment deletion failed")
    
    # Create a new appointment for doctor deletion test
    if not tester.test_create_appointment(tester.created_patient_id, tester.created_doctor_id, tomorrow, "11:00"):
        print("❌ Second appointment creation failed")
    
    # Test doctor deletion (deactivation)
    if not tester.test_delete_doctor(tester.created_doctor_id):
        print("❌ Doctor deletion (deactivation) failed")
    
    # Test patient deletion
    if not tester.test_delete_patient(tester.created_patient_id):
        print("❌ Patient deletion failed")
    
    # Print results
    print("\n" + "=" * 50)
    print(f"TESTS PASSED: {tester.tests_passed}/{tester.tests_run}")
    print("=" * 50)
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())