#!/usr/bin/env python3
"""
Test script for password expiry functionality
"""

import requests
import json
from datetime import datetime, timedelta
import time

# Configuration
BASE_URL = "http://localhost:8000/api"

def test_password_expiry():
    print("Testing password expiry functionality...")

    # Step 1: Create a test user
    print("\n1. Creating test user...")
    register_data = {
        "email": "test_expiry@example.com",
        "password": "testpass123",
        "full_name": "Test User",
        "role": "patient"
    }

    try:
        response = requests.post(f"{BASE_URL}/auth/register", json=register_data)
        if response.status_code == 200:
            print("✓ User registered successfully")
            token = response.json()["access_token"]
        else:
            print(f"✗ Registration failed: {response.text}")
            return
    except Exception as e:
        print(f"✗ Connection error: {e}")
        return

    # Step 2: Manually set password expiry to past date (simulate expired password)
    print("\n2. Simulating password expiry...")
    # This would normally be done in the database directly
    # For testing, we'll create a user with already expired password

    # Step 3: Try to access protected endpoint
    print("\n3. Testing access with expired password...")
    headers = {"Authorization": f"Bearer {token}"}

    try:
        response = requests.get(f"{BASE_URL}/auth/me", headers=headers)
        if response.status_code == 401:
            error_detail = response.json().get("detail", "")
            if "Password expired" in error_detail:
                print("✓ Password expiry correctly detected")
            else:
                print(f"✗ Unexpected error: {error_detail}")
        else:
            print(f"✗ Expected 401, got {response.status_code}")
    except Exception as e:
        print(f"✗ Request error: {e}")

    # Step 4: Test password change
    print("\n4. Testing password change...")
    change_data = {
        "current_password": "testpass123",
        "new_password": "newtestpass123"
    }

    try:
        response = requests.post(f"{BASE_URL}/auth/change-password", json=change_data, headers=headers)
        if response.status_code == 200:
            print("✓ Password change successful")
        else:
            print(f"✗ Password change failed: {response.text}")
    except Exception as e:
        print(f"✗ Request error: {e}")

    print("\nTest completed!")

if __name__ == "__main__":
    test_password_expiry()
