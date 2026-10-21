const sourceLabels = {
  website: 'Веб-сайт', phone: 'Телефон', referral: 'Направление', walk_in: 'Обращение',
  social_media: 'Соц. сети', social: 'Соц. сети', advertising: 'Реклама', email: 'Email', other: 'Другое'
};

export const patientOriginLabel = (patient, sources = []) => {
  const origin = patient?.origin;
  if (!origin || !['crm_lead', 'crm_client'].includes(origin.kind)) return '';
  const label = origin.kind === 'crm_lead' ? 'Создан из заявки CRM' : 'Создан из клиента CRM';
  const sourceId = origin.source_id || patient.source_id;
  const source = sources.find(item => item.id === sourceId)?.name
    || (origin.channel === 'whatsapp' ? 'WhatsApp' : sourceLabels[origin.source || patient.source]);
  return source ? `${label}. Источник: ${source}` : label;
};

// The API marks an exact, linked legacy template match. Keep its raw notes in
// the form payload so an unrelated save cannot delete them. Edits are literal.
export const visiblePatientNotes = (patient, notes = patient?.notes || '') => (
  patient?.origin?.legacy_generated_note && notes === patient.notes ? '' : notes
);
