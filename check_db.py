#!/usr/bin/env python3

import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / 'backend/.env')

async def check_database():
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
        
        # List all collections
        collections = await db.list_collection_names()
        print(f"\n📁 Collections in database '{db_name}':")
        
        if not collections:
            print("❌ No collections found - database is empty")
        else:
            for collection in collections:
                count = await db[collection].count_documents({})
                print(f"  - {collection}: {count} documents")
        
        # Check users collection specifically
        print(f"\n👥 Users collection:")
        users_count = await db.users.count_documents({})
        print(f"  Total users: {users_count}")
        
        if users_count > 0:
            users = await db.users.find({}).to_list(None)
            for user in users:
                print(f"  - {user.get('full_name')} ({user.get('email')}) - {user.get('role')}")
        else:
            print("  No users found")
            
    except Exception as e:
        print(f"❌ Error connecting to database: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(check_database())