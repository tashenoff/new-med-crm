import { normalizeIdentityPhone } from './leadIdentity.js';

export const resolveLeadPatientId = (lead, patients = []) => {
  const patientId = lead.patient_id || lead.identity_patient_id || lead.converted_to_client_id;
  if (patientId) return patientId;

  const phone = normalizeIdentityPhone(lead.phone);
  const matches = phone ? patients.filter(patient => normalizeIdentityPhone(patient.phone) === phone) : [];
  return matches.length === 1 ? matches[0].id : null;
};

export const loadLeadHmsData = async (lead, patients, apiBase, token, fetchData = fetch) => {
  const patientId = resolveLeadPatientId(lead, patients);
  if (!patientId) return { appointments: [], treatmentPlans: [] };

  const encodedPatientId = encodeURIComponent(patientId);
  const headers = { Authorization: `Bearer ${token}` };
  const [appointmentsResponse, plansResponse] = await Promise.all([
    fetchData(`${apiBase}/api/appointments?patient_id=${encodedPatientId}`, { headers }),
    fetchData(`${apiBase}/api/patients/${encodedPatientId}/treatment-plans`, { headers })
  ]);

  const appointments = appointmentsResponse.ok ? await appointmentsResponse.json() : [];
  const treatmentPlans = plansResponse.ok ? await plansResponse.json() : [];
  return {
    appointments: Array.isArray(appointments) ? appointments : [],
    treatmentPlans: Array.isArray(treatmentPlans) ? treatmentPlans : []
  };
};
