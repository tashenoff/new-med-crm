import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import React,{act} from 'react';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const bootstrap=new JSDOM('<html><body></body></html>');
globalThis.window=bootstrap.window;globalThis.document=bootstrap.window.document;
const {createRoot}=await import('react-dom/client');
delete globalThis.window;delete globalThis.document;bootstrap.window.close();
const compiled=await build({stdin:{contents:`export {default as Login} from './src/components/auth/LoginForm.jsx';export {default as Context} from './src/context/AuthContext.jsx';`,resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'jsx'},bundle:true,write:false,platform:'node',format:'cjs',external:['react','react-dom','react-dom/client'],loader:{'.css':'empty'},define:{'import.meta.env':'{"VITE_BACKEND_URL":"https://fixture.invalid"}'}});
const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {Login,Context}=module.exports;
async function mount(t,login=async()=>({success:true})){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid'}),previous=new Map(),calls=[];
 for(const [k,v]of Object.entries({window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true,fetch:()=>{throw Error('Real network forbidden');}})){previous.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v});}
 const root=createRoot(document.getElementById('root')),container=document.getElementById('root');
 await act(async()=>root.render(React.createElement(Context.Provider,{value:{login:(...args)=>{calls.push(args);return login(...args);}}},React.createElement(Login,{onSwitchToRegister:()=>{throw Error('Registration prompt removed');}}))));
 t.after(async()=>{await act(async()=>root.unmount());dom.window.close();for(const [k,p]of previous){if(p)Object.defineProperty(globalThis,k,p);else delete globalThis[k];}});
 const enter=async(id,value)=>act(async()=>{const input=container.querySelector('#'+id);Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
 const submit=async()=>act(async()=>container.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
 return {container,calls,enter,submit,dom};
}
test('login remains username-compatible, masked and disabled until both values are present',async t=>{
 const ui=await mount(t),email=ui.container.querySelector('#email'),password=ui.container.querySelector('#password'),button=ui.container.querySelector('button');
 assert.equal(email.type,'text');assert.equal(email.autocomplete,'username');assert.equal(password.type,'password');assert.equal(password.autocomplete,'current-password');
 assert.equal(email.required,true);assert.equal(password.required,true);assert.equal(ui.container.querySelector('#rememberMe').checked,false);assert.equal(button.disabled,true);
 assert.doesNotMatch(ui.container.textContent,/Зарегистрироваться|Нет аккаунта/);
 await ui.enter('email','demo.user');assert.equal(button.disabled,true);await ui.enter('password','   ');assert.equal(button.disabled,true);await ui.enter('password','fixture-secret');assert.equal(button.disabled,false);
 assert.equal(ui.calls.length,0);
});
test('submit retains exact credential values and remember-me contract without adding storage',async t=>{
 const ui=await mount(t);await ui.enter('email',' demo.user ');await ui.enter('password',' fixture-secret ');await act(async()=>ui.container.querySelector('#rememberMe').click());await ui.submit();
 assert.deepEqual(ui.calls,[[' demo.user ',' fixture-secret ',true]]);assert.equal(ui.dom.window.localStorage.length,0);assert.ok(!ui.container.querySelector('[role="alert"]'));
});
test('pending login disables submit and exposes loading; API error remains text and can be retried',async t=>{
 let resolve;let attempt=0;const pending=new Promise(r=>resolve=r);
 const ui=await mount(t,()=>++attempt===1?pending:Promise.resolve({success:true}));await ui.enter('email','demo.user');await ui.enter('password','fixture-secret');await ui.submit();
 assert.equal(ui.container.querySelector('button').disabled,true);assert.equal(ui.container.querySelector('form').getAttribute('aria-busy'),'true');assert.equal(ui.container.querySelector('button').textContent,'Вход...');
 await act(async()=>resolve({success:false,error:'Incorrect email or password <img src=x>'}));
 assert.equal(ui.container.querySelector('button').disabled,false);assert.equal(ui.container.querySelector('form').getAttribute('aria-busy'),'false');assert.match(ui.container.querySelector('[role="alert"]').textContent,/Incorrect email or password <img src=x>/);assert.equal(ui.container.querySelector('img'),null);
 assert.equal(ui.container.querySelector('form').getAttribute('aria-describedby'),'login-error');assert.equal(ui.container.querySelector('#email').value,'demo.user');await ui.submit();assert.equal(ui.calls.length,2);assert.equal(ui.container.querySelector('[role="alert"]'),null);
});
