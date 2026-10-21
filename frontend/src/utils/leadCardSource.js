const PROVIDER_DESCRIPTION = 'Обращение через Zadarma-звонок';
const text = value => typeof value === 'string' ? value.trim() : '';

// Keep provider metadata separate from the actual named marketing source.
// This is a presentation of existing attribution; never rewrite the lead.
export function leadCardSource(lead, sources = []) {
  const description = typeof lead.description === 'string' ? lead.description : '';
  const generatedDescription = description.trim() === PROVIDER_DESCRIPTION;
  const hasDimensions = lead.channel_id || lead.campaign_id || text(lead.contact_point);
  if (!hasDimensions && !generatedDescription && lead.created_by !== 'telephony_webhook') {
    return { attribution: null, description, hideHeaderSource: false };
  }
  const source = sources.find(item => item.id === lead.source_id);
  const name = text(source?.name) || text(lead.source_name);
  const channel = source?.channels?.find(row => row.id === lead.channel_id);
  const campaign = source?.campaigns?.find(row => row.id === lead.campaign_id);
  const dimensions = [
    lead.channel_id ? `Канал: ${text(channel?.name) || text(lead.channel_name) || 'недоступен'}` : hasDimensions ? 'Канал не указан' : '',
    lead.campaign_id ? `Кампания: ${text(campaign?.name) || text(lead.campaign_name) || 'недоступна'}` : '',
    text(lead.contact_point) ? `Место контакта: ${text(lead.contact_point)}` : ''
  ].filter(Boolean);
  const fallback = generatedDescription || lead.created_by === 'telephony_webhook' ? 'Обращение по телефону' : 'Обращение';
  return {
    attribution: [name ? `Обращение через «${name}»`
      : `${fallback} — ${lead.source_id ? 'источник недоступен' : 'источник не указан'}`, ...dimensions].join(' · '),
    description: generatedDescription ? '' : description,
    hideHeaderSource: true
  };
}
