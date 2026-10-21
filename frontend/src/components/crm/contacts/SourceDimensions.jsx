import React from 'react';

const control = 'w-full border border-curai-control rounded-md px-3 py-2 text-sm bg-curai-surface';
const adapters = { manual: 'Ручной выбор', phone: 'Телефон', form: 'Форма', whatsapp: 'WhatsApp', email: 'Email', social: 'Соц. сеть' };
const signals = { form_id: 'ID формы', utm_source: 'UTM source', utm_medium: 'UTM medium', utm_campaign: 'UTM campaign', referral: 'Referral / метка ссылки', ad_id: 'ID объявления' };
const identifier = () => crypto.randomUUID();

export default function SourceDimensions({ channels, campaigns, onChange }) {
  const change = (field, id, patch) => onChange(field, (field === 'channels' ? channels : campaigns).map(row => row.id === id ? { ...row, ...patch } : row));
  return <div className="space-y-5">
    <section className="space-y-3" aria-label="Каналы источника">
      <h3 className="font-medium">Каналы обращения</h3>
      <p className="text-xs text-curai-muted">Способы связи внутри одного источника. Название произвольное; адаптер не подключает интеграцию автоматически. Без полученной метки источник WhatsApp не угадывается.</p>
      {channels.map((channel, index) => <fieldset key={channel.id} className="rounded-md border border-curai-control p-3 space-y-2">
        <legend className="text-sm">Канал {index + 1}</legend>
        <label className="block text-sm">Название канала<input required maxLength={100} className={control} value={channel.name} onChange={e => change('channels', channel.id, { name: e.target.value })} /></label>
        <label className="block text-sm">Технический адаптер<select className={control} value={channel.adapter} disabled={channel.persisted} onChange={e => change('channels', channel.id, { adapter: e.target.value })}>{Object.entries(adapters).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={channel.active} onChange={e => change('channels', channel.id, { active: e.target.checked })} />Активен</label>
        {!channel.persisted && <button type="button" className="text-sm underline" onClick={() => onChange('channels', channels.filter(row => row.id !== channel.id))}>Убрать новый канал</button>}
      </fieldset>)}
      <button type="button" className="text-sm text-curai-blue underline" onClick={() => onChange('channels', [...channels, { id: identifier(), name: '', adapter: 'manual', active: true }])}>Добавить канал</button>
    </section>
    <section className="space-y-3" aria-label="Кампании источника">
      <h3 className="font-medium">Рекламные кампании</h3>
      <p className="text-xs text-curai-muted">Отдельный разрез, не этап воронки. Все заданные признаки должны точно совпасть. Эти поля готовят правила; неподключённые формы и рекламные API не передают признаки сами.</p>
      {campaigns.map((campaign, index) => <fieldset key={campaign.id} className="rounded-md border border-curai-control p-3 space-y-2">
        <legend className="text-sm">Кампания {index + 1}</legend>
        <label className="block text-sm">Название кампании<input required maxLength={100} className={control} value={campaign.name} onChange={e => change('campaigns', campaign.id, { name: e.target.value })} /></label>
        <label className="block text-sm">Канал кампании<select className={control} value={campaign.channel_id || ''} onChange={e => change('campaigns', campaign.id, { channel_id: e.target.value || null })}><option value="">Не указан</option>{channels.map(channel => <option key={channel.id} value={channel.id}>{channel.name || 'Без названия'}{!channel.active && ' (отключён)'}</option>)}</select></label>
        <details><summary className="cursor-pointer text-sm text-curai-blue">Признаки атрибуции</summary><div className="mt-2 space-y-2">{Object.entries(signals).map(([key, label]) => <label key={key} className="block text-xs">{label}<input className={control} maxLength={key === 'referral' ? 500 : 200} value={campaign.signals?.[key] || ''} onChange={e => change('campaigns', campaign.id, { signals: { ...campaign.signals, [key]: e.target.value || null } })} /></label>)}</div></details>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={campaign.active} onChange={e => change('campaigns', campaign.id, { active: e.target.checked })} />Активна</label>
        {!campaign.persisted && <button type="button" className="text-sm underline" onClick={() => onChange('campaigns', campaigns.filter(row => row.id !== campaign.id))}>Убрать новую кампанию</button>}
      </fieldset>)}
      <button type="button" className="text-sm text-curai-blue underline" onClick={() => onChange('campaigns', [...campaigns, { id: identifier(), name: '', active: true, channel_id: null, signals: {} }])}>Добавить кампанию</button>
    </section>
    <p className="text-xs text-curai-muted">Сохранённые каналы и кампании отключаются без удаления истории. Смена названия не меняет ID.</p>
  </div>;
}
