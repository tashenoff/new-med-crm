// paid_amount already includes allocations. Deposit receipts are not allocations.
export function paymentBreakdown(plans) {
  let depositPaid = 0;
  let otherPaid = 0;
  let known = true;
  for (const plan of plans) {
    const events = plan.accounting_events;
    if (!Array.isArray(events)) known = false;
    const allocated = (Array.isArray(events) ? events : []).reduce((sum, event) => {
      if (!String(event.kind || '').endsWith('_deposit_allocation')) return sum;
      const amount = Number(event.amount_kzt);
      return sum + (Number.isFinite(amount) ? Math.max(0, amount) : 0);
    }, 0);
    const paid = Math.max(0, Number(plan.paid_amount) || 0);
    const deposit = Math.min(paid, allocated);
    depositPaid += deposit;
    otherPaid += paid - deposit;
  }
  return { depositPaid, otherPaid, known };
}

export function discountedPaymentAmount(remaining, discount, priorPaid = 0) {
  if (discount <= 0.001) return undefined;
  return Math.max(0, Math.round((remaining + priorPaid - discount) * 100) / 100);
}

// paid_amount includes deposit allocations, so subtract it only once.
export function paymentSummary(plans) {
  const totalAmount = plans.reduce((sum, plan) => sum + (Number(plan.total_cost) || 0), 0);
  const paidAmount = plans.reduce((sum, plan) => sum + (Number(plan.paid_amount) || 0), 0);
  return {
    totalAmount,
    paidAmount,
    remainingToPay: Math.max(0, totalAmount - paidAmount),
    ...paymentBreakdown(plans),
  };
}
