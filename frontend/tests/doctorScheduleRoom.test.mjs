import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { scheduleErrorMessage } from '../src/components/doctors/scheduleValidation.js';
const bootstrap=new JSDOM('<html><body></body></html>');globalThis.window=bootstrap.window;globalThis.document=bootstrap.window.document;
const {createRoot}=await import('react-dom/client');delete globalThis.window;delete globalThis.document;bootstrap.window.close();
const compiled=await build({entryPoints:[fileURLToPath(new URL('../src/components/doctors/DoctorSchedule.js',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react-dom'],loader:{'.js':'jsx'},define:{'import.meta.env':'{"VITE_BACKEND_URL":"https://fixture.invalid"}'}});
const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
async function mount(t,writeError){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid'}),previous=new Map(),writes=[],timers=[];
 const globals={window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true,fetch:async(url,options={})=>{
   if(options.method==='POST'){writes.push(JSON.parse(options.body));return{ok:!writeError,json:async()=>writeError?{detail:writeError}:{}};}
   return{ok:true,json:async()=>String(url).includes('check-room-availability')?{is_available:true,conflicts:[]}:String(url).endsWith('/rooms')?[{id:'room',name:'Fixture room'}]:[]};
 },setTimeout:(fn,ms)=>{const id=setTimeoutNative(fn,ms);timers.push(id);return id;}};
 const setTimeoutNative=globalThis.setTimeout;
 for(const[k,v]of Object.entries(globals)){previous.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v});}
 const root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(module.exports.default,{doctors:[{id:'doctor',is_active:true,full_name:'Fixture doctor'}],canEdit:true,user:{}})));
 t.after(async()=>{await act(async()=>root.unmount());timers.forEach(clearTimeout);dom.window.close();for(const[k,d]of previous){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
 const button=label=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===label);
 return {writes,button,click:async(label)=>{const b=button(label);assert.ok(b,label);await act(async()=>b.click());},select:async(el,value)=>act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));})};
}
test('single-day creation blocks a missing room inline, then sends the selected room',async t=>{
 const ui=await mount(t);await ui.click('+ График врача');await ui.select(document.querySelector('[role="dialog"] select'),'doctor');
 await ui.click('Добавить');assert.equal(ui.writes.length,0);assert.match(document.querySelector('#doctor-schedule-room-error').textContent,/Выберите кабинет/);
 const room=document.querySelector('#doctor-schedule-room');assert.ok(room.required);await ui.select(room,'room');await ui.click('Добавить');assert.equal(ui.writes.length,1);assert.equal(ui.writes[0].room_id,'room');
});
test('weekly creation blocks all days without a room, then includes one for every selected day',async t=>{
 const ui=await mount(t);await ui.click('📅 На неделю');await ui.select(document.querySelector('[role="dialog"] select'),'doctor');await ui.click('Пн-Пт');await ui.click('Сохранить (5 дн.)');
 assert.equal(ui.writes.length,0);assert.match(document.querySelector('#doctor-week-room-error').textContent,/Выберите кабинет/);
 await ui.select(document.querySelector('select[aria-label="Кабинет/кресло"]'),'room');await ui.click('Сохранить (5 дн.)');assert.equal(ui.writes.length,5);assert.deepEqual(ui.writes.map(w=>w.day_of_week),[0,1,2,3,4]);assert.ok(ui.writes.every(w=>w.room_id==='room'));
});
test('structured validation errors stay readable in the open creation dialog',async t=>{
 const ui=await mount(t,[{loc:['body','room_id'],msg:'Выберите действующий кабинет'}]);await ui.click('+ График врача');await ui.select(document.querySelector('[role="dialog"] select'),'doctor');await ui.select(document.querySelector('#doctor-schedule-room'),'room');await ui.click('Добавить');
 assert.match(document.querySelector('[role="dialog"]').textContent,/Выберите действующий кабинет/);assert.doesNotMatch(document.body.textContent,/\[object Object\]/);
});
test('error formatter supports FastAPI arrays and nested details',()=>{
 assert.equal(scheduleErrorMessage([{msg:'First'},{detail:{message:'Second'}}]),'First; Second');assert.equal(scheduleErrorMessage({unexpected:true}),'');
});
