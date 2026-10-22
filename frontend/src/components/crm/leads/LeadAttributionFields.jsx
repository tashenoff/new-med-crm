import React from 'react';

export default function LeadAttributionFields({ value, source, onChange, inputClass, labelClass, includeContactPoint = true }) {
  const channels = (source?.channels || []).filter(row => row.active || row.id === value.channel_id);
  const campaigns = (source?.campaigns || []).filter(row => row.id === value.campaign_id || (row.active && (!row.channel_id || row.channel_id === value.channel_id)));
  const changeChannel = id => {
    const campaign = source?.campaigns?.find(row => row.id === value.campaign_id);
    const incompatible = Boolean(campaign?.channel_id && campaign.channel_id !== id);
    onChange({ ...value, channel_id: id || null, campaign_id: incompatible ? null : value.campaign_id,
      attribution_notice: incompatible ? 'Кампания сброшена: она относится к другому способу обращения.' : '' });
  };
  return <>
    {(channels.length > 0 || value.channel_id) && <label className={labelClass}>Способ обращения<select aria-label="Способ обращения" className={inputClass} value={value.channel_id || ''} onChange={e => changeChannel(e.target.value)}><option value="">Не указан</option>{value.channel_id && !channels.some(row => row.id === value.channel_id) && <option value={value.channel_id}>Способ недоступен (сохранённое значение)</option>}{channels.map(row => <option key={row.id} value={row.id} disabled={!row.active}>{row.name}{!row.active && ' (отключён)'}</option>)}</select></label>}
    {(campaigns.length > 0 || value.campaign_id) && <label className={labelClass}>Кампания (необязательно)<select aria-label="Кампания обращения" className={inputClass} value={value.campaign_id || ''} onChange={e => onChange({ ...value, campaign_id: e.target.value || null })}><option value="">Не указана</option>{value.campaign_id && !campaigns.some(row => row.id === value.campaign_id) && <option value={value.campaign_id}>Кампания недоступна (сохранённое значение)</option>}{campaigns.map(row => <option key={row.id} value={row.id} disabled={!row.active}>{row.name}{!row.active && ' (отключена)'}</option>)}</select></label>}
    {includeContactPoint && <label className={labelClass}>Место контакта (необязательно)<input className={inputClass} maxLength={200} value={value.contact_point || ''} onChange={e => onChange({ ...value, contact_point: e.target.value || null })} placeholder="Например, страница или форма сайта" /></label>}
    {value.attribution_notice && <p role="status" className="text-xs text-curai-muted">{value.attribution_notice}</p>}
  </>;
}
