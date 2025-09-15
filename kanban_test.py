#!/usr/bin/env python3
"""
Kanban Appointments Testing Script
Tests the creation of multiple appointments with different statuses for kanban functionality
"""

import requests
import json
from datetime import datetime, timedelta
import sys
import os

class KanbanTester:
    def __init__(self, base_url):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.token = None
        self.current_user = None
        self.created_doctor_id = None
        self.created_appointments = []

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

    def login_doctor(self, email, password):
        """Login with doctor credentials"""
        success, response = self.run_test(
            "Doctor Login",
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
            print(f"✅ Logged in as: {response['user']['full_name']} ({response['user']['role']})")
            return True
        return False

    def get_current_user(self):
        """Get current user info"""
        success, response = self.run_test(
            "Get current user",
            "GET",
            "auth/me",
            200
        )
        if success and response:
            print(f"✅ Current user: {response['full_name']} ({response['role']})")
        return success

    def get_doctors(self):
        """Get available doctors"""
        success, response = self.run_test(
            "Get Doctors",
            "GET",
            "doctors",
            200
        )
        if success and response and len(response) > 0:
            self.created_doctor_id = response[0]["id"]
            print(f"✅ Using doctor: {response[0]['full_name']} (ID: {self.created_doctor_id})")
            return True
        return False

    def create_patient(self, full_name, phone):
        """Create a patient"""
        success, response = self.run_test(
            f"Create Patient: {full_name}",
            "POST",
            "patients",
            200,
            data={
                "full_name": full_name,
                "phone": phone,
                "source": "other"
            }
        )
        if success and response and "id" in response:
            print(f"✅ Created patient: {full_name} (ID: {response['id']})")
            return response["id"]
        return None

    def create_appointment(self, patient_id, doctor_id, date, time, reason):
        """Create an appointment"""
        success, response = self.run_test(
            f"Create Appointment for {date} {time}",
            "POST",
            "appointments",
            200,
            data={
                "patient_id": patient_id,
                "doctor_id": doctor_id,
                "appointment_date": date,
                "appointment_time": time,
                "reason": reason
            }
        )
        if success and response and "id" in response:
            print(f"✅ Created appointment: {response['id']}")
            return response["id"]
        return None

    def update_appointment_status(self, appointment_id, status):
        """Update appointment status"""
        success, response = self.run_test(
            f"Update Appointment Status to {status}",
            "PUT",
            f"appointments/{appointment_id}",
            200,
            data={"status": status}
        )
        if success and response:
            if response["status"] == status:
                print(f"✅ Status updated to {status}")
                return True
            else:
                print(f"❌ Status update failed: expected {status}, got {response['status']}")
        return False

    def get_appointments_in_range(self, days_back=7, days_forward=7):
        """Get appointments within date range"""
        today = datetime.now()
        date_from = (today - timedelta(days=days_back)).strftime("%Y-%m-%d")
        date_to = (today + timedelta(days=days_forward)).strftime("%Y-%m-%d")
        
        success, response = self.run_test(
            f"Get Appointments (±{days_back}/{days_forward} days)",
            "GET",
            "appointments",
            200,
            params={
                "date_from": date_from,
                "date_to": date_to
            }
        )
        
        if success and response:
            print(f"✅ Retrieved {len(response)} appointments")
            return response
        return None

    def verify_appointment_fields(self, appointments):
        """Verify appointments have required fields for kanban"""
        required_fields = [
            "id", "patient_id", "doctor_id", "appointment_date", 
            "appointment_time", "status", "reason", "patient_name", 
            "doctor_name", "doctor_specialty"
        ]
        
        valid_statuses = ["unconfirmed", "confirmed", "arrived", "in_progress", "completed", "cancelled", "no_show"]
        status_counts = {}
        
        for appointment in appointments:
            # Check required fields
            for field in required_fields:
                if field not in appointment:
                    print(f"❌ Appointment {appointment.get('id', 'unknown')} missing field: {field}")
                    return False
            
            # Verify status is valid
            status = appointment["status"]
            if status not in valid_statuses:
                print(f"❌ Invalid status: {status}")
                return False
            
            # Count statuses
            status_counts[status] = status_counts.get(status, 0) + 1
        
        print("✅ All appointments have required fields")
        
        # Display status distribution
        print("\n📊 Appointment Status Distribution:")
        for status, count in status_counts.items():
            print(f"   {status}: {count} appointments")
        
        return True

    def create_kanban_test_appointments(self):
        """Create test appointments with different statuses for kanban"""
        print("\n🎯 Creating Kanban Test Appointments")
        print("=" * 50)
        
        today = datetime.now()
        
        # Define test appointments with different statuses
        test_appointments = [
            {
                "patient_name": "Kanban Patient 1 - Unconfirmed",
                "phone": "+77001111111",
                "date": (today + timedelta(days=1)).strftime("%Y-%m-%d"),
                "time": "09:00",
                "reason": "Routine dental checkup - unconfirmed",
                "target_status": "unconfirmed"
            },
            {
                "patient_name": "Kanban Patient 2 - Confirmed",
                "phone": "+77002222222",
                "date": (today + timedelta(days=2)).strftime("%Y-%m-%d"),
                "time": "10:30",
                "reason": "Dental cleaning - confirmed",
                "target_status": "confirmed"
            },
            {
                "patient_name": "Kanban Patient 3 - In Progress",
                "phone": "+77003333333",
                "date": (today + timedelta(days=3)).strftime("%Y-%m-%d"),
                "time": "14:00",
                "reason": "Root canal treatment - in progress",
                "target_status": "in_progress"
            },
            {
                "patient_name": "Kanban Patient 4 - Completed",
                "phone": "+77004444444",
                "date": (today - timedelta(days=1)).strftime("%Y-%m-%d"),
                "time": "11:00",
                "reason": "Filling replacement - completed",
                "target_status": "completed"
            }
        ]
        
        created_appointments = []
        
        for i, appt_data in enumerate(test_appointments, 1):
            print(f"\n📝 Creating appointment {i}/{len(test_appointments)}: {appt_data['target_status']}")
            
            # Create patient
            patient_id = self.create_patient(appt_data["patient_name"], appt_data["phone"])
            if not patient_id:
                print(f"❌ Failed to create patient: {appt_data['patient_name']}")
                return False
            
            # Create appointment
            appointment_id = self.create_appointment(
                patient_id,
                self.created_doctor_id,
                appt_data["date"],
                appt_data["time"],
                appt_data["reason"]
            )
            
            if not appointment_id:
                print(f"❌ Failed to create appointment for {appt_data['patient_name']}")
                return False
            
            # Update status if not default (unconfirmed)
            if appt_data["target_status"] != "unconfirmed":
                if not self.update_appointment_status(appointment_id, appt_data["target_status"]):
                    print(f"❌ Failed to update status to {appt_data['target_status']}")
                    return False
            
            created_appointments.append({
                "id": appointment_id,
                "patient_id": patient_id,
                "status": appt_data["target_status"],
                "date": appt_data["date"],
                "time": appt_data["time"],
                "reason": appt_data["reason"],
                "patient_name": appt_data["patient_name"]
            })
            
            print(f"✅ Successfully created: {appt_data['patient_name']} - {appt_data['target_status']}")
        
        self.created_appointments = created_appointments
        print(f"\n✅ Successfully created {len(created_appointments)} kanban test appointments")
        return True

    def test_kanban_retrieval(self):
        """Test retrieving appointments for kanban display"""
        print("\n🎯 Testing Kanban Appointment Retrieval")
        print("=" * 50)
        
        # Get appointments in ±7 days range
        appointments = self.get_appointments_in_range(7, 7)
        if not appointments:
            print("❌ Failed to retrieve appointments")
            return False
        
        # Verify appointments have required fields
        if not self.verify_appointment_fields(appointments):
            print("❌ Appointment field verification failed")
            return False
        
        # Check if our test appointments are included
        test_appointment_ids = [appt["id"] for appt in self.created_appointments]
        found_test_appointments = [appt for appt in appointments if appt["id"] in test_appointment_ids]
        
        print(f"\n✅ Found {len(found_test_appointments)}/{len(self.created_appointments)} test appointments in results")
        
        # Verify different statuses are present
        statuses_found = set(appt["status"] for appt in found_test_appointments)
        expected_statuses = {"unconfirmed", "confirmed", "in_progress", "completed"}
        
        if expected_statuses.issubset(statuses_found):
            print("✅ All expected kanban statuses found in results")
        else:
            missing_statuses = expected_statuses - statuses_found
            print(f"⚠️ Missing statuses: {missing_statuses}")
        
        return True

    def test_status_workflow(self):
        """Test kanban status workflow transitions"""
        print("\n🎯 Testing Kanban Status Workflow")
        print("=" * 50)
        
        if not self.created_appointments:
            print("❌ No test appointments available for workflow testing")
            return False
        
        # Use the first appointment for workflow testing
        test_appointment = self.created_appointments[0]
        appointment_id = test_appointment["id"]
        
        print(f"Testing workflow with appointment: {appointment_id}")
        
        # Test status progression: unconfirmed -> confirmed -> in_progress -> completed
        workflow_statuses = ["confirmed", "in_progress", "completed"]
        
        for status in workflow_statuses:
            if not self.update_appointment_status(appointment_id, status):
                print(f"❌ Failed to update to {status}")
                return False
        
        print("✅ Kanban status workflow completed successfully")
        return True

    def run_complete_kanban_test(self):
        """Run complete kanban functionality test"""
        print("\n" + "=" * 80)
        print("🎯 KANBAN FUNCTIONALITY COMPREHENSIVE TEST")
        print("=" * 80)
        
        # Step 1: Authentication
        print("\n📋 STEP 1: AUTHENTICATION")
        print("-" * 40)
        
        doctor_email = "doctor_test_20250821110240@medentry.com"
        doctor_password = "DoctorTest123!"
        
        if not self.login_doctor(doctor_email, doctor_password):
            print("❌ Doctor authentication failed")
            return False
        
        if not self.get_current_user():
            print("❌ Failed to get current user")
            return False
        
        # Step 2: Get existing doctors
        print("\n📋 STEP 2: GET EXISTING DOCTORS")
        print("-" * 40)
        
        if not self.get_doctors():
            print("❌ Failed to get doctors")
            return False
        
        # Step 3: Create test appointments
        print("\n📋 STEP 3: CREATE TEST APPOINTMENTS")
        print("-" * 40)
        
        if not self.create_kanban_test_appointments():
            print("❌ Failed to create kanban test appointments")
            return False
        
        # Step 4: Test appointment retrieval
        print("\n📋 STEP 4: TEST APPOINTMENT RETRIEVAL")
        print("-" * 40)
        
        if not self.test_kanban_retrieval():
            print("❌ Failed kanban retrieval test")
            return False
        
        # Step 5: Test status workflow
        print("\n📋 STEP 5: TEST STATUS WORKFLOW")
        print("-" * 40)
        
        if not self.test_status_workflow():
            print("❌ Failed status workflow test")
            return False
        
        # Final verification
        print("\n📋 FINAL VERIFICATION")
        print("-" * 40)
        
        final_appointments = self.get_appointments_in_range(7, 7)
        if final_appointments:
            self.verify_appointment_fields(final_appointments)
        
        return True

    def print_summary(self):
        """Print test summary"""
        print(f"\n{'='*60}")
        print(f"KANBAN TEST SUMMARY")
        print(f"{'='*60}")
        print(f"Total tests run: {self.tests_run}")
        print(f"Tests passed: {self.tests_passed}")
        print(f"Tests failed: {self.tests_run - self.tests_passed}")
        print(f"Success rate: {(self.tests_passed / self.tests_run * 100):.1f}%" if self.tests_run > 0 else "No tests run")
        
        if self.created_appointments:
            print(f"\nCreated {len(self.created_appointments)} test appointments:")
            for appt in self.created_appointments:
                print(f"  - {appt['patient_name']}: {appt['status']} ({appt['date']} {appt['time']})")
        
        print(f"{'='*60}")

def main():
    # Get backend URL from environment
    backend_url = os.environ.get('REACT_APP_BACKEND_URL', 'https://medicodebase.preview.emergentagent.com')
    
    print("🚀 Starting Kanban Appointments Testing")
    print(f"Backend URL: {backend_url}")
    print("=" * 80)
    
    tester = KanbanTester(backend_url)
    
    # Run complete kanban test
    success = tester.run_complete_kanban_test()
    
    # Print summary
    tester.print_summary()
    
    if success:
        print("\n✅ KANBAN FUNCTIONALITY TEST COMPLETED SUCCESSFULLY")
        print("✅ All appointments created with different statuses")
        print("✅ GET /api/appointments endpoint verified")
        print("✅ Appointment status fields verified")
        print("✅ Status workflow transitions tested")
        return 0
    else:
        print("\n❌ KANBAN FUNCTIONALITY TEST FAILED")
        return 1

if __name__ == "__main__":
    sys.exit(main())