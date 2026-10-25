import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { parse } from '@babel/parser';
import { DragDropManager } from '../src/components/calendar/functions/DragDropManager.js';

// Execute the actual page handlers at their hook/API boundaries. No copied
// save logic, browser, database or external API is used by these regressions.
const source = fs.readFileSync(new URL('../src/pages/CalendarPage.jsx', import.meta.url), 'utf8');
const tree = parse(source, { sourceType: 'module', plugins: ['jsx'] });
const component = tree.program.body.find(node => node.type === 'VariableDeclaration'
  && node.declarations[0].id.name === 'CalendarPage').declarations[0].init;
const names = ['doTimesOverlapSimple', 'handleNewAppointment', 'handleSlotClick', 'handleEditAppointment', 'handleSaveAppointment'];
const handlers = component.body.body.filter(node => node.type === 'VariableDeclaration' && names.includes(node.declarations[0].id.name));

function harness(appointments = [], failure = null) {
  const writes = [];
  let modal, closed = false;
  const env = {
    appointmentFormRef: { current: {} }, editingItemRef: { current: null },
    console: { log() {}, error() {} }, loading: false, errorMessage: null,
    setLoading() {}, setErrorMessage() {}, setCurrentAppointmentForm() {}, setCurrentEditingItem() {},
    closeModal() { closed = true; },
    openModal(id, props) { modal = props; }, updateModalProps(id, props) { modal = { ...modal, ...props }; },
    patientsHook: { patients: [] }, doctorsHook: { doctors: [] }, handleCreatePatientFromAppointment() {},
    appointmentsHook: { appointments, fetchAppointments: async () => {},
      updateAppointment: async (id, data) => { writes.push({ method: 'PUT', id, data }); return { success: true }; },
      createAppointment: async data => { writes.push({ method: 'POST', data }); return failure ? { success: false, error: failure } : { success: true }; }
    }
  };
  const api = new Function('env', `const {${Object.keys(env).join(',')}} = env;
    ${handlers.map(node => source.slice(node.start, node.end)).join('\n')}
    return {${names.join(',')}};`)(env);
  return { api, writes, get modal() { return modal; }, get closed() { return closed; } };
}

const original = { id: 'original', patient_id: 'patient-a', doctor_id: 'doctor', room_id: 'room',
  appointment_date: '2026-10-26', appointment_time: '10:00', end_time: '11:00', status: 'confirmed' };
const requested = { ...original, id: undefined, patient_id: 'patient-b', appointment_date: '2026-10-27' };

test('edit then header new creates a new booking and keeps the original unchanged', async () => {
  const h = harness([original]);
  h.api.handleEditAppointment(original);
  h.api.handleNewAppointment();
  assert.equal(h.modal.editingItem, null);
  assert.equal(h.modal.appointmentForm.patient_id, '');
  h.modal.setAppointmentForm(requested);
  await h.modal.onSave();
  assert.deepEqual(h.writes, [{ method: 'POST', data: requested }]);
  assert.equal(original.patient_id, 'patient-a');
  assert.equal(h.closed, true);
});

for (const status of ['cancelled', 'no_show']) {
  test(`${status} booking does not prevent another booking in the same room`, async () => {
    const h = harness([{ ...original, status }]);
    h.api.handleSlotClick(original.appointment_date, '10:00', 'room');
    await h.modal.onSave({ ...requested, appointment_date: original.appointment_date });
    assert.equal(h.writes[0].method, 'POST');
  });
}

test('save failure remains inside the open form and rejects submission', async () => {
  const h = harness([], 'Fixture slot conflict');
  h.api.handleNewAppointment();
  await assert.rejects(h.modal.onSave(requested), /Fixture slot conflict/);
  assert.equal(h.modal.errorMessage, 'Fixture slot conflict');
  assert.equal(h.closed, false);
});

test('missing patient rejects submission without a write or closing the form', async () => {
  const h = harness(); h.api.handleNewAppointment();
  await assert.rejects(h.modal.onSave({ ...requested, patient_id: '' }), /Выберите пациента/);
  assert.equal(h.writes.length, 0);
  assert.equal(h.closed, false);
});

test('cached occupied slot is submitted so the server can choose the next free time', async () => {
  const h = harness([original]);
  h.api.handleNewAppointment();
  await h.modal.onSave({ ...original, id: undefined, patient_id: 'patient-b' });
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].method, 'POST');
  assert.equal(h.closed, true);
});

test('editing a zero-deposit booking keeps a numeric zero in the form', () => {
  const h = harness();
  h.api.handleEditAppointment({ ...original, deposit: 0, deposit_type: 'fixed' });
  assert.equal(h.modal.appointmentForm.deposit, 0);
});

test('update hook normalizes an empty deposit and formats server validation errors', async () => {
  const hookSource = fs.readFileSync(new URL('../src/hooks/useAppointments.js', import.meta.url), 'utf8');
  const hookTree = parse(hookSource, { sourceType: 'module' });
  const cleanNode = hookTree.program.body.find(node => node.type === 'VariableDeclaration' && node.declarations[0].id.name === 'cleanAppointmentData');
  const hook = hookTree.program.body.find(node => node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'VariableDeclaration' && node.declaration.declarations[0].id.name === 'useAppointments').declaration.declarations[0].init;
  const updateNode = hook.body.body.find(node => node.type === 'VariableDeclaration' && node.declarations[0].id.name === 'updateAppointment');
  const errorsSource = fs.readFileSync(new URL('../src/api/config.js', import.meta.url), 'utf8');
  const errorsTree = parse(errorsSource, { sourceType: 'module' });
  const errorNode = errorsTree.program.body.find(node => node.type === 'ExportNamedDeclaration' && node.declaration?.declarations?.[0]?.id.name === 'handleApiError').declaration;
  const requests = [];
  const environment = { API: '/api', useCallback: fn => fn, appointmentPayment: data => ({ ...data }),
    console: { error() {} }, axios: { put: async (url, body) => {
      requests.push(body);
      throw { response: { data: { detail: [{ loc: ['body', 'deposit'], msg: 'Invalid deposit' }] } } };
    } } };
  const update = new Function('env', `const {${Object.keys(environment).join(',')}}=env;
    ${errorsSource.slice(errorNode.start, errorNode.end)}
    ${hookSource.slice(cleanNode.start, cleanNode.end)}
    ${hookSource.slice(updateNode.start, updateNode.end)}
    return updateAppointment;`)(environment);
  const result = await update('booking', { ...original, deposit: '' });
  assert.equal(requests[0].deposit, 0);
  assert.equal(result.success, false);
  assert.equal(result.error, 'body.deposit: Invalid deposit');
});

// Resolve these small ES modules with their real relative imports. The data
// URL loader avoids a JSX compiler subprocess for pure calendar utilities.
function sourceUrl(url) {
  const code = fs.readFileSync(url, 'utf8').replace(/from\s+(['"])(\.[^'"]+)\1/g, (_, quote, path) => {
    const resolved = new URL(path.endsWith('.js') ? path : `${path}.js`, url);
    return `from ${quote}${sourceUrl(resolved)}${quote}`;
  });
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const utils = await import(sourceUrl(new URL('../src/components/calendar/utils/appointmentUtils.js', import.meta.url)));
const { permissionProps } = await import(sourceUrl(new URL('../src/utils/permissions.js', import.meta.url)));

test('booking deposit controls allow calendar editors without finance permissions', () => {
  const modalSource = fs.readFileSync(new URL('../src/components/modals/AppointmentModal.js', import.meta.url), 'utf8');
  const modalTree = parse(modalSource, { sourceType: 'module', plugins: ['jsx'] });
  const controls = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'JSXOpeningElement') {
      const value = node.attributes.find(attr => attr.name?.name === 'value')?.value?.expression;
      const expression = value?.type === 'LogicalExpression' ? value.left : value;
      if (expression?.object?.name === 'appointmentForm' && ['deposit', 'deposit_type'].includes(expression.property?.name)) {
        controls.push(node);
      }
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object') visit(child);
    }
  }
  visit(modalTree);
  assert.equal(controls.length, 2);
  for (const control of controls) {
    const rule = control.attributes.find(attr => attr.type === 'JSXSpreadAttribute' && attr.argument.callee?.name === 'documentPermissionProps').argument;
    const getProps = new Function('user', 'documentPermissionProps', `return ${modalSource.slice(rule.start, rule.end)};`);
    const editor = { is_active: true, permissions: ['calendar_view', 'calendar_edit'] };
    assert.equal(getProps(editor, permissionProps).disabled, undefined);
    assert.equal(getProps({ ...editor, permissions: ['calendar_view'] }, permissionProps).disabled, true);
    assert.equal(getProps({ ...editor, is_active: false }, permissionProps).disabled, true);
  }
});
const { canAppointmentFitInSchedule, getAppointmentHeight } = await import(sourceUrl(new URL('../src/components/calendar/utils/timeUtils.js', import.meta.url)));
const room = { id: 'room', schedule: [{ day_of_week: 0, is_active: true, start_time: '09:00', end_time: '18:00', doctor_id: 'doctor' }] };

for (const status of ['cancelled', 'no_show']) {
  test(`${status} frees both modern and legacy room slots and conflict checks`, () => {
    for (const room_id of ['room', null]) {
      const rows = [{ ...original, status, room_id }];
      assert.equal(utils.isSlotOccupied(rows, [room], () => ({ id: 'doctor' }), 'room', '2026-10-26', '10:00'), undefined);
      assert.deepEqual(utils.checkTimeConflicts(rows, [room], () => ({ id: 'doctor' }), 'room', '2026-10-26', '10:15', '10:45'), []);
    }
  });
}

function dropHarness(time) {
  const moved = [], checked = [], alerts = [];
  const manager = new DragDropManager({ appointments: [original], rooms: [room], patients: [], doctors: [{ id: 'doctor' }],
    onMoveAppointment: (...args) => moved.push(args), checkTimeConflicts: (...args) => { checked.push(args); return []; },
    canAppointmentFitInSchedule, getAvailableDoctorForSlot: () => ({ id: 'doctor' }) });
  const previous = globalThis.alert;
  globalThis.alert = message => alerts.push(message);
  try {
    manager.handleDrop({ preventDefault() {}, dataTransfer: { getData: () => 'original' } }, 'room', '2026-10-26', time);
  } finally {
    if (previous === undefined) delete globalThis.alert; else globalThis.alert = previous;
  }
  return { moved, checked, alerts };
}

test('one-hour appointment moved to 17:30 is blocked by the 18:00 shift end', () => {
  const h = dropHarness('17:30');
  assert.equal(h.moved.length, 0);
  assert.equal(h.alerts.length, 1);
});

test('valid drag checks the recalculated end and keeps its original duration', () => {
  const h = dropHarness('16:30');
  assert.equal(h.checked[0][3], '17:30');
  assert.deepEqual(h.moved, [['original', 'doctor', '2026-10-26', '16:30', 'room']]);
});

const { validateAppointmentDuration, MIN_APPOINTMENT_DURATION } = await import(sourceUrl(new URL('../src/config/calendarConfig.js', import.meta.url)));

test('appointments shorter than 30 minutes are rejected; 30 minutes and longer remain valid', () => {
  assert.equal(MIN_APPOINTMENT_DURATION, 30);
  assert.equal(validateAppointmentDuration('11:00', '11:15').valid, false);
  assert.equal(validateAppointmentDuration('11:00', '11:29').valid, false);
  assert.equal(validateAppointmentDuration('11:00', '11:30').valid, true);
  assert.equal(validateAppointmentDuration('11:00', '12:00').valid, true);
  assert.equal(validateAppointmentDuration('11:00', '').duration, 30);
  assert.equal(getAppointmentHeight({ appointment_time: '11:00', end_time: '11:30' }), 64);
});
