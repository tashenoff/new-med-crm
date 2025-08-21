import requests
import json
from datetime import datetime, timedelta
import sys

class FocusedAppointmentTester:
    def __init__(self, base_url):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.token = None
        self.test_patient_id = None
        self.test_doctor_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, params=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
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

    def setup_auth_and_data(self):
        """Setup authentication and test data"""
        # Register admin
        admin_email = f"focused_admin_{datetime.now().strftime('%Y%m%d%H%M%S')}@test.com"
        success, response = self.run_test(
            "Register Admin",
            "POST",
            "auth/register",
            200,
            data={
                "email": admin_email,
                "password": "Test123!",
                "full_name": "Focused Test Admin",
                "role": "admin"
            }
        )
        
        if success and response:
            self.token = response["access_token"]
        
        # Create patient
        success, response = self.run_test(
            "Create Patient",
            "POST",
            "patients",
            200,
            data={
                "full_name": "Focused Test Patient",
                "phone": "+7 999 888 7777",
                "source": "phone"
            }
        )
        
        if success and response:
            self.test_patient_id = response["id"]
        
        # Create doctor
        success, response = self.run_test(
            "Create Doctor",
            "POST",
            "doctors",
            200,
            data={
                "full_name": "Focused Test Doctor",
                "specialty": "Терапевт",
                "calendar_color": "#4287f5"
            }
        )
        
        if success and response:
            self.test_doctor_id = response["id"]
        
        return self.token and self.test_patient_id and self.test_doctor_id

def main():
    backend_url = "https://medrecord-field.preview.emergentagent.com"
    tester = FocusedAppointmentTester(backend_url)
    
    print("=" * 80)
    print("FOCUSED SIMPLIFIED APPOINTMENT MODEL VERIFICATION")
    print("=" * 80)
    
    # Setup
    if not tester.setup_auth_and_data():
        print("❌ Setup failed")
        return 1
    
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    
    # TEST 1: Create appointment with simplified fields
    print("\n" + "=" * 60)
    print("TEST 1: CREATE APPOINTMENT WITH SIMPLIFIED FIELDS")
    print("=" * 60)
    
    appointment_data = {
        "patient_id": tester.test_patient_id,
        "doctor_id": tester.test_doctor_id,
        "appointment_date": tomorrow,
        "appointment_time": "09:00",
        "end_time": "09:30",
        "chair_number": "Chair-A1",
        "price": 15000.50,
        "reason": "Консультация терапевта",
        "notes": "Плановый осмотр",
        "patient_notes": "Жалобы на общую слабость"
    }
    
    success, response = tester.run_test(
        "Create Appointment with Simplified Model",
        "POST",
        "appointments",
        200,
        data=appointment_data
    )
    
    appointment_id = None
    if success and response:
        appointment_id = response["id"]
        print(f"✅ Created appointment ID: {appointment_id}")
        
        # Verify simplified fields are present
        simplified_fields = ["patient_id", "doctor_id", "appointment_date", "appointment_time", 
                           "end_time", "chair_number", "price", "reason", "notes", "patient_notes"]
        
        print("\n📋 VERIFYING SIMPLIFIED FIELDS:")
        for field in simplified_fields:
            if field in response and response[field] == appointment_data[field]:
                print(f"✅ {field}: {response[field]}")
            else:
                print(f"❌ {field}: Expected {appointment_data[field]}, got {response.get(field)}")
        
        # Verify removed fields are NOT present
        removed_fields = ["assistant_id", "second_doctor_id", "extra_hours"]
        print("\n📋 VERIFYING REMOVED FIELDS ARE NOT PRESENT:")
        for field in removed_fields:
            if field not in response:
                print(f"✅ {field}: Correctly removed")
            else:
                print(f"❌ {field}: Still present with value {response[field]}")
    
    # TEST 2: Test price field with decimal values
    print("\n" + "=" * 60)
    print("TEST 2: PRICE FIELD WITH DECIMAL VALUES")
    print("=" * 60)
    
    price_appointment = {
        "patient_id": tester.test_patient_id,
        "doctor_id": tester.test_doctor_id,
        "appointment_date": tomorrow,
        "appointment_time": "10:00",
        "price": 15000.50,
        "reason": "Price test with decimal"
    }
    
    success, response = tester.run_test(
        "Create Appointment with Decimal Price",
        "POST",
        "appointments",
        200,
        data=price_appointment
    )
    
    if success and response:
        print(f"✅ Price stored correctly: {response['price']} (type: {type(response['price'])})")
        if response['price'] == 15000.50:
            print("✅ Decimal price value matches exactly")
        else:
            print(f"❌ Price mismatch: expected 15000.50, got {response['price']}")
    
    # TEST 3: Test appointment update with new structure
    print("\n" + "=" * 60)
    print("TEST 3: UPDATE APPOINTMENT WITH SIMPLIFIED STRUCTURE")
    print("=" * 60)
    
    if appointment_id:
        update_data = {
            "price": 18000.75,
            "chair_number": "Chair-B2",
            "patient_notes": "Updated patient notes"
        }
        
        success, response = tester.run_test(
            "Update Appointment with Simplified Fields",
            "PUT",
            f"appointments/{appointment_id}",
            200,
            data=update_data
        )
        
        if success and response:
            print("✅ Appointment updated successfully")
            for field, expected in update_data.items():
                if response[field] == expected:
                    print(f"✅ {field} updated correctly: {response[field]}")
                else:
                    print(f"❌ {field} update failed: expected {expected}, got {response[field]}")
    
    # TEST 4: Test GET /api/appointments returns appointments without removed fields
    print("\n" + "=" * 60)
    print("TEST 4: GET APPOINTMENTS WITHOUT REMOVED FIELDS")
    print("=" * 60)
    
    success, response = tester.run_test(
        "Get All Appointments",
        "GET",
        "appointments",
        200
    )
    
    if success and response and len(response) > 0:
        print(f"✅ Retrieved {len(response)} appointments")
        
        # Check first appointment
        appointment = response[0]
        
        # Verify simplified fields are present
        expected_fields = ["id", "patient_id", "doctor_id", "appointment_date", "appointment_time",
                          "end_time", "chair_number", "price", "reason", "notes", "patient_notes"]
        
        print("\n📋 CHECKING SIMPLIFIED FIELDS IN GET RESPONSE:")
        for field in expected_fields:
            if field in appointment:
                print(f"✅ {field}: Present")
            else:
                print(f"❌ {field}: Missing")
        
        # Verify removed fields are NOT present
        removed_fields = ["assistant_id", "second_doctor_id", "extra_hours"]
        print("\n📋 CHECKING REMOVED FIELDS ARE NOT IN GET RESPONSE:")
        for field in removed_fields:
            if field not in appointment:
                print(f"✅ {field}: Correctly not present")
            else:
                print(f"❌ {field}: Still present")
        
        # Check aggregation fields
        aggregation_fields = ["patient_name", "doctor_name", "doctor_specialty", "doctor_color"]
        print("\n📋 CHECKING AGGREGATION FIELDS:")
        for field in aggregation_fields:
            if field in appointment and appointment[field]:
                print(f"✅ {field}: {appointment[field]}")
            else:
                print(f"❌ {field}: Missing or empty")
    
    # TEST 5: Backward compatibility - existing appointments without price
    print("\n" + "=" * 60)
    print("TEST 5: BACKWARD COMPATIBILITY")
    print("=" * 60)
    
    old_appointment = {
        "patient_id": tester.test_patient_id,
        "doctor_id": tester.test_doctor_id,
        "appointment_date": tomorrow,
        "appointment_time": "11:00",
        "reason": "Old style appointment"
        # No price, end_time, chair_number, patient_notes
    }
    
    success, response = tester.run_test(
        "Create Old-Style Appointment",
        "POST",
        "appointments",
        200,
        data=old_appointment
    )
    
    if success and response:
        print("✅ Old-style appointment created successfully")
        
        # Check that new fields default to null
        null_fields = ["price", "end_time", "chair_number", "patient_notes"]
        for field in null_fields:
            if response[field] is None:
                print(f"✅ {field}: Correctly defaults to null")
            else:
                print(f"❌ {field}: Should be null, got {response[field]}")
    
    # Results
    print("\n" + "=" * 80)
    print(f"FOCUSED TESTS COMPLETED: {tester.tests_passed}/{tester.tests_run} API calls passed")
    print("=" * 80)
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 ALL FOCUSED TESTS PASSED!")
        return 0
    else:
        print("❌ SOME TESTS FAILED")
        return 1

if __name__ == "__main__":
    sys.exit(main())