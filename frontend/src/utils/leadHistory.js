import { normalizeIdentityPhone } from './leadIdentity.js';

export const historySources = {
  website: 'Сайт', phone: 'Телефон', email: 'Электронная почта',
  social: 'Соцсети', referral: 'Рекомендация', advertising: 'Реклама',
  walk_in: 'Личное обращение', whatsapp: 'WhatsApp', other: 'Другое'
};

const statusLabels = {
  lead: {
    new: 'Новое обращение', contacted: 'Связались', in_progress: 'В работе',
    converted: 'Преобразовано в пациента', closed: 'Оплачено', qualified: 'Квалифицировано',
    rejected: 'Отказ', lost: 'Потеряно'
  },
  plan: {
    draft: 'Черновик', approved: 'Утверждён', completed: 'Завершён',
    cancelled: 'Отменён', in_progress: 'В работе'
  },
  payment: {
    unpaid: 'Не оплачен', partially_paid: 'Частично оплачен', paid: 'Оплачен', overdue: 'Просрочен'
  },
  appointment: {
    unconfirmed: 'Не подтверждён', confirmed: 'Подтверждён', arrived: 'Пациент пришёл',
    in_progress: 'На приёме', completed: 'Завершён', cancelled: 'Отменён', no_show: 'Не явился'
  }
};

export const historyStatusLabel = (kind, status) => statusLabels[kind]?.[status] || 'Статус не указан';

export const historyDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Дата не указана';
};

export const historyInquiries = (lead) => {
  const seen = new Set();
  return [lead, ...(lead?.linked_inquiries || [])].filter(Boolean).filter(inquiry => {
    if (!inquiry.id) return true;
    if (seen.has(inquiry.id)) return false;
    seen.add(inquiry.id);
    return true;
  }).map((inquiry, index) => ({ inquiry, primary: index === 0 })).sort((left, right) => {
    const leftDate = Date.parse(left.inquiry.created_at);
    const rightDate = Date.parse(right.inquiry.created_at);
    return (Number.isNaN(leftDate) ? Infinity : leftDate) - (Number.isNaN(rightDate) ? Infinity : rightDate);
  });
};

export const historyPhones = (lead) => [...new Set(historyInquiries(lead)
  .map(({ inquiry }) => normalizeIdentityPhone(inquiry.phone)?.slice(-10)).filter(Boolean))];

export const countRealCalls = async (fetchCalls, phones) => {
  if (!phones.length) return null;
  const identifiedCalls = new Set();
  let unidentifiedCalls = 0;
  for (const phone of phones) {
    let offset = 0;
    const limit = 500;
    while (true) {
      const calls = await fetchCalls({ phone, limit, offset });
      if (!Array.isArray(calls)) throw new Error('Некорректный ответ истории звонков');
      for (const call of calls) {
        if (call.id) identifiedCalls.add(call.id);
        else unidentifiedCalls += 1;
      }
      if (calls.length < limit) break;
      offset += limit;
    }
  }
  return identifiedCalls.size + unidentifiedCalls;
};
