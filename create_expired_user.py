#!/usr/bin/env python3
"""
Script to create a user with expired password for testing
"""

from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone
import uuid
import asyncio
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv(dotenv_path="backend/.env")

# Password hashing
pwd_context = CryptContext(schemes=["pbkdf2_sha256", "argon2", "bcrypt"], deprecated="auto")

def get_password_hash(password):
    return pwd_context.hash(password)

async def create_expired_user():
    # Database connection - use the same config as the app
    mongo_url = os.environ.get("MONGO_URL", "mongodb://admin:admin123@localhost:27017/?authSource=admin")
    db_name = os.environ.get("DB_NAME", "medcrm")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    # Get current time in UTC
    now = datetime.now(timezone.utc)

    # User data
    user_data = {
        "id": str(uuid.uuid4()),
        "email": "expired_test@example.com",
        "hashed_password": get_password_hash("testpass123"),
        "full_name": "Expired Test User",
        "role": "patient",
        "is_active": True,
        "created_at": now,
        "updated_at": now,
        "password_expires_at": now - timedelta(days=1),  # Already expired
        "doctor_id": None,
        "patient_id": None
    }

    # Insert user
    try:
        result = await db.users.insert_one(user_data)
        print(f"Created user with expired password: {user_data['email']}")
        print(f"User ID: {result.inserted_id}")
        print(f"Password expires at: {user_data['password_expires_at']}")
        print("Current time:", now)
    except Exception as e:
        print(f"Error inserting user: {e}")
        print("Make sure MongoDB is running and credentials are correct")
        return

    client.close()

if __name__ == "__main__":
    asyncio.run(create_expired_user())
