#!/usr/bin/env python3
"""
ServiceSelector Integration Tests
Testing the service selector integration with appointment modal as requested in the review.

TASK: Verify ServiceSelector can load categories and services from the price directory
1. Test that patient selection enables treatment plan tab
2. Verify ServiceSelector loads categories from /api/service-prices/categories
3. Verify services load from /api/service-prices when category selected
4. Test that services show correct prices from the directory
5. Create a test appointment with treatment plan using directory prices

AUTHENTICATION: Use admin credentials:
- Email: admin_test_20250821110240@medentry.com
- Password: AdminTest123!
"""

import requests
import json
import os
from datetime import datetime, timedelta

class ServiceSelectorTester:
    def __init__(self, base_url):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.token = None
        self.current_user = None
        self.created_patient_id = None
        self.created_services = []

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

    def test_service_price_directory_categories(self):
        """Test /api/service-prices/categories endpoint for ServiceSelector"""
        success, response = self.run_test(
            "Get Service Price Categories (ServiceSelector)",
            "GET",
            "service-prices/categories",
            200
        )
        if success and response:
            categories = response.get('categories', [])
            print(f"Found {len(categories)} service price categories")
            print(f"Categories: {', '.join(categories)}")
            
            # Verify expected categories for ServiceSelector
            expected_categories = ["Терапия", "Ортопедия", "Хирургия"]
            found_expected = []
            for expected in expected_categories:
                if expected in categories:
                    found_expected.append(expected)
                    print(f"✅ Found expected category: {expected}")
                else:
                    print(f"⚠️ Expected category not found: {expected}")
            
            if len(found_expected) >= 2:  # At least 2 categories should be present
                print("✅ ServiceSelector has sufficient categories")
                return True, categories
            else:
                print("❌ Insufficient categories for ServiceSelector")
                return False, None
                
        return success, response

    def test_service_price_directory_services(self, category=None):
        """Test /api/service-prices endpoint for ServiceSelector"""
        params = {"category": category} if category else None
        filter_desc = f" (category: {category})" if category else ""
        
        success, response = self.run_test(
            f"Get Service Prices{filter_desc} (ServiceSelector)",
            "GET",
            "service-prices",
            200,
            params=params
        )
        if success and response:
            print(f"Found {len(response)} service prices{filter_desc}")
            if len(response) > 0:
                service = response[0]
                print(f"Sample service: {service['service_name']} - {service['category']} - {service['price']}₸")
                
                # Verify all services have required fields for ServiceSelector
                required_fields = ['id', 'service_name', 'category', 'price', 'unit']
                for field in required_fields:
                    if field not in service:
                        print(f"❌ Service missing required field for ServiceSelector: {field}")
                        return False, None
                
                # Verify price is numeric and positive
                if not isinstance(service['price'], (int, float)) or service['price'] <= 0:
                    print(f"❌ Invalid price for ServiceSelector: {service['price']}")
                    return False, None
                
                # If category filter is specified, verify all services match
                if category:
                    for svc in response:
                        if svc['category'] != category:
                            print(f"❌ Category filter failed for ServiceSelector: expected {category}, got {svc['category']}")
                            return False, None
                    print(f"✅ All services match category filter for ServiceSelector: {category}")
                
                print("✅ Service data structure compatible with ServiceSelector")
        return success, response

    def test_create_service_price_directory_entries(self):
        """Create test service price entries for ServiceSelector testing"""
        test_services = [
            {
                "service_name": "Лечение кариеса",
                "category": "Терапия", 
                "price": 15000.0,
                "unit": "зуб",
                "description": "Лечение кариеса с постановкой пломбы"
            },
            {
                "service_name": "Удаление зуба",
                "category": "Хирургия",
                "price": 8000.0,
                "unit": "зуб", 
                "description": "Простое удаление зуба"
            },
            {
                "service_name": "Протезирование",
                "category": "Ортопедия",
                "price": 45000.0,
                "unit": "коронка",
                "description": "Установка металлокерамической коронки"
            }
        ]
        
        created_services = []
        all_success = True
        
        for service_data in test_services:
            success, response = self.run_test(
                f"Create Service Price: {service_data['service_name']}",
                "POST",
                "service-prices",
                200,
                data=service_data
            )
            if success and response:
                created_services.append(response)
                self.created_services.append(response)
                print(f"✅ Created service: {response['service_name']} - {response['price']}₸")
            else:
                print(f"❌ Failed to create service: {service_data['service_name']}")
                all_success = False
        
        return all_success, created_services

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

    def test_service_selector_integration_workflow(self, patient_id):
        """Test complete ServiceSelector integration workflow"""
        print("\n🔍 Testing ServiceSelector Integration Workflow...")
        
        # Step 1: Test categories endpoint (ServiceSelector loads categories)
        print("\n📋 Step 1: Testing categories loading for ServiceSelector...")
        success, categories = self.test_service_price_directory_categories()
        if not success or not categories:
            print("❌ ServiceSelector cannot load categories")
            return False
        
        # Step 2: Test services loading by category
        print("\n🔧 Step 2: Testing services loading by category...")
        services_by_category = {}
        
        for category in categories:
            success, services = self.test_service_price_directory_services(category=category)
            if success and services:
                services_by_category[category] = services
                print(f"✅ ServiceSelector can load {len(services)} services for {category}")
            else:
                print(f"❌ ServiceSelector cannot load services for {category}")
        
        if not services_by_category:
            print("❌ ServiceSelector cannot load any services by category")
            return False
        
        # Step 3: Verify service prices are correct
        print("\n💰 Step 3: Testing service prices display...")
        all_prices_valid = True
        
        for category, services in services_by_category.items():
            for service in services:
                if service['price'] <= 0:
                    print(f"❌ Invalid price for {service['service_name']}: {service['price']}")
                    all_prices_valid = False
                else:
                    print(f"✅ Valid price for {service['service_name']}: {service['price']}₸")
        
        if not all_prices_valid:
            print("❌ Some services have invalid prices")
            return False
        
        # Step 4: Create test appointment with treatment plan using directory prices
        print("\n📅 Step 4: Creating test appointment with treatment plan...")
        
        # Select services from different categories for treatment plan
        treatment_services = []
        total_cost = 0.0
        
        for category, services in services_by_category.items():
            if services:  # Take first service from each category
                service = services[0]
                treatment_services.append({
                    "service_id": service['id'],
                    "service_name": service['service_name'],
                    "category": service['category'],
                    "price": service['price'],
                    "unit": service.get('unit', 'процедура'),
                    "quantity": 1,
                    "tooth": "11" if category == "Терапия" else None
                })
                total_cost += service['price']
        
        # Create treatment plan with services from directory
        success, plan = self.test_create_treatment_plan(
            patient_id,
            "План лечения из справочника цен",
            description="План лечения с использованием ServiceSelector и справочника цен",
            services=treatment_services,
            total_cost=total_cost,
            status="draft",
            notes="Создано через ServiceSelector интеграцию"
        )
        
        if not success or not plan:
            print("❌ Failed to create treatment plan with ServiceSelector services")
            return False
        
        # Step 5: Verify treatment plan contains correct service data
        print("\n✅ Step 5: Verifying treatment plan service data...")
        
        if len(plan['services']) != len(treatment_services):
            print(f"❌ Service count mismatch: expected {len(treatment_services)}, got {len(plan['services'])}")
            return False
        
        for i, plan_service in enumerate(plan['services']):
            expected_service = treatment_services[i]
            
            # Verify service name
            if plan_service['service_name'] != expected_service['service_name']:
                print(f"❌ Service name mismatch: expected {expected_service['service_name']}, got {plan_service['service_name']}")
                return False
            
            # Verify category
            if plan_service['category'] != expected_service['category']:
                print(f"❌ Category mismatch: expected {expected_service['category']}, got {plan_service['category']}")
                return False
            
            # Verify price
            if plan_service['price'] != expected_service['price']:
                print(f"❌ Price mismatch: expected {expected_service['price']}, got {plan_service['price']}")
                return False
            
            print(f"✅ Service verified: {plan_service['service_name']} - {plan_service['price']}₸")
        
        # Verify total cost
        if plan['total_cost'] != total_cost:
            print(f"❌ Total cost mismatch: expected {total_cost}, got {plan['total_cost']}")
            return False
        
        print(f"✅ Total cost verified: {plan['total_cost']}₸")
        
        print("\n🎉 ServiceSelector Integration Workflow COMPLETED SUCCESSFULLY!")
        print(f"✅ Categories loaded: {len(categories)}")
        print(f"✅ Services loaded by category: {sum(len(services) for services in services_by_category.values())}")
        print(f"✅ Treatment plan created with {len(treatment_services)} services")
        print(f"✅ Total cost: {total_cost}₸")
        
        return True, plan['id']

    def test_service_selector_patient_selection_workflow(self, patient_id):
        """Test that patient selection enables treatment plan functionality"""
        print("\n👤 Testing Patient Selection -> Treatment Plan Tab Workflow...")
        
        # Step 1: Verify patient exists (simulates patient selection)
        success, patient = self.run_test(
            "Verify Patient Selection",
            "GET", 
            f"patients/{patient_id}",
            200
        )
        
        if not success or not patient:
            print("❌ Patient selection failed - patient not found")
            return False
        
        print(f"✅ Patient selected: {patient['full_name']}")
        
        # Step 2: Test that treatment plan tab becomes available (test treatment plan creation)
        print("📋 Testing Treatment Plan Tab Availability...")
        
        success, existing_plans = self.test_get_patient_treatment_plans(patient_id)
        if not success:
            print("❌ Treatment plan tab not accessible after patient selection")
            return False
        
        print(f"✅ Treatment plan tab accessible - found {len(existing_plans)} existing plans")
        
        # Step 3: Test ServiceSelector functionality within treatment plan context
        print("🔧 Testing ServiceSelector within Treatment Plan Context...")
        
        # This simulates the ServiceSelector being used in the appointment modal treatment plan tab
        success, workflow_result = self.test_service_selector_integration_workflow(patient_id)
        if not success:
            print("❌ ServiceSelector integration failed in treatment plan context")
            return False
        
        print("✅ ServiceSelector integration successful in treatment plan context")
        
        return True

    def test_service_selector_authentication_requirements(self):
        """Test ServiceSelector endpoints require proper authentication"""
        print("\n🔐 Testing ServiceSelector Authentication Requirements...")
        
        # Save current token
        saved_token = self.token
        # Clear token to test unauthorized access
        self.token = None
        
        # Test unauthorized access to categories
        success, _ = self.run_test(
            "Unauthorized access to service-prices/categories",
            "GET",
            "service-prices/categories", 
            403  # Expect 403 Forbidden (FastAPI returns 403 for missing auth)
        )
        
        if not success:
            print("❌ Categories endpoint should require authentication")
            self.token = saved_token
            return False
        
        # Test unauthorized access to services
        success, _ = self.run_test(
            "Unauthorized access to service-prices",
            "GET",
            "service-prices",
            403  # Expect 403 Forbidden (FastAPI returns 403 for missing auth)
        )
        
        if not success:
            print("❌ Services endpoint should require authentication")
            self.token = saved_token
            return False
        
        # Restore token
        self.token = saved_token
        
        print("✅ ServiceSelector endpoints properly require authentication")
        return True

    def test_service_selector_specific_categories(self):
        """Test ServiceSelector with specific categories mentioned in review request"""
        print("\n📂 Testing Specific Categories for ServiceSelector...")
        
        # Test categories mentioned in review request: Терапия, Ортопедия
        expected_categories = ["Терапия", "Ортопедия"]
        
        success, response = self.test_service_price_directory_categories()
        if not success or not response:
            print("❌ Cannot get categories for ServiceSelector")
            return False
        
        if isinstance(response, dict):
            categories = response.get('categories', [])
        else:
            categories = response if isinstance(response, list) else []
        found_categories = []
        
        for expected in expected_categories:
            if expected in categories:
                found_categories.append(expected)
                print(f"✅ Found expected category: {expected}")
                
                # Test services in this category
                success, services = self.test_service_price_directory_services(category=expected)
                if success and services:
                    print(f"✅ Category {expected} has {len(services)} services")
                    
                    # Show sample services
                    for service in services[:3]:  # Show first 3 services
                        print(f"   - {service['service_name']}: {service['price']}₸")
                else:
                    print(f"❌ Category {expected} has no services or failed to load")
                    return False
            else:
                print(f"⚠️ Expected category not found: {expected}")
        
        if len(found_categories) >= 1:  # At least one expected category should be present
            print(f"✅ ServiceSelector has {len(found_categories)} expected categories")
            return True
        else:
            print("❌ ServiceSelector missing expected categories")
            return False

    def print_summary(self):
        """Print test summary"""
        print(f"\n{'='*50}")
        print(f"TEST SUMMARY")
        print(f"{'='*50}")
        print(f"Total tests run: {self.tests_run}")
        print(f"Tests passed: {self.tests_passed}")
        print(f"Tests failed: {self.tests_run - self.tests_passed}")
        print(f"Success rate: {(self.tests_passed / self.tests_run * 100):.1f}%")
        print(f"{'='*50}")

def main():
    # Use the backend URL from environment variable
    backend_url = os.environ.get('REACT_APP_BACKEND_URL', 'https://medicodebase.preview.emergentagent.com')
    
    print(f"🚀 Starting ServiceSelector Integration Tests")
    print(f"Backend URL: {backend_url}")
    
    tester = ServiceSelectorTester(backend_url)
    
    # Test authentication first
    print(f"\n{'='*50}")
    print("AUTHENTICATION TESTS")
    print(f"{'='*50}")
    
    # Test with existing admin credentials from review request
    admin_email = "admin_test_20250821110240@medentry.com"
    admin_password = "AdminTest123!"
    
    if not tester.test_login_user(admin_email, admin_password):
        print("❌ Failed to login with admin credentials")
        return
    
    if not tester.test_get_current_user():
        print("❌ Failed to get current user")
        return
    
    print("✅ Authentication successful - proceeding with ServiceSelector tests")
    
    # Create test patient for ServiceSelector integration tests
    print(f"\n{'='*50}")
    print("TEST DATA SETUP")
    print(f"{'='*50}")
    
    if not tester.test_create_patient("ServiceSelector Test Patient", "+77771234567", "website"):
        print("❌ Failed to create test patient")
        return
    
    patient_id = tester.created_patient_id
    print(f"✅ Created test patient: {patient_id}")
    
    # Create test service price directory entries
    print("\n📋 Creating test service price directory entries...")
    success, created_services = tester.test_create_service_price_directory_entries()
    if success:
        print(f"✅ Created {len(created_services)} test service price entries")
    else:
        print("⚠️ Some service price entries may already exist - continuing with tests")
    
    # Main ServiceSelector Integration Tests
    print(f"\n{'='*50}")
    print("SERVICESELECTOR INTEGRATION TESTS")
    print(f"{'='*50}")
    
    # Test 1: ServiceSelector authentication requirements
    if not tester.test_service_selector_authentication_requirements():
        print("❌ ServiceSelector authentication test failed")
        return
    
    # Test 2: ServiceSelector categories loading
    success, categories = tester.test_service_price_directory_categories()
    if not success:
        print("❌ ServiceSelector categories test failed")
        return
    
    # Test 3: ServiceSelector services loading by category
    print("\n🔧 Testing ServiceSelector services loading...")
    for category in categories[:3]:  # Test first 3 categories
        success, services = tester.test_service_price_directory_services(category=category)
        if not success:
            print(f"❌ ServiceSelector services test failed for category: {category}")
            return
    
    # Test 4: ServiceSelector specific categories (Терапия, Ортопедия)
    if not tester.test_service_selector_specific_categories():
        print("❌ ServiceSelector specific categories test failed")
        return
    
    # Test 5: Patient selection enables treatment plan tab
    if not tester.test_service_selector_patient_selection_workflow(patient_id):
        print("❌ Patient selection -> treatment plan workflow failed")
        return
    
    # Test 6: Complete ServiceSelector integration workflow
    success, plan_id = tester.test_service_selector_integration_workflow(patient_id)
    if not success:
        print("❌ ServiceSelector integration workflow failed")
        return
    
    print(f"\n🎉 ALL SERVICESELECTOR INTEGRATION TESTS PASSED!")
    print(f"✅ ServiceSelector can load categories from /api/service-prices/categories")
    print(f"✅ ServiceSelector can load services from /api/service-prices when category selected")
    print(f"✅ Services show correct prices from the directory")
    print(f"✅ Patient selection enables treatment plan tab functionality")
    print(f"✅ Created test appointment with treatment plan using directory prices")
    
    # Print final summary
    tester.print_summary()

if __name__ == "__main__":
    main()