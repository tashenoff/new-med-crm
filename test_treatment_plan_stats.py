"""
Test treatment plan statistics after updating payment status
"""
import asyncio
import sys
import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables from backend/.env
load_dotenv('backend/.env')

async def test_statistics():
    # Connect to MongoDB using settings from .env
    MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    DB_NAME = os.environ.get("DB_NAME", "med_crm")
    
    print(f"Connecting to: {MONGO_URL}")
    print(f"Database: {DB_NAME}")
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    print("=" * 80)
    print("Testing Treatment Plan Statistics")
    print("=" * 80)
    
    # Get all treatment plans
    all_plans = await db.treatment_plans.find({}).to_list(None)
    print(f"\n📊 Total Treatment Plans in DB: {len(all_plans)}")
    
    # Count by payment status
    payment_statuses = {}
    execution_statuses = {}
    total_cost = 0
    total_paid = 0
    
    for plan in all_plans:
        payment_status = plan.get('payment_status', 'unpaid')
        payment_statuses[payment_status] = payment_statuses.get(payment_status, 0) + 1
        
        execution_status = plan.get('execution_status', 'pending')
        execution_statuses[execution_status] = execution_statuses.get(execution_status, 0) + 1
        
        plan_cost = plan.get('total_cost', 0) or 0
        plan_paid = plan.get('paid_amount', 0) or 0
        
        total_cost += plan_cost
        total_paid += plan_paid
    
    print("\n💰 Payment Status Distribution:")
    for status, count in payment_statuses.items():
        print(f"  - {status}: {count}")
    
    print("\n⚙️ Execution Status Distribution:")
    for status, count in execution_statuses.items():
        print(f"  - {status}: {count}")
    
    print(f"\n💵 Financial Summary:")
    print(f"  - Total Cost: {total_cost:,.2f}")
    print(f"  - Total Paid: {total_paid:,.2f}")
    print(f"  - Outstanding: {total_cost - total_paid:,.2f}")
    print(f"  - Collection Rate: {(total_paid / total_cost * 100) if total_cost > 0 else 0:.1f}%")
    
    # Get the most recent plan
    recent_plan = await db.treatment_plans.find_one(
        {},
        sort=[("updated_at", -1)]
    )
    
    if recent_plan:
        print(f"\n📋 Most Recently Updated Plan:")
        print(f"  - ID: {recent_plan.get('id')}")
        print(f"  - Patient ID: {recent_plan.get('patient_id')}")
        print(f"  - Payment Status: {recent_plan.get('payment_status')}")
        print(f"  - Execution Status: {recent_plan.get('execution_status')}")
        print(f"  - Total Cost: {recent_plan.get('total_cost', 0):,.2f}")
        print(f"  - Paid Amount: {recent_plan.get('paid_amount', 0):,.2f}")
        print(f"  - Updated At: {recent_plan.get('updated_at')}")
    
    # Close connection
    client.close()
    
    print("\n✅ Statistics test completed!")
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(test_statistics())
