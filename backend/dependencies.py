"""
Common dependencies for all routers
Extracted from server.py for modular architecture
"""
from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from routers.auth import get_current_user as auth_get_current_user, get_user_by_email, get_database
from models.auth import UserInDB, UserRole
from typing import List
from motor.motor_asyncio import AsyncIOMotorDatabase

security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: AsyncIOMotorDatabase = Depends(get_database)):
    """Get current user from JWT token"""
    return await auth_get_current_user(credentials, db)

async def get_current_active_user(current_user: UserInDB = Depends(get_current_user)):  
    """Get current active user"""
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

def require_role(allowed_roles: List[UserRole]):
    """Dependency to require specific user roles"""
    def role_checker(current_user: UserInDB = Depends(get_current_active_user)):
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        return current_user
    return role_checker