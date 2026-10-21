import assert from 'node:assert/strict';
import test from 'node:test';
import { leadCardSource } from '../src/utils/leadCardSource.js';

const sources = [{id:'marketing',name:'Google — пользовательское имя',channels:[{id:'form',name:'Запрос на сайте'},{id:'chat',name:'WhatsApp с меткой'}],campaigns:[{id:'campaign',name:'Осенняя кампания'}]}];
test('card separates a marketing source, contact channel, campaign and contact place without rewriting data',()=>{
  const lead={source_id:'marketing',source:'website',channel_id:'chat',campaign_id:'campaign',contact_point:'/clinic/form',description:'Ручная заметка'};
  const before=structuredClone(lead);
  const result=leadCardSource(lead,sources);
  assert.match(result.attribution,/Обращение через «Google — пользовательское имя»/);
  assert.match(result.attribution,/Канал: WhatsApp с меткой/);
  assert.match(result.attribution,/Кампания: Осенняя кампания/);
  assert.match(result.attribution,/Место контакта: \/clinic\/form/);
  assert.equal(result.description,'Ручная заметка');assert.equal(result.hideHeaderSource,true);
  assert.deepEqual(lead,before);
});
test('unknown or archived dimensions use saved snapshots or honest unavailable labels; no provider guessed as source',()=>{
  const lead={source_id:'deleted-source',source:'phone',channel_id:'deleted-channel',campaign_id:'deleted-campaign',created_by:'telephony_webhook'};
  const result=leadCardSource(lead,sources);
  assert.match(result.attribution,/источник недоступен/);assert.match(result.attribution,/Канал: недоступен/);assert.match(result.attribution,/Кампания: недоступна/);
  assert.ok(!result.attribution.includes('Zadarma'));
  const captured=leadCardSource({...lead,source_name:'Зафиксированный источник',channel_name:'Зафиксированный способ',campaign_name:'Старая кампания'});
  assert.match(captured.attribution,/Зафиксированный источник/);assert.match(captured.attribution,/Зафиксированный способ/);
  const unknown=leadCardSource({channel_id:'unknown',source:'whatsapp'});
  assert.match(unknown.attribution,/источник не указан/);assert.ok(!unknown.attribution.includes('Обращение через «WhatsApp»'));
});
test('current catalog names replace renamed labels, and only exact generated provider descriptions are removed',()=>{
  const source={...sources[0],name:'Переименованное привлечение'};
  const generated=leadCardSource({source_id:'marketing',source:'phone',description:'Обращение через Zadarma-звонок'},[source]);
  assert.equal(generated.description,'');assert.equal(generated.attribution,'Обращение через «Переименованное привлечение»');
  const manual=leadCardSource({source_id:'marketing',description:'Пользователь упомянул Zadarma-звонок'},[source]);
  assert.equal(manual.attribution,null);assert.equal(manual.description,'Пользователь упомянул Zadarma-звонок');
});
