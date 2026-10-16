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

const monetaryAmount = value => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
};

export function paymentDiscount(service) {
  // Complex parent discount_amount/discount_total may mirror the children.
  // Component price is a catalog weight, not its allocated package obligation.
  if (service.is_complex && Array.isArray(service.components) && service.components.length) {
    return service.components.reduce((sum, component) => sum + monetaryAmount(component.discount_amount), 0);
  }
  return monetaryAmount(service.discount_amount ?? (service.is_complex ? service.discount_total : 0));
}

export function planRemainingToPay(plan, paidAmount = plan.paid_amount) {
  const services = plan.services;
  const hasRowTotals = Array.isArray(services) && services.length > 0 && services.every(service =>
    service && service.total_price != null && service.total_price !== '' && Number.isFinite(Number(service.total_price)));
  // total_price already includes selector discount (%). Only the separate
  // monetary payment discount remains to subtract, once per payable row.
  // Start from rows, not a plan total which may already be net-discounted.
  // Incomplete legacy snapshots retain the aggregate fallback; do not guess bases.
  const payable = hasRowTotals
    ? services.reduce((sum, service) => sum + Math.max(0, monetaryAmount(service.total_price) - paymentDiscount(service)), 0)
    : monetaryAmount(plan.total_cost);
  // Actual money includes applied deposit funding. Receipts are not allocations.
  return Math.max(0, payable - monetaryAmount(paidAmount));
}

// paid_amount includes deposit allocations, so subtract it only once.
export function paymentSummary(plans) {
  const totalAmount = plans.reduce((sum, plan) => sum + (Number(plan.total_cost) || 0), 0);
  const paidAmount = plans.reduce((sum, plan) => sum + (Number(plan.paid_amount) || 0), 0);
  return {
    totalAmount,
    paidAmount,
    remainingToPay: Math.max(0, plans.reduce((sum, plan) => sum + planRemainingToPay(plan, 0), 0) - paidAmount),
    ...paymentBreakdown(plans),
  };
}
