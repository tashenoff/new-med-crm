import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { formatPatientPhone } from './patientPhone.js';

export const OPEN_WHATSAPP_CHAT = 'curai:open-whatsapp-chat';

export function normalizeWhatsAppPhone(value) {
  const candidate = formatPatientPhone(value);
  if (!candidate.startsWith('+')) return null;
  const parsed = parsePhoneNumberFromString(candidate, { extract: false });
  return parsed?.isValid() && parsed.number === candidate ? candidate : null;
}

export function whatsAppTarget({ phone, patientId, leadId, displayName } = {}) {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) return null;
  return {
    phone: normalized,
    ...(patientId ? { patient_id: patientId, linked_patient_id: patientId } : {}),
    ...(leadId ? { linked_lead_id: leadId } : {}),
    contact_name: displayName || normalized,
    source: patientId ? 'patient' : leadId ? 'lead' : 'chat',
    openedContext: true,
  };
}

// Opening is a UI command only. IDs are context, never a request to relink data.
export function openWhatsAppChat(context) {
  const target = whatsAppTarget(context);
  if (!target) return false;
  window.dispatchEvent(new window.CustomEvent(OPEN_WHATSAPP_CHAT, { detail: target }));
  return true;
}

export function mergeWhatsAppContext(current, fresh) {
  if (!current?.openedContext) return fresh;
  const patientId = current.patient_id || current.linked_patient_id;
  const conflict = patientId && fresh.patient_id && patientId !== fresh.patient_id;
  return {
    ...current, ...fresh, openedContext: true,
    ...(patientId ? { patient_id: patientId, linked_patient_id: patientId } : {}),
    ...(current.linked_lead_id ? { linked_lead_id: current.linked_lead_id } : {}),
    ...(conflict ? { patient_name: current.contact_name, contact_name: current.contact_name } : {}),
  };
}
