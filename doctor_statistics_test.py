import requests
import json
from datetime import datetime, timedelta
import sys
import random

class DoctorStatisticsAPITester:
    def __init__(self, base_url):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.token = None
        self.current_user = None
        self.created_doctors = []
        self.created_patients = []
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

    def test_register_admin(self):
        """Register admin user for testing"""
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        email = f"admin_doctor_stats_{timestamp}@test.com"
        password = "AdminTest123!"
        full_name = f"Admin Doctor Stats {timestamp}"
        
        success, response = self.run_test(
            "Register Admin User",
            "POST",
            "auth/register",
            200,
            data={
                "email": email,
                "password": password,
                "full_name": full_name,
                "role": "admin"
            }
        )
        if success and response and "access_token" in response:
            self.token = response["access_token"]
            self.current_user = response["user"]
            print(f"✅ Registered admin: {full_name} with email: {email}")
            return True, email, password
        return False, None, None

    def test_register_doctor(self):
        """Register doctor user for testing"""
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        email = f"doctor_stats_{timestamp}@test.com"
        password = "DoctorTest123!"
        full_name = f"Doctor Stats {timestamp}"
        
        success, response = self.run_test(
            "Register Doctor User",
            "POST",
            "auth/register",
            200,
            data={
                "email": email,
                "password": password,
                "full_name": full_name,
                "role": "doctor"
            }
        )
        if success and response and "access_token" in response:
            return True, email, password, response["user"]
        return False, None, None, None

    def test_login_user(self, email, password):
        """Login a user"""
        success, response = self.run_test(
            f"Login user {email}",
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
            return True
        return False

    def create_sample_doctors(self, count=3):
        """Create sample doctors for testing"""
        doctors = []
        specialties = ["Стоматолог", "Гинеколог", "Ортодонт", "Дерматолог", "Терапевт"]
        colors = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6"]
        
        for i in range(count):
            doctor_data = {
                "full_name": f"Доктор Тестов {i+1}",
                "specialty": specialties[i % len(specialties)],
                "phone": f"+7777123456{i}",
                "calendar_color": colors[i % len(colors)]
            }
            
            success, response = self.run_test(
                f"Create Doctor {i+1}",
                "POST",
                "doctors",
                200,
                data=doctor_data
            )
            
            if success and response:
                doctors.append(response)
                self.created_doctors.append(response["id"])
                print(f"✅ Created doctor: {response['full_name']} ({response['specialty']})")
            else:
                print(f"❌ Failed to create doctor {i+1}")
                return False, []
        
        return True, doctors

    def create_sample_patients(self, count=5):
        """Create sample patients for testing"""
        patients = []
        
        for i in range(count):
            patient_data = {
                "full_name": f"Пациент Тестов {i+1}",
                "phone": f"+7777654321{i}",
                "birth_date": f"199{i}-0{(i%9)+1}-{10+i:02d}",
                "gender": "male" if i % 2 == 0 else "female",
                "source": "phone"
            }
            
            success, response = self.run_test(
                f"Create Patient {i+1}",
                "POST",
                "patients",
                200,
                data=patient_data
            )
            
            if success and response:
                patients.append(response)
                self.created_patients.append(response["id"])
                print(f"✅ Created patient: {response['full_name']}")
            else:
                print(f"❌ Failed to create patient {i+1}")
                return False, []
        
        return True, patients

    def create_sample_appointments(self, doctors, patients):
        """Create sample appointments with different statuses and dates"""
        appointments = []
        statuses = ["completed", "cancelled", "no_show", "confirmed", "in_progress"]
        prices = [5000.0, 7500.0, 10000.0, 12500.0, 15000.0, 20000.0]
        
        # Create appointments for the last 3 months
        base_date = datetime.now()
        
        for month_offset in range(3):  # Last 3 months
            month_date = base_date - timedelta(days=30 * month_offset)
            
            for week in range(4):  # 4 weeks per month
                week_date = month_date - timedelta(days=7 * week)
                
                for day in range(5):  # 5 appointments per week
                    appointment_date = week_date - timedelta(days=day)
                    
                    # Skip future dates
                    if appointment_date > base_date:
                        continue
                    
                    doctor = random.choice(doctors)
                    patient = random.choice(patients)
                    status = random.choice(statuses)
                    price = random.choice(prices)
                    
                    # Adjust price based on status (completed appointments have prices)
                    if status in ["cancelled", "no_show"]:
                        price = random.choice(prices) if random.random() > 0.5 else None
                    
                    appointment_data = {
                        "patient_id": patient["id"],
                        "doctor_id": doctor["id"],
                        "appointment_date": appointment_date.strftime("%Y-%m-%d"),
                        "appointment_time": f"{9 + (day * 2)}:00",
                        "end_time": f"{10 + (day * 2)}:00",
                        "price": price,
                        "status": status,
                        "reason": f"Консультация {status}",
                        "notes": f"Заметка для приема {status}"
                    }
                    
                    success, response = self.run_test(
                        f"Create Appointment {len(appointments)+1} ({status})",
                        "POST",
                        "appointments",
                        200,
                        data=appointment_data
                    )
                    
                    if success and response:
                        appointments.append(response)
                        self.created_appointments.append(response["id"])
                        print(f"✅ Created appointment: {doctor['full_name']} - {patient['full_name']} ({status}, {price})")
                    else:
                        print(f"❌ Failed to create appointment")
        
        return True, appointments

    def test_doctor_statistics_general(self, date_from=None, date_to=None):
        """Test GET /api/doctors/statistics endpoint"""
        params = {}
        if date_from:
            params["date_from"] = date_from
        if date_to:
            params["date_to"] = date_to
        
        filter_desc = ""
        if date_from and date_to:
            filter_desc = f" (from {date_from} to {date_to})"
        elif date_from:
            filter_desc = f" (from {date_from})"
        elif date_to:
            filter_desc = f" (until {date_to})"
        
        success, response = self.run_test(
            f"Get Doctor Statistics{filter_desc}",
            "GET",
            "doctors/statistics",
            200,
            params=params
        )
        
        if success and response:
            print(f"✅ Retrieved doctor statistics{filter_desc}")
            
            # Verify response structure
            required_fields = ["overview", "monthly_statistics"]
            for field in required_fields:
                if field not in response:
                    print(f"❌ Missing required field: {field}")
                    return False, None
            
            # Verify overview structure
            overview = response["overview"]
            overview_fields = [
                "total_doctors", "total_appointments", "completed_appointments",
                "cancelled_appointments", "no_show_appointments", "completion_rate",
                "cancellation_rate", "no_show_rate", "total_revenue", "potential_revenue",
                "revenue_efficiency", "avg_revenue_per_appointment", "avg_appointments_per_doctor"
            ]
            
            for field in overview_fields:
                if field not in overview:
                    print(f"❌ Missing overview field: {field}")
                    return False, None
            
            # Print key statistics
            print(f"📊 Total Doctors: {overview['total_doctors']}")
            print(f"📊 Total Appointments: {overview['total_appointments']}")
            print(f"📊 Completed: {overview['completed_appointments']} ({overview['completion_rate']}%)")
            print(f"📊 Cancelled: {overview['cancelled_appointments']} ({overview['cancellation_rate']}%)")
            print(f"📊 No Show: {overview['no_show_appointments']} ({overview['no_show_rate']}%)")
            print(f"📊 Total Revenue: {overview['total_revenue']} тенге")
            print(f"📊 Revenue Efficiency: {overview['revenue_efficiency']}%")
            
            # Verify monthly statistics structure
            monthly_stats = response["monthly_statistics"]
            if len(monthly_stats) > 0:
                month_fields = [
                    "month", "total_appointments", "completed_appointments",
                    "cancelled_appointments", "no_show_appointments", "completion_rate",
                    "total_revenue", "avg_revenue_per_appointment"
                ]
                
                for field in month_fields:
                    if field not in monthly_stats[0]:
                        print(f"❌ Missing monthly statistics field: {field}")
                        return False, None
                
                print(f"📊 Monthly Statistics: {len(monthly_stats)} months")
                for month in monthly_stats[:3]:  # Show first 3 months
                    print(f"   {month['month']}: {month['total_appointments']} appointments, {month['total_revenue']} тенге")
            
            return True, response
        
        return False, None

    def test_doctor_statistics_individual(self, date_from=None, date_to=None):
        """Test GET /api/doctors/statistics/individual endpoint"""
        params = {}
        if date_from:
            params["date_from"] = date_from
        if date_to:
            params["date_to"] = date_to
        
        filter_desc = ""
        if date_from and date_to:
            filter_desc = f" (from {date_from} to {date_to})"
        elif date_from:
            filter_desc = f" (from {date_from})"
        elif date_to:
            filter_desc = f" (until {date_to})"
        
        success, response = self.run_test(
            f"Get Individual Doctor Statistics{filter_desc}",
            "GET",
            "doctors/statistics/individual",
            200,
            params=params
        )
        
        if success and response:
            print(f"✅ Retrieved individual doctor statistics{filter_desc}")
            
            # Verify response structure
            required_fields = ["doctor_statistics", "summary"]
            for field in required_fields:
                if field not in response:
                    print(f"❌ Missing required field: {field}")
                    return False, None
            
            # Verify doctor statistics structure
            doctor_stats = response["doctor_statistics"]
            if len(doctor_stats) > 0:
                doctor_fields = [
                    "doctor_id", "doctor_name", "doctor_specialty", "doctor_phone",
                    "total_appointments", "completed_appointments", "cancelled_appointments",
                    "no_show_appointments", "total_revenue", "potential_revenue",
                    "completion_rate", "cancellation_rate", "no_show_rate",
                    "revenue_efficiency", "avg_revenue_per_appointment"
                ]
                
                for field in doctor_fields:
                    if field not in doctor_stats[0]:
                        print(f"❌ Missing doctor statistics field: {field}")
                        return False, None
                
                print(f"📊 Individual Doctor Statistics: {len(doctor_stats)} doctors")
                
                # Show top 3 doctors by revenue
                top_doctors = sorted(doctor_stats, key=lambda x: x['total_revenue'], reverse=True)[:3]
                for i, doctor in enumerate(top_doctors, 1):
                    print(f"   {i}. {doctor['doctor_name']} ({doctor['doctor_specialty']})")
                    print(f"      Appointments: {doctor['total_appointments']} (Completed: {doctor['completed_appointments']})")
                    print(f"      Revenue: {doctor['total_revenue']} тенге (Efficiency: {doctor['revenue_efficiency']:.1f}%)")
                    print(f"      Rates: Completion {doctor['completion_rate']:.1f}%, No-show {doctor['no_show_rate']:.1f}%")
            
            # Verify summary structure
            summary = response["summary"]
            summary_fields = [
                "total_doctors", "active_doctors", "top_performers",
                "high_revenue_doctors", "doctors_with_no_shows"
            ]
            
            for field in summary_fields:
                if field not in summary:
                    print(f"❌ Missing summary field: {field}")
                    return False, None
            
            print(f"📊 Summary:")
            print(f"   Total Doctors: {summary['total_doctors']}")
            print(f"   Active Doctors: {summary['active_doctors']}")
            print(f"   Top Performers: {summary['top_performers']}")
            print(f"   High Revenue Doctors: {summary['high_revenue_doctors']}")
            print(f"   Doctors with No-shows: {summary['doctors_with_no_shows']}")
            
            return True, response
        
        return False, None

    def test_date_filtering(self):
        """Test date filtering functionality"""
        print("\n" + "=" * 60)
        print("TESTING DATE FILTERING FUNCTIONALITY")
        print("=" * 60)
        
        # Test 1: No date parameters (all data)
        print("\n🔍 Test 1: No date parameters (all data)")
        success1, response1 = self.test_doctor_statistics_general()
        if not success1:
            return False
        
        # Test 2: With date_from parameter (last 30 days)
        print("\n🔍 Test 2: With date_from parameter (last 30 days)")
        date_from = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        success2, response2 = self.test_doctor_statistics_general(date_from=date_from)
        if not success2:
            return False
        
        # Test 3: With date_to parameter (until 30 days ago)
        print("\n🔍 Test 3: With date_to parameter (until 30 days ago)")
        date_to = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        success3, response3 = self.test_doctor_statistics_general(date_to=date_to)
        if not success3:
            return False
        
        # Test 4: With both date parameters (specific month)
        print("\n🔍 Test 4: With both date parameters (last month)")
        date_from = (datetime.now() - timedelta(days=60)).strftime("%Y-%m-%d")
        date_to = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        success4, response4 = self.test_doctor_statistics_general(date_from=date_from, date_to=date_to)
        if not success4:
            return False
        
        # Verify that filtering works (filtered results should have different counts)
        all_appointments = response1["overview"]["total_appointments"]
        filtered_appointments = response4["overview"]["total_appointments"]
        
        print(f"\n📊 Filtering Verification:")
        print(f"   All appointments: {all_appointments}")
        print(f"   Filtered appointments (1 month): {filtered_appointments}")
        
        if filtered_appointments <= all_appointments:
            print("✅ Date filtering appears to be working correctly")
        else:
            print("❌ Date filtering may not be working correctly")
            return False
        
        return True

    def test_statistics_calculations(self):
        """Test that statistics calculations are accurate"""
        print("\n" + "=" * 60)
        print("TESTING STATISTICS CALCULATIONS")
        print("=" * 60)
        
        # Get general statistics
        success, stats = self.test_doctor_statistics_general()
        if not success:
            return False
        
        overview = stats["overview"]
        
        # Test calculation accuracy
        total_appointments = overview["total_appointments"]
        completed = overview["completed_appointments"]
        cancelled = overview["cancelled_appointments"]
        no_show = overview["no_show_appointments"]
        
        # Verify completion rate calculation
        expected_completion_rate = round((completed / total_appointments * 100) if total_appointments > 0 else 0, 1)
        actual_completion_rate = overview["completion_rate"]
        
        if abs(expected_completion_rate - actual_completion_rate) < 0.1:
            print(f"✅ Completion rate calculation correct: {actual_completion_rate}%")
        else:
            print(f"❌ Completion rate calculation incorrect: expected {expected_completion_rate}%, got {actual_completion_rate}%")
            return False
        
        # Verify cancellation rate calculation
        expected_cancellation_rate = round((cancelled / total_appointments * 100) if total_appointments > 0 else 0, 1)
        actual_cancellation_rate = overview["cancellation_rate"]
        
        if abs(expected_cancellation_rate - actual_cancellation_rate) < 0.1:
            print(f"✅ Cancellation rate calculation correct: {actual_cancellation_rate}%")
        else:
            print(f"❌ Cancellation rate calculation incorrect: expected {expected_cancellation_rate}%, got {actual_cancellation_rate}%")
            return False
        
        # Verify no-show rate calculation
        expected_no_show_rate = round((no_show / total_appointments * 100) if total_appointments > 0 else 0, 1)
        actual_no_show_rate = overview["no_show_rate"]
        
        if abs(expected_no_show_rate - actual_no_show_rate) < 0.1:
            print(f"✅ No-show rate calculation correct: {actual_no_show_rate}%")
        else:
            print(f"❌ No-show rate calculation incorrect: expected {expected_no_show_rate}%, got {actual_no_show_rate}%")
            return False
        
        # Test individual doctor statistics calculations
        success, individual_stats = self.test_doctor_statistics_individual()
        if not success:
            return False
        
        doctor_stats = individual_stats["doctor_statistics"]
        if len(doctor_stats) > 0:
            # Check first doctor's calculations
            doctor = doctor_stats[0]
            doctor_total = doctor["total_appointments"]
            doctor_completed = doctor["completed_appointments"]
            
            if doctor_total > 0:
                expected_doctor_completion = round((doctor_completed / doctor_total * 100), 1)
                actual_doctor_completion = round(doctor["completion_rate"], 1)
                
                if abs(expected_doctor_completion - actual_doctor_completion) < 0.1:
                    print(f"✅ Individual doctor completion rate correct: {actual_doctor_completion}%")
                else:
                    print(f"❌ Individual doctor completion rate incorrect: expected {expected_doctor_completion}%, got {actual_doctor_completion}%")
                    return False
        
        print("✅ All statistics calculations verified successfully")
        return True

    def test_authentication_and_authorization(self):
        """Test authentication and authorization for statistics endpoints"""
        print("\n" + "=" * 60)
        print("TESTING AUTHENTICATION AND AUTHORIZATION")
        print("=" * 60)
        
        # Save current token
        saved_token = self.token
        
        # Test 1: Unauthorized access (no token)
        print("\n🔍 Test 1: Unauthorized access (no token)")
        self.token = None
        
        success1, _ = self.run_test(
            "Unauthorized access to general statistics",
            "GET",
            "doctors/statistics",
            401  # Expect 401 Unauthorized
        )
        
        success2, _ = self.run_test(
            "Unauthorized access to individual statistics",
            "GET",
            "doctors/statistics/individual",
            401  # Expect 401 Unauthorized
        )
        
        if success1 and success2:
            print("✅ Unauthorized access correctly rejected")
        else:
            print("❌ Unauthorized access was allowed")
            self.token = saved_token
            return False
        
        # Restore token
        self.token = saved_token
        
        # Test 2: Admin access
        print("\n🔍 Test 2: Admin access")
        if self.current_user["role"] == "admin":
            success3, _ = self.test_doctor_statistics_general()
            success4, _ = self.test_doctor_statistics_individual()
            
            if success3 and success4:
                print("✅ Admin can access both statistics endpoints")
            else:
                print("❌ Admin access failed")
                return False
        
        # Test 3: Doctor access
        print("\n🔍 Test 3: Doctor access")
        # Register and login as doctor
        success, doctor_email, doctor_password, doctor_user = self.test_register_doctor()
        if success:
            if self.test_login_user(doctor_email, doctor_password):
                success5, _ = self.test_doctor_statistics_general()
                success6, _ = self.test_doctor_statistics_individual()
                
                if success5 and success6:
                    print("✅ Doctor can access both statistics endpoints")
                else:
                    print("❌ Doctor access failed")
                    return False
            else:
                print("❌ Doctor login failed")
                return False
        else:
            print("❌ Doctor registration failed")
            return False
        
        # Restore admin token
        self.token = saved_token
        
        print("✅ All authentication and authorization tests passed")
        return True

    def test_monthly_aggregations(self):
        """Test monthly aggregations in statistics"""
        print("\n" + "=" * 60)
        print("TESTING MONTHLY AGGREGATIONS")
        print("=" * 60)
        
        # Get statistics for last 3 months
        date_from = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")
        success, response = self.test_doctor_statistics_general(date_from=date_from)
        
        if not success:
            return False
        
        monthly_stats = response["monthly_statistics"]
        
        if len(monthly_stats) == 0:
            print("⚠️ No monthly statistics found")
            return True
        
        print(f"📊 Found {len(monthly_stats)} months of data")
        
        # Verify monthly data structure and calculations
        for month in monthly_stats:
            month_name = month["month"]
            total = month["total_appointments"]
            completed = month["completed_appointments"]
            revenue = month["total_revenue"]
            completion_rate = month["completion_rate"]
            
            # Verify completion rate calculation for this month
            expected_rate = round((completed / total * 100) if total > 0 else 0, 1)
            
            if abs(expected_rate - completion_rate) < 0.1:
                print(f"✅ {month_name}: {total} appointments, {completed} completed ({completion_rate}%), {revenue} тенге")
            else:
                print(f"❌ {month_name}: Completion rate calculation error - expected {expected_rate}%, got {completion_rate}%")
                return False
        
        # Verify months are sorted
        month_keys = [month["month"] for month in monthly_stats]
        if month_keys == sorted(month_keys):
            print("✅ Monthly statistics are properly sorted")
        else:
            print("❌ Monthly statistics are not properly sorted")
            return False
        
        print("✅ Monthly aggregations verified successfully")
        return True

    def run_comprehensive_test(self):
        """Run comprehensive doctor statistics API tests"""
        print("=" * 80)
        print("DOCTOR STATISTICS API COMPREHENSIVE TESTING")
        print("=" * 80)
        
        # Step 1: Setup authentication
        print("\n" + "=" * 60)
        print("STEP 1: AUTHENTICATION SETUP")
        print("=" * 60)
        
        success, admin_email, admin_password = self.test_register_admin()
        if not success:
            print("❌ Failed to register admin user")
            return False
        
        # Step 2: Create sample data
        print("\n" + "=" * 60)
        print("STEP 2: CREATE SAMPLE DATA")
        print("=" * 60)
        
        print("Creating sample doctors...")
        success, doctors = self.create_sample_doctors(3)
        if not success:
            print("❌ Failed to create sample doctors")
            return False
        
        print("Creating sample patients...")
        success, patients = self.create_sample_patients(5)
        if not success:
            print("❌ Failed to create sample patients")
            return False
        
        print("Creating sample appointments...")
        success, appointments = self.create_sample_appointments(doctors, patients)
        if not success:
            print("❌ Failed to create sample appointments")
            return False
        
        print(f"✅ Created {len(appointments)} sample appointments")
        
        # Step 3: Test general doctor statistics endpoint
        print("\n" + "=" * 60)
        print("STEP 3: TEST GENERAL DOCTOR STATISTICS")
        print("=" * 60)
        
        success = self.test_doctor_statistics_general()
        if not success:
            print("❌ General doctor statistics test failed")
            return False
        
        # Step 4: Test individual doctor statistics endpoint
        print("\n" + "=" * 60)
        print("STEP 4: TEST INDIVIDUAL DOCTOR STATISTICS")
        print("=" * 60)
        
        success = self.test_doctor_statistics_individual()
        if not success:
            print("❌ Individual doctor statistics test failed")
            return False
        
        # Step 5: Test date filtering
        print("\n" + "=" * 60)
        print("STEP 5: TEST DATE FILTERING")
        print("=" * 60)
        
        success = self.test_date_filtering()
        if not success:
            print("❌ Date filtering test failed")
            return False
        
        # Step 6: Test statistics calculations
        print("\n" + "=" * 60)
        print("STEP 6: TEST STATISTICS CALCULATIONS")
        print("=" * 60)
        
        success = self.test_statistics_calculations()
        if not success:
            print("❌ Statistics calculations test failed")
            return False
        
        # Step 7: Test monthly aggregations
        print("\n" + "=" * 60)
        print("STEP 7: TEST MONTHLY AGGREGATIONS")
        print("=" * 60)
        
        success = self.test_monthly_aggregations()
        if not success:
            print("❌ Monthly aggregations test failed")
            return False
        
        # Step 8: Test authentication and authorization
        print("\n" + "=" * 60)
        print("STEP 8: TEST AUTHENTICATION AND AUTHORIZATION")
        print("=" * 60)
        
        success = self.test_authentication_and_authorization()
        if not success:
            print("❌ Authentication and authorization test failed")
            return False
        
        # Final summary
        print("\n" + "=" * 80)
        print("DOCTOR STATISTICS API TESTING COMPLETED")
        print("=" * 80)
        
        print(f"📊 Tests Run: {self.tests_run}")
        print(f"✅ Tests Passed: {self.tests_passed}")
        print(f"❌ Tests Failed: {self.tests_run - self.tests_passed}")
        print(f"📈 Success Rate: {(self.tests_passed / self.tests_run * 100):.1f}%")
        
        if self.tests_passed == self.tests_run:
            print("\n🎉 ALL DOCTOR STATISTICS API TESTS PASSED!")
            return True
        else:
            print(f"\n⚠️ {self.tests_run - self.tests_passed} TESTS FAILED")
            return False

def main():
    """Main function to run doctor statistics API tests"""
    # Use the production URL from frontend/.env
    backend_url = "https://medrecord-enhance.preview.emergentagent.com"
    
    print("Starting Doctor Statistics API Testing...")
    print(f"Backend URL: {backend_url}")
    
    tester = DoctorStatisticsAPITester(backend_url)
    success = tester.run_comprehensive_test()
    
    if success:
        print("\n✅ Doctor Statistics API testing completed successfully!")
        sys.exit(0)
    else:
        print("\n❌ Doctor Statistics API testing failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()