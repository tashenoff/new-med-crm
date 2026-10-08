export function positiveKzt(value, maximum = Number.MAX_SAFE_INTEGER) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || !Number.isFinite(maximum) || amount <= 0 || amount > maximum) {
    throw new Error(`Введите положительную конечную сумму в ₸, не более ${maximum.toLocaleString('ru-RU')} ₸`);
  }
  return amount;
}

export function appointmentPayment(data) {
  const hasReceipt = data.actual_amount_kzt !== undefined && data.actual_amount_kzt !== '';
  if (!hasReceipt && !data.deposit && !data.payment_purpose) return { ...data };
  if (!['consultation', 'plan_advance'].includes(data.payment_purpose)) throw new Error('Выберите назначение платежа: консультация или аванс плана');
  if (!data.payment_method) throw new Error('Выберите способ оплаты');
  const maximum = data.payment_purpose === 'consultation' && Number(data.price) > 0 ? Number(data.price) : Number.MAX_SAFE_INTEGER;
  const result = { ...data, actual_amount_kzt: positiveKzt(data.actual_amount_kzt, maximum) };
  delete result.deposit;
  delete result.deposit_type;
  return result;
}

export function servicePayment({ amount, total, discount = 0, funding_source, advanceBalance = 0 }) {
  if (!['cash', 'plan_advance'].includes(funding_source)) throw new Error('Выберите источник оплаты');
  const discountAmount = Number(discount);
  if (!Number.isFinite(discountAmount) || discountAmount < 0 || discountAmount >= total) throw new Error('Скидка должна быть неотрицательной и меньше остатка стоимости');
  const maximum = funding_source === 'plan_advance' ? Math.min(total - discountAmount, advanceBalance) : total - discountAmount;
  return { amount: positiveKzt(amount, maximum), discount_amount: discountAmount, funding_source };
}

export function requireSessionId(session) {
  const sessionId = session?.session_id || session?.id;
  if (!sessionId) throw new Error('Сервер не передал стабильный идентификатор сеанса. Обновите план или обратитесь к администратору.');
  return sessionId;
}

export function createLedgerCommands() {
  const entries = new Map();
  const operationBodies = new Map();
  return {
    occurrence(key) {
      return `occurrence:${encodeURIComponent(key)}`;
    },
    run(key, payload, send) {
      if (payload.operation_id && !/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(payload.operation_id)) throw new Error('Некорректный UUID операции');
      const identity = `${key}:${JSON.stringify(payload)}`;
      let entry = entries.get(identity);
      if (!entry) {
        const requestedId = payload.operation_id;
        const operation_id = requestedId && (!operationBodies.has(requestedId) || operationBodies.get(requestedId) === identity)
          ? requestedId : globalThis.crypto.randomUUID();
        operationBodies.set(operation_id, identity);
        entry = { body: { ...structuredClone(payload), operation_id } };
        entries.set(identity, entry);
      }
      if (entry.promise) return entry.promise;
      if (entry.done) return Promise.resolve(entry.result);
      entry.promise = Promise.resolve().then(() => send(entry.body)).then(result => {
        entry.done = true;
        entry.result = result;
        return result;
      }).finally(() => { entry.promise = null; });
      return entry.promise;
    }
  };
}

export const ledgerCommands = createLedgerCommands();

export async function ledgerFetch(url, payload) {
  return ledgerCommands.run(url, payload, async body => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Не удалось записать операцию. Повторите тот же платеж.');
    }
    return response.json();
  });
}
