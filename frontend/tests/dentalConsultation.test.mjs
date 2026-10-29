import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { dentalTotal } from '../src/utils/dentalService.js';

const bootstrap = new JSDOM('<html><body></body></html>');
globalThis.window = bootstrap.window; globalThis.document = bootstrap.window.document;
const { createRoot } = await import('react-dom/client');
delete globalThis.window; delete globalThis.document; bootstrap.window.close();
const compiled = await build({ stdin: { contents: `export {default as Picker} from './src/components/consultations/ServiceCheckboxSelector.jsx';export {default as Form} from './src/components/consultations/ConsultationSheetForm.jsx';export {default as Legacy} from './src/components/treatment/ServiceSelector.js';`, resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'jsx' }, bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom'], loader: { '.js': 'jsx' }, define: { 'import.meta.env': '{"VITE_BACKEND_URL":"https://synthetic.test"}' } });
const loaded = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), loaded, loaded.exports);
const { Picker, Form, Legacy } = loaded.exports;
const dental = {id:'dental',service_name:'Synthetic dental',category:'Synthetic',unit:'зуб',price:1000};
const regular = {id:'regular',service_name:'Synthetic regular',category:'Synthetic',unit:'процедура',price:100};
const text = node => node.textContent.replace(/\s+/g, ' ').trim();
const button = label => [...document.querySelectorAll('button')].find(node => text(node) === label);
const tooth = number => [...document.querySelectorAll('button')].find(node => node.textContent === String(number));

async function mount(t, Component, props = {}) {
  const dom = new JSDOM('<div id="root"></div>', {url:'https://synthetic.test'}), previous = new Map();
  const globals = {window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true,alert(){},fetch:async(url, options = {}) => {
    assert.equal(options.method || 'GET', 'GET', 'Unexpected API write');
    const data = String(url).includes('/service-categories') ? [{name:'Synthetic'}] : String(url).includes('/service-prices?') ? [dental,regular] : [{id:'doctor',full_name:'Synthetic Doctor'}];
    return {ok:true,json:async()=>data};
  }};
  for (const [key,value] of Object.entries(globals)) {previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
  const root = createRoot(document.getElementById('root'));
  const render = async (next, key) => act(async()=>root.render(React.createElement(Component,{...next,key})));
  await render(props);
  t.after(async()=>{await act(async()=>root.unmount());dom.window.close();for(const[key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
  return {render,click:async node=>{assert.ok(node);await act(async()=>node.click());},change:async(node,value)=>{assert.ok(node);await act(async()=>{const proto=node.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(node,String(value));node.dispatchEvent(new window.Event('input',{bubbles:true}));node.dispatchEvent(new window.Event('change',{bubbles:true}));});}};
}

test('consultation picker selects and deselects teeth, blocks empty selection and applies discount', async t => {
  assert.equal(dentalTotal(1.005, ['11']), 1.01);
  const added=[]; const ui=await mount(t,Picker,{onAddServices:rows=>added.push(...rows)});
  await ui.click(document.querySelector('input[type=checkbox]'));
  assert.equal([...document.querySelectorAll('button')].filter(node=>/^\d{2}$/.test(node.textContent)).length,32);
  assert.equal(button('Добавить 1').disabled,true);
  await ui.click(tooth(11));await ui.click(tooth(21));await ui.click(tooth(11));
  assert.equal(tooth(11).getAttribute('aria-pressed'),'false');
  assert.equal(document.querySelector('[aria-label="Количество: Synthetic dental"]').value,'1');
  await ui.click(tooth(11));await ui.change(document.querySelector('[aria-label="Скидка (%): Synthetic dental"]'),10);
  await ui.click(button('Добавить 1'));
  assert.deepEqual(added[0].teeth_numbers,['21','11']);assert.equal(added[0].quantity,2);
  assert.equal(added[0].total_price,1800);assert.equal(added[0].unit,'зуб');assert.equal(added[0].discount,10);
});

test('ordinary services retain manual quantities and no dental controls', async t => {
  const added=[];const ui=await mount(t,Picker,{onAddServices:rows=>added.push(...rows)});
  await ui.click(document.querySelectorAll('input[type=checkbox]')[1]);
  assert.equal(tooth(11),undefined);
  await ui.change(document.querySelector('[aria-label="Количество: Synthetic regular"]'),3);
  await ui.click(button('Добавить 1'));
  assert.equal(added[0].quantity,3);assert.equal(added[0].total_price,300);assert.equal(added[0].teeth_numbers,undefined);
});

test('saved consultation reopens selected teeth, edits totals and blocks saving an empty chart', async t => {
  const saved=[];
  const sheet={doctor_id:'doctor',treatment_services:[{service_id:'dental',service_name:dental.service_name,unit:'зуб',teeth_numbers:['11','21'],quantity:2,price_per_unit:1000,total_price:1800,discount:10}]};
  const props={patientId:'synthetic-patient',editingSheet:sheet,onSave:form=>saved.push(structuredClone(form)),onCancel(){}};
  const ui=await mount(t,Form,props);
  assert.match(document.body.textContent,/Зубы: 11, 21/);
  assert.equal(tooth(11).getAttribute('aria-pressed'),'true');
  assert.equal(document.querySelector('[aria-label="Количество: Synthetic dental"]').disabled,true);
  // Removing a summary chip must not submit the surrounding consultation form.
  await ui.click(document.querySelector('button[title="Убрать зуб"]'));
  assert.equal(saved.length,0);
  await ui.click(tooth(21));
  await act(async()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(saved.length,0);assert.match(document.body.textContent,/Выберите хотя бы один зуб/);
  await ui.click(tooth(11));await ui.click(tooth(21));await ui.click(tooth(31));
  await ui.change(document.querySelector('[aria-label="Скидка (%): Synthetic dental"]'),20);
  await act(async()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(saved[0].treatment_services[0].quantity,3);assert.equal(saved[0].treatment_services[0].total_price,2400);
  assert.deepEqual(saved[0].treatment_services[0].teeth_numbers,['11','21','31']);
  await ui.render({...props,editingSheet:saved[0]},'reopened');
  assert.equal(tooth(31).getAttribute('aria-pressed'),'true');assert.match(document.body.textContent,/Зубы: 11, 21, 31/);
});

test('current consultation form adds dental services through its real picker', async t => {
  const ui=await mount(t,Form,{patientId:'synthetic-patient',onSave(){},onCancel(){}});
  await ui.click(button('+ Выбрать услуги'));
  await ui.click(document.querySelector('.curai-clinical-service-selector input[type=checkbox]'));
  await ui.click(tooth(11));await ui.click(tooth(21));await ui.click(button('Добавить 1'));
  assert.match(document.querySelector('.curai-consultation-selected-services').textContent,/Зубы: 11, 21/);
  assert.equal(document.querySelector('.curai-clinical-service-dialog'),null);
});

test('legacy service selector still returns teeth, quantity and discounted price', async t => {
  const added=[];const ui=await mount(t,Legacy,{onServiceAdd:row=>added.push(row)});
  await ui.change(document.querySelectorAll('select')[0],'Synthetic');await ui.change(document.querySelectorAll('select')[1],'dental');
  await ui.click(tooth(11));await ui.click(tooth(21));await ui.change(document.querySelectorAll('input[type=number]')[1],10);
  await ui.click(button('Добавить в план'));
  assert.deepEqual(added[0].teeth_numbers,['11','21']);assert.equal(added[0].quantity,2);assert.equal(added[0].total_price,1800);
});
