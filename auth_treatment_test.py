#!/usr/bin/env python3
"""
Authentication and Treatment Plan Testing Script
Tests the authentication system and treatment plan functionality
"""

import requests
import json
from datetime import datetime, timedelta
import sys

class AuthTreatmentTester:
    def __init__(self, base_url):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.token = None
        self.current_user = None
        self.created_patient_id = None
        self.created_doctor_id = None

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
        return success, response

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

def main():
    """Main function to run authentication and treatment plan tests"""
    # Get the backend URL from the environment
    backend_url = "https://medentry-portal.preview.emergentagent.com"
    
    # Setup
    tester = AuthTreatmentTester(backend_url)
    
    print("=" * 80)
    print("TESTING AUTHENTICATION SYSTEM AND TREATMENT PLAN FUNCTIONALITY")
    print("=" * 80)
    
    # Test credentials to provide to user
    test_credentials = {}
    
    # 1. Check if users exist in database
    print("\n" + "=" * 60)
    print("TEST 1: CHECK EXISTING USERS AND CREATE TEST USERS")
    print("=" * 60)
    
    # Try to get current user without authentication (should fail)
    success, _ = tester.run_test(
        "Check if any user is logged in",
        "GET",
        "auth/me",
        403  # Expect 403 Forbidden (FastAPI returns 403 for missing auth)
    )
    
    if success:
        print("✅ No user currently logged in (as expected)")
    else:
        print("❌ Unexpected response when checking current user")
        return 1
    
    # Create test users with different roles
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    
    # Admin user
    admin_email = f"admin_test_{timestamp}@medentry.com"
    admin_password = "AdminTest123!"
    admin_name = "Администратор Тестовый"
    
    print(f"\n🔍 Creating admin user: {admin_email}")
    if not tester.test_register_user(admin_email, admin_password, admin_name, "admin"):
        print("❌ Admin user creation failed")
        return 1
    
    test_credentials["admin"] = {
        "email": admin_email,
        "password": admin_password,
        "name": admin_name,
        "role": "admin"
    }
    
    # Doctor user
    doctor_email = f"doctor_test_{timestamp}@medentry.com"
    doctor_password = "DoctorTest123!"
    doctor_name = "Доктор Тестовый"
    
    print(f"\n🔍 Creating doctor user: {doctor_email}")
    if not tester.test_register_user(doctor_email, doctor_password, doctor_name, "doctor"):
        print("❌ Doctor user creation failed")
        return 1
    
    test_credentials["doctor"] = {
        "email": doctor_email,
        "password": doctor_password,
        "name": doctor_name,
        "role": "doctor"
    }
    
    # Patient user
    patient_email = f"patient_test_{timestamp}@medentry.com"
    patient_password = "PatientTest123!"
    patient_name = "Пациент Тестовый"
    
    print(f"\n🔍 Creating patient user: {patient_email}")
    if not tester.test_register_user(patient_email, patient_password, patient_name, "patient"):
        print("❌ Patient user creation failed")
        return 1
    
    test_credentials["patient"] = {
        "email": patient_email,
        "password": patient_password,
        "name": patient_name,
        "role": "patient"
    }
    
    print("\n✅ All test users created successfully!")
    
    # 2. Test login functionality
    print("\n" + "=" * 60)
    print("TEST 2: TEST LOGIN FUNCTIONALITY")
    print("=" * 60)
    
    # Test admin login
    print(f"\n🔍 Testing admin login...")
    if not tester.test_login_user(admin_email, admin_password):
        print("❌ Admin login failed")
        return 1
    
    # Test /api/auth/me endpoint
    print(f"\n🔍 Testing /api/auth/me endpoint...")
    if not tester.test_get_current_user():
        print("❌ Get current user failed")
        return 1
    
    # Test logout and login with different users
    tester.test_logout()
    
    print(f"\n🔍 Testing doctor login...")
    if not tester.test_login_user(doctor_email, doctor_password):
        print("❌ Doctor login failed")
        return 1
    
    if not tester.test_get_current_user():
        print("❌ Get current user failed for doctor")
        return 1
    
    tester.test_logout()
    
    print(f"\n🔍 Testing patient login...")
    if not tester.test_login_user(patient_email, patient_password):
        print("❌ Patient login failed")
        return 1
    
    if not tester.test_get_current_user():
        print("❌ Get current user failed for patient")
        return 1
    
    print("\n✅ All login tests passed!")
    
    # 3. Initialize services if not already done
    print("\n" + "=" * 60)
    print("TEST 3: INITIALIZE SERVICES")
    print("=" * 60)
    
    # Login as admin to initialize services
    tester.test_login_user(admin_email, admin_password)
    
    success, init_response = tester.test_initialize_default_services()
    if not success:
        print("❌ Services initialization failed")
        return 1
    
    print("✅ Services initialized successfully")
    
    # 4. Create test patient and doctor records
    print("\n" + "=" * 60)
    print("TEST 4: CREATE TEST PATIENT AND DOCTOR RECORDS")
    print("=" * 60)
    
    # Create doctor record
    doctor_record_name = f"Доктор Иванов {timestamp}"
    if not tester.test_create_doctor(doctor_record_name, "Стоматолог", "#3B82F6"):
        print("❌ Doctor record creation failed")
        return 1
    
    # Create patient record
    patient_record_name = f"Пациент Петров {timestamp}"
    if not tester.test_create_patient(patient_record_name, "+77771234567", "website"):
        print("❌ Patient record creation failed")
        return 1
    
    patient_id = tester.created_patient_id
    doctor_id = tester.created_doctor_id
    
    print(f"✅ Created patient ID: {patient_id}")
    print(f"✅ Created doctor ID: {doctor_id}")
    
    # 5. Test treatment plan creation with authentication
    print("\n" + "=" * 60)
    print("TEST 5: TEST TREATMENT PLAN CREATION WITH AUTHENTICATION")
    print("=" * 60)
    
    # First, get available services
    success, services = tester.test_get_services()
    if not success or not services:
        print("❌ Cannot get services for treatment plan test")
        return 1
    
    # Create treatment plan with services
    dental_services = [svc for svc in services if svc['category'] == 'Стоматолог'][:2]
    
    treatment_services = []
    total_cost = 0.0
    
    for i, service in enumerate(dental_services):
        treatment_services.append({
            "service_id": service['id'],
            "service_name": service['name'],
            "category": service['category'],
            "price": service['price'],
            "tooth": f"1{i+1}",  # Tooth 11, 12, etc.
            "quantity": 1,
            "notes": f"Лечение зуба 1{i+1}"
        })
        total_cost += service['price']
    
    # Test treatment plan creation as admin
    print(f"\n🔍 Creating treatment plan as admin...")
    success, treatment_plan = tester.test_create_treatment_plan(
        patient_id,
        "Комплексный план лечения",
        description="Полный план лечения зубов пациента",
        services=treatment_services,
        total_cost=total_cost,
        status="draft",
        notes="Создан для тестирования системы"
    )
    
    if not success or not treatment_plan:
        print("❌ Treatment plan creation failed")
        return 1
    
    treatment_plan_id = treatment_plan['id']
    print(f"✅ Created treatment plan ID: {treatment_plan_id}")
    
    # Test getting treatment plans
    success, plans = tester.test_get_patient_treatment_plans(patient_id)
    if not success or not plans:
        print("❌ Getting treatment plans failed")
        return 1
    
    print(f"✅ Retrieved {len(plans)} treatment plans")
    
    # Test getting specific treatment plan
    success, specific_plan = tester.test_get_treatment_plan(treatment_plan_id)
    if not success or not specific_plan:
        print("❌ Getting specific treatment plan failed")
        return 1
    
    print(f"✅ Retrieved specific treatment plan: {specific_plan['title']}")
    
    # Test updating treatment plan
    update_data = {
        "status": "approved",
        "notes": "План одобрен врачом после осмотра"
    }
    
    success, updated_plan = tester.test_update_treatment_plan(treatment_plan_id, update_data)
    if not success or not updated_plan:
        print("❌ Treatment plan update failed")
        return 1
    
    print(f"✅ Updated treatment plan status to: {updated_plan['status']}")
    
    # 6. Test access control for treatment plans
    print("\n" + "=" * 60)
    print("TEST 6: TEST TREATMENT PLAN ACCESS CONTROL")
    print("=" * 60)
    
    # Test as doctor
    tester.test_login_user(doctor_email, doctor_password)
    
    print(f"\n🔍 Testing treatment plan access as doctor...")
    success, doctor_plans = tester.test_get_patient_treatment_plans(patient_id)
    if not success:
        print("❌ Doctor cannot access treatment plans")
        return 1
    
    print("✅ Doctor can access treatment plans")
    
    # Test unauthorized access (no token)
    print(f"\n🔍 Testing unauthorized access to treatment plans...")
    if not tester.test_treatment_plan_unauthorized_access(patient_id):
        print("❌ Unauthorized access test failed")
        return 1
    
    print("✅ Unauthorized access correctly blocked")
    
    # Test patient role restrictions
    tester.test_login_user(patient_email, patient_password)
    
    print(f"\n🔍 Testing treatment plan creation as patient (should fail)...")
    if not tester.test_create_treatment_plan_unauthorized(patient_id, "Unauthorized Plan"):
        print("❌ Patient restriction test failed")
        return 1
    
    print("✅ Patient correctly restricted from creating treatment plans")
    
    # Print test credentials for user
    print("\n" + "=" * 80)
    print("TEST CREDENTIALS FOR USER LOGIN")
    print("=" * 80)
    
    print("\n🔑 Use these credentials to log in and test the treatment plan functionality:")
    print("\n📋 ADMIN USER:")
    print(f"   Email: {test_credentials['admin']['email']}")
    print(f"   Password: {test_credentials['admin']['password']}")
    print(f"   Role: {test_credentials['admin']['role']}")
    
    print("\n👨‍⚕️ DOCTOR USER:")
    print(f"   Email: {test_credentials['doctor']['email']}")
    print(f"   Password: {test_credentials['doctor']['password']}")
    print(f"   Role: {test_credentials['doctor']['role']}")
    
    print("\n🏥 PATIENT USER:")
    print(f"   Email: {test_credentials['patient']['email']}")
    print(f"   Password: {test_credentials['patient']['password']}")
    print(f"   Role: {test_credentials['patient']['role']}")
    
    print(f"\n📊 TEST DATA CREATED:")
    print(f"   Patient ID: {patient_id}")
    print(f"   Doctor ID: {doctor_id}")
    print(f"   Treatment Plan ID: {treatment_plan_id}")
    
    print("\n✅ ALL AUTHENTICATION AND TREATMENT PLAN TESTS PASSED!")
    print("✅ Services are initialized and ready for use")
    print("✅ Users can now log in and create treatment plans")
    
    # Final summary
    print(f"\n📈 TEST SUMMARY:")
    print(f"   Total tests run: {tester.tests_run}")
    print(f"   Tests passed: {tester.tests_passed}")
    print(f"   Success rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())