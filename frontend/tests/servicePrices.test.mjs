import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const bootstrap = new JSDOM('<html><body></body></html>');
globalThis.window = bootstrap.window;
globalThis.document = bootstrap.window.document;
const { createRoot } = await import('react-dom/client');
delete globalThis.window; delete globalThis.document; bootstrap.window.close();

// Mount the real directory and portal modal. Only the unrelated materials API
// is stubbed; every directory fetch is served by the local fixture below.
const compiled = await build({
  stdin: { contents: `
    export { default as ServicePrices } from './src/components/directory/ServicePrices.js';
    export * from './src/components/directory/servicePriceForm.js';
  `, resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'jsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react', 'react-dom', 'react-dom/client'], loader: { '.js': 'jsx' },
  define: { 'import.meta.env': '{"VITE_BACKEND_URL":"https://crm.test"}' },
  plugins: [{ name: 'isolated-materials', setup(builder) {
    builder.onResolve({ filter: /\/api\/materials$/ }, () => ({ path: 'materials', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
      contents: 'export const materialsApi = {list: async () => ({success:true,data:[]})};'
    }));
  }}]
});
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { ServicePrices, validateServicePrice, servicePriceSaveError } = module.exports;

test('price validation rejects empty, malformed, nonfinite and negative values', () => {
  for (const value of ['', '  ', null, undefined, 'abc', '12abc', '1,5', '0x10', '0b10',
    'NaN', NaN, 'Infinity', Infinity, -Infinity, '1e309', '-1', -0.01, true, [], {}]) {
    assert.ok(validateServicePrice(value), `Must reject ${String(value)}`);
  }
});

test('price validation accepts zero and finite decimal/exponent prices', () => {
  for (const value of [0, '0', '0.00', 12.5, '12.50', ' 12.5 ', '.5', '1e2']) {
    assert.equal(validateServicePrice(value), '', `Must accept ${value}`);
  }
});

test('save error formatting retains loc/msg and safely handles all detail shapes', () => {
  assert.deepEqual(servicePriceSaveError('Услуга уже существует'), {message:'Услуга уже существует',priceError:''});
  const detail = [{type:'float_parsing',loc:['body','price'],msg:'Input should be a valid number',input:'',url:'https://unused.test'}];
  assert.equal(servicePriceSaveError(detail).message, 'price: Input should be a valid number');
  assert.match(servicePriceSaveError(detail).priceError, /Проверьте цену/);
  assert.equal(servicePriceSaveError({loc:['body','price'],msg:'Недопустимая цена'}).message, 'price: Недопустимая цена');
  assert.equal(servicePriceSaveError({message:'Ошибка данных'}).message, 'Ошибка данных');
  for (const detail of [null, undefined, {}, {unexpected:{data:true}}, [], [null, {}], 42]) {
    assert.equal(servicePriceSaveError(detail).message, 'Ошибка при сохранении услуги');
  }
  const component = servicePriceSaveError([{loc:['body','components',0,'price'],msg:'Цена компонента должна быть больше 0'}]);
  assert.equal(component.message, 'components.0.price: Цена компонента должна быть больше 0');
  assert.equal(component.priceError, '', 'Component errors must not mark the total price');
});

async function mount(t, { existingPrice = 25, existingType = 'regular', detail } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url:'https://crm.test' });
  const component = {service_id:'regular-fixture',service_name:'Fixture service',quantity:1,price:25,discount:0,doctor_id:''};
  const fixture = {
    services: [
      {id:'regular-fixture',service_name:'Fixture service',price:25,service_type:'regular'},
      {id:'existing-fixture',service_name:'Fixture existing',price:existingPrice,service_type:existingType,
        components:existingType === 'complex' ? [component] : [],materials:[],description:'Fixture description'}
    ], writes:[], detail, reads:[], errors:[]
  };
  const previous = new Map();
  const globals = {window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true,
    fetch:async (url, options = {}) => {
      const target = new URL(url);
      assert.equal(target.origin, 'https://crm.test');
      const method = options.method || 'GET';
      if (method === 'GET') {
        fixture.reads.push(target.pathname);
        const data = target.pathname === '/api/service-prices' ? fixture.services
          : ['/api/service-categories','/api/doctors'].includes(target.pathname) ? [] : undefined;
        assert.notEqual(data, undefined, 'Unexpected GET '+target.pathname);
        return {ok:true,json:async () => structuredClone(data)};
      }
      assert.ok(['POST','PUT'].includes(method));
      assert.equal(target.pathname, method === 'POST' ? '/api/service-prices' : '/api/service-prices/existing-fixture');
      const data = JSON.parse(options.body);
      fixture.writes.push({method,path:target.pathname,data});
      if (fixture.detail !== undefined) return {ok:false,status:422,json:async () => ({detail:fixture.detail})};
      const saved = {...data,id:method === 'POST' ? 'created-fixture' : 'existing-fixture'};
      if (method === 'POST') fixture.services.push(saved);
      else fixture.services = fixture.services.map(item => item.id === saved.id ? saved : item);
      return {ok:true,json:async () => structuredClone(saved)};
    }};
  for (const [key,value] of Object.entries(globals)) {
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  }
  const log = console.log, error = console.error;
  console.log = () => {};
  console.error = (...args) => fixture.errors.push(args.map(String).join(' '));
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    try {
      await act(async () => root.unmount());
      // The existing directory list has an unrelated unkeyed Fragment warning.
      assert.deepEqual(fixture.errors.filter(message => !message.includes('Each child in a list should have a unique')), []);
    } finally {
      dom.window.close(); console.log = log; console.error = error;
      for (const [key,descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis,key,descriptor); else delete globalThis[key];
      }
    }
  });
  await act(async () => root.render(React.createElement(ServicePrices,{user:{role:'super_admin'}})));
  const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text);
  const click = async node => { assert.ok(node); await act(async () => node.click()); };
  const change = async (node, value) => {
    assert.ok(node);
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(node,value);
      node.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    });
  };
  const price = () => document.getElementById('service-price');
  const create = async (complex = true) => {
    await click(button('+ Добавить услугу'));
    await change(document.querySelector('input[placeholder="Консультация терапевта"]'),'Fixture created');
    if (complex) {
      await click(document.getElementById('is-complex'));
      await change(document.querySelector('input[placeholder="Найдите услугу, чтобы добавить в состав"]'),'Fixture service');
      const option = [...document.querySelectorAll('.modal-content .font-medium')].find(node => node.textContent === 'Fixture service');
      await click(option);
    }
  };
  const edit = async () => {
    const row = [...document.querySelectorAll('tbody tr')].find(node => node.textContent.includes('Fixture existing'));
    await click(row.querySelector('button[title="Редактировать"]'));
  };
  const save = async () => { assert.equal(button('Сохранить').disabled,false); await click(button('Сохранить')); };
  const inline = () => {
    assert.equal(price().getAttribute('aria-invalid'),'true');
    assert.equal(document.querySelector('label[for="service-price"]').textContent,'Цена, ₸ *');
    const message = document.getElementById(price().getAttribute('aria-describedby'));
    assert.ok(message?.textContent.trim()); assert.equal(message.getAttribute('role'),'alert');
    return message.textContent;
  };
  return {fixture,create,edit,price,change,save,inline};
}

for (const value of ['', 'abc', '12abc', 'NaN', 'Infinity', '1e309', '-0.01']) {
  test(`complex form blocks invalid price ${JSON.stringify(value)} before HTTP`, async t => {
    const h = await mount(t); await h.create(); await h.change(h.price(),value); await h.save();
    assert.equal(h.fixture.writes.length,0); h.inline();
    await h.change(h.price(),'10.5');
    assert.equal(h.price().getAttribute('aria-invalid'),'false');
    assert.equal(document.getElementById('service-price-error'),null);
    await h.save(); assert.equal(h.fixture.writes.length,1); assert.equal(h.fixture.writes[0].data.price,10.5);
    assert.equal(h.price(),null,'Successful save closes the real modal');
  });
}

for (const complex of [false,true]) {
  for (const value of ['0','123.45']) {
    test(`create ${complex ? 'complex' : 'regular'} with price ${value}`, async t => {
      const h = await mount(t); await h.create(complex); await h.change(h.price(),value); await h.save();
      assert.equal(h.fixture.writes.length,1);
      const {method,data} = h.fixture.writes[0];
      assert.equal(method,'POST'); assert.equal(data.price,Number(value));
      assert.equal(data.service_type,complex ? 'complex' : 'regular');
      assert.deepEqual(data.components,complex ? [{service_id:'regular-fixture',service_name:'Fixture service',category:'',quantity:1,price:25,discount:0,doctor_id:''}] : []);
      assert.equal(h.fixture.services.at(-1).price,Number(value)); assert.equal(h.price(),null);
      assert.equal(h.fixture.reads.filter(path => path === '/api/service-prices').length,2);
    });
  }
  for (const existingPrice of [0,32.5]) {
    test(`edit ${complex ? 'complex' : 'regular'} retains valid price ${existingPrice}`, async t => {
      const h = await mount(t,{existingPrice,existingType:complex ? 'complex' : 'regular'}); await h.edit();
      assert.equal(h.price().value,String(existingPrice)); await h.save();
      assert.equal(h.fixture.writes.length,1); assert.equal(h.fixture.writes[0].method,'PUT');
      assert.equal(h.fixture.writes[0].data.price,existingPrice); assert.equal(h.price(),null);
      assert.equal(h.fixture.writes[0].data.description,'Fixture description');
    });
  }
}

const failures = [
  {name:'string',detail:'Услуга уже существует',expected:'Услуга уже существует'},
  {name:'validation array',detail:[{type:'float_parsing',loc:['body','price'],msg:'Input should be a valid number',input:'',url:'https://unused.test'}],expected:'price: Input should be a valid number',inline:true},
  {name:'validation object',detail:{loc:['body','price'],msg:'Недопустимая цена'},expected:'price: Недопустимая цена',inline:true},
  {name:'message object',detail:{message:'Проверьте данные услуги'},expected:'Проверьте данные услуги'},
  {name:'unknown object',detail:{unknown:{value:true}},expected:'Ошибка при сохранении услуги'},
  {name:'component validation',detail:[{loc:['body','components',0,'price'],msg:'Цена компонента должна быть больше 0'}],expected:'components.0.price: Цена компонента должна быть больше 0'}
];
for (const failure of failures) {
  test(`422 ${failure.name} renders safely in modal and allows retry`, async t => {
    const h = await mount(t,{detail:failure.detail}); await h.create(); await h.change(h.price(),'100'); await h.save();
    assert.equal(h.fixture.writes.length,1);
    const modal = document.querySelector('.modal-content'); assert.ok(modal);
    assert.ok(modal.textContent.includes(failure.expected));
    assert.equal(modal.textContent.includes('[object Object]'),false);
    if (failure.inline) h.inline(); else assert.equal(h.price().getAttribute('aria-invalid'),'false');
    h.fixture.detail = undefined; await h.save();
    assert.equal(h.fixture.writes.length,2); assert.equal(h.price(),null);
  });
}
