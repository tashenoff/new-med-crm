import assert from 'node:assert/strict';
import test from 'node:test';
import { settleLegacyPlan } from '../src/utils/settleLegacyPlan.js';

globalThis.localStorage = { getItem: () => 'fixture' };
const ordinary = id => ({service_id:id,service_name:id,total_price:1000,paid_amount:0,payment_status:'unpaid'});
const complex = id => ({...ordinary(id),is_complex:true,components:[{service_id:'part',price:1000,quantity:1,paid:false}]});
const course = id => ({...ordinary(id),is_course:true,payment_type:'per_session',quantity_total:2,price_per_unit:500,sessions:[{paid:true},{paid:false}]});
function fixture(rows, failAt=0) {
  const plan={id:'plan',patient_id:'patient',services:structuredClone(rows)},writes=[],updates=[];
  let failure=failAt;
  const fetcher=async (url,options={})=>{
    if(options.method!=='POST')return {ok:true,json:async()=>structuredClone(plan)};
    writes.push({url,body:options.body?JSON.parse(options.body):null});
    if(writes.length===failure){failure=0;return {ok:false,status:409,json:async()=>({detail:'Fixture conflict'})};}
    const parts=url.split('/');
    const row=plan.services.find(row=>row.service_id===parts[parts.indexOf('services')+1]||row.service_id===parts[parts.indexOf('complex-services')+1]);
    if(parts.includes('sessions'))row.sessions[Number(parts[parts.indexOf('sessions')+1])].paid=true;
    else row.payment_status='paid';
    return {ok:true,json:async()=>structuredClone(plan)};
  };
  const args={plan,API:'https://fixture.invalid',paymentData:{payment_method_id:'cash',payment_method_name:'Cash'},fetcher,
    onUpdate:updated=>updates.push(updated),ledgerFetch:()=>assert.fail('Unexpected ledger call'),requireSessionId:s=>s.session_id,complexShares:row=>row.components.map(c=>({...c,share:c.price}))};
  return {plan,writes,updates,run:(extra={})=>settleLegacyPlan({...args,...extra})};
}
test('legacy ordinary and complex use their own endpoints with the same patient and plan',async()=>{
 const f=fixture([ordinary('single'),complex('complex')]);await f.run();
 assert.match(f.writes[0].url,/plan\/services\/single\/mark-paid$/);
 assert.match(f.writes[1].url,/plan\/complex-services\/complex\/pay-remaining$/);
 await f.run();assert.equal(f.writes.length,2,'repeat cannot pay saved rows again');
});
test('legacy course pays only unpaid indexed sessions without a ledger body',async()=>{
 const f=fixture([course('course')]);await f.run();await f.run();
 assert.equal(f.writes.length,1);assert.match(f.writes[0].url,/sessions\/1\/mark-paid$/);assert.equal(f.writes[0].body,null);
});
test('partial success is refreshed, server detail is retained, retry skips the successful row',async()=>{
 const f=fixture([ordinary('first'),complex('second')],2);
 await assert.rejects(f.run(),/HTTP 409: Fixture conflict.*уже сохранённые/);
 assert.equal(f.updates[0].services[0].payment_status,'paid');
 await f.run();assert.equal(f.writes.filter(w=>w.url.includes('/first/')).length,1);
 assert.equal(f.writes.filter(w=>w.url.includes('/second/')).length,2);
});
test('aggregate fixed discount is distributed across ordinary rows and not complexes',async()=>{
 const f=fixture([ordinary('one'),ordinary('two'),complex('three')]);await f.run({discount:200});
 assert.equal(f.writes[0].body.amount,900);assert.equal(f.writes[1].body.amount,900);assert.equal(f.writes[2].body.amount,undefined);
});
test('stale aggregate discount does not get redistributed after another payment',async()=>{
 const f=fixture([ordinary('one'),ordinary('two')]);
 const original=structuredClone(f.plan);
 f.plan.services[0].payment_status='paid';
 await assert.rejects(f.run({plan:original,discount:200}),/План изменился/);
 assert.equal(f.writes.length,0);assert.equal(f.updates.length,1);
});
test('prospective ordinary uses ledger receipt with actual remaining amount and existing discount',async()=>{
 const row={...ordinary('single'),service_row_id:'stable',paid_amount:200,discount_amount:100};
 const f=fixture([row]);let command;
 await f.run({ledgerFetch:async(url,body)=>{command={url,body};f.plan.services[0].payment_status='paid';}});
 assert.match(command.url,/service-rows\/stable\/receipts$/);assert.equal(command.body.amount_kzt,700);assert.equal(command.body.discount_amount_kzt,100);
});
test('prospective upfront course uses stable session writers and preserves partial funding',async()=>{
 const row={...course('course'),service_row_id:'course-row',payment_type:'upfront'};
 row.sessions=[{session_id:'first',price:500,paid:true,paid_amount:500},{session_id:'second',price:500,paid_amount:100,discount_amount:50}];
 const f=fixture([row]);const commands=[];
 await f.run({ledgerFetch:async(url,body)=>{commands.push({url,body});f.plan.services[0].sessions[1].paid=true;}});
 assert.equal(commands.length,1);assert.match(commands[0].url,/sessions\/second\/mark-paid$/);
 assert.equal(commands[0].body.amount_kzt,350);assert.equal(commands[0].body.discount_amount_kzt,50);
});
test('auto-completion policy is never migrated or routed through legacy writers',async()=>{
 const f=fixture([complex('complex')]);f.plan.payment_completion_policy='full_payment_v1';
 await assert.rejects(f.run(),/Правила оплаты изменились/);assert.equal(f.writes.length,0);
});
test('changed patient and duplicate catalog rows fail before any payment',async()=>{
 const f=fixture([ordinary('one'),ordinary('one')]);await assert.rejects(f.run(),/повторяется услуга/);assert.equal(f.writes.length,0);
});
test('course discount unsupported by historical indexed writer fails before spending',async()=>{
 const f=fixture([course('course')]);await assert.rejects(f.run({discount:100}),/Скидку на курс/);assert.equal(f.writes.length,0);
});
