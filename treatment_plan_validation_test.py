import requests
import json
from datetime import datetime

def test_treatment_plan_validation_issue():
    """
    Test to demonstrate the 422 validation error issue with treatment plans
    """
    backend_url = "https://medentry-portal.preview.emergentagent.com"
    
    # Authenticate as admin
    print("🔐 Authenticating as admin...")
    auth_response = requests.post(f"{backend_url}/api/auth/register", json={
        "email": f"admin_validation_{datetime.now().strftime('%Y%m%d%H%M%S')}@test.com",
        "password": "Test123!",
        "full_name": "Admin Validation Test",
        "role": "admin"
    })
    
    if auth_response.status_code != 200:
        print(f"❌ Authentication failed: {auth_response.status_code}")
        return False
    
    token = auth_response.json()["access_token"]
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
    
    print("✅ Authentication successful")
    
    # Target patient ID
    patient_id = "1db07558-3805-4588-95d1-f79fe4bcd7ce"
    
    print(f"\n🎯 DEMONSTRATING THE 422 VALIDATION ERROR")
    print(f"{'='*60}")
    
    # Test 1: Frontend-style request WITHOUT patient_id in body (this should work but currently fails)
    print("\n1️⃣ Testing frontend-style request (patient_id only in URL, not in body)")
    frontend_data = {
        "title": "План лечения пациента",
        "description": "Описание плана лечения",
        "services": [
            {
                "tooth": "11",
                "service": "Лечение кариеса",
                "price": 15000.0
            }
        ],
        "total_cost": 15000.0,
        "status": "draft",
        "notes": "Заметки врача"
    }
    
    response = requests.post(f"{backend_url}/api/patients/{patient_id}/treatment-plans", 
                           json=frontend_data, headers=headers)
    
    print(f"Status: {response.status_code}")
    if response.status_code == 422:
        print("❌ VALIDATION ERROR (This is the bug!)")
        try:
            error_data = response.json()
            print(f"Error details: {json.dumps(error_data, indent=2)}")
            
            # Check if the error is about missing patient_id
            if any(detail.get('loc') == ['body', 'patient_id'] for detail in error_data.get('detail', [])):
                print("🎯 CONFIRMED: The error is about missing patient_id in request body")
                print("💡 This is redundant since patient_id is already in the URL path")
        except:
            print(f"Raw error: {response.text}")
    else:
        print("✅ Request succeeded (unexpected)")
    
    # Test 2: Same request WITH patient_id in body (this works)
    print("\n2️⃣ Testing same request WITH patient_id in body")
    frontend_data_with_patient_id = frontend_data.copy()
    frontend_data_with_patient_id["patient_id"] = patient_id
    
    response = requests.post(f"{backend_url}/api/patients/{patient_id}/treatment-plans", 
                           json=frontend_data_with_patient_id, headers=headers)
    
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        print("✅ Request succeeded when patient_id is included in body")
        result = response.json()
        print(f"Created plan ID: {result.get('id', 'Unknown')}")
    else:
        print(f"❌ Unexpected error: {response.text}")
    
    # Test 3: Minimal request without patient_id in body
    print("\n3️⃣ Testing minimal request (only title, no patient_id in body)")
    minimal_data = {
        "title": "Минимальный план лечения"
    }
    
    response = requests.post(f"{backend_url}/api/patients/{patient_id}/treatment-plans", 
                           json=minimal_data, headers=headers)
    
    print(f"Status: {response.status_code}")
    if response.status_code == 422:
        print("❌ VALIDATION ERROR for minimal request")
        try:
            error_data = response.json()
            missing_fields = [detail.get('loc')[-1] for detail in error_data.get('detail', []) 
                            if detail.get('type') == 'missing']
            print(f"Missing fields: {missing_fields}")
        except:
            print(f"Raw error: {response.text}")
    else:
        print("✅ Minimal request succeeded (unexpected)")
    
    print(f"\n{'='*60}")
    print("ANALYSIS AND SOLUTION")
    print(f"{'='*60}")
    
    print("\n🔍 ROOT CAUSE:")
    print("The TreatmentPlanCreate model requires 'patient_id' as a mandatory field,")
    print("but the endpoint already gets patient_id from the URL path parameter.")
    print("This creates redundancy and validation errors when frontends don't include")
    print("patient_id in the request body (which is the correct approach).")
    
    print("\n💡 SOLUTION:")
    print("Make patient_id optional in TreatmentPlanCreate model since it's already")
    print("available from the URL path. The endpoint should use the path parameter,")
    print("not the body parameter for patient_id.")
    
    print("\n🛠️ RECOMMENDED FIX:")
    print("Change TreatmentPlanCreate model:")
    print("  patient_id: str  # Current (causes 422 errors)")
    print("  ↓")
    print("  patient_id: Optional[str] = None  # Fixed (optional)")
    
    print("\nOr better yet, remove patient_id from TreatmentPlanCreate entirely")
    print("since it's redundant with the URL path parameter.")
    
    return True

if __name__ == "__main__":
    test_treatment_plan_validation_issue()