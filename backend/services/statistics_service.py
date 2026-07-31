"""
Statistics service - business logic for statistics calculations
"""
from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime
from typing import Optional, Dict, Any, List


class StatisticsService:
    """Service for statistics calculations"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def get_doctor_statistics(
        self,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get overall doctor statistics"""
        # Build date filter for appointments
        appointment_date_filter = {}
        if date_from or date_to:
            date_query = {}
            if date_from:
                date_query["$gte"] = date_from
            if date_to:
                date_query["$lte"] = date_to
            appointment_date_filter["appointment_date"] = date_query
        
        # Get all appointments in date range
        all_appointments = await self.db.appointments.find(appointment_date_filter).to_list(None)
        
        # Get all doctors
        all_doctors = await self.db.doctors.find({"is_active": True}).to_list(None)
        
        # Calculate overall statistics
        total_appointments = len(all_appointments)
        completed_appointments = len([a for a in all_appointments if a.get('status') == 'completed'])
        cancelled_appointments = len([a for a in all_appointments if a.get('status') == 'cancelled'])
        no_show_appointments = len([a for a in all_appointments if a.get('status') == 'no_show'])
        
        total_revenue = sum(float(a.get('price') or 0) for a in all_appointments if a.get('status') == 'completed' and a.get('price'))
        potential_revenue = sum(float(a.get('price') or 0) for a in all_appointments if a.get('price'))
        
        # Monthly statistics for appointments
        monthly_stats = {}
        for appointment in all_appointments:
            appointment_date = appointment.get('appointment_date')
            if appointment_date:
                month_key = f"{appointment_date[:7]}"  # YYYY-MM format
                if month_key not in monthly_stats:
                    monthly_stats[month_key] = {
                        'total_appointments': 0,
                        'completed_appointments': 0,
                        'cancelled_appointments': 0,
                        'no_show_appointments': 0,
                        'total_revenue': 0
                    }
                monthly_stats[month_key]['total_appointments'] += 1
                if appointment.get('status') == 'completed':
                    monthly_stats[month_key]['completed_appointments'] += 1
                    monthly_stats[month_key]['total_revenue'] += float(appointment.get('price') or 0)
                elif appointment.get('status') == 'cancelled':
                    monthly_stats[month_key]['cancelled_appointments'] += 1
                elif appointment.get('status') == 'no_show':
                    monthly_stats[month_key]['no_show_appointments'] += 1
        
        return {
            "overview": {
                "total_doctors": len(all_doctors),
                "total_appointments": total_appointments,
                "completed_appointments": completed_appointments,
                "cancelled_appointments": cancelled_appointments,
                "no_show_appointments": no_show_appointments,
                "completion_rate": round((completed_appointments / total_appointments * 100) if total_appointments > 0 else 0, 1),
                "cancellation_rate": round((cancelled_appointments / total_appointments * 100) if total_appointments > 0 else 0, 1),
                "no_show_rate": round((no_show_appointments / total_appointments * 100) if total_appointments > 0 else 0, 1),
                "total_revenue": total_revenue,
                "potential_revenue": potential_revenue,
                "revenue_efficiency": round((total_revenue / potential_revenue * 100) if potential_revenue > 0 else 0, 1),
                "avg_revenue_per_appointment": round(total_revenue / completed_appointments if completed_appointments > 0 else 0, 2),
                "avg_appointments_per_doctor": round(total_appointments / len(all_doctors) if len(all_doctors) > 0 else 0, 1)
            },
            "monthly_statistics": [
                {
                    "month": month,
                    "total_appointments": data["total_appointments"],
                    "completed_appointments": data["completed_appointments"],
                    "cancelled_appointments": data["cancelled_appointments"], 
                    "no_show_appointments": data["no_show_appointments"],
                    "completion_rate": round((data["completed_appointments"] / data["total_appointments"] * 100) if data["total_appointments"] > 0 else 0, 1),
                    "total_revenue": data["total_revenue"],
                    "avg_revenue_per_appointment": round(data["total_revenue"] / data["completed_appointments"] if data["completed_appointments"] > 0 else 0, 2)
                }
                for month, data in sorted(monthly_stats.items())
            ]
        }
    
    async def get_individual_doctor_statistics(
        self,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get individual doctor statistics with working hours and utilization"""
        # Build date filter
        date_filter = {}
        if date_from or date_to:
            date_query = {}
            if date_from:
                date_query["$gte"] = date_from
            if date_to:
                date_query["$lte"] = date_to
            date_filter["appointment_date"] = date_query
        
        # Aggregate doctor statistics from appointments
        pipeline = [
            {"$match": date_filter},
            {
                "$addFields": {
                    "appointment_duration": 0.5  # Fixed 30 minutes duration for now
                }
            },
            {
                "$group": {
                    "_id": "$doctor_id",
                    "total_appointments": {"$sum": 1},
                    "completed_appointments": {
                        "$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}
                    },
                    "cancelled_appointments": {
                        "$sum": {"$cond": [{"$eq": ["$status", "cancelled"]}, 1, 0]}
                    },
                    "no_show_appointments": {
                        "$sum": {"$cond": [{"$eq": ["$status", "no_show"]}, 1, 0]}
                    },
                    "total_worked_hours": {
                        "$sum": {
                            "$cond": [
                                {"$eq": ["$status", "completed"]},
                                "$appointment_duration",
                                0
                            ]
                        }
                    },
                    "total_scheduled_hours": {
                        "$sum": "$appointment_duration"
                    },
                    "total_revenue": {
                        "$sum": {
                            "$cond": [
                                {"$eq": ["$status", "completed"]},
                                {"$toDouble": {"$ifNull": ["$price", 0]}},
                                0
                            ]
                        }
                    },
                    "potential_revenue": {
                        "$sum": {"$toDouble": {"$ifNull": ["$price", 0]}}
                    }
                }
            },
            {
                "$lookup": {
                    "from": "doctors",
                    "localField": "_id",
                    "foreignField": "id",
                    "as": "doctor"
                }
            },
            {"$unwind": "$doctor"},
            {
                "$project": {
                    "_id": 0,
                    "doctor_id": "$_id",
                    "doctor_name": "$doctor.full_name",
                    "doctor_specialty": "$doctor.specialty",
                    "doctor_phone": "$doctor.phone",
                    "total_appointments": 1,
                    "completed_appointments": 1,
                    "cancelled_appointments": 1,
                    "no_show_appointments": 1,
                    "total_worked_hours": 1,
                    "total_scheduled_hours": 1,
                    "total_revenue": 1,
                    "potential_revenue": 1,
                    "completion_rate": {
                        "$cond": [
                            {"$gt": ["$total_appointments", 0]},
                            {"$multiply": [
                                {"$divide": ["$completed_appointments", "$total_appointments"]},
                                100
                            ]},
                            0
                        ]
                    },
                    "cancellation_rate": {
                        "$cond": [
                            {"$gt": ["$total_appointments", 0]},
                            {"$multiply": [
                                {"$divide": ["$cancelled_appointments", "$total_appointments"]}, 
                                100
                            ]},
                            0
                        ]
                    },
                    "no_show_rate": {
                        "$cond": [
                            {"$gt": ["$total_appointments", 0]},
                            {"$multiply": [
                                {"$divide": ["$no_show_appointments", "$total_appointments"]},
                                100
                            ]},
                            0
                        ]
                    },
                    "utilization_rate": {
                        "$cond": [
                            {"$gt": ["$total_scheduled_hours", 0]},
                            {"$multiply": [
                                {"$divide": ["$total_worked_hours", "$total_scheduled_hours"]},
                                100
                            ]},
                            0
                        ]
                    },
                    "revenue_efficiency": {
                        "$cond": [
                            {"$gt": ["$potential_revenue", 0]},
                            {"$multiply": [
                                {"$divide": ["$total_revenue", "$potential_revenue"]},
                                100
                            ]},
                            0
                        ]
                    },
                    "avg_revenue_per_appointment": {
                        "$cond": [
                            {"$gt": ["$completed_appointments", 0]},
                            {"$divide": ["$total_revenue", "$completed_appointments"]},
                            0
                        ]
                    },
                    "avg_revenue_per_hour": {
                        "$cond": [
                            {"$gt": ["$total_worked_hours", 0]},
                            {"$divide": ["$total_revenue", "$total_worked_hours"]},
                            0
                        ]
                    }
                }
            },
            {"$sort": {"total_revenue": -1}}
        ]
        
        doctor_stats = await self.db.appointments.aggregate(pipeline).to_list(None)
        
        # Get doctors with no appointments in the period
        doctor_ids_with_appointments = [stat["doctor_id"] for stat in doctor_stats]
        doctors_without_appointments = await self.db.doctors.find({
            "id": {"$nin": doctor_ids_with_appointments},
            "is_active": True
        }).to_list(None)
        
        # Add doctors with zero stats
        for doctor in doctors_without_appointments:
            doctor_stats.append({
                "doctor_id": doctor["id"],
                "doctor_name": doctor["full_name"],
                "doctor_specialty": doctor["specialty"],
                "doctor_phone": doctor.get("phone", ""),
                "total_appointments": 0,
                "completed_appointments": 0,
                "cancelled_appointments": 0,
                "no_show_appointments": 0,
                "total_worked_hours": 0,
                "total_scheduled_hours": 0,
                "total_revenue": 0,
                "potential_revenue": 0,
                "completion_rate": 0,
                "cancellation_rate": 0,
                "no_show_rate": 0,
                "utilization_rate": 0,
                "revenue_efficiency": 0,
                "avg_revenue_per_appointment": 0,
                "avg_revenue_per_hour": 0
            })
        
        return {
            "doctor_statistics": doctor_stats,
            "summary": {
                "total_doctors": len(doctor_stats),
                "active_doctors": len([d for d in doctor_stats if d["total_appointments"] > 0]),
                "top_performers": len([d for d in doctor_stats if d["completion_rate"] > 80 and d["total_appointments"] > 5]),
                "high_revenue_doctors": len([d for d in doctor_stats if d["total_revenue"] > 100000]),
                "doctors_with_no_shows": len([d for d in doctor_stats if d["no_show_rate"] > 10 and d["total_appointments"] > 5]),
                "high_utilization_doctors": len([d for d in doctor_stats if d["utilization_rate"] > 80 and d["total_worked_hours"] > 0]),
                "avg_worked_hours": round(sum(d["total_worked_hours"] for d in doctor_stats) / len([d for d in doctor_stats if d["total_worked_hours"] > 0]) if len([d for d in doctor_stats if d["total_worked_hours"] > 0]) > 0 else 0, 2),
                "avg_utilization_rate": round(sum(d["utilization_rate"] for d in doctor_stats) / len([d for d in doctor_stats if d["total_scheduled_hours"] > 0]) if len([d for d in doctor_stats if d["total_scheduled_hours"] > 0]) > 0 else 0, 1)
            }
        }
    
    async def get_treatment_plan_statistics(
        self,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get treatment plan statistics"""
        # Build date filter
        date_filter = {}
        if date_from or date_to:
            date_query = {}
            if date_from:
                date_query["$gte"] = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
            if date_to:
                date_query["$lte"] = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
            date_filter["created_at"] = date_query
        
        # Get all treatment plans
        all_plans = await self.db.treatment_plans.find(date_filter).to_list(None)
        
        # Calculate statistics
        total_plans = len(all_plans)
        
        status_counts = {}
        execution_counts = {}
        payment_counts = {}
        
        total_cost = 0
        total_paid = 0
        
        for plan in all_plans:
            status = plan.get('status', 'draft')
            status_counts[status] = status_counts.get(status, 0) + 1
            
            execution_status = plan.get('execution_status', 'pending')
            execution_counts[execution_status] = execution_counts.get(execution_status, 0) + 1
            
            payment_status = plan.get('payment_status', 'unpaid')
            payment_counts[payment_status] = payment_counts.get(payment_status, 0) + 1
            
            plan_total_cost = plan.get('total_cost', 0) or 0
            plan_paid_amount = plan.get('paid_amount', 0) or 0
            
            if plan_total_cost < 0:
                plan_total_cost = 0
            if plan_paid_amount < 0:
                plan_paid_amount = 0
                
            total_cost += plan_total_cost
            total_paid += plan_paid_amount
        
        completed_plans = execution_counts.get('completed', 0)
        no_show_plans = execution_counts.get('no_show', 0)
        
        # Monthly statistics
        monthly_stats = {}
        for plan in all_plans:
            created_date = plan.get('created_at')
            if created_date:
                if isinstance(created_date, str):
                    created_date = datetime.fromisoformat(created_date.replace('Z', '+00:00'))
                month_key = f"{created_date.year}-{created_date.month:02d}"
                if month_key not in monthly_stats:
                    monthly_stats[month_key] = {
                        'created': 0,
                        'completed': 0,
                        'no_show': 0,
                        'total_cost': 0,
                        'paid_amount': 0
                    }
                monthly_stats[month_key]['created'] += 1
                
                month_total_cost = plan.get('total_cost', 0) or 0
                month_paid_amount = plan.get('paid_amount', 0) or 0
                
                if month_total_cost < 0:
                    month_total_cost = 0
                if month_paid_amount < 0:
                    month_paid_amount = 0
                    
                monthly_stats[month_key]['total_cost'] += month_total_cost
                monthly_stats[month_key]['paid_amount'] += month_paid_amount
                
                if plan.get('execution_status') == 'completed':
                    monthly_stats[month_key]['completed'] += 1
                elif plan.get('execution_status') == 'no_show':
                    monthly_stats[month_key]['no_show'] += 1
        
        # Payment summary for frontend compatibility
        paid_plans = payment_counts.get('paid', 0)
        unpaid_plans = payment_counts.get('unpaid', 0)
        partially_paid_plans = payment_counts.get('partially_paid', 0)
        overdue_plans = payment_counts.get('overdue', 0)
        
        return {
            "overview": {
                "total_plans": total_plans,
                "completed_plans": completed_plans,
                "no_show_plans": no_show_plans,
                "completion_rate": round((completed_plans / total_plans * 100) if total_plans > 0 else 0, 1),
                "total_cost": total_cost,
                "total_paid": total_paid,
                "outstanding_amount": max(0, total_cost - total_paid),
                "collection_rate": round((total_paid / total_cost * 100) if total_cost > 0 else 0, 1)
            },
            "status_distribution": status_counts,
            "execution_distribution": execution_counts,
            "payment_distribution": payment_counts,
            "payment_summary": {
                "paid_plans": paid_plans,
                "unpaid_plans": unpaid_plans,
                "partially_paid_plans": partially_paid_plans,
                "overdue_plans": overdue_plans,
                "total_revenue": total_paid,
                "outstanding_revenue": max(0, total_cost - total_paid)
            },
            "monthly_statistics": [
                {
                    "month": month,
                    "created": data["created"],
                    "completed": data["completed"], 
                    "no_show": data["no_show"],
                    "total_cost": data["total_cost"],
                    "paid_amount": data["paid_amount"],
                    "collection_rate": round((data["paid_amount"] / data["total_cost"] * 100) if data["total_cost"] > 0 else 0, 1)
                }
                for month, data in sorted(monthly_stats.items())
            ]
        }
