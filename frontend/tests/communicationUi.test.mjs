import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { clinicDate, appointmentStatusReason } from '../src/utils/appointmentStatus.js';
const boot=new JSDOM('<html><body></body></html>');globalThis.window=boot.window;globalThis.document=boot.window.document;
const {createRoot}=await import('react-dom/client');delete globalThis.window;delete globalThis.document;boot.window.close();
const compiled=await build({stdin:{contents:`import React from 'react';
 import Inbox from './src/components/crm/telephony/WhatsAppInbox.jsx';
 import Appointments from './src/components/crm/telephony/PatientAppointments.jsx';
 import Audio from './src/components/crm/telephony/WhatsAppAudio.jsx';
 import Notifications from './src/components/notifications/NotificationCenter.jsx';
 import Auth from './src/context/AuthContext.jsx';
 export function Harness({mode,props}){const [,update]=React.useState(0);globalThis.communicationFixture.refresh=()=>update(n=>n+1);const View={inbox:Inbox,appointments:Appointments,audio:Audio,notifications:Notifications}[mode];return <Auth.Provider value={{user:globalThis.communicationFixture.user}}><View {...props}/></Auth.Provider>}`,resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'jsx'},bundle:true,write:false,platform:'node',format:'cjs',external:['react','react-dom','react-dom/client'],loader:{'.js':'jsx','.css':'empty'},define:{'import.meta.env':'{"VITE_BACKEND_URL":"https://fixture.invalid"}'},plugins:[{name:'isolated-communication',setup(b){b.onResolve({filter:/\/api\/config$|\/context\/(AuthContext(\.jsx)?|ModalContext|NotificationContext)$/},args=>({path:args.path.includes('AuthContext')?'AuthContext':args.path,namespace:'boundary'}));b.onLoad({filter:/.*/,namespace:'boundary'},args=>({loader:'jsx',contents:args.path.includes('AuthContext')?"import React from 'react';export default React.createContext(null);":args.path.includes('ModalContext')?"export const useModal=()=>globalThis.communicationFixture.modals;":args.path.includes('NotificationContext')?"export const useNotifications=()=>globalThis.communicationFixture.notificationState;":"export const apiClient={get:(p,o)=>globalThis.communicationFixture.api('GET',p,o),post:(p,b)=>globalThis.communicationFixture.api('POST',p,b),patch:(p,b)=>globalThis.communicationFixture.api('PATCH',p,b)};export const API_BASE_URL='https://fixture.invalid/api';export const handleApiError=e=>e.response?.data?.detail||e.message;"}));}}]});
const loaded={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),loaded,loaded.exports);
const today=clinicDate(),tomorrow='2099-10-20';
const rows=()=>['unconfirmed','confirmed','arrived','in_progress','completed','confirmed'].map((status,i)=>({id:`visit-${i}`,patient_id:'patient',appointment_date:i===0||i===5?tomorrow:today,appointment_time:`${String(9+i).padStart(2,'0')}:00`,end_time:`${String(9+i).padStart(2,'0')}:30`,doctor_name:`Врач ${i}`,reason:`Компонент ${i}`,status,deal_id:i%2?'other-deal':'deal'}));
const context=()=>({lead_id:'deal',current_column_id:'new',current_label:'Новые',can_move:true,columns:[{id:'new',name:'Новые',is_system:true},{id:'closed',name:'Оплачено',is_system:true},{id:'custom_wait',name:'Ждём ответ',is_system:false,manual_move_allowed:true}]});
const patientChat={phone:'+70000000000',patient_id:'patient',patient_name:'Анна Демо',source:'patient'};
const leadChat={phone:'+70000000001',linked_lead_id:'lead',lead_name:'Лид Демо',source:'lead'};
const text=node=>node.textContent.replace(/[\s\u00a0\u202f]+/g,' ').trim();
async function mount(t,mode,props={},options={}){
 const dom=new JSDOM('<button id="opener">Открыть</button><div id="root"></div>',{url:'https://fixture.invalid'}),requests=[],opened=[],previous=new Map();
 const f={user:options.user||{role:'super_admin'},chats:[patientChat,leadChat],records:rows(),stage:context(),modals:{openModal:(type,props)=>opened.push({type,props}),closeModal(){}},...options};
 f.api=async(method,path,body)=>{requests.push({method,path,body});if(options.api){const result=await options.api(method,path,body,f);if(result!==undefined)return result;}
  if(method==='GET'&&path==='/wazzup/chats')return {data:{chats:f.chats}};
  if(method==='GET'&&path.startsWith('/wazzup/messages/history/'))return {data:{messages:options.messages||[]}};
  if(method==='GET'&&path==='/appointments'){if(body?.params?.patient_id)return {data:structuredClone(f.records)};return {data:[]};}
  if(method==='PATCH'&&path.startsWith('/appointments/')){const id=path.split('/')[2];f.records.find(r=>r.id===id).status=body.status;return {data:f.records.find(r=>r.id===id)};}
  if(method==='GET')return {data:[]};
  if(method==='POST'&&path.endsWith('/save-to-patient'))return {data:{success:true}};
  throw Error('Unapproved fixture command '+method+' '+path);
 };
 f.notificationState={isOpen:true,notifications:structuredClone(options.notifications||[]),unreadCount:(options.notifications||[]).filter(n=>!n.read).length,
   markAsRead:id=>{f.notificationState.notifications=f.notificationState.notifications.map(n=>n.id===id?{...n,read:true}:n);f.notificationState.unreadCount=f.notificationState.notifications.filter(n=>!n.read).length;f.refresh();},
   markAllAsRead:()=>{f.notificationState.notifications=f.notificationState.notifications.map(n=>({...n,read:true}));f.notificationState.unreadCount=0;f.refresh();},
   removeNotification:id=>{f.notificationState.notifications=f.notificationState.notifications.filter(n=>n.id!==id);f.notificationState.unreadCount=f.notificationState.notifications.filter(n=>!n.read).length;f.refresh();},
   clearAll:()=>{f.notificationState.notifications=[];f.notificationState.unreadCount=0;f.refresh();},closePanel:()=>{f.notificationState.isOpen=false;f.refresh();}};
 const globals={window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,communicationFixture:f,IS_REACT_ACT_ENVIRONMENT:true,alert(){},setInterval:()=>1,clearInterval(){},fetch:async(url,init={})=>{requests.push({method:init.method||'GET',path:String(url),body:init.body&&JSON.parse(init.body)});if(init.method==='PATCH'){f.stage.current_column_id=JSON.parse(init.body).column_id;}return {ok:true,json:async()=>structuredClone(f.stage)};}};
 for(const [key,value]of Object.entries(globals)){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 const root=createRoot(document.getElementById('root')),body=document.body;
 const render=async next=>act(async()=>root.render(React.createElement(loaded.exports.Harness,{mode,props:next||props})));
 t.after(async()=>{await act(async()=>root.unmount());dom.window.close();for(const [key,desc]of previous){if(desc)Object.defineProperty(globalThis,key,desc);else delete globalThis[key];}});
 document.getElementById('opener').focus();await render();
 return {f,requests,opened,body,render,dom,click:async element=>{assert.ok(element);await act(async()=>element.click());},button:label=>[...body.querySelectorAll('button')].find(b=>text(b)===label)};
}
test('clinic date handles Bishkek midnight and future confirmation stays available',()=>{
 assert.equal(clinicDate(new Date('2026-10-18T20:00:00Z')),'2026-10-19');
 for(const status of ['arrived','in_progress','completed','no_show'])assert.ok(appointmentStatusReason({appointment_date:tomorrow},status));
 assert.equal(appointmentStatusReason({appointment_date:tomorrow},'confirmed'),'');
});
test('WhatsApp has three filters, real patient link, independent appointments and custom-stage action',async t=>{
 const ui=await mount(t,'inbox',{isOpen:true,onClose(){}});
 assert.ok(ui.button('Все'));assert.ok(ui.button('Лиды'));assert.ok(ui.button('Пациенты'));assert.equal(ui.button('Чаты'),undefined);
 await ui.click(ui.button('Анна ДемоПациент'));
 await ui.click(ui.body.querySelector('.curai-patient-link'));assert.equal(ui.opened[0].type,'patient');assert.equal(ui.opened[0].props.editingItem.id,'patient');
 assert.ok(ui.button('Приёмы · 6'));assert.ok(ui.button('Этап сделки'));assert.equal(ui.button('Карточка пациента'),undefined);
 await ui.click(ui.button('Этап сделки'));assert.ok(ui.button('Ждём ответ'));assert.equal(ui.body.querySelector('[role="menu"] [disabled]'),null);
 await ui.click(ui.button('Ждём ответ'));const patch=ui.requests.find(r=>r.method==='PATCH');assert.equal(patch.body.lead_id,'deal');assert.equal(patch.body.column_id,'custom_wait');
 assert.equal(ui.requests.some(r=>r.path.includes('/messages/send')),false);
});
test('all patient visits span deals and statuses, future attendance is disabled, selected record alone changes',async t=>{
 const ui=await mount(t,'appointments',{patientId:'patient',patientName:'Анна'});
 await ui.click(ui.button('Приёмы · 6'));assert.equal(ui.body.querySelectorAll('tbody tr').length,6);
 const read=ui.requests.find(r=>r.path==='/appointments');assert.deepEqual(read.body,{params:{patient_id:'patient'}});
 const rows=[...ui.body.querySelectorAll('tbody tr')];assert.equal(rows[5].querySelector('td:last-child button').disabled,true);
 await ui.click(rows[1].querySelector('td:last-child button'));const writes=ui.requests.filter(r=>r.method==='PATCH');assert.equal(writes.length,1);assert.equal(writes[0].path,'/appointments/visit-1/status');assert.equal(writes[0].body.status,'arrived');assert.equal(ui.f.records[0].status,'unconfirmed');
});
test('calendar permissions keep visit actions disabled for a read-only user',async t=>{
 const ui=await mount(t,'appointments',{patientId:'patient',patientName:'Анна'},{user:{role:'doctor',permissions:[]}});
 await ui.click(ui.button('Приёмы · 6'));assert.ok([...ui.body.querySelectorAll('tbody button')].every(b=>b.disabled));assert.equal(ui.requests.some(r=>r.method==='PATCH'),false);
});
test('a failed status request keeps the original status, shows detail and blocks double submit',async t=>{
 const ui=await mount(t,'appointments',{patientId:'patient',patientName:'Анна'},{api:async(method)=>{if(method==='PATCH')throw {response:{data:{detail:'Fixture status conflict'}}};}});
 await ui.click(ui.button('Приёмы · 6'));
 const target=ui.body.querySelectorAll('tbody tr')[1].querySelector('td:last-child button');
 await act(async()=>{target.click();target.click();});
 assert.equal(ui.requests.filter(r=>r.method==='PATCH').length,1);assert.equal(ui.f.records[1].status,'confirmed');assert.match(text(ui.body),/Fixture status conflict/);
});
test('a late response from a previous patient cannot replace the current appointment list',async t=>{
 let resolve;const late=new Promise(r=>resolve=r);
 const ui=await mount(t,'appointments',{patientId:'patient',patientName:'Анна'},{api:async(method,path,body)=>method==='GET'&&path==='/appointments'?(body.params.patient_id==='patient'?late:{data:[{...rows()[0],id:'second-visit',patient_id:'second',doctor_name:'Second patient doctor'}]}):undefined});
 await ui.render({patientId:'second',patientName:'Другой'});
 await act(async()=>resolve({data:rows()}));await ui.click(ui.button('Приёмы · 1'));
 assert.match(text(ui.body),/Second patient doctor/);assert.doesNotMatch(text(ui.body),/Врач 0/);
});
test('incoming document has a save caption and audio never gets a save action',async t=>{
 const ui=await mount(t,'inbox',{isOpen:true,onClose(){}},{messages:[{id:'doc',message_type:'document',media_url:'/doc.pdf',metadata:{filename:'document.pdf'},direction:'incoming'},{id:'audio',message_type:'audio',media_url:'/sound.wav',direction:'incoming'}]});
 await ui.click([...ui.body.querySelectorAll('.curai-chat-sidebar button')].find(b=>b.textContent.includes('Анна Демо')));
 assert.equal([...ui.body.querySelectorAll('button')].filter(b=>text(b)==='Сохранить в карточке').length,1);
 assert.ok(ui.body.querySelector('.curai-save-icon'));await ui.click(ui.button('Сохранить в карточке'));
 assert.equal(ui.requests.filter(r=>r.method==='POST')[0].path,'/wazzup/messages/doc/save-to-patient');
 assert.equal(ui.requests.some(r=>r.path.includes('/messages/send')),false);
});
test('no patient produces neither a false link nor a zero count',async t=>{
 const ui=await mount(t,'inbox',{isOpen:true,onClose(){}});await ui.click([...ui.body.querySelectorAll('.curai-chat-sidebar button')].find(b=>b.textContent.includes('Лид Демо')));
 assert.equal(ui.body.querySelector('.curai-patient-link'),null);assert.equal(ui.button('Приёмы').disabled,true);assert.equal(ui.button('Приёмы · 0'),undefined);
});
test('notification actions preserve read/delete separation, explicit date, empty state and focus restore',async t=>{
 const ui=await mount(t,'notifications',{}, {notifications:[{id:'one',type:'info',title:'Новая карточка CRM',message:'Анна Демо',timestamp:'2026-10-19T04:42:00Z',read:false},{id:'two',type:'info',title:'Новая карточка CRM',message:'Другой контакт',timestamp:'2026-10-18T04:42:00Z',read:true}]});
 assert.match(text(ui.body),/10:42/);assert.ok(ui.button('Отметить всё'));
 await ui.click(ui.body.querySelector('.curai-notification-summary'));assert.equal(ui.f.notificationState.unreadCount,0);assert.equal(ui.f.notificationState.notifications.length,2);
 await ui.click(ui.body.querySelector('.curai-notification-delete'));assert.equal(ui.f.notificationState.notifications.length,1);
 await ui.click(ui.button('Очистить'));assert.match(text(ui.body),/Нет уведомлений/);assert.equal(ui.button('Отметить всё'),undefined);
 await act(async()=>ui.dom.window.document.dispatchEvent(new ui.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(ui.body.querySelector('[role="dialog"]'),null);assert.equal(ui.dom.window.document.activeElement.id,'opener');
});
test('audio preserves HTMLAudioElement play/pause, timeline and preload none without adding recording',async t=>{
 const ui=await mount(t,'audio',{src:'/fixture.wav'});const audio=ui.body.querySelector('audio');assert.equal(audio.preload,'none');assert.equal(audio.autoplay,false);
 let paused=true;Object.defineProperty(audio,'paused',{get:()=>paused});Object.defineProperty(audio,'duration',{get:()=>34});
 audio.play=async()=>{paused=false;audio.dispatchEvent(new ui.dom.window.Event('play'));};audio.pause=()=>{paused=true;audio.dispatchEvent(new ui.dom.window.Event('pause'));};
 await act(async()=>audio.dispatchEvent(new ui.dom.window.Event('loadedmetadata')));await ui.click(ui.body.querySelector('.curai-whatsapp-audio button'));assert.equal(ui.body.querySelector('.curai-whatsapp-audio button').getAttribute('aria-label'),'Приостановить аудио');
 audio.currentTime=13;await act(async()=>audio.dispatchEvent(new ui.dom.window.Event('timeupdate')));assert.match(text(ui.body),/0:13/);assert.match(text(ui.body),/0:34/);
 await ui.click(ui.body.querySelector('.curai-whatsapp-audio button'));assert.equal(ui.body.querySelector('.curai-whatsapp-audio button').getAttribute('aria-label'),'Воспроизвести аудио');assert.equal(ui.body.querySelectorAll('.curai-whatsapp-audio button').length,1);
});
