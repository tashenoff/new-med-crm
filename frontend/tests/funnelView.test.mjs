import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { funnelPresetRange } from '../src/utils/eventFunnel.js';

const bootstrap = new JSDOM('<html><body></body></html>');
globalThis.window = bootstrap.window; globalThis.document = bootstrap.window.document;
const { createRoot } = await import('react-dom/client');
delete globalThis.window; delete globalThis.document; bootstrap.window.close();
const compiled = await build({ entryPoints: [fileURLToPath(new URL('../src/components/crm/funnel/FunnelView.js', import.meta.url))],
 bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom'], loader: { '.js': 'jsx', '.css': 'empty' },
 define: { 'import.meta.env': '{"VITE_BACKEND_URL":"https://fixture.invalid"}' } });
const loaded={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),loaded,loaded.exports);
const View=loaded.exports.default;
const columns=()=>[['optional-q','Необязательный'],['end-z','Завершение'],['entry-x','Начало'],['middle-y','Обсуждение']].map(([id,name])=>({id,name,is_system:false,manual_move_allowed:true}));
const sources=()=>[{key:'source:a',name:'Канал А'},{key:'source:b',name:'Канал Б'},{key:'source:zero',name:'Пустой канал'},{key:'missing-source',name:'Источник не указан'}];
const fixtureRows=[{key:'source:a',name:'Канал А',total:6,snapshot:{'entry-x':0,'middle-y':2,'end-z':4},counts:[6,5,2],open:1},
 {key:'source:b',name:'Канал Б',total:5,snapshot:{'entry-x':1,'end-z':4},counts:[5,2,2],open:0},
 {key:'source:zero',name:'Пустой канал',total:0,snapshot:{},counts:[0,0,0],open:0},
 {key:'missing-source',name:'Источник не указан',total:1,snapshot:{'end-z':1},counts:[1,1,1],open:0}];
const rate=(a,b)=>b?Math.round(a/b*1000)/10:null;
async function mount(t, options={}) {
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid/crm-deals'+(options.batch?'?funnel_batch=demo-batch':'')});
 const f={columns:columns(),requests:[],fail:false,gate:null,user:options.user||{id:'manager',clinic_id:'clinic'},generation:0,
  methodGates:{},methodFail:false,methods:{a:[{id:'contact-one',name:'Custom first',active:true},{id:'contact-old',name:'Archived second',active:false}],b:[{id:'contact-other',name:'Other source only',active:true}],zero:[]}};
 const original=new Map();const globals={window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true,
 fetch:async(input,init)=>{
  const url=new URL(input);assert.equal(url.origin,'https://fixture.invalid');assert.equal(init?.method||'GET','GET');
  f.requests.push(url);if(f.fail)return{ok:false,json:async()=>({detail:'Отчёт недоступен'})};
  if(url.pathname.endsWith('/options'))return{ok:true,json:async()=>({columns:f.columns,sources:sources(),synthetic_batch:options.batch?'demo-batch':null})};
  if(url.pathname.endsWith('/methods')){
   const sourceId=url.searchParams.get('source_id');
   if(f.methodGates[sourceId])await f.methodGates[sourceId];
   return f.methodFail?{ok:false,json:async()=>({detail:'Method catalog unavailable'})}:{ok:true,json:async()=>({source_id:sourceId,methods:f.methods[sourceId]||[]})};
  }
  assert.equal(url.pathname,'/api/crm/funnel/report');
  const mode=url.searchParams.get('mode'),steps=url.searchParams.getAll('steps'),selected=url.searchParams.get('source_selection')==='selected'?url.searchParams.getAll('source_ids'):null;
  if(f.gate&&selected?.includes('source:a'))await f.gate;
  const method=url.searchParams.get('channel_id');
  const rows=fixtureRows.filter(row=>selected===null||selected.includes(row.key)).map(row=>!method?row:{...row,
   ...(method==='contact-one'&&row.key==='source:a'?{total:2,counts:[2,1,1],snapshot:{'middle-y':1,'end-z':1},open:0}:
    method==='contact-old'&&row.key==='source:a'?{total:1,counts:[1,0,0],snapshot:{'entry-x':1},open:0}:{total:0,counts:[0,0,0],snapshot:{},open:0})});
  const stageIds=mode==='history'?steps:f.columns.map(c=>c.id);
  const summarize=rows=>{const total=rows.reduce((sum,r)=>sum+r.total,0);const counts=stageIds.map((id,i)=>rows.reduce((sum,r)=>sum+(mode==='history'?r.counts[i]||0:r.snapshot[id]||0),0));return{total,converted:counts.at(-1)||0,conversion:rate(counts.at(-1)||0,total),open_windows:rows.reduce((sum,r)=>sum+r.open,0),outside_current_columns:0,
   stages:stageIds.map((id,index)=>({id,name:f.columns.find(c=>c.id===id)?.name||id,count:counts[index],share:rate(counts[index],total),cohort_rate:rate(counts[index],total),previous_rate:index?rate(counts[index],counts[index-1]):null}))};};
  return{ok:true,json:async()=>({mode,totals:summarize(rows),sources:rows.map(row=>({...row,...summarize([row])})),stage_options:f.columns,source_options:sources(),coverage:{current_without_observed_events:2},as_of:new Date().toISOString()})};
 }};
 for(const[key,value]of Object.entries(globals)){original.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 const root=createRoot(document.getElementById('root'));
 const render=async()=>act(async()=>root.render(React.createElement(View,{key:f.generation,user:f.user})));
 t.after(async()=>{await act(async()=>root.unmount());dom.window.close();for(const[key,value]of original){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}});
 await render();
 const click=async node=>{assert.ok(node,'Control exists');await act(async()=>node.click());};
 const button=name=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===name);
 const change=async(label,value)=>{const node=document.querySelector(`[aria-label="${label}"]`);assert.ok(node);await act(async()=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node),'value').set.call(node,value);node.dispatchEvent(new dom.window.Event('change',{bubbles:true}));if(node.tagName==='INPUT')node.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});};
 const define=async()=>{await click(button('Прохождение'));await click(button('Шаги воронки (0)'));for(const id of ['entry-x','middle-y','end-z'])await click(document.querySelector(`[data-definition-stage="${id}"]`));await click(button('Готово'));};
 return{f,dom,click,button,change,define,render,rows:()=>[...document.querySelectorAll('[data-funnel-stage]')],total:()=>document.querySelector('[data-report-total]')?.textContent,
  refresh:async()=>act(async()=>dom.window.dispatchEvent(new dom.window.Event('crm-kanban-changed'))),remount:async()=>{f.generation++;await render();}};
}

test('current snapshot uses runtime canonical columns/order and renders a true zero-width bar',async t=>{
 const h=await mount(t);assert.deepEqual(h.rows().map(row=>row.dataset.funnelStage),h.f.columns.map(c=>c.id));
 assert.equal(document.querySelector('[data-funnel-stage="optional-q"] [data-stage-bar]').style.width,'0%');
 assert.match(document.body.textContent,/не история прохождения/);assert.equal(document.querySelector('details.curai-crm-caption')?.open,false);
});

test('snapshot quick periods synchronize editable dates without duplicate reports or a changed default', async t => {
 const h = await mount(t);
 const reports = () => h.f.requests.filter(url => url.pathname.endsWith('/report'));
 const input = label => document.querySelector(`[aria-label="${label}"]`);
 assert.equal(input('Быстрый период').value, '30days');
 assert.deepEqual({ from: input('Начало периода').value, to: input('Конец периода').value }, funnelPresetRange('30days'));
 let before = reports().length;
 await h.change('Быстрый период', '7days');
 assert.equal(reports().length, before + 1);
 assert.deepEqual({ from: input('Начало периода').value, to: input('Конец периода').value }, funnelPresetRange('7days'));
 before = reports().length;
 await h.change('Быстрый период', 'custom');
 assert.equal(reports().length, before, 'selecting custom alone does not fetch unchanged bounds');
 await h.change('Начало периода', '2020-02-29');
 assert.equal(input('Быстрый период').value, 'custom');
 assert.equal(reports().length, before + 1);
 assert.equal(reports().at(-1).searchParams.get('mode'), 'snapshot');
 await h.change('Быстрый период', 'month');
 assert.deepEqual({ from: input('Начало периода').value, to: input('Конец периода').value }, funnelPresetRange('month'));
});

test('quick periods preserve history steps, source scope, conversion window and synthetic batch', async t => {
 const h = await mount(t, { batch: true });
 await h.define();
 await h.change('Окно конверсии, дней', '14');
 await h.change('Источник', 'source:a');
 const reportCount = () => h.f.requests.filter(url => url.pathname.endsWith('/report')).length;
 let before = reportCount();
 await h.change('Быстрый период', '7days');
 assert.equal(reportCount(), before + 1);
 let params = h.f.requests.at(-1).searchParams;
 assert.equal(params.get('mode'), 'history');
 assert.equal(params.get('window_days'), '14');
 assert.equal(params.get('synthetic_batch'), 'demo-batch');
 assert.deepEqual(params.getAll('steps'), ['entry-x', 'middle-y', 'end-z']);
 assert.deepEqual(params.getAll('source_ids'), ['source:a']);
 await h.click(h.button('Сравнение источников'));
 await h.click(h.button('Источники (4)'));
 await h.click(document.querySelector('[data-comparison-source="source:b"]'));
 await h.click(document.querySelector('[data-comparison-source="missing-source"]'));
 await h.click(h.button('Готово'));
 before = reportCount();
 await h.change('Быстрый период', 'yesterday');
 assert.equal(reportCount(), before + 1);
 params = h.f.requests.at(-1).searchParams;
 assert.deepEqual(params.getAll('source_ids'), ['source:a', 'source:zero']);
 assert.equal(params.get('window_days'), '14');
 assert.equal(params.get('source_selection'), 'selected');
 assert.equal(params.get('synthetic_batch'), 'demo-batch');
});
test('history has no hardcoded path; explicit arbitrary IDs determine sequence and window',async t=>{
 const h=await mount(t);await h.click(h.button('Прохождение'));assert.match(document.body.textContent,/Выберите хотя бы два шага/);
 assert.equal(h.f.requests.filter(url=>url.searchParams.get('mode')==='history').length,0);
 await h.click(h.button('Шаги воронки (0)'));assert.ok(h.button('Готово').disabled);
 for(const id of ['entry-x','middle-y','end-z'])await h.click(document.querySelector(`[data-definition-stage="${id}"]`));
 await h.click(h.button('Готово'));assert.deepEqual(h.rows().map(row=>row.dataset.funnelStage),['entry-x','middle-y','end-z']);
 await h.change('Окно конверсии, дней','7');assert.equal(h.f.requests.at(-1).searchParams.get('window_days'),'7');
 await h.click(h.button('Как считается'));assert.match(document.body.textContent,/Возврат не сбрасывает прогресс/);await h.click(h.button('Закрыть'));assert.match(document.body.textContent,/без наблюдаемых событий/);
});
test('source filter changes stage report; comparison independently uses explicit multiple sources',async t=>{
 const h=await mount(t);await h.define();await h.change('Источник','source:a');assert.match(h.total(),/^6/);
 await h.click(h.button('Сравнение источников'));assert.equal(document.querySelector('#funnel-source'),null);assert.match(h.total(),/^12/);
 await h.click(h.button('Источники (4)'));await h.click(document.querySelector('[data-comparison-source="source:b"]'));await h.click(document.querySelector('[data-comparison-source="missing-source"]'));await h.click(h.button('Готово'));
 assert.deepEqual([...document.querySelectorAll('[data-source-comparison-key]')].map(row=>row.dataset.sourceComparisonKey),['source:a','source:zero','total']);
 assert.equal(document.querySelector('[data-source-comparison-key="source:zero"] [data-comparison-total]').textContent,'0');
 assert.equal(document.querySelector('[data-source-comparison-key="source:zero"] [data-comparison-conversion]').textContent,'—');
 await h.click(h.button('По этапам'));assert.equal(document.querySelector('#funnel-source').value,'source:a');
});
test('all sources deselected shows an explicit empty comparison without vacant rows',async t=>{
 const h=await mount(t);await h.click(h.button('Сравнение источников'));await h.click(h.button('Источники (4)'));await h.click(h.button('Снять выбор'));await h.click(h.button('Готово'));
 assert.equal(document.querySelectorAll('[data-source-comparison-key]').length,0);assert.match(document.body.textContent,/Источники не выбраны/);assert.match(h.total(),/^0/);
});
test('visibility is separate from definition, applies only on Done, and preserves totals/query',async t=>{
 const h=await mount(t);await h.define();const total=h.total(),before=h.f.requests.at(-1).searchParams.getAll('steps');
 await h.click(h.button('Отображение этапов'));await h.click(document.querySelector('[data-stage-visibility="middle-y"]'));
 assert.equal(h.rows().length,3);await h.click(h.button('Закрыть'));assert.equal(h.rows().length,3);
 await h.click(h.button('Отображение этапов'));await h.click(document.querySelector('[data-stage-visibility="middle-y"]'));await h.click(h.button('Готово'));
 assert.deepEqual(h.rows().map(row=>row.dataset.funnelStage),['entry-x','end-z']);assert.equal(h.total(),total);assert.deepEqual(h.f.requests.at(-1).searchParams.getAll('steps'),before);
 await h.click(h.button('Отображение этапов'));await h.click(h.button('Скрыть все'));await h.click(h.button('Готово'));assert.match(document.body.textContent,/Все строки скрыты/);assert.equal(h.total(),total);
});
test('saved definition/visibility survive reopening and are scoped by user and clinic',async t=>{
 const h=await mount(t);await h.define();await h.click(h.button('Отображение этапов'));await h.click(document.querySelector('[data-stage-visibility="middle-y"]'));await h.click(h.button('Готово'));await h.remount();
 await h.click(h.button('Прохождение'));assert.equal(h.rows().length,2);
 h.f.user={id:'other',clinic_id:'clinic'};await h.render();assert.ok(h.button('Шаги воронки (0)'));
 h.f.user={id:'manager',clinic_id:'elsewhere'};await h.render();assert.ok(h.button('Шаги воронки (0)'));
 h.f.user={id:'manager',clinic_id:'clinic'};await h.render();assert.equal(h.rows().length,2);
});
test('definition order can change explicitly while rename and canonical reorder retain stable IDs',async t=>{
 const h=await mount(t);await h.define();await h.click(h.button('Шаги воронки (3)'));await h.click(document.querySelector('[aria-label="Поднять Завершение"]'));await h.click(h.button('Готово'));
 assert.deepEqual(h.f.requests.at(-1).searchParams.getAll('steps'),['entry-x','end-z','middle-y']);
 h.f.columns=h.f.columns.toReversed().map(c=>({...c,name:c.name+' переименован'}));await h.refresh();assert.match(document.body.textContent,/Начало переименован/);assert.deepEqual(h.rows().map(row=>row.dataset.funnelStage),['entry-x','end-z','middle-y']);
});
test('invalid dates block request and API failure permits retry without invented results',async t=>{
 const h=await mount(t);await h.change('Начало периода','2030-10-30');assert.match(document.querySelector('[role="alert"]').textContent,/корректный период/);
 await h.change('Начало периода','2020-01-01');h.f.fail=true;await h.refresh();assert.match(document.querySelector('[role="alert"]').textContent,/Отчёт недоступен/);
 h.f.fail=false;await h.click(h.button('Повторить'));assert.ok(h.rows().length);
});
test('late response for former source never replaces latest selection',async t=>{
 const h=await mount(t);let release;h.f.gate=new Promise(resolve=>{release=resolve;});await h.change('Источник','source:a');await h.change('Источник','source:b');assert.match(h.total(),/^5/);
 await act(async()=>release());assert.match(h.total(),/^5/);assert.equal(document.querySelector('#funnel-source').value,'source:b');
});
test('synthetic batch is explicit in both API requests and UI; preferences have a separate scope',async t=>{
 const h=await mount(t,{batch:true});assert.match(document.body.textContent,/Тестовый набор: demo-batch/);assert.ok(h.f.requests.every(url=>url.searchParams.get('synthetic_batch')==='demo-batch'));
});

test('dependent method filter is disabled for all/unknown sources, uses owned IDs, and resets atomically', async t => {
 const h=await mount(t,{batch:true});
 const method=()=>document.querySelector('[aria-label="Способ обращения"]');
 const reports=()=>h.f.requests.filter(url=>url.pathname.endsWith('/report'));
 assert.equal(method().disabled,true);assert.equal(method().textContent,'Выберите источник');
 assert.equal(h.f.requests.some(url=>url.pathname.endsWith('/methods')),false);
 await h.change('Источник','source:a');
 assert.equal(method().disabled,false);
 assert.deepEqual([...method().options].map(option=>option.value),['','contact-one','contact-old']);
 assert.match(method().textContent,/Archived second \(архивный\)/);
 const before=reports().length;
 await h.change('Способ обращения','contact-one');
 assert.equal(reports().length,before+1);assert.match(h.total(),/^2/);
 assert.equal(reports().at(-1).searchParams.get('channel_id'),'contact-one');
 assert.equal(reports().at(-1).searchParams.get('synthetic_batch'),'demo-batch');
 await h.change('Быстрый период','7days');
 assert.equal(method().value,'contact-one');assert.equal(reports().at(-1).searchParams.get('channel_id'),'contact-one');
 await h.define();assert.match(h.total(),/^2/);assert.equal(h.rows().at(-1).querySelector('[data-stage-count]').textContent,'1');
 await h.click(h.button('Сравнение источников'));
 assert.equal(method(),null);assert.equal(reports().at(-1).searchParams.has('channel_id'),false);assert.match(h.total(),/^12/);
 await h.click(h.button('По этапам'));assert.equal(method().value,'contact-one');assert.match(h.total(),/^2/);
 await h.change('Источник','source:b');
 assert.equal(method().value,'');assert.deepEqual([...method().options].map(option=>option.value),['','contact-other']);
 assert.match(h.total(),/^5/);assert.equal(reports().at(-1).searchParams.has('channel_id'),false);
 assert.ok(reports().every(url=>!url.searchParams.has('channel_id')||url.searchParams.getAll('source_ids').join()==='source:a'));
 await h.change('Источник','missing-source');assert.equal(method().disabled,true);assert.equal(method().value,'');
 await h.change('Источник','all');assert.equal(method().disabled,true);assert.match(h.total(),/^12/);
});

test('method catalog rejects late former-source data and exposes empty/error/loading/removed states honestly', async t => {
 const h=await mount(t);let release;
 const method=()=>document.querySelector('[aria-label="Способ обращения"]');
 h.f.methodGates.a=new Promise(resolve=>{release=resolve;});
 await h.change('Источник','source:a');assert.equal(method().disabled,true);assert.match(method().textContent,/Загрузка/);
 await h.change('Источник','source:b');assert.deepEqual([...method().options].map(option=>option.value),['','contact-other']);
 await act(async()=>release());assert.deepEqual([...method().options].map(option=>option.value),['','contact-other']);
 await h.change('Источник','source:zero');assert.equal(method().disabled,false);assert.match(document.body.textContent,/нет настроенных способов/);
 h.f.methodFail=true;await h.change('Источник','source:a');assert.equal(method().disabled,true);assert.match(document.querySelector('#funnel-method-status').textContent,/Method catalog unavailable/);
 h.f.methodFail=false;await h.click(h.button('Повторить'));assert.equal(method().disabled,false);
 await h.change('Способ обращения','contact-old');assert.match(h.total(),/^1/);
 h.f.methods.a=[];await h.refresh();
 assert.equal(method().value,'contact-old');assert.match(method().selectedOptions[0].textContent,/недоступен/);
 assert.equal(h.f.requests.filter(url=>url.pathname.endsWith('/report')).at(-1).searchParams.get('channel_id'),'contact-old');
});
