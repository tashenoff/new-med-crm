import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const compiled = await build({
  entryPoints: [fileURLToPath(new URL('../src/components/crm/tasks/TasksView.jsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom', 'react-dom/client'],
  loader: { '.js': 'jsx' }, plugins: [{
    name: 'task-test-boundaries', setup(builder) {
      builder.onResolve({ filter: /api\/config$/ }, () => ({ path: 'api', namespace: 'mock' }));
      builder.onResolve({ filter: /TaskComposer$/ }, () => ({ path: 'composer', namespace: 'mock' }));
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({
        contents: path === 'api'
          ? 'export const apiClient={get:(...args)=>globalThis.taskApi.get(...args),put:(...args)=>globalThis.taskApi.put(...args)}; export const handleApiError=e=>e.message;'
          : 'export default function Composer(){return null;}',
        loader: 'js'
      }));
    }
  }]
});
const loaded = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), loaded, loaded.exports);
const { default: TasksView, taskIsOverdue } = loaded.exports;

test('overdue excludes notes, cancelled, completed and missing dates', () => {
  const due_date = '2026-01-01T00:00:00Z', now = Date.parse('2026-02-01');
  assert.equal(taskIsOverdue({ kind: 'task', status: 'new', due_date }, now), true);
  for (const status of ['completed', 'cancelled']) assert.equal(taskIsOverdue({status, due_date}, now), false);
  for (const kind of ['note', 'comment']) assert.equal(taskIsOverdue({kind, due_date}, now), false);
  assert.equal(taskIsOverdue({status:'new'}, now), false);
});

async function harness(t, user, rows, failure) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://crm.test' });
  const keys = ['window','document','IS_REACT_ACT_ENVIRONMENT','taskApi'];
  const old = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis,key)]));
  const calls=[];
  Object.assign(globalThis, {
    window:dom.window, document:dom.window.document, IS_REACT_ACT_ENVIRONMENT:true,
    taskApi:{
      get: async (url, options) => { calls.push({method:'get',url,options}); if(failure && url==='/crm/tasks') throw Error('Ошибка загрузки'); return {data:url.endsWith('assignees')?{assignees:[{id:'m',name:'Менеджер'}]}:rows}; },
      put:async(url,data)=>{calls.push({method:'put',url,data});return {data:{}};}
    }
  });
  const root=createRoot(document.getElementById('root'));
  t.after(async()=>{await act(async()=>root.unmount());dom.window.close();for(const [key,value] of old) {if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}});
  await act(async()=>root.render(React.createElement(TasksView,{user})));
  return {calls,dom};
}
const task={id:'one',title:'Связаться',kind:'task',status:'new',chat_name:'Клиент',assigned_to_name:'Менеджер',description:'Тест',due_date:'2099-01-01T12:00:00Z'};

test('view-only renders API array and hides creation and mutation controls',async t=>{
  const {calls}=await harness(t,{permissions:['crm_tasks_view']},[task]);
  assert.match(document.querySelector('tbody').textContent,/Связаться/);
  assert.match(document.querySelector('tbody').textContent,/Клиент/);
  assert.equal(document.querySelector('button[aria-label^="Выполнить"]'),null);
  assert.equal([...document.querySelectorAll('button')].some(b=>b.textContent.includes('Создать')),false);
  assert.equal(calls.find(c=>c.url==='/crm/tasks').options.params.limit,51);
});

test('unauthorized user does not fetch tasks',async t=>{
  const {calls}=await harness(t,{permissions:['crm_view']},[task]);
  assert.equal(calls.length,0);
  assert.match(document.querySelector('[role=alert]').textContent,/Нет доступа/);
});

test('completion uses new/completed API statuses and no pending status',async t=>{
  const {calls}=await harness(t,{permissions:['crm_tasks_view','crm_tasks_edit']},[task,{...task,id:'two',status:'completed'}]);
  await act(async()=>document.querySelector('button[aria-label^="Выполнить"]').click());
  assert.deepEqual(calls.find(c=>c.method==='put').data,{status:'completed'});
  await act(async()=>document.querySelector('button[aria-label^="Вернуть"]').click());
  assert.deepEqual(calls.filter(c=>c.method==='put').at(-1).data,{status:'new'});
});

test('API failures displayed rather than silently empty table',async t=>{
  await harness(t,{permissions:['crm_tasks_view']},[],true);
  assert.match(document.querySelector('[role=alert]').textContent,/Ошибка загрузки/);
});

test('pagination queries next slice only if more than 50 records',async t=>{
  const {calls}=await harness(t,{permissions:['crm_tasks_view']},Array.from({length:51},(_,i)=>({...task,id:String(i)})));
  assert.equal(document.querySelectorAll('tbody tr').length,50);
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Далее').click());
  assert.equal(calls.filter(c=>c.url==='/crm/tasks').at(-1).options.params.skip,50);
  // Let the initial search debounce window pass: it must not send us to page 1.
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,350));});
  assert.equal(calls.filter(c=>c.url==='/crm/tasks').at(-1).options.params.skip,50);
});

