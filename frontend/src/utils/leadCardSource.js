const PROVIDER_DESCRIPTION = 'Обращение через Zadarma-звонок';
const text = value => typeof value === 'string' ? value.trim() : '';

// Keep provider metadata separate from the actual named marketing source.
// This is a presentation of existing attribution; never rewrite the lead.
export function leadCardSource(lead, sources = []) {
  const description = typeof lead.description === 'string' ? lead.description : '';
  const generatedDescription = description.trim() === PROVIDER_DESCRIPTION;
  if (!generatedDescription && lead.created_by !== 'telephony_webhook') {
    return { attribution: null, description, hideHeaderSource: false };
  }
  const source = sources.find(item => item.id === lead.source_id);
  const name = text(source?.name) || text(lead.source_name);
  return {
    attribution: name ? `Обращение через «${name}»`
      : lead.source_id ? 'Обращение по телефону — источник недоступен'
        : 'Обращение по телефону — источник не указан',
    description: generatedDescription ? '' : description,
    hideHeaderSource: true
  };
}
