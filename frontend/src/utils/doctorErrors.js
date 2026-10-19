const fieldLabels = {
  full_name: 'ФИО врача', phone: 'Телефон', specialties: 'Специальности',
  payment_mode: 'Режим комиссий', payment_type: 'Тип основной оплаты', payment_value: 'Основная оплата',
  consultation_compensation_mode: 'Оплата консультаций', consultation_payment_type: 'Тип оплаты консультаций',
  consultation_payment_value: 'Оплата консультаций', consultation_hybrid_percentage_value: 'Процент консультаций',
  hybrid_percentage_value: 'Процент основной оплаты', currency: 'Валюта', consultation_currency: 'Валюта консультаций',
  services: 'Услуги', service_id: 'Услуга', commission_type: 'Тип комиссии', commission_value: 'Комиссия услуги', commission_currency: 'Валюта комиссии'
};

const readableMessage = value => {
  const message = value.replace(/^Value error,\s*/i, '').trim();
  if (message === 'Phone number must contain at least 7 digits') return 'Укажите не менее 7 цифр.';
  if (message.startsWith('Phone number contains invalid characters')) return 'Допустимы только цифры, пробелы и символы + - ( ).';
  if (message === 'Field required') return 'Обязательное поле.';
  if (message === 'consultation_compensation_mode must be explicitly selected') return 'Выберите режим оплаты консультаций.';
  if (message === 'Duplicate service commission') return 'Услуга выбрана повторно: оставьте одну комиссию для каждой услуги.';
  return message;
};

// Read message fields only: validation input and context may contain private data.
export function formatDoctorError(error, fallback = 'Не удалось сохранить врача') {
  const visited = new WeakSet();
  const messages = value => {
    if (typeof value === 'string') return value.trim() && !/^\[object Object\](,\[object Object\])*$/.test(value.trim()) ? [readableMessage(value)] : [];
    if (!value || typeof value !== 'object' || visited.has(value)) return [];
    visited.add(value);
    if (Array.isArray(value)) return value.flatMap(messages);
    if (value.detail != null) return messages(value.detail);
    if (value.errors != null) return messages(value.errors);
    const text = messages(value.msg ?? value.message ?? value.error);
    const location = Array.isArray(value.loc) ? value.loc.filter(part => !['body', 'query', 'path'].includes(part)).map(part => typeof part === 'number' ? String(part + 1) : fieldLabels[part] || String(part)).join(' → ') : '';
    if (text.length) return text.map(item => location ? `${location}: ${item}` : item);
    return Object.entries(value).flatMap(([key, item]) => fieldLabels[key] ? messages(item).map(message => `${fieldLabels[key]}: ${message}`) : []);
  };
  const data = error?.response?.data ?? error;
  return [...new Set(messages(data))].join('; ') || fallback;
}
