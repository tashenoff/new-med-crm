import assert from 'node:assert/strict';
import test from 'node:test';
import { loadLeadHmsData, resolveLeadPatientId } from '../src/utils/leadHmsData.js';

test('canonical patient_id takes precedence over identity and conversion IDs', () => {
  assert.equal(resolveLeadPatientId({
    patient_id: 'patient-canonical',
    identity_patient_id: 'patient-legacy',
    converted_to_client_id: 'crm-client'
  }), 'patient-canonical');
  assert.equal(resolveLeadPatientId({
    patient_id: 'patient-canonical',
    converted_to_client_id: 'crm-client'
  }), 'patient-canonical');
});

test('history requests use the canonical patient filter and retain all plan statuses', async () => {
  const lead = {
    id: 'lead-primary',
    patient_id: 'patient-canonical',
    identity_patient_id: 'patient-legacy',
    converted_to_client_id: 'crm-client'
  };
  const plans = [
    { id: 'plan-approved', patient_id: lead.patient_id, status: 'approved' },
    { id: 'plan-draft', patient_id: lead.patient_id, status: 'draft' },
    { id: 'plan-other', patient_id: 'patient-other', status: 'approved' }
  ];
  const appointments = [{ id: 'appointment-existing', patient_id: lead.patient_id }];
  const requests = [];
  const fetchData = async (url, options) => {
    requests.push({ url, options });
    const request = new URL(url);
    const isPlans = request.pathname.endsWith('/treatment-plans');
    const patientId = isPlans ? request.pathname.split('/')[3] : request.searchParams.get('patient_id');
    const records = isPlans ? plans : appointments;
    return { ok: true, json: async () => records.filter(record => record.patient_id === patientId) };
  };

  const data = await loadLeadHmsData(lead, [], 'https://crm.test', 'test-token', fetchData);

  assert.deepEqual(data.treatmentPlans, plans.slice(0, 2));
  assert.deepEqual(data.appointments, appointments);
  assert.deepEqual(requests, [
    { url: 'https://crm.test/api/appointments?patient_id=patient-canonical', options: { headers: { Authorization: 'Bearer test-token' } } },
    { url: 'https://crm.test/api/patients/patient-canonical/treatment-plans', options: { headers: { Authorization: 'Bearer test-token' } } }
  ]);
});

test('legacy IDs remain supported when canonical patient_id is absent', () => {
  assert.equal(resolveLeadPatientId({ identity_patient_id: 'patient-identity', converted_to_client_id: 'client' }), 'patient-identity');
  assert.equal(resolveLeadPatientId({ patient_id: null, converted_to_client_id: 'patient-converted' }), 'patient-converted');
});

test('phone fallback requires exactly one normalized match and never overrides patient_id', () => {
  const lead = { phone: '8 (701) 234-56-78' };
  const patient = { id: 'patient-phone', phone: '+7 701 234 56 78' };
  assert.equal(resolveLeadPatientId(lead, [patient]), patient.id);
  assert.equal(resolveLeadPatientId(lead, [patient, { ...patient, id: 'patient-duplicate' }]), null);
  assert.equal(resolveLeadPatientId({ phone: '123' }, [patient]), null);
  assert.equal(resolveLeadPatientId({ ...lead, patient_id: 'patient-canonical' }, [patient]), 'patient-canonical');
});

test('unresolved patient identity does not make unfiltered requests', async () => {
  const fetchData = () => assert.fail('No request should be made without a patient ID');
  assert.deepEqual(await loadLeadHmsData({}, [], 'https://crm.test', 'token', fetchData), {
    appointments: [], treatmentPlans: []
  });
});

test('empty or unsuccessful responses preserve the modal array contract', async () => {
  for (const response of [
    { ok: false, json: () => assert.fail('Failed responses must not be parsed') },
    { ok: true, json: async () => ({ detail: 'Not an array' }) },
    { ok: true, json: async () => [] }
  ]) {
    const data = await loadLeadHmsData({ patient_id: 'patient' }, [], 'https://crm.test', 'token', async () => response);
    assert.deepEqual(data, { appointments: [], treatmentPlans: [] });
  }
});
