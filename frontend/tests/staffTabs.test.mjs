import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act, useState } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { allPermissionKeys } from '../src/utils/permissions.js';

const bootstrap=new JSDOM('<html><body></body></html>');
globalThis.window=bootstrap.window;globalThis.document=bootstrap.window.document;
const {createRoot}=await import('react-dom/client');
delete globalThis.window;delete globalThis.document;bootstrap.window.close();
const compiled=await build({entryPoints:[fileURLToPath(new URL('../src/components/modals/StaffModal.jsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react-dom'],loader:{'.js':'jsx'},define:{'import.meta.env':'{}'}});
const module={exports:{}};
new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const StaffModal=module.exports.default;

async function mount(t,{doctor=false,creating=false}={}){
  const dom=new JSDOM('<div id="root"></div>',{url:'https://crm.test'});
  const keys=['window','document','IS_REACT_ACT_ENVIRONMENT'];
  const saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
  const root=createRoot(document.getElementById('root'));const calls=[];let form,setForm;
  const props={isOpen:true,editingItem:creating?null:{id:'first',type:doctor?'doctor':'staff',full_name:'Staff',specialty:'Dentist'},onClose(){},onSave:(e,data)=>calls.push(structuredClone(data)),onResetPassword:()=>{throw new Error('Unexpected password reset');}};
  function Harness(){[form,setForm]=useState({full_name:'Staff',email:'staff@example.test',login:'staff',phone:'555',role:doctor?'doctor':'admin',custom_permissions:[]});return React.createElement(StaffModal,{...props,staffForm:form,setStaffForm:setForm});}
  const render=async()=>act(async()=>root.render(React.createElement(Harness)));
  await render();
  t.after(async()=>{await act(async()=>root.unmount());dom.window.close();for(const [k,d]of saved){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
  const tab=name=>[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent.trim()===name);
  return {dom,tab,calls,props,render,setForm:value=>setForm(value),getForm:()=>form,panel:name=>document.querySelector(`[data-staff-tab="${name}"]`)};
}

test('profile and rights keep draft fields and permissions and submit one combined payload',async t=>{
  const h=await mount(t);
  assert.equal(h.panel('profile').hidden,false);assert.equal(h.panel('permissions').hidden,true);
  const name=h.panel('profile').querySelector('input[type=text]');
  await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(name,'Updated staff');name.dispatchEvent(new window.Event('input',{bubbles:true}));});
  assert.equal(h.getForm().full_name,'Updated staff');
  await act(async()=>h.tab('Права').click());
  assert.equal(h.calls.length,0);assert.equal(h.panel('profile').hidden,true);
  assert.ok(h.panel('permissions').querySelector('select'));
  await act(async()=>document.querySelector('input[name="calendar_view"]').click());
  await act(async()=>h.tab('Профиль').click());
  assert.equal(name.value,'Updated staff');
  await act(async()=>h.tab('Права').click());
  assert.equal(document.querySelector('input[name="calendar_view"]').checked,true);
  await act(async()=>document.querySelector('button[type=submit]').click());
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].full_name,'Updated staff');
  assert.deepEqual(h.calls[0].custom_permissions,['calendar_view']);
});
test('save reveals invalid fields on the other tab instead of submitting incomplete data',async t=>{
  const h=await mount(t);
  await act(async()=>h.setForm({...h.getForm(),full_name:''}));
  await act(async()=>h.tab('Права').click());
  await act(async()=>document.querySelector('button[type=submit]').click());
  assert.equal(h.calls.length,0);assert.equal(h.tab('Профиль').getAttribute('aria-selected'),'true');
  await act(async()=>h.setForm({...h.getForm(),full_name:'Staff',role:''}));
  await act(async()=>document.querySelector('button[type=submit]').click());
  assert.equal(h.calls.length,0);assert.equal(h.tab('Права').getAttribute('aria-selected'),'true');
});
test('doctor profile retains login and reset while rights stay separately editable',async t=>{
  const h=await mount(t,{doctor:true});
  assert.ok(h.panel('profile').querySelector('input[type=text]'));
  assert.equal(h.panel('permissions').querySelector('select'),null);
  await act(async()=>h.tab('Права').click());
  await act(async()=>document.querySelector('input[name="patients_view"]').click());
  assert.deepEqual(h.getForm().custom_permissions,['patients_view']);
  h.props.editingItem={...h.props.editingItem,id:'second'};await h.render();
  assert.equal(h.tab('Профиль').getAttribute('aria-selected'),'true');
  await act(async()=>h.tab('Права').click());h.props.isOpen=false;await h.render();h.props.isOpen=true;await h.render();
  assert.equal(h.tab('Профиль').getAttribute('aria-selected'),'true');
});
test('tabs support keyboard navigation without submitting the form',async t=>{
  const h=await mount(t);
  await act(async()=>h.tab('Профиль').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true})));
  assert.equal(h.tab('Права').getAttribute('aria-selected'),'true');assert.equal(document.activeElement,h.tab('Права'));
  await act(async()=>h.tab('Права').dispatchEvent(new window.KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true})));
  assert.equal(h.tab('Профиль').getAttribute('aria-selected'),'true');assert.equal(h.calls.length,0);
});
test('creating staff retains its single form with profile, role and password requirements',async t=>{
  const h=await mount(t,{creating:true});
  assert.equal(document.querySelectorAll('[role=tab]').length,0);
  assert.equal(h.panel('profile').hidden,false);assert.equal(h.panel('permissions').hidden,false);
  assert.equal(h.panel('profile').querySelector('input[type=password]').required,true);
  await act(async()=>document.querySelector('button[type=submit]').click());
  assert.equal(h.calls.length,0);
});
test('all production permission groups and granular selections survive tab changes and save',async t=>{
  const h=await mount(t);
  const selected=['doctors_create','patients_export','calendar_delete','payroll_view'];
  await act(async()=>h.setForm({...h.getForm(),permission_mode:'explicit',custom_permissions:selected}));
  await act(async()=>h.tab('Права').click());
  assert.deepEqual([...h.panel('permissions').querySelectorAll('input[type=checkbox]')].map(e=>e.name).sort(),[...allPermissionKeys].sort());
  assert.deepEqual([...h.panel('permissions').querySelectorAll('legend')].map(e=>e.textContent),['HMS','CRM','Склад','Финансы']);
  for(const key of selected)assert.equal(document.querySelector(`input[name="${key}"]`).checked,true);
  await act(async()=>{const role=h.panel('permissions').querySelector('select');role.value='marketer';role.dispatchEvent(new window.Event('change',{bubbles:true}));});
  await act(async()=>h.tab('Профиль').click());
  await act(async()=>document.querySelector('button[type=submit]').click());
  assert.deepEqual(h.calls[0].custom_permissions,selected);assert.equal(h.calls[0].permission_mode,'explicit');assert.equal(h.calls[0].role,'marketer');
});
