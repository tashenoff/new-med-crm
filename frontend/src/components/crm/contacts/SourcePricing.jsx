import React from 'react';

const control = 'w-full border border-curai-control rounded-md px-3 py-2 text-sm bg-curai-surface';
export const pricingSchemes = { monthly: 'В месяц', per_lead: 'За заявку', free: 'Бесплатно', actual: 'По фактическим расходам' };
export const localDateTime = (now = new Date()) => {
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
};

export default function SourcePricing({ value, onChange, history = [] }) {
  return <section className="space-y-3" aria-label="Условия оплаты источника">
    <h3 className="font-medium">Условия оплаты источника</h3>
    <label className="block text-sm">Схема оплаты<select className={control} value={value.scheme} onChange={e => onChange({ ...value, scheme: e.target.value, effective_at: value.effective_at || localDateTime(new Date(Math.max(Date.now(), ...history.map(row => new Date(row.effective_at).getTime() + 1000)))) })}><option value="">Не задана / без изменения</option>{Object.entries(pricingSchemes).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    {['monthly', 'per_lead'].includes(value.scheme) && <label className="block text-sm">{value.scheme === 'monthly' ? 'Договорная сумма в месяц (₸)' : 'Договорная цена заявки (₸)'}<input type="number" min="0" step="0.01" required className={control} value={value.amount} onChange={e => onChange({ ...value, amount: e.target.value })} /></label>}
    {value.scheme && <label className="block text-sm">Начало действия новой версии<input type="datetime-local" step="1" required className={control} value={value.effective_at} onChange={e => onChange({ ...value, effective_at: e.target.value })} /></label>}
    {value.scheme === 'free' && <p className="text-sm">Договорная сумма: 0 ₸.</p>}
    <p className="text-xs text-curai-muted">Условия договора — не фактические расходы. Бюджет — план.</p>
    <details><summary className="cursor-pointer text-xs text-curai-muted">Как учитываются условия</summary><p className="mt-2 text-xs text-curai-muted">Договорная цена заявки не является вычисленным CPL. Тариф один на источник, не повторяется на каналах и кампаниях. Прошлые версии сохраняются; они не превращают все обращения в оплаченные заявки.</p></details>
    {history.length > 0 && <details><summary className="cursor-pointer text-sm">Сохранённые версии ({history.length})</summary><ul className="space-y-2 mt-2 text-xs">{history.map(version => <li key={version.id}>{new Date(version.effective_at).toLocaleString('ru-RU')} · {pricingSchemes[version.scheme] || 'Неизвестная схема'} · {version.amount == null ? 'Сумма не задана' : `${version.amount} ₸`}</li>)}</ul></details>}
  </section>;
}
