import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
async function load(path) {
  const compiled = await build({entryPoints:[fileURLToPath(new URL(path, import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react-dom'],loader:{'.js':'jsx'},define:{'import.meta.env':'{}'}});
  const module={exports:{}};
  new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
  return module.exports;
}
const StaffModal=(await load('../src/components/modals/StaffModal.jsx')).default;
const {useStaff}=await load('../src/hooks/useStaff.js');
for (const type of ['staff','doctor']) for (const close of ['X','Cancel','Escape']) {
  test(`${type} blank reset closes by ${close} and reopens clean`, async t => {
    const dom=new JSDOM('<div id="root"></div>',{url:'https://crm.test'});
    const saved=new Map(['window','document','IS_REACT_ACT_ENVIRONMENT'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
    Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
    const root=createRoot(document.getElementById('root')); let saves=0,resets=0,closes=0;
    const props={isOpen:true,editingItem:{id:'id',type,full_name:'Staff'},staffForm:{full_name:'Staff',role:type==='doctor'?'doctor':'admin'},setStaffForm:()=>{},onClose:()=>{closes++;},onSave:()=>{saves++;},onResetPassword:()=>{resets++;}};
    t.after(async()=>{await act(async()=>root.unmount());dom.window.close();for(const [k,d] of saved) {if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
    const render=async()=>act(async()=>root.render(React.createElement(StaffModal,props)));
    await render();
    const resetButtons=[...document.querySelectorAll('button')].filter(b=>b.className.includes('bg-orange-500'));
    assert.equal(resetButtons.length,1,'one reset section');
    await act(async()=>resetButtons[0].click());
    await act(async()=>{
      if(close==='Escape')document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      else if(close==='X')document.querySelector('[aria-label]').click();
      else document.querySelector('form > .flex.justify-end button').click();
    });
    assert.equal(closes,1);assert.equal(saves,0);assert.equal(resets,0);
    assert.equal(document.querySelectorAll('.bg-red-100').length,0);
    props.isOpen=false;await render();props.isOpen=true;await render();
    assert.equal(document.querySelectorAll('input[type=password]').length,0,'reset mode cleared');
    assert.equal(document.querySelectorAll('.bg-red-100').length,0);
  });
}
test('doctor grant puts credentials and optional login only in JSON body',async t=>{
  let hook;const calls=[];
  const dom=new JSDOM('<div id="root"></div>',{url:'https://crm.test'});
  const keys=['window','document','localStorage','fetch','IS_REACT_ACT_ENVIRONMENT'];const saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true,fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({data:{}})};}});
  const root=createRoot(document.getElementById('root'));
  t.after(async()=>{await act(async()=>root.unmount());dom.window.close();for(const[k,d]of saved){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
  function Harness(){hook=useStaff();return null;}
  await act(async()=>root.render(React.createElement(Harness)));
  await act(async()=>hook.assignAccessToDoctor('d','doc@example.com','secret','doclogin'));
  const call=calls.find(c=>c.url.includes('assign-access'));
  assert.ok(!call.url.includes('?'));
  assert.deepEqual(JSON.parse(call.options.body),{email:'doc@example.com',password:'secret',login:'doclogin'});
});
test('management page forwards optional doctor login',()=>{
  const source=readFileSync(new URL('../src/pages/StaffManagementPage.jsx',import.meta.url),'utf8');
  assert.match(source,/handleAssignAccessSubmit = async \(doctorId, email, password, login\)/);
  assert.match(source,/assignAccessToDoctor\(doctorId, email, password, login\)/);
});
