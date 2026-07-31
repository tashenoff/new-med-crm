"""
Loyalty Service Module

This service handles patient bonus system and doctor cashback logic.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase

from models.loyalty import (
    LoyaltySettings,
    BonusTransaction,
    BonusTransactionCreate,
    BonusTransactionType,
    DoctorCashbackTransaction,
    DoctorCashbackTransactionCreate,
    CashbackTransactionType,
    LabServiceCashback,
    PatientBonusInfo,
    DoctorCashbackInfo,
    BonusPaymentCalculation
)


class LoyaltyService:
    """Service for managing loyalty program (bonuses and cashback)"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def get_or_create_settings(self) -> LoyaltySettings:
        """Get loyalty settings or create default if not exists"""
        settings = await self.db.loyalty_settings.find_one()
        
        if not settings:
            # Create default settings
            default_settings = LoyaltySettings()
            await self.db.loyalty_settings.insert_one(default_settings.dict())
            return default_settings
        
        return LoyaltySettings(**settings)
    
    async def update_settings(self, update_data: Dict[str, Any]) -> LoyaltySettings:
        """Update loyalty settings"""
        update_data["updated_at"] = datetime.utcnow()
        
        await self.db.loyalty_settings.update_one(
            {},
            {"$set": update_data},
            upsert=True
        )
        
        return await self.get_or_create_settings()
    
    async def get_patient_bonus_info(self, patient_id: str) -> PatientBonusInfo:
        """Get patient bonus information"""
        # Get patient
        patient = await self.db.patients.find_one({"id": patient_id})
        if not patient:
            raise ValueError(f"Patient {patient_id} not found")
        
        # Get settings
        settings = await self.get_or_create_settings()
        
        return PatientBonusInfo(
            patient_id=patient_id,
            bonus_balance=patient.get("bonus_balance", 0.0),
            total_earned=patient.get("total_bonus_earned", 0.0),
            total_spent=patient.get("total_bonus_spent", 0.0),
            can_use_bonus=settings.is_active,
            earning_rate=settings.earning_rate,
            max_usage_percent=settings.max_usage_percent
        )
    
    async def calculate_bonus_payment(
        self,
        patient_id: str,
        total_amount: float,
        requested_bonus: float
    ) -> BonusPaymentCalculation:
        """Calculate how much bonus can be used for payment"""
        # Get patient bonus info
        bonus_info = await self.get_patient_bonus_info(patient_id)
        
        # Calculate maximum allowed bonus (30% of total)
        max_allowed_bonus = total_amount * (bonus_info.max_usage_percent / 100)
        
        # Determine actual bonus to use
        bonus_to_use = min(
            requested_bonus,
            bonus_info.bonus_balance,
            max_allowed_bonus
        )
        
        return BonusPaymentCalculation(
            requested_bonus=requested_bonus,
            available_bonus=bonus_info.bonus_balance,
            max_allowed_bonus=max_allowed_bonus,
            bonus_to_use=bonus_to_use,
            remaining_payment=total_amount - bonus_to_use,
            patient_new_balance=bonus_info.bonus_balance - bonus_to_use
        )
    
    async def process_payment(
        self,
        payment_type: str,
        payment_id: str,
        patient_id: str,
        amount: float,
        doctor_id: Optional[str] = None,
        services: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Process payment and award bonuses/cashback
        
        Args:
            payment_type: "appointment" or "treatment_plan"
            payment_id: ID of appointment or treatment plan
            patient_id: Patient ID
            amount: Payment amount
            doctor_id: Doctor ID (for cashback)
            services: List of service IDs (for cashback)
        
        Returns:
            Dict with bonus and cashback information
        """
        result = {
            "bonus_awarded": 0.0,
            "cashback_awarded": 0.0,
            "bonus_transaction_id": None,
            "cashback_transactions": []
        }
        
        # 1. Award bonus to patient
        bonus_awarded = await self._earn_patient_bonus(
            patient_id, amount, payment_type, payment_id
        )
        result["bonus_awarded"] = bonus_awarded.get("amount", 0.0)
        result["bonus_transaction_id"] = bonus_awarded.get("transaction_id")
        
        # 2. Award cashback to doctor for lab services
        if doctor_id and services:
            cashback_transactions = await self._earn_doctor_cashback(
                doctor_id, patient_id, services, payment_id
            )
            result["cashback_awarded"] = sum(t.get("amount", 0.0) for t in cashback_transactions)
            result["cashback_transactions"] = [t.get("transaction_id") for t in cashback_transactions]
        
        return result
    
    async def _earn_patient_bonus(
        self,
        patient_id: str,
        amount: float,
        payment_type: str,
        payment_id: str
    ) -> Dict[str, Any]:
        """Award bonus to patient after payment"""
        # Get settings
        settings = await self.get_or_create_settings()
        
        if not settings.is_active:
            return {"amount": 0.0, "transaction_id": None}
        
        # Calculate bonus
        bonus_amount = amount * (settings.earning_rate / 100)
        
        # Get patient
        patient = await self.db.patients.find_one({"id": patient_id})
        if not patient:
            raise ValueError(f"Patient {patient_id} not found")
        
        # Update patient balance
        current_balance = patient.get("bonus_balance", 0.0)
        current_total_earned = patient.get("total_bonus_earned", 0.0)
        
        new_balance = current_balance + bonus_amount
        new_total_earned = current_total_earned + bonus_amount
        
        await self.db.patients.update_one(
            {"id": patient_id},
            {
                "$set": {
                    "bonus_balance": new_balance,
                    "total_bonus_earned": new_total_earned,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        # Create transaction record
        transaction = BonusTransactionCreate(
            patient_id=patient_id,
            transaction_type=BonusTransactionType.EARNED,
            amount=bonus_amount,
            balance_after=new_balance,
            related_id=payment_id,
            related_type=payment_type,
            description=f"Начислено {settings.earning_rate}% от оплаты ({amount:.2f} ₸)"
        )
        
        transaction_obj = BonusTransaction(**transaction.dict())
        await self.db.bonus_transactions.insert_one(transaction_obj.dict())
        
        return {
            "amount": bonus_amount,
            "transaction_id": transaction_obj.id,
            "new_balance": new_balance
        }
    
    async def spend_patient_bonus(
        self,
        patient_id: str,
        amount: float,
        payment_type: str,
        payment_id: str
    ) -> Dict[str, Any]:
        """Spend patient bonus for payment"""
        # Get patient
        patient = await self.db.patients.find_one({"id": patient_id})
        if not patient:
            raise ValueError(f"Patient {patient_id} not found")
        
        current_balance = patient.get("bonus_balance", 0.0)
        
        if current_balance < amount:
            raise ValueError(f"Insufficient bonus balance. Available: {current_balance}, requested: {amount}")
        
        # Update patient balance
        current_total_spent = patient.get("total_bonus_spent", 0.0)
        
        new_balance = current_balance - amount
        new_total_spent = current_total_spent + amount
        
        await self.db.patients.update_one(
            {"id": patient_id},
            {
                "$set": {
                    "bonus_balance": new_balance,
                    "total_bonus_spent": new_total_spent,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        # Create transaction record
        transaction = BonusTransactionCreate(
            patient_id=patient_id,
            transaction_type=BonusTransactionType.SPENT,
            amount=amount,
            balance_after=new_balance,
            related_id=payment_id,
            related_type=payment_type,
            description=f"Списано бонусов для оплаты"
        )
        
        transaction_obj = BonusTransaction(**transaction.dict())
        await self.db.bonus_transactions.insert_one(transaction_obj.dict())
        
        return {
            "amount": amount,
            "transaction_id": transaction_obj.id,
            "new_balance": new_balance
        }
    
    async def refund_patient_bonus(
        self,
        patient_id: str,
        original_transaction_id: str,
        reason: str = "Отмена приема"
    ) -> Dict[str, Any]:
        """Refund bonus if appointment/treatment is cancelled"""
        # Find original earning transaction
        original = await self.db.bonus_transactions.find_one({
            "id": original_transaction_id,
            "patient_id": patient_id,
            "transaction_type": BonusTransactionType.EARNED.value
        })
        
        if not original:
            return {"amount": 0.0, "transaction_id": None}
        
        # Get patient
        patient = await self.db.patients.find_one({"id": patient_id})
        if not patient:
            raise ValueError(f"Patient {patient_id} not found")
        
        # Refund amount
        refund_amount = original["amount"]
        current_balance = patient.get("bonus_balance", 0.0)
        current_total_earned = patient.get("total_bonus_earned", 0.0)
        
        new_balance = max(0, current_balance - refund_amount)
        new_total_earned = max(0, current_total_earned - refund_amount)
        
        await self.db.patients.update_one(
            {"id": patient_id},
            {
                "$set": {
                    "bonus_balance": new_balance,
                    "total_bonus_earned": new_total_earned,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        # Create refund transaction
        transaction = BonusTransactionCreate(
            patient_id=patient_id,
            transaction_type=BonusTransactionType.REFUND,
            amount=refund_amount,
            balance_after=new_balance,
            related_id=original.get("related_id"),
            related_type=original.get("related_type"),
            description=f"Возврат бонусов: {reason}"
        )
        
        transaction_obj = BonusTransaction(**transaction.dict())
        await self.db.bonus_transactions.insert_one(transaction_obj.dict())
        
        return {
            "amount": refund_amount,
            "transaction_id": transaction_obj.id,
            "new_balance": new_balance
        }
    
    async def get_patient_bonus_history(
        self,
        patient_id: str,
        limit: int = 50
    ) -> List[BonusTransaction]:
        """Get patient bonus transaction history"""
        transactions = await self.db.bonus_transactions.find(
            {"patient_id": patient_id}
        ).sort("created_at", -1).limit(limit).to_list(limit)
        
        return [BonusTransaction(**t) for t in transactions]
    
    async def _earn_doctor_cashback(
        self,
        doctor_id: str,
        patient_id: str,
        services: List[str],
        appointment_id: str
    ) -> List[Dict[str, Any]]:
        """Award cashback to doctor for lab services"""
        results = []
        
        # Get patient info for display
        patient = await self.db.patients.find_one({"id": patient_id})
        patient_name = patient.get("full_name", "Unknown") if patient else "Unknown"
        
        # Check each service
        for service_id in services:
            # Check if this service has cashback settings
            service_cashback = await self.db.lab_service_cashback.find_one({
                "service_id": service_id,
                "is_active": True
            })
            
            if not service_cashback:
                continue
            
            # Get service price
            service = await self.db.service_prices.find_one({"id": service_id})
            if not service:
                continue
            
            service_price = service.get("price", 0.0)
            service_name = service.get("service_name", "Unknown")
            cashback_rate = service_cashback.get("cashback_rate", 0.0)
            
            # Calculate cashback
            cashback_amount = service_price * (cashback_rate / 100)
            
            # Get doctor
            doctor = await self.db.doctors.find_one({"id": doctor_id})
            if not doctor:
                continue
            
            # Update doctor balance
            current_balance = doctor.get("cashback_balance", 0.0)
            current_total_earned = doctor.get("total_cashback_earned", 0.0)
            
            new_balance = current_balance + cashback_amount
            new_total_earned = current_total_earned + cashback_amount
            
            await self.db.doctors.update_one(
                {"id": doctor_id},
                {
                    "$set": {
                        "cashback_balance": new_balance,
                        "total_cashback_earned": new_total_earned,
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            
            # Create transaction record
            transaction = DoctorCashbackTransactionCreate(
                doctor_id=doctor_id,
                patient_id=patient_id,
                patient_name=patient_name,
                service_id=service_id,
                service_name=service_name,
                transaction_type=CashbackTransactionType.EARNED,
                amount=cashback_amount,
                balance_after=new_balance,
                related_appointment_id=appointment_id,
                description=f"Кэшбэк {cashback_rate}% за направление на анализ: {service_name}"
            )
            
            transaction_obj = DoctorCashbackTransaction(**transaction.dict())
            await self.db.doctor_cashback_transactions.insert_one(transaction_obj.dict())
            
            results.append({
                "amount": cashback_amount,
                "transaction_id": transaction_obj.id,
                "service_id": service_id,
                "service_name": service_name
            })
        
        return results
    
    async def get_doctor_cashback_info(
        self,
        doctor_id: str,
        include_transactions: bool = True,
        limit: int = 10
    ) -> DoctorCashbackInfo:
        """Get doctor cashback information"""
        # Get doctor
        doctor = await self.db.doctors.find_one({"id": doctor_id})
        if not doctor:
            raise ValueError(f"Doctor {doctor_id} not found")
        
        recent_transactions = []
        if include_transactions:
            transactions = await self.db.doctor_cashback_transactions.find(
                {"doctor_id": doctor_id}
            ).sort("created_at", -1).limit(limit).to_list(limit)
            
            recent_transactions = [DoctorCashbackTransaction(**t) for t in transactions]
        
        return DoctorCashbackInfo(
            doctor_id=doctor_id,
            cashback_balance=doctor.get("cashback_balance", 0.0),
            total_earned=doctor.get("total_cashback_earned", 0.0),
            recent_transactions=recent_transactions
        )
    
    async def get_doctor_cashback_history(
        self,
        doctor_id: str,
        limit: int = 50
    ) -> List[DoctorCashbackTransaction]:
        """Get doctor cashback transaction history"""
        transactions = await self.db.doctor_cashback_transactions.find(
            {"doctor_id": doctor_id}
        ).sort("created_at", -1).limit(limit).to_list(limit)
        
        return [DoctorCashbackTransaction(**t) for t in transactions]
    
    async def get_lab_service_cashback(self, service_id: str) -> Optional[LabServiceCashback]:
        """Get cashback settings for a lab service"""
        service_cashback = await self.db.lab_service_cashback.find_one({"service_id": service_id})
        
        if service_cashback:
            return LabServiceCashback(**service_cashback)
        return None
    
    async def create_lab_service_cashback(
        self,
        service_id: str,
        service_name: str,
        cashback_rate: float
    ) -> LabServiceCashback:
        """Create or update cashback settings for a lab service"""
        # Check if exists
        existing = await self.db.lab_service_cashback.find_one({"service_id": service_id})
        
        if existing:
            # Update existing
            await self.db.lab_service_cashback.update_one(
                {"service_id": service_id},
                {
                    "$set": {
                        "cashback_rate": cashback_rate,
                        "service_name": service_name,
                        "is_active": True,
                        "updated_at": datetime.utcnow()
                    }
                }
            )
        else:
            # Create new
            service_cashback = LabServiceCashback(
                service_id=service_id,
                service_name=service_name,
                cashback_rate=cashback_rate
            )
            await self.db.lab_service_cashback.insert_one(service_cashback.dict())
        
        return await self.get_lab_service_cashback(service_id)
    
    async def update_lab_service_cashback(
        self,
        service_id: str,
        update_data: Dict[str, Any]
    ) -> Optional[LabServiceCashback]:
        """Update cashback settings for a lab service"""
        update_data["updated_at"] = datetime.utcnow()
        
        result = await self.db.lab_service_cashback.update_one(
            {"service_id": service_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            return None
        
        return await self.get_lab_service_cashback(service_id)
    
    async def get_all_lab_services_cashback(self) -> List[LabServiceCashback]:
        """Get all lab services with cashback settings"""
        services = await self.db.lab_service_cashback.find(
            {"is_active": True}
        ).to_list(None)
        
        return [LabServiceCashback(**s) for s in services]
