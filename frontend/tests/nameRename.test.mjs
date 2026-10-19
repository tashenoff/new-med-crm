import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const bootstrap = new JSDOM('<html><body></body></html>');
globalThis.window = bootstrap.window;
globalThis.document = bootstrap.window.document;
const { createRoot } = await import('react-dom/client');
bootstrap.window.close();
delete globalThis.window;
delete globalThis.document;

async function compile(path) {
  const result = await build({
    stdin: { contents: `import React from 'react';
      import View from ${JSON.stringify(fileURLToPath(new URL(path, import.meta.url)))};
      import { ThemeProvider } from './src/hooks/useTheme.js';
      export default props => <ThemeProvider><View {...props} /></ThemeProvider>;`,
      resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'jsx' },
    bundle: true, write: false,
    platform: 'node', format: 'cjs', external: ['react', 'react-dom'], loader: { '.js': 'jsx' },
    define: { 'import.meta.env': '{"VITE_BACKEND_URL":"http://localhost"}' },
    plugins: [{ name: 'name-fixture', setup(builder) {
      builder.onResolve({ filter: /\/useCrm$|\/useKanbanColumns$|\/ModalContext$|\/api\/config$|^\.\/config$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents:
        args.path.endsWith('/useCrm')
          ? `import React from 'react'; export const useCrm = () => {
              const f = globalThis.nameFixture;
              const [leads, setLeads] = React.useState(f.leads);
              f.setLeads = setLeads;
              return { ...f.crm, leads };
            };`
          : args.path.endsWith('/useKanbanColumns')
            ? `export const useKanbanColumns = () => ({ columns: [{ id: 'new', name: 'Новые', is_system: true, manual_move_allowed: true }], busy: false, loading: false });`
          : args.path.endsWith('/ModalContext')
            ? 'export const useModal = () => globalThis.nameFixture.modals;'
            : `export const apiClient = {
                get: (...args) => globalThis.nameFixture.api('GET', ...args),
                post: (...args) => globalThis.nameFixture.api('POST', ...args),
                put: (...args) => globalThis.nameFixture.api('PUT', ...args)
              }; export const handleApiError = error => error.message; export const API_BASE_URL = 'http://localhost/api';`
      }));
    } }]
  });
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), loaded, loaded.exports);
  return loaded.exports.default;
}
const AppointmentModal = await compile('../src/components/modals/AppointmentModal.js');
const Inbox = await compile('../src/components/crm/telephony/WhatsAppInbox.jsx');
const Board = await compile('../src/components/crm/leads/EnhancedLeadsView.js');

const lead = { id: 'lead', first_name: 'Анна Мария', last_name: 'Иванова', middle_name: 'Петровна',
  full_name: 'Анна Мария Иванова Петровна', phone: '+77012345678', status: 'new', source_id: 'source' };
const chat = { phone: lead.phone, linked_lead_id: lead.id, lead_name: lead.full_name, contact_name: 'External Wazzup' };
const booking = { doctor_id: 'doctor', appointment_date: '2026-10-15', appointment_time: '10:00', end_time: '10:30',
  source_id: 'source', price: 0, deposit: '', deposit_type: '' };

async function mount(context, Component, props, options = {}) {
  const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: 'http://localhost' });
  const requests = [], opened = [], alerts = [], intervals = new Map();
  const fixture = { leads: structuredClone(options.leads || [lead]), chats: structuredClone(options.chats || [chat]), refreshes: 0,
    modals: { openModal: (type, props) => opened.push({ type, props }), closeModal() {} } };
  fixture.crm = { managers: [], sources: [], loading: false, fetchAvailableManagers() {}, fetchSources() {},
    fetchLeads: async () => { fixture.refreshes++; fixture.setLeads?.(structuredClone(fixture.leads)); },
    updateLead: async (id, data) => {
      requests.push({ method: 'UPDATE_LEAD', path: id, data });
      if (options.failSave) throw new Error('Ошибка сохранения');
      Object.assign(fixture.leads.find(item => item.id === id), data);
      fixture.leads[0].full_name = [data.first_name, data.last_name, data.middle_name].filter(Boolean).join(' ');
      await fixture.crm.fetchLeads();
    }
  };
  fixture.api = async (method, path, data) => {
    requests.push({ method, path, data });
    if (options.api) { const result = await options.api(method, path, data); if (result !== undefined) return result; }
    if (method === 'PUT' && options.failSave) throw new Error('Ошибка сохранения');
    if (path === '/wazzup/chats') {
      const search = data?.params?.search?.toLowerCase();
      return { data: { chats: structuredClone(fixture.chats.filter(item => !search ||
        [item.patient_name, item.lead_name, item.contact_name, item.phone].some(value => value?.toLowerCase().includes(search)))) } };
    }
    if (method === 'PUT' && path === '/patients/patient') {
      fixture.leads[0].full_name = data.full_name;
      return { data: { ...options.patient, ...data } };
    }
    if (path === '/patients/patient') return { data: options.patient };
    if (method === 'POST' && path.includes('schedule-appointment')) {
      fixture.chats[0] = { ...fixture.chats[0], patient_id: 'patient', patient_name: data.patient_full_name || 'Linked patient' };
      return { data: { patient_id: 'patient', appointment_id: 'appointment' } };
    }
    return { data: [] };
  };
  const globals = { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true, nameFixture: fixture, alert: value => alerts.push(value),
    setInterval: (callback, delay) => { const id = Symbol(); intervals.set(id, { callback, delay }); return id; },
    clearInterval: id => intervals.delete(id),
    fetch: async (url, init = {}) => {
      if (options.fetch) { const response = await options.fetch(String(url), init); if (response !== undefined) return response; }
      const path = new URL(url).pathname;
      const data = init.body && JSON.parse(init.body);
      requests.push({ method: init.method || 'GET', path, data });
      return { ok: true, json: async () => path.endsWith('/task-statuses') ? { statuses: [] }
        : path.endsWith('/tasks') ? { tasks: [] }
        : path === '/api/patients' ? (options.patient ? [options.patient] : []) : [] };
    } };
  const saved = Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const root = createRoot(document.getElementById('root'));
  context.after(async () => {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  });
  await act(async () => root.render(React.createElement(Component, { patients: [], doctors: [], appointments: [], ...props })));
  const change = async (element, value) => {
    assert.ok(element, 'input exists');
    const prototype = element.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
      element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
  };
  return { fixture, requests, opened, alerts, change, body: document.body,
    render: async (View, props) => act(async () => root.render(React.createElement(View, props))),
    click: async element => { assert.ok(element, 'action exists'); await act(async () => element.click()); },
    submit: async () => act(async () => document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))),
    poll: async () => act(async () => { for (const { callback } of [...intervals.values()]) await callback(); }) };
}
const button = (ui, text) => [...ui.body.querySelectorAll('button')].find(item => item.textContent.trim() === text);
const edit = ui => ui.body.querySelector('[aria-label="Редактировать имя"]');
const input = (ui, label) => ui.body.querySelector(`[aria-label="${label}"]`);
const chatButton = (ui, name) => [...ui.body.querySelectorAll('span')].find(item => item.textContent === name)?.closest('button');

for (const [phone, expected] of [
  ['8 (701) 234-56-78', '+77012345678'],
  ['+8 (123) 456-78-901', '+812345678901']
]) {
  test(`AppointmentModal new-patient phone normalizes edited input and submission: ${phone}`, async context => {
    const created = [];
    const ui = await mount(context, AppointmentModal, { show: true,
      appointmentForm: { ...booking, patient_id: '', showNewPatientForm: true, lead_full_name: lead.full_name },
      onCreatePatient: value => { created.push(value); return { id: 'patient', ...value }; } });
    const field = ui.body.querySelector('input[type="tel"]');
    await ui.change(field, phone);
    const displayedPhone = field.value;
    await ui.click(button(ui, 'Создать пациента'));
    assert.equal(created.length, 1);
    assert.equal(created[0].phone, expected);
    assert.equal(displayedPhone, expected);
  });
}

test('AppointmentModal new-patient phone normalizes untouched lead-prefilled input on submission', async context => {
  const created = [];
  const ui = await mount(context, AppointmentModal, { show: true,
    appointmentForm: { ...booking, patient_id: '', showNewPatientForm: true,
      lead_full_name: lead.full_name, lead_phone: '8 (701) 234-56-78' },
    onCreatePatient: value => { created.push(value); return { id: 'patient', ...value }; } });
  assert.ok(ui.body.querySelector('input[type="tel"]').value, 'lead phone is prefilled');
  await ui.click(button(ui, 'Создать пациента'));
  assert.equal(created.length, 1);
  assert.equal(created[0].phone, '+77012345678');
});

test('Deals pencil preserves structured name fields, saves via updateLead and refreshes without opening card', async context => {
  const ui = await mount(context, Board, {});
  const refreshes = ui.fixture.refreshes;
  await ui.click(edit(ui));
  assert.equal(ui.opened.length, 0);
  assert.equal(ui.body.textContent.includes('История и данные'), false);
  assert.equal(input(ui, 'Имя').value, lead.first_name);
  assert.equal(input(ui, 'Фамилия').value, lead.last_name);
  assert.equal(input(ui, 'Отчество').value, lead.middle_name);
  await ui.change(input(ui, 'Имя'), 'Мария Анна');
  await ui.click(button(ui, 'Сохранить'));
  assert.deepEqual(ui.requests.filter(r => r.method === 'UPDATE_LEAD'), [{ method: 'UPDATE_LEAD', path: lead.id,
    data: { first_name: 'Мария Анна', last_name: lead.last_name, middle_name: lead.middle_name } }]);
  assert.ok(ui.fixture.refreshes > refreshes);
  assert.match(ui.body.querySelector('[data-lead-id] h4').textContent, /Мария Анна/);
  assert.equal(ui.requests.some(r => r.method === 'PUT'), false);
});

test('converted Deals edits official patient full_name only and refreshes linked board', async context => {
  const patient = { id: 'patient', full_name: 'Официальная Фамилия Имя Отчество', phone: lead.phone };
  const ui = await mount(context, Board, {}, { leads: [{ ...lead, converted_to_client_id: 'patient' }], patient });
  const refreshes = ui.fixture.refreshes;
  await ui.click(edit(ui));
  assert.equal(input(ui, 'ФИО пациента').value, patient.full_name);
  await ui.change(input(ui, 'ФИО пациента'), 'Новое официальное ФИО');
  await ui.click(button(ui, 'Сохранить'));
  assert.deepEqual(ui.requests.filter(r => r.method === 'PUT'), [{ method: 'PUT', path: '/patients/patient', data: { full_name: 'Новое официальное ФИО' } }]);
  assert.equal(ui.requests.some(r => r.method === 'UPDATE_LEAD'), false);
  assert.ok(ui.fixture.refreshes > refreshes);
  assert.match(ui.body.querySelector('[data-lead-id] h4').textContent, /Новое официальное ФИО/);
});

test('Deals cancel and failed save retain names and allow retry', async context => {
  const ui = await mount(context, Board, {}, { failSave: true });
  await ui.click(edit(ui));
  await ui.change(input(ui, 'Имя'), 'Не сохранено');
  await ui.click(button(ui, 'Отмена'));
  assert.equal(ui.requests.some(r => r.method === 'UPDATE_LEAD'), false);
  await ui.click(edit(ui));
  assert.equal(input(ui, 'Имя').value, lead.first_name);
  await ui.change(input(ui, 'Имя'), 'Повторить');
  await ui.click(button(ui, 'Сохранить'));
  assert.match(ui.body.textContent, /Ошибка сохранения/);
  assert.equal(input(ui, 'Имя').value, 'Повторить');
  assert.equal(button(ui, 'Сохранить').disabled, false);
});

for (const lead_full_name of [lead.full_name, undefined]) {
  test(`CRM auto-conversion omits unchanged prefilled lead name (${lead_full_name ? 'full name' : 'structured fallback'})`, async context => {
    const saved = [], created = [];
    const ui = await mount(context, AppointmentModal, { show: true, hideCreatePatientButton: true,
      appointmentForm: { ...booking, patient_id: '', showNewPatientForm: true,
        lead_first_name: lead.first_name, lead_last_name: lead.last_name,
        lead_middle_name: lead.middle_name, lead_full_name },
      onSave: value => saved.push(value), onCreatePatient: value => created.push(value) });
    assert.equal(ui.body.querySelector('[placeholder="ФИО *"]').value, lead.full_name);
    await ui.submit();
    assert.equal(saved.length, 1);
    assert.equal(Object.hasOwn(saved[0], 'patient_full_name'), false);
    assert.deepEqual(created, []);
  });
}

test('CRM auto-conversion submit forwards typed official name without separately creating a patient', async context => {
  const saved = [], created = [];
  const ui = await mount(context, AppointmentModal, { show: true, hideCreatePatientButton: true,
    patients: [], doctors: [], appointments: [],
    appointmentForm: { ...booking, patient_id: '', showNewPatientForm: true, lead_first_name: lead.first_name,
      lead_last_name: lead.last_name, lead_middle_name: lead.middle_name, lead_full_name: lead.full_name },
    onSave: value => saved.push(value), onCreatePatient: value => created.push(value) });
  const name = ui.body.querySelector('[placeholder="ФИО *"]');
  assert.equal(name.value, lead.full_name);
  await ui.change(name, '  Официальное Имя Полностью  ');
  await ui.submit();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].patient_full_name, 'Официальное Имя Полностью');
  assert.deepEqual(created, []);
});

test('existing-patient booking omits official-name override even with stale lead form metadata', async context => {
  const saved = [];
  const ui = await mount(context, AppointmentModal, { show: true, hideCreatePatientButton: true,
    appointmentForm: { ...booking, patient_id: 'patient', showNewPatientForm: true, patient_full_name: 'Stale override' },
    patients: [{ id: 'patient', full_name: 'Existing official name' }], onSave: value => saved.push(value) });
  await ui.submit();
  assert.equal(saved.length, 1);
  assert.equal(Object.hasOwn(saved[0], 'patient_full_name'), false);
});

for (const patient_full_name of ['Официальное Имя', undefined]) {
  test(`Deals booking callback forwards optional official name: ${patient_full_name}`, async context => {
    const ui = await mount(context, Board, {});
    await ui.click(button(ui, 'Назначить прием'));
    const props = ui.opened.at(-1).props;
    await act(async () => props.onSave({ ...booking, ...(patient_full_name ? { patient_full_name } : {}) }));
    const request = ui.requests.find(r => r.path.includes('/schedule-appointment'));
    assert.ok(request);
    assert.equal(request.data.patient_full_name, patient_full_name);
    assert.equal(Object.hasOwn(request.data, 'patient_full_name'), !!patient_full_name);
  });
}

test('WhatsApp uses effective names in list, search, selected header and full booking fallback, then refreshes after conversion', async context => {
  const ui = await mount(context, Inbox, { isOpen: true });
  assert.match(ui.body.textContent, new RegExp(lead.full_name));
  await ui.change(ui.body.querySelector('input[placeholder="Поиск по имени или телефону…"]'), 'Иванова');
  await ui.click(chatButton(ui, lead.full_name));
  await ui.click(button(ui, 'Записать'));
  const props = ui.opened.at(-1).props;
  assert.equal(props.appointmentForm.lead_full_name, lead.full_name);
  assert.match(props.appointmentForm.notes, new RegExp(lead.full_name));
  await act(async () => props.onSave({ ...booking, patient_full_name: 'Официальное ФИО' }));
  assert.equal(ui.requests.find(r => r.method === 'POST').data.patient_full_name, 'Официальное ФИО');
  assert.equal(ui.body.querySelector('[aria-label="Контакт выбранного чата"]').textContent, 'Официальное ФИО');
  assert.equal(ui.fixture.chats[0].contact_name, chat.contact_name);
  assert.equal(ui.requests.some(r => r.data?.contact_name), false);
});

test('WhatsApp polling refreshes selected canonical name and subsequent patient booking', async context => {
  const ui = await mount(context, Inbox, { isOpen: true }, { chats: [{ ...chat, patient_id: 'patient', patient_name: 'Old official name' }] });
  await ui.click(chatButton(ui, 'Old official name'));
  ui.fixture.chats[0].patient_name = 'Renamed official name';
  await ui.poll();
  assert.equal(ui.body.querySelector('[aria-label="Контакт выбранного чата"]').textContent, 'Renamed official name');
  await ui.click(button(ui, 'Записать'));
  const props = ui.opened.at(-1).props;
  assert.equal(props.appointmentForm.patient_id, 'patient');
  assert.equal(props.patients[0].full_name, 'Renamed official name');
  await act(async () => props.onSave({ ...booking, patient_id: 'patient' }));
  assert.equal(ui.requests.find(r => r.method === 'POST').path, '/appointments');
  assert.equal(Object.hasOwn(ui.requests.find(r => r.method === 'POST').data, 'patient_full_name'), false);
});

test('selected WhatsApp chat refreshes even when its renamed name no longer matches list search', async context => {
  const ui = await mount(context, Inbox, { isOpen: true }, { chats: [{ ...chat, lead_name: 'Search old name' }] });
  await ui.change(ui.body.querySelector('input[placeholder="Поиск по имени или телефону…"]'), 'Search old');
  await ui.click(chatButton(ui, 'Search old name'));
  ui.fixture.chats[0].lead_name = 'Renamed lead';
  await ui.poll();
  assert.equal(ui.body.querySelector('[aria-label="Контакт выбранного чата"]').textContent, 'Renamed lead');
});

test('separate onCreatePatient flow submits selected patient without forwarding a stale name', async context => {
  const saved = [], created = [];
  const ui = await mount(context, AppointmentModal, { show: true,
    appointmentForm: { ...booking, patient_id: '', showNewPatientForm: true, lead_full_name: lead.full_name,
      lead_source_id: 'source' },
    onCreatePatient: async value => { created.push(value); return { success: true, data: { id: 'created', ...value } }; },
    onSave: value => saved.push(value) });
  await ui.change(ui.body.querySelector('[placeholder="ФИО *"]'), 'Имя нового пациента');
  await ui.click(button(ui, 'Создать пациента'));
  assert.equal(created.length, 1);
  assert.equal(created[0].full_name, 'Имя нового пациента');
  await ui.submit();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].patient_id, 'created');
  assert.equal(Object.hasOwn(saved[0], 'patient_full_name'), false);
});

for (const link of [{patient_id:'patient'}, {linked_patient_id:'patient'}]) {
 test(`WhatsApp patient booking passes doctors and existing appointments: ${Object.keys(link)[0]}`,async t=>{
  const doctors=[{id:'doctor',full_name:'Fixture Doctor',is_active:true}],existing=[{id:'existing',doctor_id:'doctor'}];
  const ui=await mount(t,Inbox,{isOpen:true},{chats:[{...chat,...link,patient_name:'Fixture Patient'}],api:async(method,path)=>path==='/doctors'?{data:doctors}:path==='/appointments'?{data:existing}:undefined});
  await ui.click(chatButton(ui,'Fixture Patient'));await ui.click(button(ui,'Записать'));
  const props=ui.opened.at(-1).props;assert.equal(props.appointmentForm.patient_id,'patient');assert.deepEqual(props.doctors,doctors);assert.deepEqual(props.appointments,existing);assert.equal(props.hideAddPlanForm,true);assert.equal(props.editingItem,null);
  await ui.render(AppointmentModal,{...props,show:true,onSave:async()=>{}});
  assert.equal(ui.body.querySelector('input[type="date"]').value,props.appointmentForm.appointment_date);
 });
}
test('WhatsApp lead booking uses the same context and retains conversion endpoint',async t=>{
 const doctors=[{id:'doctor',full_name:'Fixture Doctor'}];
 const ui=await mount(t,Inbox,{isOpen:true},{api:async(method,path)=>method==='GET'&&path==='/doctors'?{data:{doctors}}:undefined});
 await ui.click(chatButton(ui,lead.full_name));await ui.click(button(ui,'Записать'));const props=ui.opened.at(-1).props;
 assert.deepEqual(props.doctors,doctors);assert.equal(props.hideAddPlanForm,true);assert.equal(props.hideCreatePatientButton,true);assert.equal(props.appointmentForm.showNewPatientForm,true);
 await act(async()=>props.onSave(booking));assert.equal(ui.requests.find(r=>r.method==='POST').path,'/crm/leads/lead/schedule-appointment');
});
test('WhatsApp opening fails visibly when doctors cannot load, and does not open an empty form',async t=>{
 const ui=await mount(t,Inbox,{isOpen:true},{api:async(method,path)=>{if(path==='/doctors')throw Error('Doctors unavailable');}});
 await ui.click(chatButton(ui,lead.full_name));await ui.click(button(ui,'Записать'));assert.equal(ui.opened.length,0);assert.match(ui.body.textContent,/Doctors unavailable/);
});
test('WhatsApp ignores pending booking after chat switch and suppresses duplicate opening',async t=>{
 let resolveDoctors;const waiting=new Promise(resolve=>{resolveDoctors=resolve;});
 const ui=await mount(t,Inbox,{isOpen:true},{chats:[chat,{...chat,phone:'+70000000002',lead_name:'Other fixture'}],api:async(method,path)=>path==='/doctors'?waiting:undefined});
 await ui.click(chatButton(ui,lead.full_name));await ui.click(button(ui,'Записать'));assert.equal(button(ui,'Записать').disabled,true);
 await ui.click(chatButton(ui,'Other fixture'));await act(async()=>resolveDoctors({data:[{id:'doctor'}]}));assert.equal(ui.opened.length,0);assert.equal(ui.requests.filter(r=>r.path==='/doctors').length,1);
});
test('shared AppointmentModal resolves the scheduled doctor and ignores old room answers',async t=>{
 const doctors=[{id:'doctor-a',full_name:'Doctor A'},{id:'doctor-b',full_name:'Doctor B'}];let resolveOld;
 const old=new Promise(resolve=>{resolveOld=resolve;});
 const schedules=id=>Array.from({length:7},(_,day_of_week)=>({doctor_id:id,day_of_week,is_active:true,start_time:'08:00',end_time:'18:00'}));
 const ui=await mount(t,AppointmentModal,{show:true,appointmentForm:{...booking,doctor_id:'',patient_id:'patient'},patients:[{id:'patient',full_name:'Fixture Patient'}],doctors,onSave:async()=>{}},{fetch:async url=>{
  if(url.endsWith('/rooms'))return{ok:true,json:async()=>[{id:'a',name:'Room A'},{id:'b',name:'Room B'}]};
  if(url.endsWith('/rooms/a/schedule'))return old;
  if(url.endsWith('/rooms/b/schedule'))return{ok:true,json:async()=>schedules('doctor-b')};
  if(url.includes('/doctors/available/'))return{ok:true,json:async()=>doctors};
 }});
 const room=[...ui.body.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='a'));await ui.change(room,'a');await ui.change(room,'b');
 assert.match(ui.body.textContent,/Doctor B/);assert.doesNotMatch(ui.body.textContent,/Врач не найден/);
 await act(async()=>resolveOld({ok:true,json:async()=>schedules('doctor-a')}));
 const doctor=[...ui.body.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='doctor-b'));assert.equal(doctor.value,'doctor-b');
});
test('shared appointment save failure stays open and displays a readable error',async t=>{
 const ui=await mount(t,AppointmentModal,{show:true,appointmentForm:{...booking,patient_id:'patient'},patients:[{id:'patient',full_name:'Fixture Patient'}],doctors:[],onSave:async()=>{throw Error('Fixture save failed');}});
 await ui.submit();assert.match(ui.body.textContent,/Fixture save failed/);assert.ok(ui.body.querySelector('form'));assert.equal(button(ui,'Создать').disabled,false);
});

const sharedPlan = id => ({id,title:`Shared plan ${id}`,created_at:'2026-10-19T09:40:00',created_by_name:'Fixture clinician',total_cost:1000,paid_amount:0,services:[{service_id:`service-${id}`,service_row_id:`row-${id}`,service_name:`Service ${id}`,total_price:1000,quantity_total:1,quantity_completed:0,occurrence_ids:[`occ-${id}`]}]});
for(const mode of ['calendar-create','calendar-edit','whatsapp-patient','crm-create']) {
 test(`existing payment and plan tabs use R21/R22 in ${mode} without adding consultations`,async t=>{
  const plans=[sharedPlan('a'),sharedPlan('b')],manual=mode==='crm-create';
  const ui=await mount(t,AppointmentModal,{show:true,appointmentForm:{...booking,patient_id:'patient'},patients:[{id:'patient',full_name:'Fixture Patient'}],doctors:[],editingItem:mode==='calendar-edit'?{id:'appointment',patient_name:'Fixture Patient'}:null,hideAddPlanForm:!manual,onSave:async()=>{}},{fetch:async url=>url.endsWith('/treatment-plans')?{ok:true,json:async()=>plans}:undefined});
  assert.equal(ui.body.querySelectorAll('[role="tab"]').length,4);assert.equal(button(ui,'Консультации'),undefined);
  await ui.click(button(ui,'План лечения'));assert.ok(ui.body.querySelector('.curai-plan-workspace-treatment'));assert.equal(ui.body.querySelectorAll('.curai-plan-option').length,2);
  await ui.click(ui.body.querySelectorAll('.curai-plan-option')[1]);assert.equal(ui.body.querySelector('.curai-treatment-plan-details h4').textContent,'Shared plan b');
  assert.equal(Boolean(button(ui,'Редактировать план')),manual);assert.equal(Boolean(button(ui,'Удалить план')),manual);
  if(manual){await ui.click(button(ui,'Создать план лечения'));assert.ok(!ui.body.querySelector('.curai-plan-workspace-treatment'));await ui.click(button(ui,'К списку планов'));}
  await ui.click(button(ui,'Оплата'));assert.ok(ui.body.querySelector('.curai-r21-payment-workspace'));assert.equal(ui.body.querySelectorAll('.curai-plan-option').length,2);
  await ui.click(ui.body.querySelectorAll('.curai-plan-option')[1]);assert.equal(ui.body.querySelector('.curai-plan-details h4').textContent,'Shared plan b');
  assert.equal(ui.requests.filter(r=>r.method==='POST'||r.method==='PUT').length,0);
 });
}
test('new unlinked appointment has no patient-only tabs added',async t=>{
 const ui=await mount(t,AppointmentModal,{show:true,appointmentForm:{...booking,patient_id:''},patients:[],doctors:[],hideAddPlanForm:true});assert.equal(ui.body.querySelectorAll('[role="tab"]').length,1);assert.equal(button(ui,'Оплата'),undefined);
});
test('appointment payment rejects stale patient results and shows no settled fallback while loading',async t=>{
 let resolveOld;const old=new Promise(resolve=>{resolveOld=resolve;});const patients=[{id:'patient',full_name:'Patient A'},{id:'patient-b',full_name:'Patient B'}],doctors=[];
 const props={show:true,appointmentForm:{...booking,patient_id:'patient'},patients,doctors,hideAddPlanForm:true};
 const ui=await mount(t,AppointmentModal,props,{fetch:async url=>url.endsWith('/patient/treatment-plans')?old:url.endsWith('/patient-b/treatment-plans')?{ok:true,json:async()=>[sharedPlan('b')]}:undefined});
 await ui.click(button(ui,'Оплата'));assert.match(ui.body.textContent,/Загрузка планов/);assert.equal(ui.body.querySelector('.curai-r21-total-due'),null);
 await ui.render(AppointmentModal,{...props,appointmentForm:{...booking,patient_id:'patient-b'}});assert.equal(ui.body.querySelector('.curai-plan-details h4').textContent,'Shared plan b');
 await act(async()=>resolveOld({ok:true,json:async()=>[sharedPlan('a')]}));assert.equal(ui.body.querySelector('.curai-plan-details h4').textContent,'Shared plan b');
});
test('appointment plan error and empty response never display a paid balance from zero fallback',async t=>{
 const ui=await mount(t,AppointmentModal,{show:true,appointmentForm:{...booking,patient_id:'patient'},patients:[{id:'patient',full_name:'Fixture Patient'}],doctors:[],hideAddPlanForm:true},{fetch:async url=>url.endsWith('/treatment-plans')?{ok:false}:undefined});
 await ui.click(button(ui,'Оплата'));assert.match(ui.body.textContent,/Не удалось загрузить планы/);assert.equal(ui.body.querySelector('.curai-r21-total-due'),null);
});
