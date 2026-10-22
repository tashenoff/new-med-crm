import assert from 'node:assert/strict';
import test from 'node:test';
import { initialHistorySteps, readReportPreference } from '../src/utils/eventFunnel.js';

test('initial history path uses server order and system metadata, never names or a fixed ID list', () => {
 const columns=[{id:'final-random',name:'Renamed final',is_system:true},
  {id:'converted',name:'Optional detour',is_system:false},
  {id:'start-random',name:'Renamed entry',is_system:true},
  {id:'not-system',name:'New',is_system:false},
  {id:'old-random',name:'Archived',is_system:true,archived:true},
  {id:'inactive-random',name:'Inactive',is_system:true,active:false}];
 assert.deepEqual(initialHistorySteps(columns),['final-random','start-random']);
 assert.deepEqual(initialHistorySteps(columns.toReversed()),['start-random','final-random']);
 assert.deepEqual(initialHistorySteps(columns.map(column=>({...column,name:'Other name'}))),['final-random','start-random']);
 assert.deepEqual(initialHistorySteps([{id:'only',is_system:true}]),[]);
 assert.deepEqual(initialHistorySteps([{id:'untyped',name:'Won'}]),[]);
 assert.deepEqual(initialHistorySteps(),[]);
});

test('valid historical step IDs remain intact, invalid saved entries cannot prevent an initial path', () => {
 const previous=globalThis.localStorage;
 try{
  let raw=JSON.stringify({version:1,steps:['archived-entry','custom-middle','archived-final'],hidden:[]});
  globalThis.localStorage={getItem:()=>raw};
  assert.deepEqual(readReportPreference('key').steps,['archived-entry','custom-middle','archived-final']);
  raw=JSON.stringify({version:1,steps:['',null,' ',3,'x'.repeat(121)],hidden:[]});
  assert.deepEqual(readReportPreference('key').steps,[]);
  raw='{broken';assert.deepEqual(readReportPreference('key').steps,[]);
 }finally{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
});
