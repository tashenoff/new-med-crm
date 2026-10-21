import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const boot = new JSDOM('<html><body></body></html>');
globalThis.window = boot.window; globalThis.document = boot.window.document;
const { createRoot } = await import('react-dom/client');
delete globalThis.window; delete globalThis.document; boot.window.close();
const compiled = await build({
  stdin: { contents: `export { default as Inbox } from './src/components/crm/telephony/WhatsAppInbox.jsx';
    export { GlobalRefreshProvider } from './src/hooks/useGlobalRefresh.js';
    export { wazzupConnectionStatus as status } from './src/hooks/useWazzupConnection.js';
    export { default as Income } from './src/components/finance/income/IncomeView.js';
    export { default as Expenses } from './src/components/finance/expenses/ExpensesView.js';`,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'jsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react', 'react-dom'], loader: { '.js': 'jsx', '.css': 'empty' },
  define: { 'import.meta.env': '{"VITE_BACKEND_URL":"https://fixture.invalid"}' },
  plugins: [{ name: 'isolated-header', setup(b) {
    b.onResolve({ filter: /\/api\/config$|\/context\/(AuthContext(\.jsx)?|ModalContext)$/ }, a => ({ path: a.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ loader: 'jsx', contents:
      a.path.includes('AuthContext') ? "import React from 'react';export default React.createContext({user:{role:'super_admin', permissions:['crm_view','crm_edit','crm_delete','patients_view','patients_edit','patients_export','calendar_view','calendar_edit','calendar_delete','directory_view','directory_edit','directory_delete','warehouse_view','warehouse_edit','warehouse_delete','warehouse_export','finance_view','finance_edit','doctors_view','doctors_edit','doctors_delete','payroll_view']}});" :
      a.path.includes('ModalContext') ? 'export const useModal=()=>({openModal(){},closeModal(){}});' :
      "export const apiClient={get:(p,o)=>globalThis.glassFixture.api(p,o)};export const API_BASE_URL='https://fixture.invalid/api';export const handleApiError=e=>e.message;" }));
  } }]
});
const loaded = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), loaded, loaded.exports);
const { Inbox, status, Income, Expenses, GlobalRefreshProvider } = loaded.exports;
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return { promise, resolve, reject }; };
async function mount(t, readChannels, Component = Inbox) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.invalid' });
  const requests = [], timers = new Map(), previous = new Map(); let next = 0;
  const api = async (path, options) => {
    requests.push({ path, options });
    if (path === '/wazzup/channels') return readChannels(options);
    if (path === '/wazzup/chats') return { data: { chats: [{ phone: '+70000000000', patient_name: 'Fixture patient', status: 'online' }] } };
    throw Error('Unexpected API command: ' + path);
  };
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    glassFixture: { api }, IS_REACT_ACT_ENVIRONMENT: true, setInterval: (fn,ms) => { const id=++next;timers.set(id,{fn,ms});return id; }, clearInterval: id=>timers.delete(id) })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis,key)); Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  }
  const root = createRoot(document.getElementById('root'));
  const render = async open => act(async () => root.render(React.createElement(GlobalRefreshProvider,null,React.createElement(Component,{isOpen:open,onClose(){},user:{role:'super_admin', permissions:['crm_view','crm_edit','crm_delete','patients_view','patients_edit','patients_export','calendar_view','calendar_edit','calendar_delete','directory_view','directory_edit','directory_delete','warehouse_view','warehouse_edit','warehouse_delete','warehouse_export','finance_view','finance_edit','doctors_view','doctors_edit','doctors_delete','payroll_view']}}))));
  t.after(async () => { await act(async()=>root.unmount());dom.window.close();for(const[key,d]of previous){if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key];} });
  await render(true);
  return { requests, render, body: document.body, poll: async ms => act(async()=>{for(const t of timers.values())if(t.ms===ms)t.fn();}),
    badge:()=>document.querySelector('.curai-connection-badge'), header:()=>document.querySelector('.curai-whatsapp-title'), timers };
}

test('connection follows the same active-channel contract as backend sending', () => {
  assert.equal(status([{id:'a',status:'active'}]),'online');
  assert.equal(status([{id:'a',status:'inactive'},{id:'b',status:'ACTIVE'}]),'online');
  assert.equal(status([{status:'disconnected'}]),'offline');
  assert.equal(status([{status:'waitingForQr'}]),'offline');
  assert.equal(status([]),'offline');
  for(const data of [null,{},[{status:null}],[{}],[{status:'unknown'}],[{status:'loading'}]])assert.equal(status(data),null);
});

test('loading never shows patient presence as online; title and capsule stay stable during polls', async t => {
  const first=deferred(); let current=first;
  const ui=await mount(t,()=>current.promise),title=ui.header().querySelector('h3');
  assert.equal(ui.badge(),null);assert.ok(ui.header().querySelector('[role="status"]'));
  await act(async()=>first.resolve({data:[{id:'channel',status:'active'}]}));
  assert.equal(ui.badge().textContent,'online');assert.equal(ui.badge().children.length,0);
  const badge=ui.badge();current=deferred();await ui.poll(30000);await ui.poll(5000);
  assert.equal(ui.header().querySelector('h3'),title);assert.equal(ui.badge(),badge);assert.equal(ui.badge().textContent,'online');
  assert.equal(ui.header().querySelector('.curai-chat-online'),null);assert.doesNotMatch(ui.header().textContent,/обновление/i);
  await act(async()=>current.resolve({data:[{id:'channel',status:'inactive'}]}));
  assert.equal(ui.badge().textContent,'offline');assert.equal(ui.header().querySelector('h3'),title);
  assert.ok(ui.body.querySelector('.curai-whatsapp > .curai-whatsapp-body.curai-glass-body'));
});

test('polls cannot overlap and responses from a closed session cannot replace a reopened session', async t => {
  const old=deferred(),fresh=deferred();let reads=0;
  const ui=await mount(t,()=>++reads===1?old.promise:fresh.promise);
  await ui.poll(30000);await ui.poll(30000);assert.equal(reads,1);
  const signal=ui.requests.find(r=>r.path==='/wazzup/channels').options.signal;
  await ui.render(false);assert.equal(signal.aborted,true);assert.equal(ui.timers.size,0);
  await ui.render(true);assert.equal(reads,2);
  await act(async()=>fresh.resolve({data:[{status:'inactive'}]}));assert.equal(ui.badge().textContent,'offline');
  await act(async()=>old.resolve({data:[{status:'active'}]}));assert.equal(ui.badge().textContent,'offline');
});

test('API error or malformed response clears stale online and a later confirmed connection recovers', async t => {
  let result={data:[{status:'active'}]};
  const ui=await mount(t,async()=>{if(result instanceof Error)throw result;return result;});
  assert.equal(ui.badge().textContent,'online');
  result=new Error('offline fixture');await ui.poll(30000);assert.equal(ui.badge(),null);
  result={data:{channels:[{status:'active'}]}};await ui.poll(30000);assert.equal(ui.badge(),null);
  result={data:[{status:'active'}]};await ui.poll(30000);assert.equal(ui.badge().textContent,'online');
  assert.ok(ui.requests.every(r=>r.path==='/wazzup/channels'||r.path==='/wazzup/chats'));
});

for (const [name,Component,label] of [['income',Income,'Добавить доход'],['expenses',Expenses,'Добавить расход']]) {
  test(`${name} form stays wholly inside the opaque body outside its glass title bar`, async t => {
    const ui=await mount(t,async()=>{throw Error('Unexpected channel request');},Component);
    const open=[...ui.body.querySelectorAll('button')].find(b=>b.textContent.includes(label));assert.ok(open);
    await act(async()=>open.click());
    const shell=ui.body.querySelector('.curai-custom-dialog');assert.ok(shell);
    const header=shell.querySelector(':scope > .curai-glass-header'),body=shell.querySelector(':scope > .curai-glass-body');
    assert.ok(header);assert.ok(body);assert.equal(header.querySelector('form,input,textarea'),null);
    assert.ok(body.querySelector('form'));assert.ok(body.querySelector('button[type="submit"]'));
  });
}
