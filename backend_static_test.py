#!/usr/bin/env python3
"""
Test backend static file serving on internal port to verify functionality
"""

import requests
import json
from datetime import datetime
import sys

def test_backend_static_serving():
    """Test backend static file serving on localhost:8001"""
    print("=" * 60)
    print("BACKEND STATIC FILE SERVING TEST (Internal Port)")
    print("=" * 60)
    
    backend_url = "http://localhost:8001"
    
    # Register admin user
    admin_email = f"static_test_{datetime.now().strftime('%Y%m%d%H%M%S')}@test.com"
    response = requests.post(f"{backend_url}/api/auth/register", json={
        "email": admin_email,
        "password": "Test123!",
        "full_name": "Static Test Admin",
        "role": "admin"
    })
    
    if response.status_code != 200:
        print("❌ Admin registration failed")
        return False
    
    token = response.json()["access_token"]
    print("✅ Admin registered successfully")
    
    # Create test patient
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    response = requests.post(f"{backend_url}/api/patients", 
                           headers=headers,
                           json={
                               "full_name": "Static Test Patient",
                               "phone": "+7 999 123 4567",
                               "source": "phone"
                           })
    
    if response.status_code != 200:
        print("❌ Patient creation failed")
        return False
    
    patient_id = response.json()["id"]
    print("✅ Test patient created")
    
    # Upload test document
    headers = {'Authorization': f'Bearer {token}'}
    test_content = b"Test content for static serving verification"
    files = {'file': ('test_static.txt', test_content, 'text/plain')}
    data = {'description': 'Static serving test document'}
    
    response = requests.post(f"{backend_url}/api/patients/{patient_id}/documents",
                           files=files, data=data, headers=headers)
    
    if response.status_code != 200:
        print("❌ Document upload failed")
        return False
    
    doc_data = response.json()
    filename = doc_data['filename']
    print(f"✅ Document uploaded: {filename}")
    
    # Test static file access on internal port
    static_response = requests.get(f"{backend_url}/uploads/{filename}")
    
    if static_response.status_code == 200:
        if static_response.content == test_content:
            print("✅ Static file serving works correctly on internal port")
            print(f"   Content-Type: {static_response.headers.get('content-type')}")
            print(f"   Content-Length: {static_response.headers.get('content-length')}")
            return True
        else:
            print("❌ Static file content mismatch")
            return False
    else:
        print(f"❌ Static file access failed: {static_response.status_code}")
        return False

def test_external_routing_issue():
    """Test and document the external routing issue"""
    print("\n" + "=" * 60)
    print("EXTERNAL ROUTING ISSUE ANALYSIS")
    print("=" * 60)
    
    external_url = "https://medrecord-enhance.preview.emergentagent.com"
    
    # Test API access (should work)
    api_response = requests.get(f"{external_url}/api/")
    print(f"API Access: {api_response.status_code} (Expected: 405 Method Not Allowed)")
    
    # Test uploads access (currently broken)
    uploads_response = requests.get(f"{external_url}/uploads/nonexistent.txt")
    print(f"Uploads Access: {uploads_response.status_code}")
    print(f"Content-Type: {uploads_response.headers.get('content-type')}")
    
    if 'text/html' in uploads_response.headers.get('content-type', ''):
        print("❌ CRITICAL ISSUE: /uploads requests are being served by frontend React app")
        print("   This means the Kubernetes ingress is not routing /uploads to backend")
        return False
    else:
        print("✅ Uploads routing appears to be working")
        return True

if __name__ == "__main__":
    backend_works = test_backend_static_serving()
    routing_works = test_external_routing_issue()
    
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Backend Static Serving (Internal): {'✅ WORKING' if backend_works else '❌ BROKEN'}")
    print(f"External Routing (/uploads):       {'✅ WORKING' if routing_works else '❌ BROKEN'}")
    
    if backend_works and not routing_works:
        print("\n🔧 DIAGNOSIS: Backend static file serving is implemented correctly,")
        print("   but external routing configuration needs to be fixed to route")
        print("   /uploads requests to the backend instead of the frontend.")
    
    sys.exit(0 if backend_works else 1)