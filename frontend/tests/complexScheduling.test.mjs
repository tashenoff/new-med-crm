import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React, { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { isBookableSlot } from '../src/utils/scheduling.js';

const bootstrap = new JSDOM('<html><body></body></html>');
globalThis.window = bootstrap.window;
globalThis.document = bootstrap.window.document;
const { createRoot } = await import('react-dom/client');
delete globalThis.window;
delete globalThis.document;
bootstrap.window.close();

async function compile(path, mockServices = false, patientModal = false) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs',
    external: ['react', 'react-dom'], loader: { '.js': 'jsx' },
    define: { 'import.meta.env': '{}' },
    plugins: mockServices ? [{ name: 'services', setup(builder) {
      if (patientModal) {
        builder.onResolve({ filter: /\/useGlobalRefresh$|^\.\/Modal$/ }, args => ({ path: args.path, namespace: 'parent-mock' }));
        builder.onLoad({ filter: /.*/, namespace: 'parent-mock' }, args => ({
          contents: args.path.endsWith('useGlobalRefresh')
            ? 'export const useGlobalRefresh = () => ({ refreshTreatmentPlans() {} });'
            : 'export default props => props.show ? props.children : null;'
        }));
      }
      builder.onResolve({ filter: /ServiceCheckboxSelector/ }, () => ({ path: 'services', namespace: 'mock' }));
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({
        contents: `import React from 'react'; export default props =>
          React.createElement('button', { type: 'button', onClick: () => props.onAddServices(globalThis.scheduledServices) }, 'Add fixture');`
      }));
    } }] : []
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  return module.exports.default;
}

const PatientSelector = await compile('../src/components/treatment/ServiceSelector.js');
const ConsultationSelector = await compile('../src/components/consultations/ServiceCheckboxSelector.jsx');
const ConsultationForm = await compile('../src/components/consultations/ConsultationSheetForm.jsx', true);
const PatientModal = await compile('../src/components/modals/PatientModal.js', true, true);
const doctors = ['doctor-default', 'doctor-other'].map(doctor_id => ({
  doctor_id, doctor_name: doctor_id, has_schedule: true, schedule_start: '09:00', schedule_end: '11:00', booked: []
}));
const service = { id: 'package', service_name: 'Package', service_type: 'complex', category: 'Category', price: 100,
  components: ['component-a', 'component-b'].map(service_id => ({ service_id, service_name: service_id })) };
const availability = { complex_id: service.id, common_doctors: doctors,
  services: service.components.map(component => ({ ...component, doctors })) };

test('slot validation independently requires matching doctor, bounds and exactly 30 minutes', () => {
  const endTime = start => start === '10:00' ? '10:30' : '09:00';
  const slot = { doctor_id: doctors[0].doctor_id, start: '10:00', end: '10:30' };
  assert.equal(isBookableSlot(doctors[0], slot, ['10:00'], endTime), true);
  assert.equal(isBookableSlot(doctors[1], slot, ['10:00'], endTime), false);
  assert.equal(isBookableSlot(doctors[0], { ...slot, end: '' }, ['10:00'], endTime), false);
  assert.equal(isBookableSlot({ ...doctors[0], schedule_start: '10:15' }, slot, ['10:00'], endTime), false);
  assert.equal(isBookableSlot({ ...doctors[0], schedule_end: '10:15' }, slot, ['10:00'], endTime), false);
  assert.equal(isBookableSlot(doctors[0], { ...slot, start: '23:30', end: '09:00' }, ['23:30'], endTime), false);
});

async function mount(context, Component, props = {}, request = null, priceList = [service], availabilityFor = () => availability) {
  const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: 'http://localhost' });
  const globals = { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true, alert: message => alerts.push(message),
    fetch: async (url, options) => {
      if (options?.method === 'POST') return request(url, options);
      const data = String(url).includes('specialists-availability') ? availabilityFor(url)
        : String(url).includes('service-prices') ? priceList
        : String(url).includes('service-categories') ? [{ name: 'Category' }] : [];
      return { ok: true, json: async () => data };
    } };
  const alerts = [];
  const saved = Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const container = dom.window.document.getElementById('root');
  const root = createRoot(container);
  context.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    delete globalThis.scheduledServices;
  });
  await act(async () => root.render(React.createElement(Component, props)));
  const change = async (element, value) => {
    assert.ok(element, 'control exists');
    await act(async () => {
      const prototype = element.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
      element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
  };
  const click = async element => {
    assert.ok(element, 'button exists');
    await act(async () => element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
  };
  return { container, alerts, change, click, dom };
}
const button = (container, text) => [...container.querySelectorAll('button')].find(element => element.textContent.includes(text));
const doctorSelects = container => [...container.querySelectorAll('select')].filter(element => [...element.options].some(option => option.value === doctors[0].doctor_id));
const timeSelects = container => [...container.querySelectorAll('select')].filter(element => [...element.options].some(option => /^\d{2}:\d{2}$/.test(option.value)));

async function patientFixture(context) {
  const added = [];
  const ui = await mount(context, PatientSelector, { onlyComplex: true, onServiceAdd: value => added.push(value) });
  await ui.change([...ui.container.querySelectorAll('select')].find(element => [...element.options].some(option => option.value === service.id)), service.id);
  return { ...ui, added };
}
async function consultationFixture(context) {
  const added = [];
  const ui = await mount(context, ConsultationSelector, { onAddServices: values => added.push(...values), alreadyAddedIds: [] });
  await ui.click(ui.container.querySelector('input[type="checkbox"]'));
  return { ...ui, added };
}

test('patient common doctor mode emits one package appointment and stamps every component', async context => {
  const ui = await patientFixture(context);
  await ui.click(ui.container.querySelector('input[type="checkbox"]'));
  assert.equal(doctorSelects(ui.container).length, 1);
  await ui.change(timeSelects(ui.container)[0], '09:00');
  await ui.click(button(ui.container, 'Добавить'));
  assert.equal(ui.added[0].scheduling.slots.length, 1);
  assert.equal(ui.added[0].scheduling.slots[0].service_id, service.id);
  assert.equal(ui.added[0].scheduling.slots[0].doctor_id, doctors[0].doctor_id);
  assert.deepEqual(ui.added[0].components.map(component => component.doctor_id), doctors.slice(0, 1).flatMap(doctor => [doctor.doctor_id, doctor.doctor_id]));
});

test('patient common doctor mode stamps the selected second doctor into every component and appointment', async context => {
  const ui = await patientFixture(context);
  await ui.click(ui.container.querySelector('input[type="checkbox"]'));
  await ui.change(doctorSelects(ui.container)[0], doctors[1].doctor_id);
  await ui.change(timeSelects(ui.container)[0], '10:00');
  await ui.click(button(ui.container, 'Добавить'));
  assert.equal(ui.added.length, 1);
  assert.equal(ui.added[0].scheduling.slots.length, 1);
  assert.equal(ui.added[0].scheduling.slots[0].service_id, service.id);
  assert.equal(ui.added[0].scheduling.slots[0].doctor_id, doctors[1].doctor_id);
  assert.deepEqual(ui.added[0].components.map(component => component.doctor_id), service.components.map(() => doctors[1].doctor_id));
});

test('patient per-component defaults serialize the displayed doctor IDs', async context => {
  const ui = await patientFixture(context);
  await ui.change(timeSelects(ui.container)[0], '09:00');
  await ui.change(timeSelects(ui.container)[1], '10:00');
  await ui.click(button(ui.container, 'Добавить'));
  assert.equal(ui.added[0].scheduling.slots.length, 2);
  assert.deepEqual(ui.added[0].scheduling.slots.map(slot => slot.doctor_id), [doctors[0].doctor_id, doctors[0].doctor_id]);
  assert.deepEqual(ui.added[0].components.map(component => component.doctor_id), [doctors[0].doctor_id, doctors[0].doctor_id]);
});

for (const value of [doctors[1].doctor_id, '']) {
  test(`consultation replacing/removing doctor (${value}) drops stale appointments`, async context => {
    const ui = await consultationFixture(context);
    await ui.change(timeSelects(ui.container)[1], '');
    await ui.change(timeSelects(ui.container)[0], '09:00');
    await ui.change(doctorSelects(ui.container)[0], value);
    if (value) await ui.change(timeSelects(ui.container)[0], '10:00');
    await ui.click(button(ui.container, 'Добавить'));
    assert.equal(ui.added[0].scheduling.slots.length, value ? 1 : 0);
    if (value) {
      assert.equal(ui.added[0].scheduling.slots[0].doctor_id, value);
      assert.equal(ui.added[0].components[0].doctor_id, value);
      assert.equal(ui.added[0].scheduling.slots[0].start_time, '10:00');
    }
  });
}

test('consultation common default doctor is also serialized into components', async context => {
  const ui = await consultationFixture(context);
  await ui.click(ui.container.querySelectorAll('input[type="checkbox"]')[1]);
  await ui.change(timeSelects(ui.container)[0], '09:00');
  await ui.click(button(ui.container, 'Добавить'));
  assert.equal(ui.added[0].scheduling.slots.length, 1);
  assert.deepEqual(ui.added[0].components.map(component => component.doctor_id), [doctors[0].doctor_id, doctors[0].doctor_id]);
});

for (const common of [false, true]) {
  test(`patient ${common ? 'common' : 'component'} doctor changes and time removal keep only current slots`, async context => {
    const ui = await patientFixture(context);
    if (common) await ui.click(ui.container.querySelector('input[type="checkbox"]'));
    else await ui.change(timeSelects(ui.container)[1], '');
    await ui.change(timeSelects(ui.container)[0], '09:00');
    await ui.change(doctorSelects(ui.container)[0], doctors[1].doctor_id);
    assert.equal(timeSelects(ui.container)[0].value, '09:00');
    await ui.change(timeSelects(ui.container)[0], '10:00');
    await ui.change(timeSelects(ui.container)[0], '');
    await ui.click(button(ui.container, 'Добавить'));
    assert.equal(ui.added[0].scheduling.slots.length, 0);
    assert.equal(ui.added[0].components[0].doctor_id, doctors[1].doctor_id);
  });
}

test('consultation common date change replaces the old time with the new available slot', async context => {
  const ui = await consultationFixture(context);
  await ui.click(ui.container.querySelectorAll('input[type="checkbox"]')[1]);
  await ui.change(timeSelects(ui.container)[0], '10:00');
  await ui.change(ui.container.querySelector('input[type="date"]'), '2026-10-10');
  await ui.click(button(ui.container, 'Добавить'));
  assert.equal(ui.added[0].scheduling.slots.length, 1);
  assert.equal(ui.added[0].scheduling.slots[0].date, '2026-10-10');
  assert.equal(ui.added[0].scheduling.slots[0].start_time, '09:00');
});

test('switching patient packages reloads availability instead of reusing the previous doctors', async context => {
  const alternate = { ...service, id: 'alternate-package', service_name: 'Alternate', components: [{ service_id: 'alternate-component', service_name: 'Alternate component' }] };
  const alternateAvailability = { complex_id: alternate.id, common_doctors: [doctors[1]],
    services: alternate.components.map(component => ({ ...component, doctors: [doctors[1]] })) };
  const added = [];
  const ui = await mount(context, PatientSelector, { onlyComplex: true, onServiceAdd: value => added.push(value) }, null,
    [service, alternate], url => String(url).includes(alternate.id) ? alternateAvailability : availability);
  const serviceSelect = [...ui.container.querySelectorAll('select')].find(element => [...element.options].some(option => option.value === service.id));
  await ui.change(serviceSelect, service.id);
  await ui.change(timeSelects(ui.container)[0], '10:00');
  await ui.change(serviceSelect, alternate.id);
  const selectors = [...ui.container.querySelectorAll('select')].filter(element => [...element.options].some(option => option.value === doctors[1].doctor_id));
  assert.equal(selectors.length, 1);
  assert.equal(selectors[0].value, doctors[1].doctor_id);
  await ui.click(button(ui.container, 'Добавить'));
  assert.equal(added[0].scheduling.slots.length, 1);
  assert.equal(added[0].scheduling.slots[0].doctor_id, doctors[1].doctor_id);
  assert.equal(added[0].scheduling.slots[0].service_id, 'alternate-component');
  assert.equal(added[0].scheduling.slots[0].start_time, '09:00');
});

for (const Component of [PatientSelector, ConsultationSelector]) {
  for (const common of [false, true]) {
    const label = `autofill ${Component === PatientSelector ? 'patient' : 'consultation'} ${common ? 'common' : 'component'}`;
    const today = new Date().toISOString().slice(0, 10);
    const futureDate = offset => {
      const date = new Date(`${today}T00:00:00`);
      date.setDate(date.getDate() + offset);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };
    const dayName = date => ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][new Date(`${date}T00:00:00`).getDay()];
    const fixture = async (context, availabilityFor) => {
      const added = [];
      const ui = await mount(context, Component, { onlyComplex: true, onServiceAdd: value => added.push(value),
        onAddServices: values => added.push(...values) }, null, [service], availabilityFor);
      if (Component === PatientSelector) {
        await ui.change(ui.container.querySelector('select'), service.id);
      } else {
        await ui.click(ui.container.querySelector('input[type="checkbox"]'));
      }
      if (common) await ui.click(ui.container.querySelectorAll('input[type="checkbox"]')[Component === PatientSelector ? 0 : 1]);
      return { ...ui, added };
    };
    const response = (date, noFree = false) => {
      const scheduledDoctors = doctors.map((doctor, index) => ({ ...doctor,
        working_days: [dayName(futureDate(index + 1))],
        has_schedule: date === futureDate(index + 1) || date === futureDate(3),
        booked: noFree ? ['09:00', '09:30', '10:00', '10:30']
          : date === futureDate(3) ? ['09:00', '09:30'] : index ? ['09:00', '09:30', '10:00'] : ['09:00'] }));
      return { ...availability, common_doctors: scheduledDoctors,
        services: availability.services.map(component => ({ ...component, doctors: scheduledDoctors })) };
    };
    for (const state of ['pending', 'missing', 'no schedule', 'common mismatch', 'component mismatch', 'missing components', 'missing doctors', 'short window']) {
      test(`${label} final clarification blocks ${state} availability and serialization`, async context => {
        let resolveAvailability;
        const ui = await fixture(context, () => {
          if (state === 'pending') return new Promise(resolve => { resolveAvailability = resolve; });
          if (state === 'missing') return null;
          if (state === 'missing components') return { ...availability, services: [] };
          if (state === 'missing doctors') return { ...availability, common_doctors: [],
            services: availability.services.map(component => ({ ...component, doctors: [] })) };
          const unavailable = doctors.map(doctor => ({ ...doctor,
            has_schedule: state !== 'no schedule',
            schedule_end: state === 'short window' ? '09:15' : doctor.schedule_end }));
          return { ...availability,
            common_doctors: state === 'common mismatch' ? unavailable.map(doctor => ({ ...doctor, has_schedule: false })) : unavailable,
            services: availability.services.map(component => ({ ...component,
              doctors: state === 'component mismatch' ? unavailable.map(doctor => ({ ...doctor, has_schedule: false })) : unavailable })) };
        });
        try {
          if (common && ['missing components', 'component mismatch'].includes(state)) {
            assert.equal(button(ui.container, 'Добавить').disabled, false, 'common candidates are authoritative');
            await ui.click(button(ui.container, 'Добавить'));
            assert.equal(ui.added[0].scheduling.slots.length, 1);
          } else if (!common && state === 'common mismatch') {
            assert.equal(button(ui.container, 'Добавить').disabled, false, 'component candidates are authoritative');
            await ui.click(button(ui.container, 'Добавить'));
            assert.equal(ui.added[0].scheduling.slots.length, 2);
          } else {
            assert.equal(button(ui.container, 'Добавить').disabled, true);
            assert.ok([...ui.container.querySelectorAll('input[type="time"]')].every(input => input.disabled));
            await act(async () => {
              const add = button(ui.container, 'Добавить');
              const propsKey = Object.keys(add).find(key => key.startsWith('__reactProps$'));
              add[propsKey].onClick();
            });
            assert.equal(ui.added.length, 0);
            assert.equal(timeSelects(ui.container).length, 0, 'no incomplete 30-minute slot is selectable');
          }
        } finally {
          if (resolveAvailability) await act(async () => resolveAvailability(availability));
        }
      });
    }
    test(`${label} rejects a forged end and preserves a valid alternative`, async context => {
      const ui = await fixture(context, () => availability);
      await ui.change(timeSelects(ui.container)[0], '10:00');
      const end = ui.container.querySelector('input[type="date"]').parentElement.querySelector('input[type="time"]');
      await ui.change(end, '10:45');
      assert.equal(button(ui.container, 'Добавить').disabled, true);
      await ui.click(button(ui.container, 'Добавить'));
      assert.equal(ui.added.length, 0);
      await ui.change(timeSelects(ui.container)[0], '10:30');
      await ui.click(button(ui.container, 'Добавить'));
      assert.equal(ui.added[0].scheduling.slots[0].start_time, '10:30');
      assert.equal(ui.added[0].scheduling.slots[0].end_time, '11:00');
    });
    {
      for (const invalidStart of ['09:00', '09:45', '23:00']) {
        test(`${label} rejects scheduled booked/off-grid/outside time ${invalidStart}`, async context => {
          const scheduled = doctors.map(doctor => ({ ...doctor, booked: ['09:00'] }));
          const ui = await fixture(context, () => ({ ...availability, common_doctors: scheduled,
            services: availability.services.map(component => ({ ...component, doctors: scheduled })) }));
          const start = timeSelects(ui.container)[0];
          assert.ok(![...start.options].some(option => option.value === invalidStart));
          const option = ui.dom.window.document.createElement('option');
          option.value = invalidStart;
          start.append(option);
          await ui.change(start, invalidStart);
          await ui.click(button(ui.container, 'Добавить'));
          assert.equal(ui.added.length, 0, 'serialization must revalidate even a tampered control');
          await act(async () => {
            const add = button(ui.container, 'Добавить');
            const propsKey = Object.keys(add).find(key => key.startsWith('__reactProps$'));
            add[propsKey].onClick();
          });
          assert.equal(ui.added.length, 0, 'the Add handler also blocks invalid slots independently of its disabled button');
        });
      }
      test(`${label} absent exact-date availability never enables manual scheduling`, async context => {
        const ui = await fixture(context, url => {
          const date = new URL(url, 'http://localhost').searchParams.get('date');
          return date === futureDate(3) ? null : response(date);
        });
        await ui.change(ui.container.querySelector('input[type="date"]'), futureDate(3));
        const manual = ui.container.querySelector('input[type="date"]').parentElement.querySelector('input[type="time"]');
        assert.equal(manual.disabled, true);
        await ui.change(manual, '13:00');
        await ui.click(button(ui.container, 'Добавить'));
        assert.equal(ui.added.length, 0);
        assert.match(ui.container.textContent, /Загрузка доступности/);
      });
      test(`${label} regression rejects a manually extended scheduled slot`, async context => {
        const ui = await fixture(context, () => availability);
        await ui.change(ui.container.querySelector('input[type="date"]').parentElement.querySelector('input[type="time"]'), '23:30');
        await ui.click(button(ui.container, 'Добавить'));
        assert.equal(ui.added.length, 0, 'scheduled slots must remain free 30-minute choices');
      });
      for (const changeDoctor of [false, true]) {
        test(`${label} regression blocks manual entry and Add during async ${changeDoctor ? 'doctor' : 'date'} load`, async context => {
          let resolveAvailability;
          const target = futureDate(changeDoctor ? 2 : 3);
          const ui = await fixture(context, url => {
            const date = new URL(url, 'http://localhost').searchParams.get('date');
            return date === target ? new Promise(resolve => { resolveAvailability = () => resolve(response(date)); }) : response(date);
          });
          if (changeDoctor) await ui.change(doctorSelects(ui.container)[0], doctors[1].doctor_id);
          else await ui.change(ui.container.querySelector('input[type="date"]'), target);
          const manual = ui.container.querySelector('input[type="date"]').parentElement.querySelector('input[type="time"]');
          await ui.change(manual, '23:00');
          await ui.click(button(ui.container, 'Добавить'));
          assert.equal(ui.added.length, 0, 'loading cannot serialize an appointment');
          assert.equal(manual.disabled, true);
          assert.match(ui.container.textContent, /Загрузка доступности/);
          await act(async () => resolveAvailability());
          assert.equal(timeSelects(ui.container)[0].value, changeDoctor ? '10:30' : '10:00');
          await ui.change(timeSelects(ui.container)[0], '10:30');
          await ui.click(button(ui.container, 'Добавить'));
          assert.equal(ui.added[0].scheduling.slots[0].start_time, '10:30');
        });
      }
    }
    for (const otherCandidates of [false, true]) {
      test(`${label} exact-date availability missing selected doctor blocks Add and manual input (${otherCandidates})`, async context => {
        const ui = await fixture(context, url => {
          const date = new URL(url, 'http://localhost').searchParams.get('date');
          if (date !== futureDate(3)) return availability;
          const candidates = otherCandidates ? [doctors[0]] : [];
          return { ...availability, common_doctors: candidates,
            services: availability.services.map((component, index) => index === 0 ? { ...component, doctors: candidates } : component) };
        });
        await ui.change(doctorSelects(ui.container)[0], doctors[1].doctor_id);
        await ui.change(timeSelects(ui.container)[0], '10:00');
        await ui.change(ui.container.querySelector('input[type="date"]'), futureDate(3));
        const doctorControl = [...ui.container.querySelectorAll('select')].find(element => [...element.options].some(option => option.textContent.includes('doctor-')));
        assert.equal(doctorControl.value, doctors[1].doctor_id, 'doctor selection persists');
        const row = ui.container.querySelector('input[type="date"]').parentElement;
        const manual = row.querySelector('input[type="time"]');
        assert.equal(manual.value, '', 'previous time is cleared');
        assert.equal(manual.disabled, true, 'missing doctor is not an unscheduled doctor');
        assert.equal(button(ui.container, 'Добавить').disabled, true);
        await ui.change(manual, '13:00');
        await act(async () => {
          const add = button(ui.container, 'Добавить');
          const propsKey = Object.keys(add).find(key => key.startsWith('__reactProps$'));
          add[propsKey].onClick();
        });
        assert.equal(ui.added.length, 0, 'handler also blocks stale serialization');
      });
    }
    {
      for (const changeDoctor of [false, true]) {
        test(`${label} regression unscheduled doctor stays blocked after ${changeDoctor ? 'doctor' : 'date'} change`, async context => {
          const unscheduled = doctors.map(doctor => ({ ...doctor, has_schedule: false }));
          const ui = await fixture(context, () => ({ ...availability, common_doctors: unscheduled,
            services: availability.services.map(component => ({ ...component, doctors: unscheduled })) }));
          const date = ui.container.querySelector('input[type="date"]');
          const manual = date.parentElement.querySelector('input[type="time"]');
          await ui.change(manual, '13:00');
          if (changeDoctor) await ui.change(doctorSelects(ui.container)[0], doctors[1].doctor_id);
          else await ui.change(date, futureDate(3));
          assert.equal(manual.value, '', 'manual time cannot carry over to a different selection');
          assert.equal(manual.disabled, true, 'unscheduled doctors never permit manual booking');
          assert.equal(button(ui.container, 'Добавить').disabled, true);
          await ui.click(button(ui.container, 'Добавить'));
          assert.equal(ui.added.length, 0);
        });
      }
    }
    if (common) {
      for (const otherCandidates of [false, true]) {
        test(`${label} regression rejects exact-date common doctor mismatch (${otherCandidates})`, async context => {
          const ui = await fixture(context, url => {
            const date = new URL(url, 'http://localhost').searchParams.get('date');
            return date === futureDate(3) ? { ...response(date), common_doctors: otherCandidates ? [doctors[1]] : [] } : response(date);
          });
          await ui.change(ui.container.querySelector('input[type="date"]'), futureDate(3));
          const manual = ui.container.querySelector('input[type="date"]').parentElement.querySelector('input[type="time"]');
          if (manual) await ui.change(manual, '13:00');
          await ui.click(button(ui.container, 'Добавить'));
          assert.equal(ui.added.length, 0, 'a doctor from another date is not a common candidate');
          assert.match(ui.container.textContent, /недоступен/);
          assert.ok(manual?.disabled);
        });
      }
    }
      test(`${label} regression unscheduled exact-date doctor cannot be booked even through handler`, async context => {
        const ui = await fixture(context, url => {
          const date = new URL(url, 'http://localhost').searchParams.get('date');
          const unscheduled = [{ ...doctors[0], has_schedule: false }];
          return date === futureDate(3) ? { ...response(date), common_doctors: unscheduled,
            services: availability.services.map(component => ({ ...component, doctors: unscheduled })) } : response(date);
        });
        await ui.change(ui.container.querySelector('input[type="date"]'), futureDate(3));
        const manual = ui.container.querySelector('input[type="date"]').parentElement.querySelector('input[type="time"]');
        assert.equal(manual.value, '', 'scheduled time does not carry over to manual input');
        await ui.change(manual, '13:00');
        const add = button(ui.container, 'Добавить');
        const propsKey = Object.keys(add).find(key => key.startsWith('__reactProps$'));
        const handleAdd = add[propsKey].onClick;
        await ui.click(button(ui.container, 'Добавить'));
        await act(async () => handleAdd());
        assert.equal(ui.added.length, 0, 'neither the button nor handler may book an unscheduled doctor');
        assert.equal(manual.disabled, true);
        assert.equal(button(ui.container, 'Добавить').disabled, true);
      });
    test(`${label} regression valid exact-date free slot remains bookable`, async context => {
      const ui = await fixture(context, url => response(new URL(url, 'http://localhost').searchParams.get('date')));
      await ui.change(ui.container.querySelector('input[type="date"]'), futureDate(3));
      await ui.change(timeSelects(ui.container)[0], '10:30');
      await ui.click(button(ui.container, 'Добавить'));
      const slot = ui.added[0].scheduling.slots[0];
      assert.equal(slot.date, futureDate(3));
      assert.equal(slot.start_time, '10:30');
      assert.equal(slot.end_time, '11:00');
      assert.equal(slot.doctor_id, doctors[0].doctor_id);
      assert.equal(slot.service_id, common ? service.id : service.components[0].service_id);
    });
    test(`${label} fills today's default slot without manual selection`, async context => {
      const ui = await fixture(context, () => availability);
      assert.equal(ui.container.querySelector('input[type="date"]').value, today);
      assert.equal(timeSelects(ui.container)[0].value, '09:00');
      await ui.click(button(ui.container, 'Добавить'));
      const slots = ui.added[0].scheduling.slots;
      assert.equal(slots.length, common ? 1 : service.components.length);
      assert.ok(slots.every(slot => slot.date === today && slot.start_time === '09:00' && slot.end_time === '09:30'));
    });
    test(`${label} defaults to nearest working date and first unbooked time; alternatives remain editable`, async context => {
      const ui = await fixture(context, url => response(new URL(url, 'http://localhost').searchParams.get('date')));
      assert.equal(ui.container.querySelector('input[type="date"]').value, futureDate(1));
      const start = timeSelects(ui.container)[0];
      assert.ok(start, 'working date availability is loaded automatically');
      assert.equal(start.value, '09:30');
      assert.equal(ui.container.querySelector('input[type="time"]').value, '10:00');
      assert.ok(![...start.options].some(option => option.value === '09:00'), 'booked time is excluded');
      await ui.change(start, '10:00');
      assert.equal(start.value, '10:00');
      await ui.click(button(ui.container, 'Добавить'));
      assert.equal(ui.added[0].scheduling.slots[0].date, futureDate(1));
      assert.equal(ui.added[0].scheduling.slots[0].start_time, '10:00');
    });
    test(`${label} doctor/date changes discard stale time and wait for new availability`, async context => {
      let resolveDate;
      const ui = await fixture(context, url => {
        const date = new URL(url, 'http://localhost').searchParams.get('date');
        return date === futureDate(3) ? new Promise(resolve => { resolveDate = () => resolve(response(date)); }) : response(date);
      });
      await ui.change(doctorSelects(ui.container)[0], doctors[1].doctor_id);
      assert.equal(ui.container.querySelector('input[type="date"]').value, futureDate(2));
      assert.equal(timeSelects(ui.container)[0].value, '10:30');
      await ui.change(ui.container.querySelector('input[type="date"]'), futureDate(3));
      assert.equal(ui.container.querySelector('input[type="time"]').value, '', 'old time is cleared while loading');
      await act(async () => resolveDate());
      assert.equal(timeSelects(ui.container)[0].value, '10:00');
      await ui.change(timeSelects(ui.container)[0], '10:30');
      await ui.click(button(ui.container, 'Добавить'));
      assert.equal(ui.added[0].scheduling.slots[0].doctor_id, doctors[1].doctor_id);
      assert.equal(ui.added[0].scheduling.slots[0].date, futureDate(3));
      assert.equal(ui.added[0].scheduling.slots[0].start_time, '10:30');
    });
    test(`${label} changes to booked/missing schedules clear stale time and block manual booking`, async context => {
      const ui = await fixture(context, url => {
        const date = new URL(url, 'http://localhost').searchParams.get('date');
        const unavailable = doctors.map((doctor, index) => ({ ...doctor, has_schedule: date === today,
          booked: index ? ['09:00', '09:30', '10:00', '10:30'] : [] }));
        return { ...availability, common_doctors: unavailable,
          services: availability.services.map(component => ({ ...component, doctors: unavailable })) };
      });
      await ui.change(timeSelects(ui.container)[0], '10:00');
      await ui.change(doctorSelects(ui.container)[0], doctors[1].doctor_id);
      const dateInput = ui.container.querySelector('input[type="date"]');
      const startSelect = dateInput.parentElement.querySelector('select');
      assert.equal(startSelect.value, '');
      assert.deepEqual([...startSelect.options].map(option => option.value), ['']);
      await ui.change(dateInput, futureDate(3));
      const manualStart = dateInput.parentElement.querySelector('input[type="time"]');
      assert.equal(manualStart.value, '');
      assert.equal(manualStart.disabled, true);
      await ui.change(manualStart, '13:00');
      await ui.click(button(ui.container, 'Добавить'));
      assert.equal(ui.added.length, 0);
      await ui.change(doctorSelects(ui.container)[0], '');
      assert.equal(ui.container.querySelector('input[type="date"]').parentElement.querySelector('input[type="time"]').value, '');
    });
    for (const booked of [false, true]) {
      test(`${label} ${booked ? 'fully booked permits no appointments' : 'missing schedule blocks booking'}`, async context => {
        const unavailable = doctors.map(doctor => ({ ...doctor, has_schedule: booked,
          booked: booked ? ['09:00', '09:30', '10:00', '10:30'] : [] }));
        const ui = await fixture(context, () => ({ ...availability, common_doctors: unavailable,
          services: availability.services.map(component => ({ ...component, doctors: unavailable })) }));
        assert.equal(ui.container.querySelector('input[type="date"]').value, today);
        assert.ok([...ui.container.querySelectorAll('input[type="time"], select')]
          .filter(control => control.type === 'time' || [...control.options].some(option => option.textContent === '—'))
          .filter(control => !doctorSelects(ui.container).includes(control)).every(control => control.value === ''));
        await ui.click(button(ui.container, 'Добавить'));
        if (booked) assert.equal(ui.added[0].scheduling.slots.length, 0);
        else assert.equal(ui.added.length, 0);
      });
    }
  }
  test(`${Component === PatientSelector ? 'patient' : 'consultation'} regular services remain unscheduled`, async context => {
    const regular = { ...service, service_type: 'regular', components: [] };
    const added = [];
    const ui = await mount(context, Component, { onServiceAdd: value => added.push(value), onAddServices: values => added.push(...values) }, null, [regular]);
    if (Component === PatientSelector) {
      await ui.change(ui.container.querySelector('select'), 'Category');
      await ui.change([...ui.container.querySelectorAll('select')].find(element => [...element.options].some(option => option.value === service.id)), service.id);
    } else {
      await ui.click(ui.container.querySelector('input[type="checkbox"]'));
    }
    await ui.click(button(ui.container, 'Добавить'));
    assert.equal(added.length, 1);
    assert.equal(added[0].scheduling, undefined);
    assert.equal(added[0].is_complex, undefined);
    assert.equal(added[0].total_price, 100);
  });
}

async function formFixture(context, onSave, request, onSaved = () => {}) {
  globalThis.scheduledServices = [{ service_id: service.id, service_name: service.service_name,
    quantity: 1, price_per_unit: 100, total_price: 100,
    scheduling: { slots: [{ doctor_id: doctors[0].doctor_id, service_id: service.id, date: '2026-10-09', start_time: '09:00' }] } }];
  const ui = await mount(context, ConsultationForm, { patientId: 'patient', onSave, onSaved }, request);
  await ui.click(button(ui.container, 'Add fixture'));
  return { ...ui, submit: async () => {
    await act(async () => ui.container.querySelector('form').dispatchEvent(new ui.dom.window.Event('submit', { bubbles: true, cancelable: true })));
  } };
}

test('plan save failure creates no appointments and reports an error', async context => {
  let appointments = 0;
  const ui = await formFixture(context, async () => { throw new Error('Plan failed'); }, async () => { appointments++; return { ok: true }; });
  await ui.submit();
  assert.equal(appointments, 0);
  assert.match(ui.container.textContent, /Plan failed/);
});

test('appointments wait for plan persistence and completion waits for appointments', async context => {
  const events = [];
  let resolvePlan;
  let resolveAppointment;
  const ui = await formFixture(context, () => {
    events.push('plan'); return new Promise(resolve => { resolvePlan = resolve; });
  }, () => {
    events.push('appointment'); return new Promise(resolve => { resolveAppointment = resolve; });
  }, () => events.push('complete'));
  await ui.submit();
  assert.deepEqual(events, ['plan']);
  await act(async () => resolvePlan());
  assert.deepEqual(events, ['plan', 'appointment']);
  await act(async () => resolveAppointment({ ok: true }));
  assert.deepEqual(events, ['plan', 'appointment', 'complete']);
});

for (const networkFailure of [false, true]) {
  test(`appointment ${networkFailure ? 'network' : 'HTTP'} failure never reports completion`, async context => {
    let completed = false;
    const ui = await formFixture(context, async () => {}, async () => {
      if (networkFailure) throw new Error('Network failed');
      return { ok: false, status: 409, json: async () => ({ detail: 'Slot occupied' }) };
    }, () => { completed = true; });
    await ui.submit();
    assert.equal(completed, false);
    assert.match(ui.container.textContent, networkFailure ? /Network failed/ : /Slot occupied/);
  });
}

test('patient-card consultation save propagates HTTP failure without closing or scheduling', async context => {
  globalThis.scheduledServices = [{ service_id: service.id, service_name: service.service_name,
    quantity: 1, price_per_unit: 100, total_price: 100,
    scheduling: { slots: [{ doctor_id: doctors[0].doctor_id, service_id: service.id, date: '2026-10-09', start_time: '09:00' }] } }];
  const requests = [];
  const ui = await mount(context, PatientModal, { show: true, editingItem: { id: 'patient', full_name: 'Test Patient' } }, async url => {
    requests.push(String(url));
    return { ok: false, status: 500, json: async () => ({ detail: 'Plan persistence failed' }) };
  });
  await ui.click(button(ui.container, 'Консультации'));
  await ui.click(ui.container.querySelector('[data-guide="new-consultation-btn"]'));
  await ui.click(button(ui.container, 'Add fixture'));
  await act(async () => ui.container.querySelector('form').dispatchEvent(new ui.dom.window.Event('submit', { bubbles: true, cancelable: true })));
  assert.equal(requests.length, 1);
  assert.ok(requests[0].endsWith('/consultation-sheets'));
  assert.match(ui.container.textContent, /Plan persistence failed/);
  assert.ok(button(ui.container, 'Add fixture'), 'form remains open on failure');
});
