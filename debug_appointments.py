import requests
import json
from datetime import datetime

def test_appointments_endpoint():
    base_url = "https://medrec-system-1.preview.emergentagent.com"
    
    # First register an admin user
    admin_email = f"debug_admin_{datetime.now().strftime('%Y%m%d%H%M%S')}@test.com"
    admin_password = "Test123!"
    admin_name = "Debug Admin"
    
    print("Registering admin user...")
    response = requests.post(f"{base_url}/api/auth/register", json={
        "email": admin_email,
        "password": admin_password,
        "full_name": admin_name,
        "role": "admin"
    })
    
    if response.status_code != 200:
        print(f"Failed to register admin: {response.status_code} - {response.text}")
        return
    
    token = response.json()["access_token"]
    headers = {'Authorization': f'Bearer {token}'}
    
    print("Testing GET /api/appointments...")
    response = requests.get(f"{base_url}/api/appointments", headers=headers)
    
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 500:
        print("500 error detected. This suggests an issue with the aggregation pipeline.")

if __name__ == "__main__":
    test_appointments_endpoint()