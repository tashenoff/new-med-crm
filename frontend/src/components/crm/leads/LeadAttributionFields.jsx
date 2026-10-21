import React from 'react';

export default function LeadAttributionFields({ value, source, onChange, inputClass, labelClass }) {
  const channels = (source?.channels || []).filter(row => row.active);
  const campaigns = (source?.campaigns || []).filter(row => row.active && (!row.channel_id || row.channel_id === value.channel_id));
  return <>
    {channels.length > 0 && <label className={labelClass}>Канал обращения<select aria-label="Канал обращения" className={inputClass} value={value.channel_id || ''} onChange={e => onChange({ ...value, channel_id: e.target.value || null, campaign_id: null })}><option value="">Не указан</option>{channels.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
    {campaigns.length > 0 && <label className={labelClass}>Кампания (необязательно)<select aria-label="Кампания обращения" className={inputClass} value={value.campaign_id || ''} onChange={e => onChange({ ...value, campaign_id: e.target.value || null })}><option value="">Не указана</option>{campaigns.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
    <label className={labelClass}>Место контакта (необязательно)<input className={inputClass} maxLength={200} value={value.contact_point || ''} onChange={e => onChange({ ...value, contact_point: e.target.value || null })} placeholder="Например, страница или форма сайта" /></label>
  </>;
}
