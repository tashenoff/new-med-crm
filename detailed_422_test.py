import requests
import json
from datetime import datetime

def detailed_422_investigation():
    """
    Detailed investigation of 422 validation errors for treatment plans
    Testing various edge cases and data combinations
    """
    backend_url = "https://dentalmanager-2.preview.emergentagent.com"
    
    # First authenticate as admin
    print("🔐 Authenticating as admin...")
    auth_response = requests.post(f"{backend_url}/api/auth/register", json={
        "email": f"admin_detailed_{datetime.now().strftime('%Y%m%d%H%M%S')}@test.com",
        "password": "Test123!",
        "full_name": "Admin Detailed Test",
        "role": "admin"
    })
    
    if auth_response.status_code != 200:
        print(f"❌ Authentication failed: {auth_response.status_code}")
        print(f"Response: {auth_response.text}")
        return False
    
    token = auth_response.json()["access_token"]
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
    
    print("✅ Authentication successful")
    
    # Target patient ID
    patient_id = "1db07558-3805-4588-95d1-f79fe4bcd7ce"
    
    # Test cases that might cause 422 errors
    test_cases = [
        {
            "name": "Basic valid plan",
            "data": {
                "patient_id": patient_id,
                "title": "Basic Plan"
            },
            "expected_status": 200
        },
        {
            "name": "Plan with null description",
            "data": {
                "patient_id": patient_id,
                "title": "Plan with null description",
                "description": None
            },
            "expected_status": 200
        },
        {
            "name": "Plan with empty string description",
            "data": {
                "patient_id": patient_id,
                "title": "Plan with empty description",
                "description": ""
            },
            "expected_status": 200
        },
        {
            "name": "Plan with invalid services structure",
            "data": {
                "patient_id": patient_id,
                "title": "Plan with invalid services",
                "services": "invalid_string_instead_of_array"
            },
            "expected_status": 422
        },
        {
            "name": "Plan with services containing invalid data",
            "data": {
                "patient_id": patient_id,
                "title": "Plan with invalid service data",
                "services": [
                    {
                        "invalid_field": "invalid_value"
                    }
                ]
            },
            "expected_status": 200  # Should still work as services is flexible
        },
        {
            "name": "Plan with negative total_cost",
            "data": {
                "patient_id": patient_id,
                "title": "Plan with negative cost",
                "total_cost": -100.0
            },
            "expected_status": 200  # Backend might allow this
        },
        {
            "name": "Plan with invalid status",
            "data": {
                "patient_id": patient_id,
                "title": "Plan with invalid status",
                "status": "invalid_status_value"
            },
            "expected_status": 200  # Backend might accept any string
        },
        {
            "name": "Plan with very long title",
            "data": {
                "patient_id": patient_id,
                "title": "A" * 1000  # Very long title
            },
            "expected_status": 200  # Should work unless there's a length limit
        },
        {
            "name": "Plan with missing patient_id in data",
            "data": {
                "title": "Plan without patient_id in data"
                # patient_id is missing from data but present in URL
            },
            "expected_status": 200  # Should work as patient_id comes from URL
        },
        {
            "name": "Plan with mismatched patient_id",
            "data": {
                "patient_id": "different-patient-id",
                "title": "Plan with mismatched patient_id"
            },
            "expected_status": 200  # Backend might ignore data patient_id and use URL
        },
        {
            "name": "Plan with complex services array",
            "data": {
                "patient_id": patient_id,
                "title": "Plan with complex services",
                "services": [
                    {
                        "tooth": "11",
                        "service": "Лечение кариеса",
                        "price": 5000.0,
                        "quantity": 1,
                        "notes": "Глубокий кариес",
                        "discount": 10.0,
                        "category": "Стоматолог"
                    },
                    {
                        "tooth": "12",
                        "service": "Чистка зубов",
                        "price": 2000.0,
                        "quantity": 1
                    }
                ],
                "total_cost": 6300.0
            },
            "expected_status": 200
        },
        {
            "name": "Plan with Unicode characters",
            "data": {
                "patient_id": patient_id,
                "title": "План с русскими символами и эмодзи 🦷",
                "description": "Описание с различными символами: ñáéíóú çüß 中文 العربية",
                "notes": "Заметки врача с специальными символами"
            },
            "expected_status": 200
        }
    ]
    
    print(f"\n🔍 Running {len(test_cases)} detailed test cases...")
    
    failed_tests = []
    passed_tests = []
    
    for i, test_case in enumerate(test_cases, 1):
        print(f"\n[{i}/{len(test_cases)}] Testing: {test_case['name']}")
        
        url = f"{backend_url}/api/patients/{patient_id}/treatment-plans"
        
        try:
            response = requests.post(url, json=test_case['data'], headers=headers)
            
            print(f"   Status: {response.status_code} (expected: {test_case['expected_status']})")
            
            if response.status_code == test_case['expected_status']:
                print(f"   ✅ PASSED")
                passed_tests.append(test_case['name'])
            else:
                print(f"   ❌ FAILED")
                print(f"   Response: {response.text}")
                failed_tests.append({
                    'name': test_case['name'],
                    'expected': test_case['expected_status'],
                    'actual': response.status_code,
                    'response': response.text
                })
                
                # If we got a 422, let's examine the error details
                if response.status_code == 422:
                    print(f"   🔍 422 VALIDATION ERROR DETAILS:")
                    try:
                        error_data = response.json()
                        print(f"   Error: {json.dumps(error_data, indent=2)}")
                    except:
                        print(f"   Raw error: {response.text}")
        
        except Exception as e:
            print(f"   ❌ EXCEPTION: {str(e)}")
            failed_tests.append({
                'name': test_case['name'],
                'expected': test_case['expected_status'],
                'actual': 'EXCEPTION',
                'response': str(e)
            })
    
    # Summary
    print(f"\n{'='*60}")
    print("DETAILED INVESTIGATION SUMMARY")
    print(f"{'='*60}")
    print(f"Total tests: {len(test_cases)}")
    print(f"Passed: {len(passed_tests)}")
    print(f"Failed: {len(failed_tests)}")
    
    if failed_tests:
        print(f"\n❌ FAILED TESTS:")
        for test in failed_tests:
            print(f"  - {test['name']}: Expected {test['expected']}, got {test['actual']}")
            if test['actual'] == 422:
                print(f"    422 Error details: {test['response']}")
    
    if passed_tests:
        print(f"\n✅ PASSED TESTS:")
        for test in passed_tests:
            print(f"  - {test}")
    
    # Additional investigation: Try to reproduce the exact error scenario
    print(f"\n{'='*60}")
    print("ADDITIONAL INVESTIGATION")
    print(f"{'='*60}")
    
    # Test with the exact data that might be sent from frontend
    frontend_like_data = {
        "patient_id": patient_id,
        "title": "План лечения",
        "description": "Описание плана лечения",
        "services": [
            {
                "tooth": "11",
                "service": "Лечение кариеса",
                "price": 15000.0,
                "quantity": 1,
                "category": "Стоматолог"
            }
        ],
        "total_cost": 15000.0,
        "status": "draft",
        "notes": "Заметки врача"
    }
    
    print("🔍 Testing with frontend-like data structure...")
    response = requests.post(f"{backend_url}/api/patients/{patient_id}/treatment-plans", 
                           json=frontend_like_data, headers=headers)
    
    print(f"Status: {response.status_code}")
    if response.status_code == 422:
        print("🎯 FOUND 422 ERROR WITH FRONTEND-LIKE DATA!")
        print(f"Error details: {response.text}")
        try:
            error_data = response.json()
            print(f"Structured error: {json.dumps(error_data, indent=2)}")
        except:
            pass
    elif response.status_code == 200:
        print("✅ Frontend-like data works fine")
        result = response.json()
        print(f"Created plan ID: {result.get('id', 'Unknown')}")
    else:
        print(f"❌ Unexpected status: {response.status_code}")
        print(f"Response: {response.text}")
    
    return len(failed_tests) == 0

if __name__ == "__main__":
    detailed_422_investigation()