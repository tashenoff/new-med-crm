export const attributionIds = ['source_id', 'channel_id', 'campaign_id'];
export const emptyAttribution = () => ({ source_id: '', channel_id: null, campaign_id: null, source: '' });
export const readAttribution = (record = {}, prefix = '') => ({
  source_id: record[`${prefix}source_id`] || '',
  channel_id: record[`${prefix}channel_id`] || record[`${prefix}contactmethod_id`] || null,
  campaign_id: record[`${prefix}campaign_id`] || null
});
export const bookingAttribution = form => ({ source_id: form.source_id || null,
  ...(Object.hasOwn(form, 'channel_id') ? { channel_id: form.channel_id || null } : {}),
  ...(Object.hasOwn(form, 'campaign_id') ? { campaign_id: form.campaign_id || null } : {}) });

export function resolveAttribution(candidate, sources) {
  const source = sources.find(row => row.id === candidate.source_id);
  if (!source || (source.status && source.status !== 'active')) return { ...emptyAttribution(),
    notice: candidate.source_id ? 'Сохранённый источник недоступен или отключён. Выберите актуальный либо оставьте неизвестным; история пациента сохранена.' : '' };
  let channel = source.channels?.find(row => row.id === candidate.channel_id && row.active !== false);
  let campaign = source.campaigns?.find(row => row.id === candidate.campaign_id && row.active !== false);
  let notice = '';
  if (candidate.channel_id && !channel) notice = 'Сохранённый способ недоступен; он не заменён другим автоматически.';
  if (campaign?.channel_id && channel && campaign.channel_id !== channel.id) campaign = null;
  if (campaign?.channel_id && !channel) {
    channel = source.channels?.find(row => row.id === campaign.channel_id && row.active !== false);
    if (!channel) campaign = null;
  }
  if (candidate.campaign_id && !campaign) notice = 'Сохранённая кампания недоступна или несовместима со способом. Уточните выбор; история сохранена.';
  return { source_id: source.id, source: source.type || '', channel_id: channel?.id || null, campaign_id: campaign?.id || null, notice };
}

export function applyAttribution(form, resolved) {
  const next = { ...form, source_id: resolved.source_id, source: resolved.source };
  for (const field of ['channel_id', 'campaign_id']) {
    if (resolved[field] || Object.hasOwn(form, field)) next[field] = resolved[field] || null;
  }
  if (resolved.notice) next.attribution_notice = resolved.notice;
  else delete next.attribution_notice;
  return next;
}

export function firstAcquisitionLabel(patient, sources = []) {
  const sourceId = patient?.source_id;
  const source = sources.find(row => row.id === sourceId);
  const name = source?.name || patient?.source_name || (sourceId ? 'Источник недоступен' : 'Источник не указан');
  const channelId = patient?.channel_id || patient?.contactmethod_id;
  const channel = source?.channels?.find(row => row.id === channelId);
  const campaign = source?.campaigns?.find(row => row.id === patient?.campaign_id);
  return [name, channelId ? `Способ: ${channel?.name || patient.channel_name || 'недоступен'}` : '',
    patient?.campaign_id ? `Кампания: ${campaign?.name || patient.campaign_name || 'недоступна'}` : ''].filter(Boolean).join(' · ');
}
