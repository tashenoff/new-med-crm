"""
Database connection and utilities
Extracted from server.py for modular architecture
"""
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
import os

# Database connection
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017/clinic")
client = AsyncIOMotorClient(MONGO_URL)
db = client[os.environ.get('DB_NAME', 'clinic')]

async def close_database():
    """Close database connection"""
    client.close()

# This will be imported by all routers to get database access
def get_database() -> AsyncIOMotorDatabase:
    """Get database instance"""
    return db