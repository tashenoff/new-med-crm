import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

async def check_database():
    # Load environment variables
    load_dotenv('/app/backend/.env')
    
    mongo_url = os.environ['MONGO_URL']
    db_name = os.environ['DB_NAME']
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print("Checking database collections...")
    
    # Check appointments
    appointments_count = await db.appointments.count_documents({})
    print(f"Appointments count: {appointments_count}")
    
    if appointments_count > 0:
        # Get a sample appointment
        sample_appointment = await db.appointments.find_one({})
        print(f"Sample appointment: {sample_appointment}")
        
        # Check if patient and doctor exist for this appointment
        if sample_appointment:
            patient_id = sample_appointment.get('patient_id')
            doctor_id = sample_appointment.get('doctor_id')
            
            patient = await db.patients.find_one({"id": patient_id})
            doctor = await db.doctors.find_one({"id": doctor_id})
            
            print(f"Patient exists: {patient is not None}")
            print(f"Doctor exists: {doctor is not None}")
            
            if not patient:
                print(f"Missing patient with ID: {patient_id}")
            if not doctor:
                print(f"Missing doctor with ID: {doctor_id}")
    
    # Check patients
    patients_count = await db.patients.count_documents({})
    print(f"Patients count: {patients_count}")
    
    # Check doctors
    doctors_count = await db.doctors.count_documents({})
    print(f"Doctors count: {doctors_count}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(check_database())