"""Doctor compensation from explicit completions and actual service receipts."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from compensation import accrue, in_period, service_accrual_data, tariff
from services.accounting_ledger_service import ordinary_ledger_totals


BLOCKER_DETAILS = {
    "accounting_ledger_gap": "A service target has no stable ledger identity or earning doctor, or stored payment, discount or completion evidence lacks matching ledger events. No historical events are inferred.",
    "invalid_accounting_event": "An accounting event failed snapshot/identity verification; no compensation was inferred.",
    "legacy_ledger_unavailable": "This plan has no accounting events. Legacy preview calculations are diagnostic only; payroll is blocked until the writer rollout is complete. No historical events are inferred.",
    "consultation_receipts_unavailable": "Appointments store price and ambiguous deposits, not identified consultation receipts. Percentage consultation pay cannot be calculated.",
    "consultation_mode_unavailable": "Legacy doctor has no explicit consultation compensation mode. Select none, inherit or separate; no mode was inferred.",
    "service_completion_unavailable": "No explicit dated completion records exist for this service/component. Paid status, planned quantity and plan completion do not prove completed units.",
    "completion_period_unavailable": "Completed units are counted or recorded without dates; they cannot be attributed to the requested payroll period.",
    "actual_receipt_amount_unavailable": "Paid status exists without an actual received amount. Gross/list price is not a receipt.",
    "receipt_period_unavailable": "Actual received amount has no service/component receipt date. Plan created_at/payment_date cannot attribute partial or cumulative receipts to a payroll period.",
    "invalid_actual_receipt_amount": "Stored received amount is not a finite non-negative number.",
    "legacy_non_kzt_compensation": "Legacy compensation currency is not KZT. It was not converted and this tariff was not accrued.",
    "legacy_hybrid_tariff_ambiguous": "Deprecated hybrid_fixed_amount conflicts with payment_value. No fixed tariff was inferred.",
    "invalid_compensation_settings": "Stored tariff is invalid; correct compensation settings explicitly before using it.",
    "service_doctor_unavailable": "A component has no doctor assignment and its plan has no assigned doctor. Service eligibility alone cannot identify who earned compensation.",
}


class SalaryService:
    @staticmethod
    def _has_legacy_accounting_evidence(item):
        """Only exempt untouched plans; never infer receipts or completions."""
        amount_fields = (
            "paid_amount", "paid_from_deposit", "cash_amount", "deposit",
            "deposit_amount", "deposit_balance", "extra_deposit",
            "quantity_completed", "completed_units",
        )
        date_fields = ("payment_date", "paid_at", "completed_at", "completion_date")
        if (any(item.get(key) for key in amount_fields + date_fields)
                or item.get("paid") or item.get("completed")
                or item.get("payment_status") in ("paid", "partially_paid", "part_paid")
                or item.get("status") == "completed"
                or item.get("execution_status") == "completed"):
            return True
        return any(
            SalaryService._has_legacy_accounting_evidence(child)
            for key in ("services", "components", "sessions", "completions", "payments", "receipts")
            for child in (item.get(key) or [])
        )

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.accounting_blockers = []

    def _block(self, code, doctor_id, **context):
        blocker = dict(code=code, doctor_id=doctor_id, detail=BLOCKER_DETAILS[code], **context)
        if blocker not in self.accounting_blockers:
            self.accounting_blockers.append(blocker)

    def _tariff(self, doctor, prefix=""):
        try:
            return tariff(doctor, prefix)
        except ValueError as error:
            code = str(error) if str(error) in BLOCKER_DETAILS else "invalid_compensation_settings"
            self._block(code, doctor["id"], source="consultations" if prefix else "treatment_plans")
            return None

    async def get_doctor_salary_report(
        self, date_from: Optional[str] = None, date_to: Optional[str] = None
    ) -> Dict[str, Any]:
        date_from = date_from or datetime.now().replace(day=1).strftime("%Y-%m-%d")
        date_to = date_to or datetime.now().strftime("%Y-%m-%d")
        start = datetime.strptime(date_from, "%Y-%m-%d")
        end = datetime.strptime(date_to, "%Y-%m-%d").replace(hour=23, minute=59, second=59, microsecond=999999)
        self.accounting_blockers = []
        doctors = await self.db.doctors.find({"is_active": True}).to_list(None)
        salary_data = []
        for doctor in doctors:
            doctor_id = doctor["id"]
            appointments_revenue, total_appointments = await self._calculate_appointments_revenue(doctor_id, start, end)
            treatment_plans_revenue, treatment_plans_salary = await self._calculate_treatment_plans_salary(doctor, doctor_id, start, end)
            consultations_salary = self._calculate_consultations_salary(doctor, appointments_revenue, total_appointments)
            mode = doctor.get("consultation_compensation_mode")
            if mode in ("inherit", "separate") and total_appointments:
                scheme = self._tariff(doctor, "consultation_" if mode == "separate" else "")
                if scheme and (scheme[0] == "percentage" and scheme[1] or scheme[0] == "hybrid" and scheme[2]):
                    self._block("consultation_receipts_unavailable", doctor_id, source="consultations")
            total_revenue = appointments_revenue + treatment_plans_revenue
            salary_item = self._build_salary_item(
                doctor, total_appointments, appointments_revenue, treatment_plans_revenue,
                total_revenue, consultations_salary, treatment_plans_salary,
                consultations_salary + treatment_plans_salary,
            )
            salary_item["accounting_blockers"] = [entry for entry in self.accounting_blockers if entry["doctor_id"] == doctor_id]
            salary_item["compensation_complete"] = not salary_item["accounting_blockers"]
            salary_data.append(salary_item)
        salary_data.sort(key=lambda item: item["total_revenue"], reverse=True)
        return {
            "salary_data": salary_data,
            "summary": self._calculate_summary(salary_data, date_from, date_to),
            "accounting_blockers": self.accounting_blockers,
            "compensation_complete": not self.accounting_blockers,
            "compensation_currency": "KZT",
        }

    async def _calculate_appointments_revenue(self, doctor_id, date_from_dt, date_to_dt) -> tuple:
        appointments = await self.db.appointments.find({"doctor_id": doctor_id, "status": "completed"}).to_list(None)
        count = 0
        for appointment in appointments:
            if appointment.get("doctor_id") != doctor_id or appointment.get("status") != "completed":
                continue
            included = in_period(appointment.get("appointment_date"), date_from_dt, date_to_dt)
            if included is None:
                self._block("completion_period_unavailable", doctor_id, appointment_id=appointment.get("id"))
            elif included:
                count += 1
        return 0.0, count

    async def _calculate_treatment_plans_salary(self, doctor, doctor_id, date_from_dt, date_to_dt) -> tuple:
        configs = {}
        for service in doctor.get("services") or []:
            service_id = service.get("service_id") if isinstance(service, dict) else service
            if service_id:
                configs[service_id] = service if isinstance(service, dict) else {}
        general_scheme = None
        plans = await self.db.treatment_plans.find({"$or": [
            {"accounting_events.doctor_id": doctor_id},
            {"assigned_doctor_id": doctor_id}, {"doctor_id": doctor_id},
            {"services.components.doctor_id": doctor_id},
            {"services.components.service_id": {"$in": list(configs)}},
        ]}).to_list(None)
        if not plans and configs and (doctor.get("payment_mode") or "general") == "general":
            self._tariff(doctor)
        revenue = 0.0
        salary = 0.0
        for plan in plans:
            if plan.get("accounting_events"):
                event_revenue, event_salary, blockers = ordinary_ledger_totals(plan, doctor_id, date_from_dt, date_to_dt)
                revenue += event_revenue
                salary += event_salary
                for blocker in blockers:
                    self._block(blocker["code"], doctor_id, **{key: value for key, value in blocker.items() if key != "code"})
                continue
            if not self._has_legacy_accounting_evidence(plan):
                continue
            self._block("legacy_ledger_unavailable", doctor_id, plan_id=plan.get("id"))
            if (doctor.get("payment_mode") or "general") not in ("general", "individual"):
                self._block("invalid_compensation_settings", doctor_id, source="treatment_plans")
                continue
            if not configs:
                continue
            if general_scheme is None and (doctor.get("payment_mode") or "general") == "general":
                general_scheme = self._tariff(doctor)
            assigned = plan.get("assigned_doctor_id") or plan.get("doctor_id")
            for row in plan.get("services") or []:
                complex_row = row.get("is_complex") and row.get("components")
                for item in row["components"] if complex_row else [row]:
                    service_id = item.get("service_id") or item.get("id") or item.get("serviceId")
                    if service_id not in configs:
                        continue
                    if complex_row:
                        if item.get("doctor_id") and item["doctor_id"] != doctor_id:
                            continue
                        if not item.get("doctor_id") and assigned != doctor_id:
                            if not assigned:
                                self._block("service_doctor_unavailable", doctor_id, plan_id=plan.get("id"), service_id=service_id)
                            continue
                    elif assigned != doctor_id:
                        continue
                    scheme = general_scheme
                    if doctor.get("payment_mode") == "individual":
                        config = configs[service_id]
                        if config.get("commission_type") not in ("fixed", "percentage") or config.get("commission_value") is None:
                            self._block("invalid_compensation_settings", doctor_id, service_id=service_id)
                            continue
                        scheme = self._tariff(dict(
                            id=doctor_id, payment_type=config.get("commission_type", "percentage"),
                            payment_value=config.get("commission_value", 0),
                            currency=config.get("commission_currency", "KZT"),
                        ))
                    received, completed, blockers = service_accrual_data(item, date_from_dt, date_to_dt)
                    receipts = item.get("sessions") or [] if item.get("payment_type") == "per_session" else [item]
                    if not any(receipt.get("paid_amount") is not None for receipt in receipts) and (
                        plan.get("paid_amount") or plan.get("payment_status") in ("paid", "partially_paid")
                    ):
                        blockers.add("actual_receipt_amount_unavailable")
                    revenue += received
                    if not scheme:
                        continue
                    for code in sorted(blockers):
                        if code in ("service_completion_unavailable", "completion_period_unavailable") and scheme[0] == "percentage":
                            continue
                        self._block(code, doctor_id, plan_id=plan.get("id"), service_id=service_id)
                    salary += accrue(scheme, received, completed)
        return revenue, salary

    def _calculate_consultations_salary(self, doctor, appointments_revenue, total_appointments) -> float:
        mode = doctor.get("consultation_compensation_mode")
        if mode == "none":
            return 0.0
        if mode not in ("inherit", "separate"):
            self._block("consultation_mode_unavailable", doctor["id"], source="consultations")
            return 0.0
        scheme = self._tariff(doctor, "consultation_" if mode == "separate" else "")
        return accrue(scheme, appointments_revenue, total_appointments) if scheme else 0.0

    def _build_salary_item(
        self, doctor, total_appointments, appointments_revenue, treatment_plans_revenue,
        total_revenue, consultations_salary, treatment_plans_salary, calculated_salary,
    ) -> Dict[str, Any]:
        services = doctor.get("services") or []
        specialties = doctor.get("specialties") or []
        return {
            "doctor_id": doctor["id"], "doctor_name": doctor["full_name"],
            "doctor_specialty": specialties[0] if specialties else doctor.get("specialty", ""),
            "payment_mode": doctor.get("payment_mode", "general"),
            "payment_type": doctor.get("payment_type", "percentage"),
            "payment_value": doctor.get("payment_value", 0.0),
            "currency": doctor.get("currency", "KZT"),
            "compensation_currency": "KZT",
            "consultation_compensation_mode": doctor.get("consultation_compensation_mode"),
            "consultation_payment_type": doctor.get("consultation_payment_type"),
            "consultation_payment_value": doctor.get("consultation_payment_value"),
            "consultation_currency": doctor.get("consultation_currency", "KZT"),
            "total_appointments": total_appointments, "completed_appointments": total_appointments,
            "appointments_revenue": appointments_revenue,
            "treatment_plans_revenue": treatment_plans_revenue, "total_revenue": total_revenue,
            "consultations_salary": consultations_salary, "treatment_plans_salary": treatment_plans_salary,
            "calculated_salary": calculated_salary, "total_salary": calculated_salary,
            "has_services": bool(services), "services_count": len(services),
            "hybrid_fixed_amount": doctor.get("hybrid_fixed_amount", 0),
            "hybrid_percentage_value": doctor.get("hybrid_percentage_value", 0),
            "consultation_hybrid_fixed_amount": doctor.get("consultation_payment_value", 0),
            "consultation_hybrid_percentage_value": doctor.get("consultation_hybrid_percentage_value", 0),
        }

    def _calculate_summary(self, salary_data: List[Dict[str, Any]], date_from, date_to) -> Dict[str, Any]:
        revenue = sum(item["total_revenue"] for item in salary_data)
        salary = sum(item["calculated_salary"] for item in salary_data)
        return {
            "total_revenue": revenue, "total_salary": salary, "total_doctors": len(salary_data),
            "date_from": date_from, "date_to": date_to,
            "salary_percentage": round(salary / revenue * 100 if revenue else 0, 2),
            "compensation_complete": not self.accounting_blockers, "compensation_currency": "KZT",
        }
