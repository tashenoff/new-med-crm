export const patientOriginLabel = (patient, sources = []) => {
  const origin = patient?.origin;
  if (!origin || !['crm_lead', 'crm_client'].includes(origin.kind)) return '';
  const label = origin.kind === 'crm_lead' ? 'Создан из заявки CRM' : 'Создан из клиента CRM';
  const sourceId = origin.source_id || patient.source_id;
  const source = sources.find(item => item.id === sourceId)?.name || origin.source_name || patient.source_name;
  if (sourceId) return `${label}. Источник: ${source || 'недоступен'}`;
  // Proven contact transport is not a named marketing source.
  return origin.channel === 'whatsapp' ? `${label}. Способ связи: WhatsApp` : label;
};

// The API marks an exact, linked legacy template match. Keep its raw notes in
// the form payload so an unrelated save cannot delete them. Edits are literal.
export const visiblePatientNotes = (patient, notes = patient?.notes || '') => (
  patient?.origin?.legacy_generated_note && notes === patient.notes ? '' : notes
);
