#!/usr/bin/env python3
"""
Enhanced Treatment Plan Testing with New Tracking Fields
Tests the new payment_status, paid_amount, execution_status, appointment_ids fields
and the statistics API endpoints.
"""

import requests
import json
from datetime import datetime, timedelta
import sys
import os

class EnhancedTreatmentPlanTester:
    def __init__(self, base_url):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.token = None
        self.current_user = None
        self.created_patients = []
        self.created_treatment_plans = []

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

    def setup_authentication(self):
        """Setup admin authentication for testing"""
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        admin_email = f"admin_enhanced_test_{timestamp}@medentry.com"
        admin_password = "AdminTest123!"
        admin_name = f"Enhanced Test Admin {timestamp}"
        
        success, response = self.run_test(
            "Register Admin User",
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
        
        if success and response and "access_token" in response:
            self.token = response["access_token"]
            self.current_user = response["user"]
            print(f"✅ Admin authenticated: {admin_name}")
            return True
        return False

    def create_test_patient(self, name_suffix=""):
        """Create a test patient for treatment plans"""
        timestamp = datetime.now().strftime('%H%M%S')
        patient_name = f"Test Patient {name_suffix} {timestamp}"
        
        success, response = self.run_test(
            f"Create Test Patient {name_suffix}",
            "POST",
            "patients",
            200,
            data={
                "full_name": patient_name,
                "phone": f"+7777{timestamp}",
                "source": "other",
                "birth_date": "1990-05-15",
                "gender": "male"
            }
        )
        
        if success and response and "id" in response:
            patient_id = response["id"]
            self.created_patients.append(patient_id)
            print(f"✅ Created patient: {patient_name} (ID: {patient_id})")
            return patient_id
        return None

    def test_enhanced_treatment_plan_creation(self, patient_id, plan_data):
        """Test creating treatment plan with enhanced tracking fields"""
        success, response = self.run_test(
            f"Create Enhanced Treatment Plan: {plan_data['title']}",
            "POST",
            f"patients/{patient_id}/treatment-plans",
            200,
            data=plan_data
        )
        
        if success and response and "id" in response:
            plan_id = response["id"]
            self.created_treatment_plans.append(plan_id)
            
            # Verify all enhanced fields are present and correct
            enhanced_fields = [
                'payment_status', 'paid_amount', 'payment_date',
                'execution_status', 'started_at', 'completed_at', 'appointment_ids'
            ]
            
            for field in enhanced_fields:
                if field not in response:
                    print(f"❌ Missing enhanced field: {field}")
                    return False, None
            
            # Verify field values match input
            for field in ['payment_status', 'paid_amount', 'execution_status', 'appointment_ids']:
                if field in plan_data and response[field] != plan_data[field]:
                    print(f"❌ Field mismatch {field}: expected {plan_data[field]}, got {response[field]}")
                    return False, None
            
            print(f"✅ Enhanced treatment plan created successfully")
            print(f"   Payment Status: {response['payment_status']}")
            print(f"   Paid Amount: {response['paid_amount']}")
            print(f"   Execution Status: {response['execution_status']}")
            print(f"   Appointment IDs: {response['appointment_ids']}")
            
            return True, response
        
        return False, None

    def test_treatment_plan_statistics(self, date_from=None, date_to=None):
        """Test the treatment plan statistics endpoint"""
        params = {}
        if date_from:
            params['date_from'] = date_from
        if date_to:
            params['date_to'] = date_to
        
        filter_desc = ""
        if date_from and date_to:
            filter_desc = f" (from {date_from} to {date_to})"
        elif date_from:
            filter_desc = f" (from {date_from})"
        elif date_to:
            filter_desc = f" (until {date_to})"
        
        success, response = self.run_test(
            f"Get Treatment Plan Statistics{filter_desc}",
            "GET",
            "treatment-plans/statistics",
            200,
            params=params
        )
        
        if success and response:
            # Verify statistics structure
            required_sections = ['overview', 'status_distribution', 'execution_distribution', 
                               'payment_distribution', 'payment_summary', 'monthly_statistics']
            
            for section in required_sections:
                if section not in response:
                    print(f"❌ Missing statistics section: {section}")
                    return False, None
            
            # Verify overview metrics
            overview = response['overview']
            required_overview_fields = [
                'total_plans', 'completed_plans', 'no_show_plans', 'in_progress_plans',
                'pending_plans', 'completion_rate', 'no_show_rate', 'total_cost',
                'total_paid', 'outstanding_amount', 'collection_rate'
            ]
            
            for field in required_overview_fields:
                if field not in overview:
                    print(f"❌ Missing overview field: {field}")
                    return False, None
            
            # Verify payment summary
            payment_summary = response['payment_summary']
            required_payment_fields = [
                'paid_plans', 'unpaid_plans', 'partially_paid_plans', 'overdue_plans',
                'total_revenue', 'outstanding_revenue'
            ]
            
            for field in required_payment_fields:
                if field not in payment_summary:
                    print(f"❌ Missing payment summary field: {field}")
                    return False, None
            
            print(f"✅ Statistics retrieved successfully")
            print(f"   Total Plans: {overview['total_plans']}")
            print(f"   Completed: {overview['completed_plans']} ({overview['completion_rate']}%)")
            print(f"   No Shows: {overview['no_show_plans']} ({overview['no_show_rate']}%)")
            print(f"   Total Cost: {overview['total_cost']}")
            print(f"   Total Paid: {overview['total_paid']}")
            print(f"   Collection Rate: {overview['collection_rate']}%")
            print(f"   Payment Distribution: {response['payment_distribution']}")
            print(f"   Execution Distribution: {response['execution_distribution']}")
            
            return True, response
        
        return False, None

    def test_patient_statistics(self):
        """Test the patient-specific statistics endpoint"""
        success, response = self.run_test(
            "Get Patient Statistics",
            "GET",
            "treatment-plans/statistics/patients",
            200
        )
        
        if success and response:
            # Verify response structure
            if 'patient_statistics' not in response or 'summary' not in response:
                print("❌ Missing patient statistics sections")
                return False, None
            
            patient_stats = response['patient_statistics']
            summary = response['summary']
            
            # Verify summary fields
            required_summary_fields = [
                'total_patients', 'patients_with_unpaid', 'patients_with_no_shows', 'high_value_patients'
            ]
            
            for field in required_summary_fields:
                if field not in summary:
                    print(f"❌ Missing summary field: {field}")
                    return False, None
            
            # Verify patient statistics structure (if any patients exist)
            if patient_stats:
                required_patient_fields = [
                    'patient_id', 'patient_name', 'patient_phone', 'total_plans',
                    'completed_plans', 'no_show_plans', 'total_cost', 'total_paid',
                    'outstanding_amount', 'unpaid_plans', 'completion_rate',
                    'no_show_rate', 'collection_rate'
                ]
                
                first_patient = patient_stats[0]
                for field in required_patient_fields:
                    if field not in first_patient:
                        print(f"❌ Missing patient field: {field}")
                        return False, None
            
            print(f"✅ Patient statistics retrieved successfully")
            print(f"   Total Patients: {summary['total_patients']}")
            print(f"   Patients with Unpaid: {summary['patients_with_unpaid']}")
            print(f"   Patients with No Shows: {summary['patients_with_no_shows']}")
            print(f"   High Value Patients: {summary['high_value_patients']}")
            
            if patient_stats:
                print(f"   Sample Patient: {patient_stats[0]['patient_name']}")
                print(f"     Total Plans: {patient_stats[0]['total_plans']}")
                print(f"     Total Cost: {patient_stats[0]['total_cost']}")
                print(f"     Collection Rate: {patient_stats[0]['collection_rate']:.1f}%")
            
            return True, response
        
        return False, None

    def create_sample_treatment_plans(self):
        """Create sample treatment plans with different statuses for testing statistics"""
        print("\n" + "=" * 60)
        print("CREATING SAMPLE TREATMENT PLANS FOR STATISTICS TESTING")
        print("=" * 60)
        
        # Create test patients
        patient1 = self.create_test_patient("Stats1")
        patient2 = self.create_test_patient("Stats2")
        patient3 = self.create_test_patient("Stats3")
        
        if not all([patient1, patient2, patient3]):
            print("❌ Failed to create test patients")
            return False
        
        # Sample treatment plans with different statuses
        sample_plans = [
            # Patient 1 - Paid and completed
            {
                "patient_id": patient1,
                "title": "Dental Cleaning - Completed",
                "description": "Professional dental cleaning",
                "total_cost": 15000.0,
                "status": "completed",
                "payment_status": "paid",
                "paid_amount": 15000.0,
                "execution_status": "completed",
                "appointment_ids": ["apt-001", "apt-002"]
            },
            # Patient 1 - Partially paid, in progress
            {
                "patient_id": patient1,
                "title": "Root Canal Treatment",
                "description": "Multi-session root canal treatment",
                "total_cost": 45000.0,
                "status": "approved",
                "payment_status": "partially_paid",
                "paid_amount": 20000.0,
                "execution_status": "in_progress",
                "appointment_ids": ["apt-003"]
            },
            # Patient 2 - Unpaid, no show
            {
                "patient_id": patient2,
                "title": "Tooth Extraction",
                "description": "Wisdom tooth extraction",
                "total_cost": 12000.0,
                "status": "approved",
                "payment_status": "unpaid",
                "paid_amount": 0.0,
                "execution_status": "no_show",
                "appointment_ids": ["apt-004"]
            },
            # Patient 2 - Overdue payment, pending
            {
                "patient_id": patient2,
                "title": "Dental Implant",
                "description": "Single tooth implant",
                "total_cost": 85000.0,
                "status": "approved",
                "payment_status": "overdue",
                "paid_amount": 0.0,
                "execution_status": "pending",
                "appointment_ids": []
            },
            # Patient 3 - Paid, completed
            {
                "patient_id": patient3,
                "title": "Orthodontic Consultation",
                "description": "Initial orthodontic assessment",
                "total_cost": 8000.0,
                "status": "completed",
                "payment_status": "paid",
                "paid_amount": 8000.0,
                "execution_status": "completed",
                "appointment_ids": ["apt-005"]
            }
        ]
        
        created_plans = []
        for plan_data in sample_plans:
            success, plan = self.test_enhanced_treatment_plan_creation(plan_data["patient_id"], plan_data)
            if success and plan:
                created_plans.append(plan)
            else:
                print(f"❌ Failed to create plan: {plan_data['title']}")
                return False
        
        print(f"✅ Created {len(created_plans)} sample treatment plans")
        return True

    def verify_statistics_calculations(self):
        """Verify that statistics calculations match the test data"""
        print("\n" + "=" * 60)
        print("VERIFYING STATISTICS CALCULATIONS")
        print("=" * 60)
        
        # Get current statistics
        success, stats = self.test_treatment_plan_statistics()
        if not success or not stats:
            print("❌ Failed to get statistics for verification")
            return False
        
        overview = stats['overview']
        payment_dist = stats['payment_distribution']
        execution_dist = stats['execution_distribution']
        
        # Expected values based on sample data
        expected_total_plans = 5
        expected_completed = 2  # 2 completed plans
        expected_no_show = 1    # 1 no_show plan
        expected_in_progress = 1 # 1 in_progress plan
        expected_pending = 1    # 1 pending plan
        
        expected_paid = 2       # 2 paid plans
        expected_unpaid = 1     # 1 unpaid plan
        expected_partially_paid = 1 # 1 partially_paid plan
        expected_overdue = 1    # 1 overdue plan
        
        expected_total_cost = 165000.0  # Sum of all plan costs
        expected_total_paid = 43000.0   # Sum of all paid amounts
        
        # Verify calculations (allowing for existing data)
        print(f"📊 Verification Results:")
        print(f"   Total Plans: {overview['total_plans']} (expected at least {expected_total_plans})")
        print(f"   Completed: {overview['completed_plans']} (expected at least {expected_completed})")
        print(f"   No Shows: {overview['no_show_plans']} (expected at least {expected_no_show})")
        print(f"   In Progress: {overview['in_progress_plans']} (expected at least {expected_in_progress})")
        print(f"   Pending: {overview['pending_plans']} (expected at least {expected_pending})")
        
        print(f"   Paid Plans: {payment_dist.get('paid', 0)} (expected at least {expected_paid})")
        print(f"   Unpaid Plans: {payment_dist.get('unpaid', 0)} (expected at least {expected_unpaid})")
        print(f"   Partially Paid: {payment_dist.get('partially_paid', 0)} (expected at least {expected_partially_paid})")
        print(f"   Overdue Plans: {payment_dist.get('overdue', 0)} (expected at least {expected_overdue})")
        
        # Check if our test data is reflected (allowing for existing data)
        verification_passed = True
        
        if overview['total_plans'] < expected_total_plans:
            print(f"❌ Total plans count too low")
            verification_passed = False
        
        if overview['completed_plans'] < expected_completed:
            print(f"❌ Completed plans count too low")
            verification_passed = False
        
        if overview['no_show_plans'] < expected_no_show:
            print(f"❌ No show plans count too low")
            verification_passed = False
        
        # Verify rates are calculated correctly
        if overview['total_plans'] > 0:
            calculated_completion_rate = round((overview['completed_plans'] / overview['total_plans'] * 100), 1)
            if abs(calculated_completion_rate - overview['completion_rate']) > 0.1:
                print(f"❌ Completion rate calculation error: expected {calculated_completion_rate}, got {overview['completion_rate']}")
                verification_passed = False
        
        if overview['total_cost'] > 0:
            calculated_collection_rate = round((overview['total_paid'] / overview['total_cost'] * 100), 1)
            if abs(calculated_collection_rate - overview['collection_rate']) > 0.1:
                print(f"❌ Collection rate calculation error: expected {calculated_collection_rate}, got {overview['collection_rate']}")
                verification_passed = False
        
        if verification_passed:
            print("✅ Statistics calculations verified successfully")
        else:
            print("❌ Some statistics calculations failed verification")
        
        return verification_passed

    def test_date_filtering(self):
        """Test date filtering in statistics endpoint"""
        print("\n" + "=" * 60)
        print("TESTING DATE FILTERING IN STATISTICS")
        print("=" * 60)
        
        # Test with different date ranges
        today = datetime.now()
        yesterday = (today - timedelta(days=1)).isoformat()
        tomorrow = (today + timedelta(days=1)).isoformat()
        last_week = (today - timedelta(days=7)).isoformat()
        next_week = (today + timedelta(days=7)).isoformat()
        
        # Test 1: Get statistics for today only
        success1, stats_today = self.test_treatment_plan_statistics(
            date_from=today.isoformat(),
            date_to=today.isoformat()
        )
        
        # Test 2: Get statistics for last week to next week
        success2, stats_wide = self.test_treatment_plan_statistics(
            date_from=last_week,
            date_to=next_week
        )
        
        # Test 3: Get statistics from yesterday (should include today's data)
        success3, stats_recent = self.test_treatment_plan_statistics(
            date_from=yesterday
        )
        
        if not all([success1, success2, success3]):
            print("❌ Date filtering tests failed")
            return False
        
        # Verify that wider date range includes more or equal data
        if stats_wide['overview']['total_plans'] < stats_today['overview']['total_plans']:
            print("❌ Wide date range has fewer plans than today only")
            return False
        
        if stats_recent['overview']['total_plans'] < stats_today['overview']['total_plans']:
            print("❌ Recent date range has fewer plans than today only")
            return False
        
        print("✅ Date filtering working correctly")
        return True

    def test_update_enhanced_fields(self):
        """Test updating treatment plans with enhanced tracking fields"""
        print("\n" + "=" * 60)
        print("TESTING ENHANCED FIELD UPDATES")
        print("=" * 60)
        
        if not self.created_treatment_plans:
            print("❌ No treatment plans available for update testing")
            return False
        
        plan_id = self.created_treatment_plans[0]
        
        # Test updating payment status and amount
        update_data = {
            "payment_status": "partially_paid",
            "paid_amount": 10000.0,
            "execution_status": "in_progress",
            "started_at": datetime.now().isoformat(),
            "appointment_ids": ["apt-update-001", "apt-update-002"]
        }
        
        success, response = self.run_test(
            "Update Treatment Plan Enhanced Fields",
            "PUT",
            f"treatment-plans/{plan_id}",
            200,
            data=update_data
        )
        
        if success and response:
            # Verify updates were applied
            for field, expected_value in update_data.items():
                if field == "started_at":
                    # For datetime fields, just check if it's not None
                    if response[field] is None:
                        print(f"❌ Field {field} was not updated")
                        return False
                else:
                    if response[field] != expected_value:
                        print(f"❌ Field {field} update failed: expected {expected_value}, got {response[field]}")
                        return False
            
            print("✅ Enhanced fields updated successfully")
            print(f"   Payment Status: {response['payment_status']}")
            print(f"   Paid Amount: {response['paid_amount']}")
            print(f"   Execution Status: {response['execution_status']}")
            print(f"   Started At: {response['started_at']}")
            print(f"   Appointment IDs: {response['appointment_ids']}")
            
            return True
        
        return False

    def run_comprehensive_test(self):
        """Run comprehensive test suite for enhanced treatment plan functionality"""
        print("=" * 80)
        print("ENHANCED TREATMENT PLAN FUNCTIONALITY TESTING")
        print("=" * 80)
        
        # Setup
        if not self.setup_authentication():
            print("❌ Authentication setup failed")
            return False
        
        # Test 1: Create sample treatment plans with enhanced fields
        if not self.create_sample_treatment_plans():
            print("❌ Sample treatment plan creation failed")
            return False
        
        # Test 2: Test statistics endpoint
        if not self.test_treatment_plan_statistics():
            print("❌ Treatment plan statistics test failed")
            return False
        
        # Test 3: Test patient statistics endpoint
        if not self.test_patient_statistics():
            print("❌ Patient statistics test failed")
            return False
        
        # Test 4: Verify statistics calculations
        if not self.verify_statistics_calculations():
            print("❌ Statistics calculations verification failed")
            return False
        
        # Test 5: Test date filtering
        if not self.test_date_filtering():
            print("❌ Date filtering test failed")
            return False
        
        # Test 6: Test updating enhanced fields
        if not self.test_update_enhanced_fields():
            print("❌ Enhanced field updates test failed")
            return False
        
        # Final summary
        print("\n" + "=" * 80)
        print("ENHANCED TREATMENT PLAN TESTING SUMMARY")
        print("=" * 80)
        print(f"Tests Run: {self.tests_run}")
        print(f"Tests Passed: {self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.tests_passed == self.tests_run:
            print("🎉 ALL ENHANCED TREATMENT PLAN TESTS PASSED!")
            return True
        else:
            print(f"❌ {self.tests_run - self.tests_passed} tests failed")
            return False

def main():
    """Main test execution"""
    # Get backend URL from environment or use default
    backend_url = os.environ.get('REACT_APP_BACKEND_URL', 'https://medicodebase.preview.emergentagent.com')
    
    print(f"Testing Enhanced Treatment Plan functionality at: {backend_url}")
    
    tester = EnhancedTreatmentPlanTester(backend_url)
    success = tester.run_comprehensive_test()
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()