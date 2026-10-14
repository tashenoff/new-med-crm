import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('patient create, edit and reset forms omit API counts without changing the patient', async () => {
  const source = await readFile(new URL('../src/pages/PatientsPage.jsx', import.meta.url), 'utf8');
  const handlers = (start, end) => {
    const from = source.indexOf(`const ${start} =`);
    const to = source.indexOf(end, from);
    assert.ok(from >= 0 && to > from);
    return source.slice(from, to);
  };
  let props;
  let resetForm;
  const patient = { id: 'patient', full_name: 'Patient', appointments_count: 7, records_count: 9 };
  const original = { ...patient };
  const { add, edit, reset, save } = new Function(
    'openModal', 'updateModalProps', 'loading', 'errorMessage', 'setShowPatientModal',
    'setEditingItem', 'setPatientForm', 'getModalProps', 'patientsHook', 'setLoading',
    'setErrorMessage', 'closeModal', 'console',
    `${handlers('handleAddPatient', 'const handleSavePatient =')}
     ${handlers('handleSavePatient', 'const handleDeletePatient =')}
     ${handlers('handleClosePatientModal', 'return (')}
     return { add: handleAddPatient, edit: handleEditPatient, reset: handleClosePatientModal, save: handleSavePatient };`
  )(
    (_type, value) => { props = value; }, () => {}, false, null, () => {}, () => {},
    form => { resetForm = form; }, () => props,
    {
      createPatient: async data => { checkCounts(data); return { success: true }; },
      updatePatient: async (id, data) => { assert.equal(id, patient.id); checkCounts(data); return { success: true }; },
      fetchPatients: async () => {}
    }, () => {}, () => {}, () => {}, { log() {}, error: assert.fail }
  );
  function checkCounts(form) {
    assert.equal(Object.hasOwn(form, 'appointments_count'), false);
    assert.equal(Object.hasOwn(form, 'records_count'), false);
  }
  add();
  checkCounts(props.patientForm);
  await save({ preventDefault() {} });
  edit(patient);
  checkCounts(props.patientForm);
  assert.equal(props.editingItem, patient);
  await save({ preventDefault() {} });
  reset();
  checkCounts(resetForm);
  assert.deepEqual(patient, original);
});

test('patient modal has no count inputs', async () => {
  const source = await readFile(new URL('../src/components/modals/PatientModal.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Количество приемов|Количество записей|patientForm\.(appointments_count|records_count)/);
});
