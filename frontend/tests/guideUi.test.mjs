import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act, useState } from 'react';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { guidePosition } from '../src/components/guide/guidePosition.js';
import { getNavigationMenu, getSearchNavigation } from '../src/components/layout/navigationCatalog.js';
import { allPermissionKeys } from '../src/utils/permissions.js';

const boot=new JSDOM('<body/>');globalThis.window=boot.window;globalThis.document=boot.window.document;
const {createRoot}=await import('react-dom/client');delete globalThis.window;delete globalThis.document;boot.window.close();
const base=fileURLToPath(new URL('..',import.meta.url));
const compiled=await build({stdin:{contents:`export {GuideProvider,useGuide} from './src/context/GuideContext.jsx'; export {default as GuideTour} from './src/components/guide/GuideTour.jsx'; export {default as GuideTourModal} from './src/components/guide/GuideTourModal.jsx'; export {default as Modal} from './src/components/modals/Modal.js'; export {default as NavigationSearch} from './src/components/layout/NavigationSearch.jsx';`,resolveDir:base,loader:'jsx'},bundle:true,write:false,platform:'node',format:'cjs',external:['react','react-dom','react-router-dom'],loader:{'.js':'jsx','.css':'empty'}});
const mod={exports:{}};const require=createRequire(import.meta.url);
new Function('require','module','exports',compiled.outputFiles[0].text)(require,mod,mod.exports);
const {GuideProvider,useGuide,GuideTour,GuideTourModal,Modal,NavigationSearch}=mod.exports;
const {MemoryRouter}=require('react-router-dom');
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));

async function mount(t){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://crm.test'});
 const globals={window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,MutationObserver:dom.window.MutationObserver,IS_REACT_ACT_ENVIRONMENT:true};
 const saved=new Map(Object.keys(globals).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));Object.assign(globalThis,globals);
 window.requestAnimationFrame=cb=>setTimeout(cb,0);window.cancelAnimationFrame=clearTimeout;
 window.HTMLElement.prototype.getBoundingClientRect=function(){const top=Number(this.dataset.top||100),width=this.classList.contains('guide-tour-tooltip')?360:120,height=this.classList.contains('guide-tour-tooltip')?240:40;return {top,left:80,width,height,right:80+width,bottom:top+height};};
 let guide;let opened=0,selected=0,closed=0;
 const el=React.createElement;
 function Screen(){const [page,setPage]=useState('');const [form,setForm]=useState(false);guide=useGuide();return el(React.Fragment,null,
  el('button',{onClick:guide.openGuideModal},'Гид'),el(NavigationSearch,{user:{role:'admin',permissions:allPermissionKeys},onNavigate:setPage}),
  page==='calendar'&&el(React.Fragment,null,el('button',{'data-guide':'nav-calendar'},'Календарь'),el('button',{'data-guide':'add-appointment-btn',onClick:()=>{opened++;setForm(true);}},'Новая запись')),
  page==='patients'&&el(React.Fragment,null,el('button',{'data-guide':'nav-patients'},'Пациенты'),el('button',{'data-guide':'patient-row',onClick:()=>selected++},'Пациент')),
  el(Modal,{show:form,onClose:()=>{closed++;setForm(false);},title:'Запись'},el('form',null,el('input',{'aria-label':'Причина'}),el('button',{type:'button','data-guide':'save-appointment-btn'},'Сохранить запись'))),
  el(GuideTourModal),el(GuideTour,{onNavigate:tab=>setPage(tab)}));}
 const root=createRoot(document.getElementById('root'));
 await act(async()=>root.render(el(MemoryRouter,null,el(GuideProvider,null,el(Screen)))));
 t.after(async()=>{await act(async()=>root.unmount());dom.window.close();for(const [k,d]of saved){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
 const run=async cb=>{await act(async()=>cb());await act(async()=>{await tick();});};
 return {get guide(){return guide;},run,get opened(){return opened;},get selected(){return selected;},get closed(){return closed;}};
}

test('navigation label is updated and quality assessment is absent from menu and search for every role',async t=>{
 for(const role of ['admin','super_admin','doctor','marketer']){
  const user={role,permissions:allPermissionKeys};
  assert.equal(getNavigationMenu(user,'hms').some(x=>x.key==='quality-assessment'),false);
  assert.equal(getSearchNavigation(user).some(x=>x.key==='quality-assessment'),false);
  assert.ok(getSearchNavigation(user).some(x=>x.key==='calendar'));
 }
 await mount(t);
 assert.ok(document.querySelector('button[aria-label="Перейти к разделу"]'));
 assert.equal(document.querySelector('button[aria-label="Поиск разделов"]'),null);
});
test('help opens the standard dialog, closes with Escape and restores focus',async t=>{
 const h=await mount(t);const trigger=[...document.querySelectorAll('button')].find(b=>b.textContent==='Гид');trigger.focus();
 await h.run(()=>trigger.click());
 assert.ok(document.querySelector('[role=dialog].curai-guide-dialog'));
 assert.ok(document.activeElement.classList.contains('guide-option-card'));
 await h.run(()=>document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
 assert.equal(document.querySelector('.curai-guide-dialog'),null);assert.equal(document.activeElement,trigger);
});
test('highlight survives route rerender, follows scrolling and restarts cleanly',async t=>{
 const h=await mount(t);await h.run(()=>h.guide.startGuide('appointment'));
 assert.ok(document.querySelector('.guide-tour-highlight'));
 const nav=document.querySelector('[data-guide="nav-calendar"]');nav.dataset.top='240';
 await h.run(()=>window.dispatchEvent(new window.Event('scroll')));
 assert.equal(document.querySelector('.guide-tour-highlight').style.top,'236px');
 await h.run(()=>h.guide.endGuide());assert.equal(document.querySelector('.guide-tour-overlay'),null);
 await h.run(()=>h.guide.startGuide('appointment'));assert.ok(document.querySelector('.guide-tour-highlight'));
});
test('guide waits for actual form actions and ignores Enter and arrows while typing',async t=>{
 const h=await mount(t);await h.run(()=>h.guide.startGuide('appointment'));await h.run(()=>h.guide.nextStep());
 assert.equal(h.opened,0);assert.equal(document.querySelector('input[aria-label="Причина"]'),null);
 await h.run(()=>document.querySelector('[data-guide="add-appointment-btn"]').click());
 assert.equal(h.opened,1);assert.equal(h.guide.currentStep,2);
 const input=document.querySelector('input[aria-label="Причина"]');input.focus();
 await h.run(()=>{input.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));input.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));});
 assert.equal(h.guide.currentStep,2);
 await h.run(()=>input.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
 assert.equal(h.guide.activeGuide,null);assert.equal(h.closed,0);assert.ok(document.querySelector('input[aria-label="Причина"]'));
});
test('treatment guide never chooses a patient automatically and handles missing targets',async t=>{
 const h=await mount(t);await h.run(()=>h.guide.startGuide('treatmentPlan'));await h.run(()=>h.guide.nextStep());await h.run(()=>h.guide.nextStep());
 assert.equal(h.selected,0);assert.equal(document.querySelector('.guide-tour-highlight'),null);
 assert.match(document.querySelector('.guide-tour-waiting').textContent,/недоступен/);
 await h.run(()=>h.guide.openGuideModal());assert.equal(h.guide.activeGuide,null);assert.ok(document.querySelector('.curai-guide-dialog'));
});
test('guide placement stays within narrow viewports and near every screen edge',()=>{
 for(const placement of ['top','bottom','left','right'])for(const rect of [null,{top:0,left:0,width:40,height:30},{top:620,left:290,width:30,height:20}]){
  const p=guidePosition(rect,placement,{width:380,height:240},{width:320,height:640});
  assert.ok(p.left>=16);assert.ok(p.left+288<=304);assert.ok(p.top>=16);assert.ok(p.top+240<=624);
 }
 const form={top:440,left:40,width:680,height:60};
 const p=guidePosition(form,'left',{width:360,height:240},{width:784,height:884});
 assert.ok(p.top>=form.top+form.height+12,'fallback leaves the form accessible');
});
