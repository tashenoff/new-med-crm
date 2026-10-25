import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { getAppointmentLayout } from '../src/components/calendar/utils/appointmentLayout.js';

const appointment=(start,end,extra={})=>({id:`${start}-${end}`,room_id:'room',appointment_date:'2026-10-26',appointment_time:start,end_time:end,...extra});
const range=[480,1200];
test('card edges use actual minutes for adjacent, hour and fractional intervals without mutating data',()=>{
  const cases=[['09:00','09:30',128,64],['09:30','10:00',192,64],['09:00','10:00',128,128],
    ['09:15','10:00',160,96],['10:15','10:30',288,32],['09:00','09:01',128,64/30]];
  for(const [start,end,top,height] of cases){
    const data=Object.freeze(appointment(start,end));
    assert.deepEqual(getAppointmentLayout(data,...range),{top,height});
    assert.equal(data.appointment_time,start);assert.equal(data.end_time,end);
  }
  const first=getAppointmentLayout(appointment('09:00','09:30'),...range);
  const next=getAppointmentLayout(appointment('09:30','10:00'),...range);
  assert.equal(first.top+first.height,next.top);
});
test('visible day clips card geometry and omits intervals outside the scale',()=>{
  assert.deepEqual(getAppointmentLayout(appointment('07:45','08:30'),...range),{top:0,height:64});
  assert.deepEqual(getAppointmentLayout(appointment('19:30','20:15'),...range),{top:1472,height:64});
  for(const [start,end] of [['07:00','08:00'],['20:00','20:30'],['09:00','09:00'],['bad','10:00']]){
    assert.equal(getAppointmentLayout(appointment(start,end),...range),null);
  }
  assert.deepEqual(getAppointmentLayout(appointment('09:00',undefined),...range),{top:128,height:64});
});

const compiled=await build({
  entryPoints:[fileURLToPath(new URL('../src/components/calendar/CalendarView.js',import.meta.url))],
  bundle:true,write:false,platform:'node',format:'cjs',external:['react','react-dom'],loader:{'.js':'jsx','.css':'empty'}
});
const module={exports:{}};
new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
test('actual calendar keeps labels inside rows and renders off-grid, overlapping and clipped cards once',()=>{
  globalThis.window={innerWidth:1280};
  const data=[appointment('09:00','09:30'),appointment('09:30','10:00'),appointment('09:15','10:00'),
    appointment('07:45','08:30'),appointment('19:30','20:15'),appointment('20:00','20:30'),
    appointment('10:00','10:30',{id:'other-room',room_id:'other'}),appointment('11:00','11:30',{id:'other-day',appointment_date:'2026-10-27'})];
  const html=renderToStaticMarkup(React.createElement(module.exports.default,{
    currentDate:new Date(2026,9,26),appointments:data,rooms:[{id:'room',name:'Room',schedule:[]}],doctors:[],patients:[]
  }));
  delete globalThis.window;
  assert.equal((html.match(/class="curai-appointment-card /g)||[]).length,5);
  assert.match(html,/top:160px;height:96px/);
  assert.match(html,/top:0px;height:64px/);
  assert.match(html,/top:1472px;height:64px/);
  assert.doesNotMatch(html,/calendar-time-mark|calendar-time-end/);
  assert.equal((html.match(/calendar-timeslot /g)||[]).length,24);
});
