#!/usr/bin/env python3

import asyncio
import os
import uuid
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
from passlib.context import CryptContext

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / 'backend/.env')

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

async def create_admin_user():
    # Connect to MongoDB
    mongo_url = os.environ['MONGO_URL']
    db_name = os.environ['DB_NAME']
    
    print(f"Connecting to: {mongo_url}")
    print(f"Database: {db_name}")
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    try:
        # Test connection
        await client.admin.command('ping')
        print("✅ Connected to MongoDB successfully!")
        
        # Check if admin already exists
        existing_admin = await db.users.find_one({"role": "admin"})
        if existing_admin:
            print(f"⚠️ Admin user already exists: {existing_admin['email']}")
            return
        
        # Create admin user
        admin_data = {
            "id": str(uuid.uuid4()),
            "email": "admin@medcenter.com",
            "full_name": "System Administrator",
            "role": "admin",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "doctor_id": None,
            "patient_id": None,
            "hashed_password": hash_password("admin123")  # Default password
        }
        
        # Insert admin user
        await db.users.insert_one(admin_data)
        print("✅ Admin user created successfully!")
        print("📧 Email: admin@medcenter.com")
        print("🔐 Password: admin123")
        print("⚠️ Please change the password after first login!")
        
        # Verify creation
        users_count = await db.users.count_documents({})
        print(f"\n📊 Total users in database: {users_count}")
        
        # List all users
        users = await db.users.find({}).to_list(None)
        print(f"\n👥 Users in database:")
        for user in users:
            print(f"  - {user['full_name']} ({user['email']}) - {user['role']}")
            
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    print("🚀 Creating admin user...")
    asyncio.run(create_admin_user())


