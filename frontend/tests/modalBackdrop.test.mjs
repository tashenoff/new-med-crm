import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const boot=new JSDOM('<html><body></body></html>');globalThis.window=boot.window;globalThis.document=boot.window.document;
const {createRoot}=await import('react-dom/client');delete globalThis.window;delete globalThis.document;boot.window.close();
const compiled=await build({stdin:{contents:"export { default as Modal } from './src/components/modals/Modal.js';",resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'jsx'},bundle:true,write:false,platform:'node',format:'cjs',external:['react','react-dom'],loader:{'.js':'jsx'}});
const loaded={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),loaded,loaded.exports);const {Modal}=loaded.exports;

async function mount(t,content){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid'}),previous=new Map();
 for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true})){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 const root=createRoot(document.getElementById('root'));await act(async()=>root.render(content));
 t.after(async()=>{await act(async()=>root.unmount());dom.window.close();for(const[key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}});
 return {document:dom.window.document,window:dom.window,click:async node=>{assert.ok(node);await act(async()=>node.click());}};
}

for(const [name,className]of [['patient','curai-patient-dialog'],['appointment','curai-patient-dialog curai-appointment-dialog']]){
 test(`${name} shared dialog keeps opaque sections and existing close actions in its own scrim layer`,async t=>{
  let closes=0,actions=0;
  const ui=await mount(t,React.createElement(Modal,{show:true,onClose:()=>closes++,title:name,className,
   subheader:React.createElement('nav',{'data-part':'tabs'},'Tabs'),footer:React.createElement('button',{'data-part':'footer'},'Save')},React.createElement('button',{'data-part':'body',onClick:()=>actions++},'Body action')));
  const dialog=ui.document.querySelector('[role="dialog"]'),layer=dialog.parentElement;
  assert.ok(layer.classList.contains('curai-glass-modal-layer'));assert.equal(layer.parentElement,ui.document.body);
  assert.ok(dialog.querySelector(':scope > .curai-glass-header'));
  for(const part of ['tabs','body','footer']){const node=dialog.querySelector(`[data-part="${part}"]`);assert.ok(node.closest('.curai-glass-body'));assert.equal(node.closest('.curai-glass-header'),null);}
  await ui.click(dialog.querySelector('[data-part="body"]'));assert.equal(actions,1);assert.equal(closes,0);
  await ui.click(layer.querySelector('.modal-overlay'));assert.equal(closes,1);
  await ui.click(dialog.querySelector('.curai-dialog-close'));assert.equal(closes,2);
  await act(async()=>ui.document.dispatchEvent(new ui.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(closes,3);
 });
}

test('nested dialogs keep separate portal scrim layers and close buttons do not close the parent',async t=>{
 let outer=0,inner=0;
 const ui=await mount(t,React.createElement(React.Fragment,null,
  React.createElement(Modal,{show:true,title:'Parent',onClose:()=>outer++},'Opaque parent body'),
  React.createElement(Modal,{show:true,title:'Child',onClose:()=>inner++},'Opaque child body')));
 const layers=[...ui.document.querySelectorAll('.modal-wrapper.curai-glass-modal-layer')];assert.equal(layers.length,2);
 assert.ok(layers.every(layer=>layer.parentElement===ui.document.body));
 await ui.click(layers[1].querySelector('.curai-dialog-close'));assert.equal(inner,1);assert.equal(outer,0);
 await ui.click(layers[1].querySelector('.modal-overlay'));assert.equal(inner,2);assert.equal(outer,0);
});
