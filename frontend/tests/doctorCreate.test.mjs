import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import React,{act} from 'react';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {formatDoctorError} from '../src/utils/doctorErrors.js';
import {initializeDoctorForm,buildDoctorPayload} from '../src/utils/doctorCompensation.js';

test('doctor errors preserve useful messages and field locations, never raw inputs or object coercion',()=>{
 assert.equal(formatDoctorError({response:{data:{detail:[{loc:['body','phone'],msg:'Value error, Phone number must contain at least 7 digits',input:'private-phone',ctx:{error:{}}}]}}}),'Телефон: Укажите не менее 7 цифр.');
 assert.equal(formatDoctorError({detail:{message:'Doctor already exists'}}),'Doctor already exists');
 assert.equal(formatDoctorError({detail:[{loc:['body','services',0,'commission_value'],msg:'must be between 0 and 100'},{loc:['body','consultation_compensation_mode'],msg:'Field required'}]}),'Услуги → 1 → Комиссия услуги: must be between 0 and 100; Оплата консультаций: Обязательное поле.');
 assert.equal(formatDoctorError({detail:{phone:['Invalid number']}}),'Телефон: Invalid number');
 assert.equal(formatDoctorError(new Error('Network Error')),'Network Error');
 for(const value of [{detail:{code:422,input:'private'}},{detail:[]},null,'[object Object]'])assert.equal(formatDoctorError(value,'Не удалось создать врача'),'Не удалось создать врача');
});

for(const phone of ['+','+7','123456','+7abcdefg'])test(`incomplete or invalid optional phone is rejected before API: ${phone}`,()=>{
 assert.throws(()=>buildDoctorPayload({...initializeDoctorForm(),full_name:'Fixture Doctor',phone,consultation_compensation_mode:'none'}),/Телефон/);
});
for(const phone of ['',null,'1234567','+77012345678','+996700123456'])test(`valid optional phone and commissions remain valid: ${phone}`,()=>{
 const result=buildDoctorPayload({...initializeDoctorForm(),full_name:'Fixture Doctor',phone,consultation_compensation_mode:'none'});
 assert.equal(result.phone,phone||null);
});

const bootstrap=new JSDOM('<html><body></body></html>');globalThis.window=bootstrap.window;globalThis.document=bootstrap.window.document;
const {createRoot}=await import('react-dom/client');delete globalThis.window;delete globalThis.document;bootstrap.window.close();
const compiled=await build({stdin:{contents:`import React from 'react';
import Page from './src/pages/DoctorsPage.jsx';
import DoctorModal from './src/components/modals/DoctorModal.js';
import {ModalProvider,useModal} from './src/context/ModalContext.jsx';
function Window(){const {isModalOpen,getModalProps,closeModal}=useModal();return <DoctorModal show={isModalOpen('doctor')} onClose={()=>closeModal('doctor')} {...getModalProps('doctor')}/>;}
export default function Harness(){return <ModalProvider><Page user={{role:'admin', permissions:['crm_view','crm_edit','crm_delete','patients_view','patients_edit','patients_export','calendar_view','calendar_edit','calendar_delete','directory_view','directory_edit','directory_delete','warehouse_view','warehouse_edit','warehouse_delete','warehouse_export','finance_view','finance_edit','doctors_view','doctors_edit','doctors_delete','payroll_view']}}/><Window/></ModalProvider>;}`,resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'jsx'},bundle:true,write:false,platform:'node',format:'cjs',loader:{'.js':'jsx'},external:['react','react-dom','react-dom/client'],define:{'import.meta.env':'{"VITE_BACKEND_URL":"https://fixture.invalid"}'},plugins:[{name:'doctor-creation-fixture',setup(b){
 b.onResolve({filter:/^axios$|\/(useGlobalRefresh|DoctorsView|DoctorCashbackWidget)$/},args=>({path:args.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'jsx',contents:args.path==='axios'?'export default {get:(...args)=>globalThis.doctorCreateFixture.get(...args),post:(...args)=>globalThis.doctorCreateFixture.post(...args),put:(...args)=>globalThis.doctorCreateFixture.put(...args)};':args.path.endsWith('/useGlobalRefresh')?'export const useGlobalRefresh=()=>({refreshTriggers:{},refreshDoctors:()=>globalThis.doctorCreateFixture.refreshes++});':args.path.endsWith('/DoctorsView')?'import React from "react"; export default props=><button onClick={props.onAddDoctor}>Добавить врача</button>;':'export default ()=>null;'}));
}}]});
const mod={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);const Harness=mod.exports.default;

async function mount(t,respond){
 const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'https://fixture.invalid'}),previous=new Map(),posts=[];
 const originalLog=console.log,originalError=console.error;console.log=()=>{};console.error=()=>{};
 const fixture={refreshes:0,get:async()=>({data:[]}),put:()=>{throw Error('Unexpected update');},post:async(url,payload,options)=>{assert.equal(url,'https://fixture.invalid/api/doctors');posts.push(structuredClone(payload));return respond(payload,options);}};
 const globals={window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true,doctorCreateFixture:fixture,fetch:async url=>({ok:true,json:async()=>String(url).endsWith('/specialties')?[{id:'specialty',name:'Therapy'}]:[{id:'service',service_name:'Fixture Service',category:'Therapy',price:10000}]})};
 for(const [key,value]of Object.entries(globals)){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 const root=createRoot(document.getElementById('root'));
 t.after(async()=>{await act(async()=>root.unmount());dom.window.close();for(const [key,p]of previous){if(p)Object.defineProperty(globalThis,key,p);else delete globalThis[key];}console.log=originalLog;console.error=originalError;});
 await act(async()=>root.render(React.createElement(Harness)));
 const click=async e=>act(async()=>{assert.ok(e);e.click();});
 await click([...document.querySelectorAll('button')].find(b=>b.textContent==='Добавить врача'));
 const change=async(e,value)=>act(async()=>{assert.ok(e);const prototype=e.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(e,value);e.dispatchEvent(new dom.window.Event('input',{bubbles:true}));e.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
 const submit=async()=>act(async()=>document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
 return {body:document.body,posts,fixture,click,change,submit};
}

for(const individual of [false,true])test(`${individual?'individual':'general'} creation preserves entered fields after structured 422, retries and closes only on success`,async t=>{
 let attempt=0;const ui=await mount(t,async payload=>{if(++attempt===1)throw {response:{status:422,data:{detail:[{loc:['body','phone'],msg:'Phone number must contain at least 7 digits'}]}}};return {data:{id:'fixture-doctor',...payload}};});
 await ui.change(ui.body.querySelector('[placeholder="Полное имя *"]'),'Fixture Doctor');await ui.change(ui.body.querySelector('[type="tel"]'),'+77012345678');await ui.change(ui.body.querySelector('[name="consultation_compensation_mode"]'),'none');
 await ui.click(ui.body.querySelector('.curai-doctor-specialties input[type="checkbox"]'));
 if(individual){await ui.change(ui.body.querySelector('[name="paymentMode"]'),'individual');await ui.click(ui.body.querySelector('.curai-doctor-service-label input'));await ui.change(ui.body.querySelector('[aria-label="Комиссия Fixture Service"]'),'fixed');await ui.change(ui.body.querySelector('[aria-label="Значение комиссии Fixture Service"]'),'2500');}
 await ui.submit();assert.equal(ui.posts.length,1);assert.ok(ui.body.querySelector('[role="dialog"]'));assert.match(ui.body.querySelector('[role="dialog"]').textContent,/Телефон: Укажите не менее 7 цифр/);assert.doesNotMatch(ui.body.textContent,/\[object Object\]/);
 assert.equal(ui.body.querySelector('[placeholder="Полное имя *"]').value,'Fixture Doctor');assert.equal(ui.body.querySelector('[type="tel"]').value,'+77012345678');assert.equal(ui.body.querySelector('[name="consultation_compensation_mode"]').value,'none');
 if(individual){assert.equal(ui.body.querySelector('[aria-label="Значение комиссии Fixture Service"]').value,'2500');assert.equal(ui.body.querySelector('[name="paymentMode"]').value,'individual');}
 await ui.submit();assert.equal(ui.posts.length,2);assert.deepEqual(ui.posts[1],ui.posts[0]);assert.equal(ui.body.querySelector('[role="dialog"]'),null);assert.equal(ui.fixture.refreshes,1);
});
test('pending create is disabled and duplicate submit cannot create twice',async t=>{
 let resolve;const pending=new Promise(r=>resolve=r);const ui=await mount(t,()=>pending);
 await ui.change(ui.body.querySelector('[placeholder="Полное имя *"]'),'Fixture Doctor');await ui.change(ui.body.querySelector('[name="consultation_compensation_mode"]'),'none');await ui.submit();await ui.submit();
 assert.equal(ui.posts.length,1);assert.equal(ui.body.querySelector('button[type="submit"]').disabled,true);assert.match(ui.body.querySelector('button[type="submit"]').textContent,/Сохранение/);await act(async()=>resolve({data:{id:'fixture-doctor'}}));assert.equal(ui.body.querySelector('[role="dialog"]'),null);
});
test('incomplete phone stays in the form and never reaches create API',async t=>{
 const ui=await mount(t,()=>{throw Error('Invalid form must not post');});await ui.change(ui.body.querySelector('[placeholder="Полное имя *"]'),'Fixture Doctor');await ui.change(ui.body.querySelector('[name="consultation_compensation_mode"]'),'none');await ui.change(ui.body.querySelector('[type="tel"]'),'+7');await ui.submit();
 assert.equal(ui.posts.length,0);assert.equal(ui.body.querySelector('[type="tel"]').value,'+7');assert.match(ui.body.querySelector('[role="alert"]').textContent,/Телефон.*7 цифр/);
});
