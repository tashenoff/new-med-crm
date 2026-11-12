import test from 'node:test';
import assert from 'node:assert/strict';
import React, {act} from 'react';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const boot=new JSDOM('<body/>');globalThis.window=boot.window;globalThis.document=boot.window.document;
const {createRoot}=await import('react-dom/client');delete globalThis.window;delete globalThis.document;boot.window.close();
const result=await build({entryPoints:[fileURLToPath(new URL('../src/components/crm/tasks/TaskContactPicker.jsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['react'],plugins:[{name:'api',setup(b){b.onResolve({filter:/api\/config$/},()=>({path:'api',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const apiClient={get:(...args)=>globalThis.contactApi(...args)};export const handleApiError=e=>e.message;'}));}}]});
const m={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
async function mount(t,api,props={}){
 const dom=new JSDOM('<div id="root"></div>'),saved=new Map(),calls=[],selected=[];
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true,contactApi:(...args)=>{calls.push(args);return api(...args)}})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 const root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(m.exports.default,{value:null,onChange:c=>selected.push(c),...props})));
 t.after(async()=>{await act(async()=>root.unmount());dom.window.close();for(const[k,d]of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k];});
 return {calls,selected,root,dom,type:async value=>act(async()=>{const el=document.querySelector('input');Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));}),wait:()=>act(async()=>new Promise(r=>setTimeout(r,350)))};
}
test('no empty lookup, debounces unified source and keyboard selects typed identity',async t=>{
 const h=await mount(t,async()=>({data:{contacts:[{id:'patient:p',name:'Same name',source:'patient',phone:'123'},{id:'lead:l',name:'Same name',source:'lead',phone:'123'}]}}));
 await h.wait();assert.equal(h.calls.length,0);await h.type('S');await h.wait();assert.equal(h.calls.length,0);
 await h.type('Sa');await h.type('Same');await h.wait();assert.equal(h.calls.length,1);assert.equal(h.calls[0][0],'/crm/tasks/contacts');assert.deepEqual(h.calls[0][1].params,{q:'Same',limit:20});assert.equal(document.querySelectorAll('[role=option]').length,2);
 const input=document.querySelector('input');await act(async()=>input.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));await act(async()=>input.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));await act(async()=>input.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));
 assert.equal(h.selected[0].id,'lead:l');
});
test('late lookup is aborted and cannot replace newer results',async t=>{
 let finish;const h=await mount(t,async(path,opts)=>opts.params.q==='old'?new Promise(r=>finish=r):{data:{contacts:[{id:'patient:new',name:'New contact',source:'patient'}]}});
 await h.type('old');await h.wait();await h.type('new');assert.equal(h.calls[0][1].signal.aborted,true);await h.wait();await act(async()=>finish({data:{contacts:[{id:'lead:old',name:'Old contact'}]}}));assert.match(document.body.textContent,/New contact/);assert.doesNotMatch(document.body.textContent,/Old contact/);
});
test('source permission denial disables search without API requests',async t=>{
 const h=await mount(t,async()=>{throw Error('must not call')},{allowed:false});assert.equal(document.querySelector('input').disabled,true);await h.wait();assert.equal(h.calls.length,0);
});

test('Enter in short or unselected search never submits surrounding form',async t=>{
 const h=await mount(t,async()=>({data:{contacts:[]}}));await h.type('A');
 const event=new h.dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});await act(async()=>document.querySelector('input').dispatchEvent(event));assert.equal(event.defaultPrevented,true);assert.equal(h.selected.length,0);
});
