import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';
const result=await build({entryPoints:[fileURLToPath(new URL('../src/components/common/LoadingIndicator.jsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['react'],loader:{'.css':'empty'}});
const mod={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
const {default:LoadingIndicator,LoadingSpinner,AppLoading}=mod.exports;
const render=(component,props)=>new JSDOM(renderToStaticMarkup(React.createElement(component,props))).window.document;
test('labeled loading announces one status without a second decorative spinner announcement',()=>{
 const doc=render(LoadingIndicator,{label:'Загрузка задач…'});
 assert.equal(doc.querySelectorAll('[role=status]').length,1);
 assert.equal(doc.querySelector('[role=status]').textContent,'Загрузка задач…');
 assert.equal(doc.querySelector('.curai-spinner').getAttribute('aria-hidden'),'true');
 assert.equal(doc.querySelector('[role=status]').getAttribute('aria-live'),'polite');
});
test('standalone and compact loading remain accessible while decorative loading stays silent',()=>{
 const standalone=render(LoadingSpinner,{label:'Загрузка записей'});
 assert.equal(standalone.querySelector('[role=status]').getAttribute('aria-label'),'Загрузка записей');
 const compact=render(LoadingIndicator,{inline:true});
 assert.ok(compact.querySelector('span.is-inline .curai-spinner-sm'));
 assert.equal(render(LoadingSpinner,{decorative:true}).querySelector('[role=status]'),null);
});
test('application startup exposes busy state and the same labeled loading indicator',()=>{
 const doc=render(AppLoading);
 assert.equal(doc.querySelector('.curai-app-loading').getAttribute('aria-busy'),'true');
 assert.equal(doc.querySelectorAll('[role=status]').length,1);
 assert.equal(doc.querySelector('[role=status]').textContent,'Загружаем систему…');
});
