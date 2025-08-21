import requests
import json
from datetime import datetime, timedelta
import sys

class SimplifiedAppointmentTester:
    def __init__(self, base_url):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.token = None
        self.current_user = None
        self.test_patient_id = None
        self.test_doctor_id = None
        self.test_appointment_ids = []

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

    def setup_test_data(self):
        """Setup test data - register admin, create patient and doctor"""
        print("\n" + "=" * 50)
        print("SETUP: Creating test data")
        print("=" * 50)
        
        # Register admin user
        admin_email = f"admin_{datetime.now().strftime('%Y%m%d%H%M%S')}@test.com"
        admin_password = "Test123!"
        admin_name = "Admin Simplified Test"
        
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
        else:
            print("❌ Failed to register admin user")
            return False
        
        # Create test patient
        patient_name = f"Пациент Упрощенный {datetime.now().strftime('%H%M%S')}"
        success, response = self.run_test(
            "Create Test Patient",
            "POST",
            "patients",
            200,
            data={
                "full_name": patient_name,
                "phone": "+7 999 123 4567",
                "source": "phone",
                "birth_date": "1990-05-15",
                "gender": "male"
            }
        )
        
        if success and response and "id" in response:
            self.test_patient_id = response["id"]
            print(f"✅ Created test patient: {patient_name} (ID: {self.test_patient_id})")
        else:
            print("❌ Failed to create test patient")
            return False
        
        # Create test doctor
        doctor_name = f"Доктор Упрощенный {datetime.now().strftime('%H%M%S')}"
        success, response = self.run_test(
            "Create Test Doctor",
            "POST",
            "doctors",
            200,
            data={
                "full_name": doctor_name,
                "specialty": "Терапевт",
                "calendar_color": "#4287f5"
            }
        )
        
        if success and response and "id" in response:
            self.test_doctor_id = response["id"]
            print(f"✅ Created test doctor: {doctor_name} (ID: {self.test_doctor_id})")
        else:
            print("❌ Failed to create test doctor")
            return False
        
        return True

    def test_simplified_appointment_creation(self):
        """Test creating appointments with simplified fields"""
        print("\n" + "=" * 50)
        print("TEST 1: SIMPLIFIED APPOINTMENT MODEL CREATION")
        print("=" * 50)
        
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        # Test 1.1: Create appointment with all simplified fields
        appointment_data = {
            "patient_id": self.test_patient_id,
            "doctor_id": self.test_doctor_id,
            "appointment_date": tomorrow,
            "appointment_time": "10:00",
            "end_time": "10:30",
            "chair_number": "Chair-1",
            "price": 15000.50,
            "reason": "Первичный осмотр",
            "notes": "Плановый осмотр пациента",
            "patient_notes": "Пациент жалуется на головную боль"
        }
        
        success, response = self.run_test(
            "Create Appointment with All Simplified Fields",
            "POST",
            "appointments",
            200,
            data=appointment_data
        )
        
        if success and response and "id" in response:
            appointment_id = response["id"]
            self.test_appointment_ids.append(appointment_id)
            print(f"✅ Created appointment with ID: {appointment_id}")
            
            # Verify all fields are present and correct
            expected_fields = [
                "patient_id", "doctor_id", "appointment_date", "appointment_time",
                "end_time", "chair_number", "price", "reason", "notes", "patient_notes"
            ]
            
            all_fields_present = True
            for field in expected_fields:
                if field not in response:
                    print(f"❌ Missing field: {field}")
                    all_fields_present = False
                elif response[field] != appointment_data[field]:
                    print(f"❌ Field mismatch {field}: expected {appointment_data[field]}, got {response[field]}")
                    all_fields_present = False
            
            if all_fields_present:
                print("✅ All simplified appointment fields are present and correct")
            
            # Verify removed fields are NOT present
            removed_fields = ["assistant_id", "second_doctor_id", "extra_hours"]
            no_removed_fields = True
            for field in removed_fields:
                if field in response:
                    print(f"❌ Removed field still present: {field}")
                    no_removed_fields = False
            
            if no_removed_fields:
                print("✅ Confirmed removed fields (assistant_id, second_doctor_id, extra_hours) are not present")
            
            return success and all_fields_present and no_removed_fields
        
        return False

    def test_price_field_functionality(self):
        """Test price field with various values"""
        print("\n" + "=" * 50)
        print("TEST 2: PRICE FIELD TESTING")
        print("=" * 50)
        
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        # Test 2.1: Create appointment with decimal price
        price_test_cases = [
            {"price": 15000.50, "description": "decimal price"},
            {"price": 25000.0, "description": "whole number price"},
            {"price": 0.0, "description": "zero price"},
            {"price": 99999.99, "description": "high decimal price"}
        ]
        
        all_price_tests_passed = True
        
        for i, test_case in enumerate(price_test_cases):
            appointment_data = {
                "patient_id": self.test_patient_id,
                "doctor_id": self.test_doctor_id,
                "appointment_date": tomorrow,
                "appointment_time": f"1{i}:00",  # Different times to avoid conflicts
                "price": test_case["price"],
                "reason": f"Price test - {test_case['description']}"
            }
            
            success, response = self.run_test(
                f"Create Appointment with {test_case['description']} ({test_case['price']})",
                "POST",
                "appointments",
                200,
                data=appointment_data
            )
            
            if success and response and "id" in response:
                self.test_appointment_ids.append(response["id"])
                
                # Verify price is stored correctly
                if response["price"] == test_case["price"]:
                    print(f"✅ Price {test_case['price']} stored correctly")
                else:
                    print(f"❌ Price mismatch: expected {test_case['price']}, got {response['price']}")
                    all_price_tests_passed = False
            else:
                print(f"❌ Failed to create appointment with {test_case['description']}")
                all_price_tests_passed = False
        
        # Test 2.2: Create appointment without price (should be None/null)
        appointment_data_no_price = {
            "patient_id": self.test_patient_id,
            "doctor_id": self.test_doctor_id,
            "appointment_date": tomorrow,
            "appointment_time": "15:00",
            "reason": "Appointment without price"
        }
        
        success, response = self.run_test(
            "Create Appointment without Price Field",
            "POST",
            "appointments",
            200,
            data=appointment_data_no_price
        )
        
        if success and response and "id" in response:
            self.test_appointment_ids.append(response["id"])
            
            # Verify price is None/null when not provided
            if response["price"] is None:
                print("✅ Price field correctly set to null when not provided")
            else:
                print(f"❌ Price should be null when not provided, got {response['price']}")
                all_price_tests_passed = False
        
        return all_price_tests_passed

    def test_appointment_update_simplified(self):
        """Test updating appointments with simplified structure"""
        print("\n" + "=" * 50)
        print("TEST 3: SIMPLIFIED APPOINTMENT UPDATE")
        print("=" * 50)
        
        if not self.test_appointment_ids:
            print("❌ No test appointments available for update testing")
            return False
        
        appointment_id = self.test_appointment_ids[0]
        
        # Test updating with simplified fields
        update_data = {
            "end_time": "11:00",
            "chair_number": "Chair-2",
            "price": 20000.75,
            "reason": "Updated reason",
            "notes": "Updated notes",
            "patient_notes": "Updated patient notes"
        }
        
        success, response = self.run_test(
            "Update Appointment with Simplified Fields",
            "PUT",
            f"appointments/{appointment_id}",
            200,
            data=update_data
        )
        
        if success and response:
            # Verify all updated fields
            all_updates_correct = True
            for field, expected_value in update_data.items():
                if response[field] != expected_value:
                    print(f"❌ Update failed for {field}: expected {expected_value}, got {response[field]}")
                    all_updates_correct = False
            
            if all_updates_correct:
                print("✅ All simplified appointment fields updated correctly")
            
            # Verify removed fields are still not present
            removed_fields = ["assistant_id", "second_doctor_id", "extra_hours"]
            no_removed_fields = True
            for field in removed_fields:
                if field in response:
                    print(f"❌ Removed field still present after update: {field}")
                    no_removed_fields = False
            
            if no_removed_fields:
                print("✅ Confirmed removed fields are still not present after update")
            
            return all_updates_correct and no_removed_fields
        
        return False

    def test_get_appointments_simplified(self):
        """Test GET /api/appointments returns simplified structure"""
        print("\n" + "=" * 50)
        print("TEST 4: GET APPOINTMENTS WITH SIMPLIFIED STRUCTURE")
        print("=" * 50)
        
        success, response = self.run_test(
            "Get All Appointments",
            "GET",
            "appointments",
            200
        )
        
        if success and response and len(response) > 0:
            print(f"✅ Retrieved {len(response)} appointments")
            
            # Check first appointment for simplified structure
            appointment = response[0]
            
            # Verify expected simplified fields are present
            expected_fields = [
                "id", "patient_id", "doctor_id", "appointment_date", "appointment_time",
                "end_time", "chair_number", "price", "status", "reason", "notes", "patient_notes",
                "patient_name", "doctor_name", "doctor_specialty", "doctor_color"
            ]
            
            all_fields_present = True
            for field in expected_fields:
                if field not in appointment:
                    print(f"❌ Missing expected field: {field}")
                    all_fields_present = False
            
            if all_fields_present:
                print("✅ All expected simplified fields are present in GET response")
            
            # Verify removed fields are NOT present
            removed_fields = ["assistant_id", "second_doctor_id", "extra_hours", "assistant_name", "second_doctor_name"]
            no_removed_fields = True
            for field in removed_fields:
                if field in appointment:
                    print(f"❌ Removed field still present in GET response: {field}")
                    no_removed_fields = False
            
            if no_removed_fields:
                print("✅ Confirmed removed fields are not present in GET response")
            
            # Test price field specifically
            price_appointments = [apt for apt in response if apt.get("price") is not None]
            if price_appointments:
                print(f"✅ Found {len(price_appointments)} appointments with price values")
                for apt in price_appointments[:3]:  # Check first 3
                    if isinstance(apt["price"], (int, float)):
                        print(f"✅ Price field correctly stored as number: {apt['price']}")
                    else:
                        print(f"❌ Price field has wrong type: {type(apt['price'])}")
                        all_fields_present = False
            
            return all_fields_present and no_removed_fields
        
        return False

    def test_backward_compatibility(self):
        """Test that existing appointments without price field still work"""
        print("\n" + "=" * 50)
        print("TEST 5: BACKWARD COMPATIBILITY")
        print("=" * 50)
        
        # Create an appointment without the new price field (simulating old appointment)
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        old_style_appointment = {
            "patient_id": self.test_patient_id,
            "doctor_id": self.test_doctor_id,
            "appointment_date": tomorrow,
            "appointment_time": "16:00",
            "reason": "Backward compatibility test"
            # Intentionally omitting price, end_time, chair_number, patient_notes
        }
        
        success, response = self.run_test(
            "Create Old-Style Appointment (without new fields)",
            "POST",
            "appointments",
            200,
            data=old_style_appointment
        )
        
        if success and response and "id" in response:
            appointment_id = response["id"]
            self.test_appointment_ids.append(appointment_id)
            
            # Verify that missing fields are handled correctly
            if response["price"] is None:
                print("✅ Price field correctly defaults to null for old-style appointment")
            else:
                print(f"❌ Price field should be null, got {response['price']}")
                return False
            
            if response["end_time"] is None:
                print("✅ End_time field correctly defaults to null")
            else:
                print(f"❌ End_time field should be null, got {response['end_time']}")
                return False
            
            if response["chair_number"] is None:
                print("✅ Chair_number field correctly defaults to null")
            else:
                print(f"❌ Chair_number field should be null, got {response['chair_number']}")
                return False
            
            if response["patient_notes"] is None:
                print("✅ Patient_notes field correctly defaults to null")
            else:
                print(f"❌ Patient_notes field should be null, got {response['patient_notes']}")
                return False
            
            print("✅ Backward compatibility verified - old appointments work correctly")
            return True
        
        return False

    def test_time_conflict_detection(self):
        """Test that time conflict detection still works with simplified model"""
        print("\n" + "=" * 50)
        print("TEST 6: TIME CONFLICT DETECTION WITH SIMPLIFIED MODEL")
        print("=" * 50)
        
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        # Create first appointment
        first_appointment = {
            "patient_id": self.test_patient_id,
            "doctor_id": self.test_doctor_id,
            "appointment_date": tomorrow,
            "appointment_time": "17:00",
            "price": 12000.0,
            "reason": "First appointment for conflict test"
        }
        
        success, response = self.run_test(
            "Create First Appointment for Conflict Test",
            "POST",
            "appointments",
            200,
            data=first_appointment
        )
        
        if success and response and "id" in response:
            self.test_appointment_ids.append(response["id"])
            print("✅ Created first appointment")
            
            # Try to create conflicting appointment
            conflicting_appointment = {
                "patient_id": self.test_patient_id,
                "doctor_id": self.test_doctor_id,
                "appointment_date": tomorrow,
                "appointment_time": "17:00",  # Same time as first appointment
                "price": 15000.0,
                "reason": "Conflicting appointment"
            }
            
            success, response = self.run_test(
                "Create Conflicting Appointment (should fail)",
                "POST",
                "appointments",
                400,  # Expecting 400 Bad Request for conflict
                data=conflicting_appointment
            )
            
            if success:
                print("✅ Time conflict correctly detected with simplified model")
                return True
            else:
                print("❌ Time conflict detection failed with simplified model")
                return False
        
        return False

    def test_aggregation_queries(self):
        """Test that aggregation queries work correctly with new structure"""
        print("\n" + "=" * 50)
        print("TEST 7: AGGREGATION QUERIES WITH SIMPLIFIED STRUCTURE")
        print("=" * 50)
        
        # Test date range query
        today = datetime.now().strftime("%Y-%m-%d")
        week_from_now = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        
        success, response = self.run_test(
            "Get Appointments with Date Range",
            "GET",
            "appointments",
            200,
            params={"date_from": today, "date_to": week_from_now}
        )
        
        if success and response:
            print(f"✅ Date range query returned {len(response)} appointments")
            
            if len(response) > 0:
                # Verify aggregation includes patient and doctor details
                appointment = response[0]
                required_aggregated_fields = ["patient_name", "doctor_name", "doctor_specialty", "doctor_color"]
                
                all_aggregated_present = True
                for field in required_aggregated_fields:
                    if field not in appointment or appointment[field] is None:
                        print(f"❌ Missing aggregated field: {field}")
                        all_aggregated_present = False
                
                if all_aggregated_present:
                    print("✅ Aggregation queries correctly populate patient and doctor details")
                
                # Verify simplified fields are present in aggregated results
                simplified_fields = ["end_time", "chair_number", "price", "patient_notes"]
                simplified_present = True
                for field in simplified_fields:
                    if field not in appointment:
                        print(f"❌ Missing simplified field in aggregation: {field}")
                        simplified_present = False
                
                if simplified_present:
                    print("✅ Simplified fields correctly included in aggregation results")
                
                return all_aggregated_present and simplified_present
        
        return False

    def cleanup_test_data(self):
        """Clean up test appointments"""
        print("\n" + "=" * 50)
        print("CLEANUP: Removing test appointments")
        print("=" * 50)
        
        for appointment_id in self.test_appointment_ids:
            success, _ = self.run_test(
                f"Delete Test Appointment {appointment_id}",
                "DELETE",
                f"appointments/{appointment_id}",
                200
            )
            if success:
                print(f"✅ Deleted appointment {appointment_id}")

    def run_all_tests(self):
        """Run all simplified appointment model tests"""
        print("=" * 70)
        print("SIMPLIFIED APPOINTMENT MODEL TESTING")
        print("=" * 70)
        
        # Setup
        if not self.setup_test_data():
            print("❌ Setup failed, aborting tests")
            return False
        
        # Run tests
        test_results = []
        
        test_results.append(self.test_simplified_appointment_creation())
        test_results.append(self.test_price_field_functionality())
        test_results.append(self.test_appointment_update_simplified())
        test_results.append(self.test_get_appointments_simplified())
        test_results.append(self.test_backward_compatibility())
        test_results.append(self.test_time_conflict_detection())
        test_results.append(self.test_aggregation_queries())
        
        # Cleanup
        self.cleanup_test_data()
        
        # Results
        passed_tests = sum(test_results)
        total_tests = len(test_results)
        
        print("\n" + "=" * 70)
        print(f"SIMPLIFIED APPOINTMENT MODEL TESTS COMPLETED")
        print(f"INDIVIDUAL TESTS PASSED: {passed_tests}/{total_tests}")
        print(f"API CALLS PASSED: {self.tests_passed}/{self.tests_run}")
        print("=" * 70)
        
        if passed_tests == total_tests:
            print("🎉 ALL SIMPLIFIED APPOINTMENT MODEL TESTS PASSED!")
            return True
        else:
            print("❌ SOME TESTS FAILED")
            return False

def main():
    # Get the backend URL from the environment
    backend_url = "https://medentry-portal.preview.emergentagent.com"
    
    # Setup
    tester = SimplifiedAppointmentTester(backend_url)
    
    # Run all tests
    success = tester.run_all_tests()
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())