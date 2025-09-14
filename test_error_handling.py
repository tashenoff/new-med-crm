import requests
import json
from datetime import datetime
import sys

def run_test(name, method, endpoint, expected_status, data=None, params=None, token=None):
    """Run a single API test"""
    url = f"https://env-setup-12.preview.emergentagent.com/api/{endpoint}"
    headers = {'Content-Type': 'application/json'}
    
    # Add authorization token if available
    if token:
        headers['Authorization'] = f'Bearer {token}'
    
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

def main():
    print("=" * 50)
    print("TESTING ERROR HANDLING FOR MEDICAL RECORD CREATION")
    print("=" * 50)
    
    # 1. Register admin user
    print("\n" + "=" * 50)
    print("TEST 1: REGISTER ADMIN USER")
    print("=" * 50)
    
    # Register a new admin user
    admin_email = f"admin_error_{datetime.now().strftime('%Y%m%d%H%M%S')}@test.com"
    admin_password = "Test123!"
    admin_name = "Администратор Тест Ошибки"
    
    print(f"\n🔍 Registering admin user with email {admin_email}...")
    success, response = run_test(
        "Register admin user",
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
    
    if not success or not response or "access_token" not in response:
        print("❌ Admin user registration failed")
        return 1
    
    token = response["access_token"]
    print(f"✅ Registered admin user with email {admin_email}")
    
    # 2. Create a patient (this should succeed even if medical record creation fails)
    print("\n" + "=" * 50)
    print("TEST 2: PATIENT CREATION WITH ERROR HANDLING")
    print("=" * 50)
    
    # Create test patient
    patient_name = f"Пациент Тест Ошибки {datetime.now().strftime('%H%M%S')}"
    success, response = run_test(
        "Create Patient",
        "POST",
        "patients",
        200,
        data={"full_name": patient_name, "phone": "+7 999 123 4567", "source": "phone"},
        token=token
    )
    
    if not success or not response or "id" not in response:
        print("❌ Patient creation failed")
        return 1
    
    patient_id = response["id"]
    print(f"✅ Created patient with ID: {patient_id}")
    
    # 3. Verify medical record was created
    print("\n" + "=" * 50)
    print("TEST 3: VERIFY MEDICAL RECORD CREATION")
    print("=" * 50)
    
    success, response = run_test(
        "Get Medical Record",
        "GET",
        f"medical-records/{patient_id}",
        200,
        token=token
    )
    
    if success and response and "id" in response:
        print(f"✅ Medical record was created for patient {patient_id}")
        print(f"Medical Record ID: {response['id']}")
    else:
        print(f"❌ Medical record was not created for patient {patient_id}")
    
    print("\n" + "=" * 50)
    print("ERROR HANDLING TESTS COMPLETED")
    print("=" * 50)
    
    return 0

if __name__ == "__main__":
    sys.exit(main())