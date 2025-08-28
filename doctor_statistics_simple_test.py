import requests
import json
from datetime import datetime, timedelta
import sys
import random

def test_doctor_statistics_with_status_updates():
    """Test doctor statistics with proper appointment status updates"""
    backend_url = "https://medrecord-enhance.preview.emergentagent.com"
    
    print("=" * 80)
    print("DOCTOR STATISTICS API TESTING WITH STATUS UPDATES")
    print("=" * 80)
    
    # Register admin
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    admin_data = {
        "email": f"admin_stats_test_{timestamp}@test.com",
        "password": "AdminTest123!",
        "full_name": f"Admin Stats Test {timestamp}",
        "role": "admin"
    }
    
    response = requests.post(f"{backend_url}/api/auth/register", json=admin_data)
    if response.status_code != 200:
        print(f"❌ Failed to register admin: {response.status_code}")
        return False
    
    token = response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    print(f"✅ Registered admin: {admin_data['full_name']}")
    
    # Create doctors
    doctors = []
    for i in range(3):
        doctor_data = {
            "full_name": f"Доктор Статистика {i+1}",
            "specialty": ["Стоматолог", "Гинеколог", "Ортодонт"][i],
            "phone": f"+7777123456{i}",
            "calendar_color": ["#3B82F6", "#EF4444", "#10B981"][i]
        }
        
        response = requests.post(f"{backend_url}/api/doctors", json=doctor_data, headers=headers)
        if response.status_code == 200:
            doctors.append(response.json())
            print(f"✅ Created doctor: {doctor_data['full_name']}")
        else:
            print(f"❌ Failed to create doctor: {response.status_code}")
            return False
    
    # Create patients
    patients = []
    for i in range(5):
        patient_data = {
            "full_name": f"Пациент Статистика {i+1}",
            "phone": f"+7777654321{i}",
            "source": "phone"
        }
        
        response = requests.post(f"{backend_url}/api/patients", json=patient_data, headers=headers)
        if response.status_code == 200:
            patients.append(response.json())
            print(f"✅ Created patient: {patient_data['full_name']}")
        else:
            print(f"❌ Failed to create patient: {response.status_code}")
            return False
    
    # Create appointments and update their statuses
    appointments = []
    statuses = ["completed", "cancelled", "no_show"]
    prices = [5000.0, 7500.0, 10000.0, 12500.0, 15000.0]
    
    print("\n📅 Creating appointments with different statuses...")
    
    for i in range(30):  # Create 30 appointments
        doctor = random.choice(doctors)
        patient = random.choice(patients)
        status = random.choice(statuses)
        price = random.choice(prices)
        
        # Create appointment date (last 60 days)
        appointment_date = (datetime.now() - timedelta(days=random.randint(1, 60))).strftime("%Y-%m-%d")
        appointment_time = f"{9 + (i % 8)}:00"
        
        # Create appointment
        appointment_data = {
            "patient_id": patient["id"],
            "doctor_id": doctor["id"],
            "appointment_date": appointment_date,
            "appointment_time": appointment_time,
            "price": price,
            "reason": f"Консультация {status}",
            "notes": f"Заметка для приема {status}"
        }
        
        response = requests.post(f"{backend_url}/api/appointments", json=appointment_data, headers=headers)
        if response.status_code == 200:
            appointment = response.json()
            appointments.append(appointment)
            
            # Update appointment status
            update_data = {"status": status}
            update_response = requests.put(
                f"{backend_url}/api/appointments/{appointment['id']}", 
                json=update_data, 
                headers=headers
            )
            
            if update_response.status_code == 200:
                print(f"✅ Created appointment {i+1}: {doctor['full_name']} - {patient['full_name']} ({status}, {price})")
            else:
                print(f"❌ Failed to update appointment status: {update_response.status_code}")
        else:
            print(f"❌ Failed to create appointment: {response.status_code}")
    
    print(f"\n✅ Created {len(appointments)} appointments with various statuses")
    
    # Test general doctor statistics
    print("\n" + "=" * 60)
    print("TESTING GENERAL DOCTOR STATISTICS")
    print("=" * 60)
    
    response = requests.get(f"{backend_url}/api/doctors/statistics", headers=headers)
    if response.status_code == 200:
        stats = response.json()
        overview = stats["overview"]
        
        print("✅ General doctor statistics retrieved successfully")
        print(f"📊 Total Doctors: {overview['total_doctors']}")
        print(f"📊 Total Appointments: {overview['total_appointments']}")
        print(f"📊 Completed: {overview['completed_appointments']} ({overview['completion_rate']}%)")
        print(f"📊 Cancelled: {overview['cancelled_appointments']} ({overview['cancellation_rate']}%)")
        print(f"📊 No Show: {overview['no_show_appointments']} ({overview['no_show_rate']}%)")
        print(f"📊 Total Revenue: {overview['total_revenue']} тенге")
        print(f"📊 Revenue Efficiency: {overview['revenue_efficiency']}%")
        
        # Verify we have some completed appointments with revenue
        if overview['completed_appointments'] > 0 and overview['total_revenue'] > 0:
            print("✅ Revenue calculations working correctly")
        else:
            print("⚠️ No completed appointments with revenue found")
        
    else:
        print(f"❌ Failed to get general statistics: {response.status_code}")
        return False
    
    # Test individual doctor statistics
    print("\n" + "=" * 60)
    print("TESTING INDIVIDUAL DOCTOR STATISTICS")
    print("=" * 60)
    
    response = requests.get(f"{backend_url}/api/doctors/statistics/individual", headers=headers)
    if response.status_code == 200:
        stats = response.json()
        doctor_stats = stats["doctor_statistics"]
        
        print("✅ Individual doctor statistics retrieved successfully")
        print(f"📊 Total Doctors in Statistics: {len(doctor_stats)}")
        
        # Show top 3 doctors by appointments
        top_doctors = sorted([d for d in doctor_stats if d["total_appointments"] > 0], 
                           key=lambda x: x['total_appointments'], reverse=True)[:3]
        
        for i, doctor in enumerate(top_doctors, 1):
            print(f"   {i}. {doctor['doctor_name']} ({doctor['doctor_specialty']})")
            print(f"      Appointments: {doctor['total_appointments']} (Completed: {doctor['completed_appointments']})")
            print(f"      Revenue: {doctor['total_revenue']} тенге")
            print(f"      Completion Rate: {doctor['completion_rate']:.1f}%")
            print(f"      No-show Rate: {doctor['no_show_rate']:.1f}%")
        
        summary = stats["summary"]
        print(f"\n📊 Summary:")
        print(f"   Active Doctors: {summary['active_doctors']}")
        print(f"   Top Performers: {summary['top_performers']}")
        
    else:
        print(f"❌ Failed to get individual statistics: {response.status_code}")
        return False
    
    # Test date filtering
    print("\n" + "=" * 60)
    print("TESTING DATE FILTERING")
    print("=" * 60)
    
    # Test with last 30 days
    date_from = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    params = {"date_from": date_from}
    
    response = requests.get(f"{backend_url}/api/doctors/statistics", headers=headers, params=params)
    if response.status_code == 200:
        filtered_stats = response.json()
        filtered_appointments = filtered_stats["overview"]["total_appointments"]
        
        print(f"✅ Date filtering working")
        print(f"📊 All appointments: {overview['total_appointments']}")
        print(f"📊 Last 30 days: {filtered_appointments}")
        
        if filtered_appointments <= overview['total_appointments']:
            print("✅ Date filtering appears to be working correctly")
        else:
            print("❌ Date filtering may not be working correctly")
            return False
    else:
        print(f"❌ Failed to test date filtering: {response.status_code}")
        return False
    
    # Test authentication
    print("\n" + "=" * 60)
    print("TESTING AUTHENTICATION")
    print("=" * 60)
    
    # Test without token
    response = requests.get(f"{backend_url}/api/doctors/statistics")
    if response.status_code in [401, 403]:  # Both are acceptable
        print("✅ Unauthorized access correctly rejected")
    else:
        print(f"❌ Unauthorized access was allowed: {response.status_code}")
        return False
    
    print("\n" + "=" * 80)
    print("DOCTOR STATISTICS API TESTING COMPLETED SUCCESSFULLY!")
    print("=" * 80)
    
    return True

if __name__ == "__main__":
    success = test_doctor_statistics_with_status_updates()
    if success:
        print("\n✅ All doctor statistics tests passed!")
        sys.exit(0)
    else:
        print("\n❌ Some doctor statistics tests failed!")
        sys.exit(1)