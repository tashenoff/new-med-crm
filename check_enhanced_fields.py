import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

async def check_enhanced_fields():
    # Load environment variables
    load_dotenv('/app/backend/.env')
    
    mongo_url = os.environ['MONGO_URL']
    db_name = os.environ['DB_NAME']
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print("Checking enhanced fields in appointments...")
    
    # Get all appointments and check for enhanced fields
    appointments = await db.appointments.find({}).to_list(None)
    
    enhanced_fields = ['end_time', 'chair_number', 'assistant_id', 'second_doctor_id', 'extra_hours', 'patient_notes']
    
    for i, appointment in enumerate(appointments[:3]):  # Check first 3
        print(f"\nAppointment {i+1} (ID: {appointment.get('id', 'unknown')}):")
        for field in enhanced_fields:
            value = appointment.get(field, 'MISSING')
            print(f"  {field}: {value}")
    
    # Check if any appointments have assistant_id or second_doctor_id
    with_assistant = await db.appointments.count_documents({"assistant_id": {"$ne": None}})
    with_second_doctor = await db.appointments.count_documents({"second_doctor_id": {"$ne": None}})
    
    print(f"\nAppointments with assistant_id: {with_assistant}")
    print(f"Appointments with second_doctor_id: {with_second_doctor}")
    
    # Test the aggregation pipeline manually
    print("\nTesting aggregation pipeline...")
    
    try:
        pipeline = [
            {"$limit": 1},  # Just test with one appointment
            {
                "$lookup": {
                    "from": "patients",
                    "localField": "patient_id",
                    "foreignField": "id",
                    "as": "patient"
                }
            },
            {
                "$lookup": {
                    "from": "doctors",
                    "localField": "doctor_id",
                    "foreignField": "id",
                    "as": "doctor"
                }
            },
            {
                "$lookup": {
                    "from": "doctors",
                    "localField": "assistant_id",
                    "foreignField": "id",
                    "as": "assistant"
                }
            },
            {
                "$lookup": {
                    "from": "doctors",
                    "localField": "second_doctor_id",
                    "foreignField": "id",
                    "as": "second_doctor"
                }
            }
        ]
        
        result = await db.appointments.aggregate(pipeline).to_list(1)
        if result:
            appointment = result[0]
            print(f"Patient array length: {len(appointment.get('patient', []))}")
            print(f"Doctor array length: {len(appointment.get('doctor', []))}")
            print(f"Assistant array length: {len(appointment.get('assistant', []))}")
            print(f"Second doctor array length: {len(appointment.get('second_doctor', []))}")
            
            # Now test with unwind
            pipeline_with_unwind = pipeline + [
                {"$unwind": "$patient"},
                {"$unwind": "$doctor"}
            ]
            
            result_unwind = await db.appointments.aggregate(pipeline_with_unwind).to_list(1)
            print(f"Unwind successful: {len(result_unwind) > 0}")
            
    except Exception as e:
        print(f"Aggregation error: {e}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(check_enhanced_fields())