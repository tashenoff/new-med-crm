from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional
import os
import uuid
import bcrypt

# Import auth models from models module
from models.auth import (
    UserRole,
    User,
    UserInDB,
    UserCreate,
    UserLogin,
    Token,
    TokenData,
    ChangePasswordRequest
)

# Security setup
SECRET_KEY = os.environ.get("SECRET_KEY", "fallback-secret-key")
ALGORITHM = os.environ.get("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

security = HTTPBearer()

# Router
auth_router = APIRouter(prefix="/auth", tags=["Authentication"])

# Dependency to get database
def get_database():
    from database import db
    return db

# Helper functions using bcrypt directly
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Проверка пароля используя bcrypt напрямую"""
    try:
        # Конвертируем в байты
        password_bytes = plain_password.encode('utf-8')
        
        # Обрезаем если нужно (как при хешировании)
        if len(password_bytes) > 72:
            password_bytes = password_bytes[:72]
        
        hashed_bytes = hashed_password.encode('utf-8')
        
        # Проверяем через bcrypt
        return bcrypt.checkpw(password_bytes, hashed_bytes)
    except Exception as e:
        print(f"Ошибка при проверке пароля: {e}")
        return False

def get_password_hash(password: str) -> str:
    """Хеширование пароля используя bcrypt напрямую"""
    try:
        # bcrypt работает с байтами, лимит 72 байта
        password_bytes = password.encode('utf-8')
        
        # Обрезаем если нужно
        if len(password_bytes) > 72:
            password_bytes = password_bytes[:72]
        
        # Используем bcrypt напрямую
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password_bytes, salt)
        
        # Возвращаем как строку
        return hashed.decode('utf-8')
    except Exception as e:
        print(f"Ошибка при хешировании пароля: {e}")
        raise ValueError(f"Не удалось захешировать пароль: {str(e)}")

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: AsyncIOMotorDatabase = Depends(get_database)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = TokenData(email=email)
    except JWTError:
        raise credentials_exception

    user = await db.users.find_one({"email": token_data.email})
    if user is None:
        raise credentials_exception

    user["id"] = str(user["_id"])
    del user["_id"]
    return User(**user)

# UserInDB model is now imported from models.auth

async def get_user_by_email(email: str, db: AsyncIOMotorDatabase):
    user = await db.users.find_one({"email": email})
    if user:
        user["id"] = str(user["_id"])
        del user["_id"]
        return UserInDB(**user)
    return None

async def authenticate_user(email: str, password: str, db: AsyncIOMotorDatabase):
    user = await get_user_by_email(email, db)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user

async def get_current_active_user(current_user: UserInDB = Depends(get_current_user)):
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    # Check if password has expired
    if current_user.password_expires_at and datetime.utcnow() > current_user.password_expires_at:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Password expired",
            headers={"X-Password-Expired": "true"}
        )

    return current_user

def require_role(allowed_roles: list):
    """Dependency to require specific roles"""
    def role_checker(current_user: UserInDB = Depends(get_current_active_user)):
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        return current_user
    return role_checker

# Auth routes
@auth_router.post("/register", response_model=Token)
async def register(user: UserCreate, db: AsyncIOMotorDatabase = Depends(get_database)):
    # Check if user already exists
    existing_user = await get_user_by_email(user.email, db)
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )
    
    # Hash password
    hashed_password = get_password_hash(user.password)
    
    # Create user
    user_dict = user.dict()
    user_dict.pop("password")
    user_dict["hashed_password"] = hashed_password
    user_dict["id"] = str(uuid.uuid4())
    user_dict["created_at"] = datetime.utcnow()
    user_dict["updated_at"] = datetime.utcnow()
    user_dict["is_active"] = True
    user_dict["password_expires_at"] = datetime.utcnow() + timedelta(days=90)  # Password expires in 90 days
    user_obj = UserInDB(**user_dict)
    
    await db.users.insert_one(user_obj.dict())
    
    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user_obj.email}, expires_delta=access_token_expires
    )
    
    # Convert to public user model
    public_user = User(**{k: v for k, v in user_obj.dict().items() if k != "hashed_password"})
    
    return {"access_token": access_token, "token_type": "bearer", "user": public_user}

@auth_router.post("/login", response_model=Token)
async def login(form_data: UserLogin, db: AsyncIOMotorDatabase = Depends(get_database)):
    user = await authenticate_user(form_data.email, form_data.password, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    
    # Convert to public user model
    user_data = {k: v for k, v in user.dict().items() if k != "hashed_password"}
    
    # Добавляем permissions из коллекции staff
    staff_doc = await db.staff.find_one({"_id": user.id})
    if staff_doc:
        # Импортируем StaffRole и ROLE_PERMISSIONS
        from models.staff import StaffRole, ROLE_PERMISSIONS
        
        # Получаем базовые права для роли
        role = staff_doc.get("role")
        base_permissions = ROLE_PERMISSIONS.get(StaffRole(role), []) if role else []
        
        # Получаем custom_permissions
        custom_permissions = staff_doc.get("custom_permissions", [])
        
        # Объединяем и удаляем дубликаты
        all_permissions = list(set(base_permissions + custom_permissions))
        user_data["permissions"] = all_permissions
    else:
        user_data["permissions"] = []
    
    public_user = User(**user_data)
    
    return {"access_token": access_token, "token_type": "bearer", "user": public_user}

@auth_router.get("/me", response_model=User)
async def read_users_me(current_user: UserInDB = Depends(get_current_active_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    # Convert to public user model
    user_data = {k: v for k, v in current_user.dict().items() if k != "hashed_password"}
    
    # Добавляем permissions из коллекции staff
    staff_doc = await db.staff.find_one({"_id": current_user.id})
    if staff_doc:
        # Импортируем StaffRole и ROLE_PERMISSIONS
        from models.staff import StaffRole, ROLE_PERMISSIONS
        
        # Получаем базовые права для роли
        role = staff_doc.get("role")
        base_permissions = ROLE_PERMISSIONS.get(StaffRole(role), []) if role else []
        
        # Получаем custom_permissions
        custom_permissions = staff_doc.get("custom_permissions", [])
        
        # Объединяем и удаляем дубликаты
        all_permissions = list(set(base_permissions + custom_permissions))
        user_data["permissions"] = all_permissions
    else:
        user_data["permissions"] = []
    
    return User(**user_data)

@auth_router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    # Verify current password
    if not verify_password(request.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )

    # Hash new password
    new_hashed_password = get_password_hash(request.new_password)

    # Update user in database
    update_data = {
        "hashed_password": new_hashed_password,
        "password_expires_at": datetime.utcnow() + timedelta(days=90),  # Password expires in 90 days
        "updated_at": datetime.utcnow()
    }

    await db.users.update_one(
        {"email": current_user.email},
        {"$set": update_data}
    )

    return {"message": "Password changed successfully"}
