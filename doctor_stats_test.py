import requests
import json
from datetime import datetime, timedelta
import sys

class DoctorStatsAPITester:
    def __init__(self, base_url):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.token = None
        self.created_patient_id = None
        self.created_doctor_id = None

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
            print(f"✅ Logged in user: {response['user']['full_name']} ({response['user']['role']})")
            return True
        return False

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
            return True
        return False

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
            return True
        return False

    def test_doctor_statistics_individual(self, date_from=None, date_to=None):
        """Test individual doctor statistics with working hours and utilization"""
        params = {}
        if date_from:
            params["date_from"] = date_from
        if date_to:
            params["date_to"] = date_to
        
        filter_desc = ""
        if date_from and date_to:
            filter_desc = f" from {date_from} to {date_to}"
        elif date_from:
            filter_desc = f" from {date_from}"
        elif date_to:
            filter_desc = f" until {date_to}"
            
        success, response = self.run_test(
            f"Get Individual Doctor Statistics{filter_desc}",
            "GET",
            "doctors/statistics/individual",
            200,
            params=params
        )
        
        if success and response:
            print(f"✅ Individual doctor statistics retrieved successfully{filter_desc}")
            
            # Verify response structure
            if "doctor_statistics" not in response or "summary" not in response:
                print("❌ Response missing required structure (doctor_statistics, summary)")
                return False, None
            
            doctor_stats = response["doctor_statistics"]
            summary = response["summary"]
            
            print(f"Found statistics for {len(doctor_stats)} doctors")
            
            # Verify new working hours and utilization fields
            required_fields = [
                "doctor_id", "doctor_name", "doctor_specialty", "total_appointments",
                "completed_appointments", "total_worked_hours", "total_scheduled_hours",
                "utilization_rate", "avg_revenue_per_hour", "total_revenue"
            ]
            
            if len(doctor_stats) > 0:
                doctor = doctor_stats[0]
                for field in required_fields:
                    if field not in doctor:
                        print(f"❌ Missing required field in doctor statistics: {field}")
                        return False, None
                
                # Verify utilization rate calculation
                if doctor["total_scheduled_hours"] > 0:
                    expected_utilization = (doctor["total_worked_hours"] / doctor["total_scheduled_hours"]) * 100
                    actual_utilization = doctor["utilization_rate"]
                    if abs(expected_utilization - actual_utilization) > 0.1:
                        print(f"❌ Utilization rate calculation incorrect: expected {expected_utilization:.1f}%, got {actual_utilization:.1f}%")
                        return False, None
                    else:
                        print(f"✅ Utilization rate correctly calculated: {actual_utilization:.1f}%")
                
                # Verify avg_revenue_per_hour calculation
                if doctor["total_worked_hours"] > 0:
                    expected_avg_revenue = doctor["total_revenue"] / doctor["total_worked_hours"]
                    actual_avg_revenue = doctor["avg_revenue_per_hour"]
                    if abs(expected_avg_revenue - actual_avg_revenue) > 0.01:
                        print(f"❌ Average revenue per hour calculation incorrect: expected {expected_avg_revenue:.2f}, got {actual_avg_revenue:.2f}")
                        return False, None
                    else:
                        print(f"✅ Average revenue per hour correctly calculated: {actual_avg_revenue:.2f}")
                
                print(f"Sample doctor: {doctor['doctor_name']} ({doctor['doctor_specialty']})")
                print(f"  Total appointments: {doctor['total_appointments']}")
                print(f"  Completed appointments: {doctor['completed_appointments']}")
                print(f"  Total worked hours: {doctor['total_worked_hours']:.2f}")
                print(f"  Total scheduled hours: {doctor['total_scheduled_hours']:.2f}")
                print(f"  Utilization rate: {doctor['utilization_rate']:.1f}%")
                print(f"  Total revenue: {doctor['total_revenue']:.2f}")
                print(f"  Avg revenue per hour: {doctor['avg_revenue_per_hour']:.2f}")
            
            # Verify summary statistics
            required_summary_fields = [
                "total_doctors", "active_doctors", "high_utilization_doctors",
                "avg_worked_hours", "avg_utilization_rate"
            ]
            
            for field in required_summary_fields:
                if field not in summary:
                    print(f"❌ Missing required field in summary: {field}")
                    return False, None
            
            print(f"Summary statistics:")
            print(f"  Total doctors: {summary['total_doctors']}")
            print(f"  Active doctors: {summary['active_doctors']}")
            print(f"  High utilization doctors (>80%): {summary['high_utilization_doctors']}")
            print(f"  Average worked hours: {summary['avg_worked_hours']:.2f}")
            print(f"  Average utilization rate: {summary['avg_utilization_rate']:.1f}%")
            
            return True, response
        
        return False, None

    def test_doctor_statistics_general(self, date_from=None, date_to=None):
        """Test general doctor statistics endpoint"""
        params = {}
        if date_from:
            params["date_from"] = date_from
        if date_to:
            params["date_to"] = date_to
        
        filter_desc = ""
        if date_from and date_to:
            filter_desc = f" from {date_from} to {date_to}"
        elif date_from:
            filter_desc = f" from {date_from}"
        elif date_to:
            filter_desc = f" until {date_to}"
            
        success, response = self.run_test(
            f"Get General Doctor Statistics{filter_desc}",
            "GET",
            "doctors/statistics",
            200,
            params=params
        )
        
        if success and response:
            print(f"✅ General doctor statistics retrieved successfully{filter_desc}")
            
            # Verify response structure
            if "overview" not in response or "monthly_statistics" not in response:
                print("❌ Response missing required structure (overview, monthly_statistics)")
                return False, None
            
            overview = response["overview"]
            monthly_stats = response["monthly_statistics"]
            
            # Verify overview fields
            required_overview_fields = [
                "total_doctors", "total_appointments", "completed_appointments",
                "total_revenue", "completion_rate", "avg_revenue_per_appointment"
            ]
            
            for field in required_overview_fields:
                if field not in overview:
                    print(f"❌ Missing required field in overview: {field}")
                    return False, None
            
            print(f"Overview statistics:")
            print(f"  Total doctors: {overview['total_doctors']}")
            print(f"  Total appointments: {overview['total_appointments']}")
            print(f"  Completed appointments: {overview['completed_appointments']}")
            print(f"  Completion rate: {overview['completion_rate']:.1f}%")
            print(f"  Total revenue: {overview['total_revenue']:.2f}")
            print(f"  Avg revenue per appointment: {overview['avg_revenue_per_appointment']:.2f}")
            
            # Verify monthly statistics structure
            if len(monthly_stats) > 0:
                month_stat = monthly_stats[0]
                required_monthly_fields = [
                    "month", "total_appointments", "completed_appointments",
                    "completion_rate", "total_revenue", "avg_revenue_per_appointment"
                ]
                
                for field in required_monthly_fields:
                    if field not in month_stat:
                        print(f"❌ Missing required field in monthly statistics: {field}")
                        return False, None
                
                print(f"Monthly statistics: {len(monthly_stats)} months")
                print(f"Sample month ({month_stat['month']}): {month_stat['total_appointments']} appointments, {month_stat['total_revenue']:.2f} revenue")
            
            return True, response
        
        return False, None

    def create_test_appointments(self):
        """Create test appointments with working hours data"""
        print("Creating test appointments with working hours data...")
        
        today = datetime.now()
        test_dates = [
            (today - timedelta(days=5)).strftime("%Y-%m-%d"),
            (today - timedelta(days=10)).strftime("%Y-%m-%d"),
            (today - timedelta(days=15)).strftime("%Y-%m-%d")
        ]
        
        appointment_data = [
            {"time": "09:00", "end_time": "10:00", "price": 5000.0, "status": "completed"},
            {"time": "10:30", "end_time": "11:30", "price": 7500.0, "status": "completed"},
            {"time": "14:00", "end_time": "15:30", "price": 12000.0, "status": "completed"},
            {"time": "16:00", "end_time": "16:30", "price": 3000.0, "status": "cancelled"},
            {"time": "11:00", "end_time": "12:00", "price": 6000.0, "status": "no_show"}
        ]
        
        created_appointments = []
        
        for i, date in enumerate(test_dates):
            for j, apt_data in enumerate(appointment_data):
                success, response = self.run_test(
                    f"Create Test Appointment {i}-{j}",
                    "POST",
                    "appointments",
                    200,
                    data={
                        "patient_id": self.created_patient_id,
                        "doctor_id": self.created_doctor_id,
                        "appointment_date": date,
                        "appointment_time": apt_data["time"],
                        "end_time": apt_data["end_time"],
                        "price": apt_data["price"],
                        "reason": f"Test appointment {i}-{j}"
                    }
                )
                
                if success and response:
                    created_appointments.append(response["id"])
                    
                    # Update status if not default
                    if apt_data["status"] != "unconfirmed":
                        self.run_test(
                            f"Update Appointment {i}-{j} Status",
                            "PUT",
                            f"appointments/{response['id']}",
                            200,
                            data={"status": apt_data["status"]}
                        )
        
        print(f"✅ Created {len(created_appointments)} test appointments")
        return created_appointments

    def cleanup_appointments(self, appointment_ids):
        """Clean up test appointments"""
        print("Cleaning up test appointments...")
        for apt_id in appointment_ids:
            self.run_test(
                f"Delete Test Appointment {apt_id}",
                "DELETE",
                f"appointments/{apt_id}",
                200
            )

    def print_summary(self):
        """Print test summary"""
        print(f"\n{'='*50}")
        print(f"TEST SUMMARY")
        print(f"{'='*50}")
        print(f"Tests run: {self.tests_run}")
        print(f"Tests passed: {self.tests_passed}")
        print(f"Tests failed: {self.tests_run - self.tests_passed}")
        print(f"Success rate: {(self.tests_passed / self.tests_run * 100):.1f}%")
        print(f"{'='*50}")

def main():
    """Test enhanced doctor statistics API with working hours and utilization metrics"""
    import os
    backend_url = os.environ.get('REACT_APP_BACKEND_URL', 'https://dentalmanager-2.preview.emergentagent.com')
    
    tester = DoctorStatsAPITester(backend_url)
    
    print(f"🚀 Starting Enhanced Doctor Statistics API Tests")
    print(f"Backend URL: {backend_url}")
    print(f"{'='*50}")
    
    # Test authentication with provided admin credentials
    print("\n📋 AUTHENTICATION")
    print("-" * 30)
    
    admin_email = "admin_test_20250821110240@medentry.com"
    admin_password = "AdminTest123!"
    if not tester.test_login_user(admin_email, admin_password):
        print("❌ Failed to login with admin credentials")
        tester.print_summary()
        return False
    
    print("\n📋 SETUP TEST DATA")
    print("-" * 30)
    
    # Create test patient and doctor
    if not tester.test_create_patient("Test Patient for Stats", "+77771234567", "phone"):
        print("❌ Failed to create patient")
        tester.print_summary()
        return False
    
    if not tester.test_create_doctor("Dr. Statistics Test", "Стоматолог", "#FF5733"):
        print("❌ Failed to create doctor")
        tester.print_summary()
        return False
    
    # Create test appointments with working hours
    appointment_ids = tester.create_test_appointments()
    
    print("\n📋 ENHANCED DOCTOR STATISTICS TESTS")
    print("-" * 30)
    
    # Test 1: Individual doctor statistics without date filter
    print("\n1. Testing individual doctor statistics without date filter...")
    success, response = tester.test_doctor_statistics_individual()
    if not success:
        print("❌ Individual doctor statistics test failed")
        tester.cleanup_appointments(appointment_ids)
        tester.print_summary()
        return False
    
    # Test 2: Individual doctor statistics with date range filter (last 30 days)
    print("\n2. Testing individual doctor statistics with date range filter...")
    today = datetime.now()
    date_from = (today - timedelta(days=30)).strftime("%Y-%m-%d")
    date_to = today.strftime("%Y-%m-%d")
    success, response = tester.test_doctor_statistics_individual(date_from, date_to)
    if not success:
        print("❌ Individual doctor statistics with date filter test failed")
        tester.cleanup_appointments(appointment_ids)
        tester.print_summary()
        return False
    
    # Test 3: Verify response structure includes new working hours fields
    print("\n3. Verifying response structure includes new fields...")
    if response and "doctor_statistics" in response:
        doctor_stats = response["doctor_statistics"]
        if len(doctor_stats) > 0:
            doctor = doctor_stats[0]
            new_fields = ["total_worked_hours", "total_scheduled_hours", "utilization_rate", "avg_revenue_per_hour"]
            
            for field in new_fields:
                if field not in doctor:
                    print(f"❌ New field missing: {field}")
                    tester.cleanup_appointments(appointment_ids)
                    tester.print_summary()
                    return False
                else:
                    print(f"✅ New field present: {field} = {doctor[field]}")
    
    # Test 4: Verify utilization rate calculation (worked_hours / scheduled_hours) × 100
    print("\n4. Verifying utilization rate calculation...")
    if response and "doctor_statistics" in response:
        doctor_stats = response["doctor_statistics"]
        for doctor in doctor_stats:
            if doctor["total_scheduled_hours"] > 0:
                expected_utilization = (doctor["total_worked_hours"] / doctor["total_scheduled_hours"]) * 100
                actual_utilization = doctor["utilization_rate"]
                
                if abs(expected_utilization - actual_utilization) > 0.1:
                    print(f"❌ Utilization calculation error for {doctor['doctor_name']}: expected {expected_utilization:.1f}%, got {actual_utilization:.1f}%")
                    tester.cleanup_appointments(appointment_ids)
                    tester.print_summary()
                    return False
                else:
                    print(f"✅ Utilization correctly calculated for {doctor['doctor_name']}: {actual_utilization:.1f}%")
    
    # Test 5: Verify avg_revenue_per_hour calculation
    print("\n5. Verifying avg_revenue_per_hour calculation...")
    if response and "doctor_statistics" in response:
        doctor_stats = response["doctor_statistics"]
        for doctor in doctor_stats:
            if doctor["total_worked_hours"] > 0:
                expected_avg_revenue = doctor["total_revenue"] / doctor["total_worked_hours"]
                actual_avg_revenue = doctor["avg_revenue_per_hour"]
                
                if abs(expected_avg_revenue - actual_avg_revenue) > 0.01:
                    print(f"❌ Avg revenue per hour calculation error for {doctor['doctor_name']}: expected {expected_avg_revenue:.2f}, got {actual_avg_revenue:.2f}")
                    tester.cleanup_appointments(appointment_ids)
                    tester.print_summary()
                    return False
                else:
                    print(f"✅ Avg revenue per hour correctly calculated for {doctor['doctor_name']}: {actual_avg_revenue:.2f}")
    
    # Test 6: Check high_utilization_doctors count (doctors with >80% utilization)
    print("\n6. Verifying high_utilization_doctors count...")
    if response and "summary" in response:
        summary = response["summary"]
        high_util_count = summary.get("high_utilization_doctors", 0)
        
        # Count doctors with >80% utilization manually
        actual_high_util = 0
        if "doctor_statistics" in response:
            for doctor in response["doctor_statistics"]:
                if doctor["utilization_rate"] > 80 and doctor["total_worked_hours"] > 0:
                    actual_high_util += 1
        
        if high_util_count == actual_high_util:
            print(f"✅ High utilization doctors count correct: {high_util_count}")
        else:
            print(f"❌ High utilization doctors count mismatch: expected {actual_high_util}, got {high_util_count}")
            tester.cleanup_appointments(appointment_ids)
            tester.print_summary()
            return False
    
    # Test 7: General doctor statistics
    print("\n7. Testing general doctor statistics...")
    success, general_response = tester.test_doctor_statistics_general()
    if not success:
        print("❌ General doctor statistics test failed")
        tester.cleanup_appointments(appointment_ids)
        tester.print_summary()
        return False
    
    # Test 8: General doctor statistics with date filter
    print("\n8. Testing general doctor statistics with date filter...")
    success, filtered_response = tester.test_doctor_statistics_general(date_from, date_to)
    if not success:
        print("❌ General doctor statistics with date filter test failed")
        tester.cleanup_appointments(appointment_ids)
        tester.print_summary()
        return False
    
    # Cleanup
    print("\n📋 CLEANUP")
    print("-" * 30)
    tester.cleanup_appointments(appointment_ids)
    
    # Print final summary
    tester.print_summary()
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All enhanced doctor statistics tests passed!")
        return True
    else:
        print("❌ Some tests failed!")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)