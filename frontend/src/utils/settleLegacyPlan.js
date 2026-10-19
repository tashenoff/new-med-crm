// Historical plans keep their existing writers. Refresh before a retry so a
// response lost after a successful write cannot spend the same balance twice.
export async function paymentResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail || body);
    throw new Error(`HTTP ${response.status}: ${detail || 'Не удалось провести оплату'}`);
  }
  return body;
}

export async function settleLegacyPlan({ plan, API, paymentData, discount = 0, complexShares, ledgerFetch, requireSessionId, onUpdate, fetcher = fetch }) {
  const prefix = `${API}/api/treatment-plans/${encodeURIComponent(plan.id)}`;
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' };
  const read = async () => {
    const current = await paymentResponse(await fetcher(prefix, { headers }));
    if (current.id !== plan.id || (plan.patient_id && current.patient_id !== plan.patient_id)) throw new Error('План или пациент изменился. Обновите карточку.');
    if (current.payment_completion_policy === 'full_payment_v1') throw new Error('Правила оплаты изменились. Обновите карточку.');
    return current;
  };
  const send = async (path, body) => paymentResponse(await fetcher(`${prefix}${path}`, {
    method: 'POST', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) })
  }));
  let current = await read();
  if (discount > 0.001 && JSON.stringify(current.services) !== JSON.stringify(plan.services)) {
    if (onUpdate) await onUpdate(current);
    throw new Error('План изменился. Проверьте обновлённый остаток и задайте скидку заново.');
  }
  const unpaid = current.services.filter(row => row.payment_status !== 'paid' && !row.is_paid);
  const simple = unpaid.filter(row => !row.is_complex);
  const discPer = simple.length && discount > 0.001 ? Math.round(discount / simple.length * 100) / 100 : 0;
  // Legacy indexed session writers have no discount command; never pretend an
  // aggregate discount was applied to a course when it was not persisted.
  if (discPer && simple.some(row => row.is_course && (row.service_row_id || row.payment_type === 'per_session'))) throw new Error('Скидку на курс задайте отдельно до оплаты остатка плана.');
  if (new Set(current.services.map(row => row.service_id)).size !== current.services.length) throw new Error('В плане повторяется услуга. Оплатите строки отдельно по их идентификаторам.');
  try {
    for (const original of unpaid) {
      const row = current.services.find(row => original.service_row_id ? row.service_row_id === original.service_row_id : row.service_id === original.service_id);
      if (!row || row.payment_status === 'paid' || row.is_paid) continue;
      const path = `/services/${encodeURIComponent(row.service_id)}`;
      const deposit = (current.accounting_events || []).some(event => event.kind === 'patient_deposit_received');
      if (row.is_complex) {
        if (!row.service_row_id) {
          await send(`/complex-services/${encodeURIComponent(row.service_id)}/pay-remaining`, paymentData);
        } else {
          for (const component of complexShares(row)) {
            const amount = Math.max(0, component.share - Number(component.discount_amount || 0) - Number(component.paid_amount || 0));
            if (!amount || component.paid) continue;
            if (!component.component_id) throw new Error('Обновите план: нет идентификатора компонента.');
            const child = `/complex-services/${encodeURIComponent(row.service_id)}/components/${encodeURIComponent(component.service_id)}/mark-paid`;
            if (deposit) await send(child, paymentData);
            else await ledgerFetch(`${prefix}${child}`, {
              service_row_id: row.service_row_id, component_id: component.component_id,
              amount_kzt: amount, discount_amount_kzt: Number(component.discount_amount || 0),
              payment_source: 'cash', payment_method: paymentData.payment_method_id, ...paymentData
            });
          }
        }
      } else if (row.is_course && (row.service_row_id || row.payment_type === 'per_session')) {
        const count = row.service_row_id ? (row.sessions?.length || 0) : (row.quantity_total || row.sessions?.length || 1);
        if (!count) throw new Error('Обновите план: нет сеансов курса.');
        for (let index = 0; index < count; index++) {
          const session = row.sessions?.[index];
          if (session?.paid) continue;
          if (!row.service_row_id) await send(`${path}/sessions/${index}/mark-paid`);
          else {
            const sessionId = requireSessionId(session);
            const amount = Math.max(0, Number(session.price ?? row.session_price ?? row.price_per_unit ?? 0) - Number(session.discount_amount || 0) - Number(session.paid_amount || 0));
            if (!amount) continue;
            const child = `${path}/sessions/${encodeURIComponent(sessionId)}/mark-paid`;
            if (deposit) await send(child, paymentData);
            else await ledgerFetch(`${prefix}${child}`, {service_row_id: row.service_row_id, session_id: sessionId,
              amount_kzt: amount, discount_amount_kzt: Number(session.discount_amount || 0), payment_source: 'cash', payment_method: paymentData.payment_method_id, ...paymentData});
          }
        }
      } else {
        const amount = Math.max(0, Number(row.total_price || 0) - Number(row.discount_amount || 0) - Number(row.paid_amount || 0) - discPer);
        if (!amount) continue;
        if (row.service_row_id && !deposit) await ledgerFetch(`${prefix}/service-rows/${encodeURIComponent(row.service_row_id)}/receipts`, {
          amount_kzt: amount, discount_amount_kzt: Number(row.discount_amount || 0) + discPer,
          payment_source: 'cash', payment_method: paymentData.payment_method_id, ...paymentData
        });
        else await send(`${path}/mark-paid`, { ...paymentData, ...(Number(row.discount_amount || 0) + discPer > 0.001 ? { amount: Math.max(0, Number(row.total_price || 0) - Number(row.discount_amount || 0) - discPer) } : {}) });
      }
      current = await read();
    }
  } catch (error) {
    try { current = await read(); if (onUpdate) await onUpdate(current); }
    catch { throw new Error(`${error.message}. Не удалось обновить план. Перед повтором обновите карточку.`); }
    throw new Error(`${error.message}. План обновлён; уже сохранённые оплаты сохранены.`);
  }
  if (onUpdate) await onUpdate(current);
  return current;
}
