import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
const bootstrap=new JSDOM('<html><body></body></html>');
globalThis.window=bootstrap.window;globalThis.document=bootstrap.window.document;
const {createRoot}=await import('react-dom/client');
delete globalThis.window;delete globalThis.document;bootstrap.window.close();
const compiled=await build({stdin:{contents:`import React from 'react';
 export {default} from './src/components/treatment/payment/PatientFundingSummary.jsx';
 import PatientModal from './src/components/modals/PatientModal.js';
 import AppointmentModal from './src/components/modals/AppointmentModal.js';
 import { GlobalRefreshProvider } from './src/hooks/useGlobalRefresh.js';
 import { ThemeProvider } from './src/hooks/useTheme.js';
 export const PatientShell = props => <ThemeProvider><GlobalRefreshProvider><PatientModal {...props}/></GlobalRefreshProvider></ThemeProvider>;
 export const AppointmentShell = props => <ThemeProvider><AppointmentModal {...props}/></ThemeProvider>;`,resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'jsx'},bundle:true,write:false,platform:'node',format:'cjs',loader:{'.js':'jsx'},external:['react','react-dom','react-dom/client'],define:{'import.meta.env':'{"VITE_BACKEND_URL":"https://fixture.invalid"}'}});
const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const Funding=module.exports.default;
const summary=(received,used=0)=>({deposit_received_kzt:received,deposit_used_kzt:used,deposit_available_kzt:received-used,advance_available_kzt:0,known:true});
async function mount(t,read){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid'}),previous=new Map(),reads=[];
 const globals={window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true,fetch:async(url,options={})=>{
   assert.equal(options.method||'GET','GET');reads.push(url);return read(url);
 }};
 for(const [key,value]of Object.entries(globals)){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 const root=createRoot(document.getElementById('root')),container=document.getElementById('root');
 const render=async (props,Component=Funding)=>act(async()=>root.render(React.createElement(Component,props)));
 t.after(async()=>{await act(async()=>root.unmount());dom.window.close();for(const [key,desc]of previous){if(desc)Object.defineProperty(globalThis,key,desc);else delete globalThis[key];}});
 return {render,container,body:dom.window.document.body,reads};
}
const text=node=>node.textContent.replace(/[\s\u00a0\u202f]+/g,' ').trim();
const response=data=>({ok:true,json:async()=>data});
test('unspent top-up is visible and plan update refetches receipt and available balance',async t=>{
 let data=summary(1000);const ui=await mount(t,async()=>response(data));
 await ui.render({patientId:'patient',plans:[]});
 assert.match(text(ui.container),/Депозит1 000 ₸/);assert.doesNotMatch(text(ui.container),/Внесено|Использовано|Остаток депозита/);
 data=summary(1500,400);await ui.render({patientId:'patient',plans:[{id:'updated'}]});
 assert.doesNotMatch(text(ui.container),/Внесено|Использовано/);assert.match(text(ui.container),/Депозит1 100 ₸/);assert.equal(ui.reads.length,2);
});
test('switching patients cannot show a late balance from the previous patient',async t=>{
 let resolve;const late=new Promise(r=>resolve=r);
 const ui=await mount(t,async url=>url.includes('/first/')?late:response(summary(2000)));
 const plans=[];await ui.render({patientId:'first',plans});await ui.render({patientId:'second',plans});
 await act(async()=>resolve(response(summary(9999))));
 assert.match(text(ui.container),/2 000 ₸/);assert.doesNotMatch(text(ui.container),/9 999/);
});
test('failed or unknown funding does not invent a zero balance and retry reads again',async t=>{
 let fails=true;const ui=await mount(t,async()=>fails?{ok:false,status:409,json:async()=>({detail:'Invalid source'})}:response(summary(1000)));
 await ui.render({patientId:'patient',plans:[]});assert.match(text(ui.container),/Нет данных/);assert.match(text(ui.container),/Invalid source/);
 fails=false;await act(async()=>ui.container.querySelector('button').click());assert.match(text(ui.container),/1 000 ₸/);
});
for (const mode of ['PatientShell','AppointmentShell']) test(`${mode} shows source funds and refreshes plans on payment tab entry`,async t=>{
 const plan={id:'plan',title:'Fixture Plan',patient_id:'patient',total_cost:1000,paid_amount:0,accounting_events:[],services:[{service_id:'single',service_name:'Fixture Service',total_price:1000,payment_status:'unpaid'}]};
 let funds=summary(1000);
 const ui=await mount(t,async url=>response(url.endsWith('/funding-summary')?funds:url.endsWith('/treatment-plans')?[plan]:url.endsWith('/consultation')?null:[]));
 const props=mode==='PatientShell'?{show:true,editingItem:{id:'patient',full_name:'Fixture Patient'},patientForm:{full_name:'Fixture Patient'}}:{show:true,appointmentForm:{patient_id:'patient'},patients:[{id:'patient',full_name:'Fixture Patient'}],doctors:[],appointments:[],hideAddPlanForm:true};
 await ui.render(props,module.exports[mode]);
 const click=async label=>act(async()=>{const button=[...ui.body.querySelectorAll('button')].find(b=>b.textContent.trim()===label);assert.ok(button,label);button.click();});
 await click('Оплата');
 const totals=ui.body.querySelectorAll('.curai-r21-totals');
 assert.equal(totals.length,1,'Both shells use one summary');
 assert.equal(totals[0].querySelectorAll(':scope > div').length,4);
 assert.ok(totals[0].querySelector(':scope > .curai-r21-deposit'));
 assert.equal(text(totals[0].querySelector('[aria-label="Сумма депозита"]')),'1 000 ₸');
 assert.doesNotMatch(text(totals[0]),/Внесено|Использовано|Остаток депозита/);
 const before=ui.reads.filter(url=>url.endsWith('/treatment-plans')).length;
 await click(mode==='PatientShell'?'Информация':'Запись на прием');
 funds=summary(2000);await click('Оплата');
 assert.match(text(ui.body.querySelector('[aria-label="Сумма депозита"]')),/2 000 ₸/);
 assert.ok(ui.reads.filter(url=>url.endsWith('/treatment-plans')).length>before);
});

test('unknown deposit stays unknown; source warning survives while secondary metrics are hidden',async t=>{
 const ui=await mount(t,async()=>response({deposit_received_kzt:1000,deposit_used_kzt:null,deposit_available_kzt:null,advance_available_kzt:300,detail:'Source allocation needs review'}));
 await ui.render({patientId:'patient',plans:[]});
 assert.equal(text(ui.container.querySelector('[aria-label="Сумма депозита"]')),'Нет данных');
 assert.doesNotMatch(text(ui.container),/Внесено|Использовано|Остаток депозита|Аванс планов/);
 assert.equal(ui.container.querySelector('[role="status"]').textContent,'Source allocation needs review');
});
