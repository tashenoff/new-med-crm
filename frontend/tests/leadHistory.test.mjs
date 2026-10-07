import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { countRealCalls, historyDate, historyInquiries, historyPhones, historySources, historyStatusLabel } from '../src/utils/leadHistory.js';

const compiled = await build({
  entryPoints: [fileURLToPath(new URL('../src/components/crm/leads/LeadHistoryTimeline.jsx', import.meta.url))],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  external: ['react']
});
const componentModule = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(
  createRequire(import.meta.url), componentModule, componentModule.exports
);
const { LeadHistoryTimeline } = componentModule.exports;

const lead = {
  id: 'lead-internal-id', full_name: 'Анна Иванова', source: 'whatsapp',
  source_id: 'source-internal-id', status: 'in_progress',
  created_at: '2026-10-01T10:30:00Z', phone: '+7 (701) 234-56-78',
  description: 'Нужна консультация', notes: 'Нужна консультация',
  converted_to_appointment_id: 'appointment-internal-id', contact_attempts: 99,
  linked_inquiries: [
    { id: 'repeat-id', source: 'phone', status: 'contacted', created_at: '2026-10-02T12:00:00Z', phone: '87012345678' }
  ]
};

const render = (props = {}) => renderToStaticMarkup(React.createElement(LeadHistoryTimeline, { lead, ...props }));
const withoutTechnicalDetails = html => html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g, '');

test('Russian timeline renders source badges, statuses and concise nonduplicated notes', () => {
  const html = withoutTechnicalDetails(render({ calls: { status: 'ready', count: 3 } }));
  assert.match(html, /История обращений/);
  assert.match(html, /aria-label="Хронология обращений"/);
  assert.match(html, /Первое обращение/);
  assert.match(html, /Повторное обращение/);
  assert.match(html, /rounded-full[^>]*>WhatsApp/);
  assert.match(html, /rounded-full[^>]*>Телефон/);
  assert.match(html, /В работе/);
  assert.match(html, /Связались/);
  assert.match(html, /октября/);
  assert.equal(html.match(/Нужна консультация/g).length, 1);
  assert.doesNotMatch(html, /Анна Иванова/);
});

test('IDs and raw enums remain available only inside closed native details', () => {
  const html = render();
  const details = [...html.matchAll(/<details\b([^>]*)>([\s\S]*?)<\/details>/g)];
  assert.equal(details.length, 2);
  for (const [, attributes, content] of details) {
    assert.doesNotMatch(attributes, /\bopen\b/);
    assert.match(content, /<summary[^>]*>Технические данные<\/summary>/);
  }
  assert.match(html, /lead-internal-id/);
  assert.match(html, /source-internal-id/);
  assert.match(html, /appointment-internal-id/);
  assert.match(html, /in_progress/);
  const visible = withoutTechnicalDetails(html);
  assert.doesNotMatch(visible, /internal-id|repeat-id|in_progress|contacted|whatsapp/);
  assert.match(visible, /Создана запись на приём/);
});

test('unknown source/status codes and missing dates have readable Russian fallbacks', () => {
  const html = withoutTechnicalDetails(render({ lead: { id: 'unknown', source: 'new_channel', status: 'future_status', created_at: 'bad-date' } }));
  assert.match(html, /Источник не указан/);
  assert.match(html, /Статус не указан/);
  assert.match(html, /Дата не указана/);
  assert.doesNotMatch(html, /new_channel|future_status|Invalid Date|undefined/);
  assert.equal(historyDate(null), 'Дата не указана');
});

test('all locally defined backend sources and lead statuses are translated', () => {
  for (const source of ['website', 'phone', 'email', 'social', 'referral', 'advertising', 'walk_in', 'whatsapp', 'other']) {
    const html = withoutTechnicalDetails(render({ lead: { source, status: 'new' } }));
    assert.ok(html.includes(historySources[source]));
    assert.doesNotMatch(html, /Источник не указан/);
  }
  for (const status of ['new', 'contacted', 'in_progress', 'converted', 'closed', 'qualified', 'rejected', 'lost']) {
    assert.notEqual(historyStatusLabel('lead', status), 'Статус не указан');
    assert.match(withoutTechnicalDetails(render({ lead: { status } })), new RegExp(historyStatusLabel('lead', status)));
  }
});

test('plan, payment and appointment statuses match local backend enums', () => {
  assert.equal(historyStatusLabel('plan', 'draft'), 'Черновик');
  assert.equal(historyStatusLabel('payment', 'partially_paid'), 'Частично оплачен');
  assert.equal(historyStatusLabel('appointment', 'cancelled'), 'Отменён');
  assert.equal(historyStatusLabel('appointment', 'no_show'), 'Не явился');
  for (const [kind, statuses] of Object.entries({
    plan: ['draft', 'approved', 'completed', 'cancelled', 'in_progress'],
    payment: ['unpaid', 'partially_paid', 'paid', 'overdue'],
    appointment: ['unconfirmed', 'confirmed', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_show']
  })) {
    for (const status of statuses) assert.notEqual(historyStatusLabel(kind, status), 'Статус не указан');
    assert.equal(historyStatusLabel(kind, 'future_enum'), 'Статус не указан');
  }
});

test('timeline sorts oldest first, deduplicates IDs and preserves the primary marker', () => {
  const input = { ...lead, linked_inquiries: [
    lead,
    { id: 'late', created_at: '2026-10-04T10:00:00Z' },
    { id: 'early', created_at: '2026-09-30T10:00:00Z' },
    { id: 'missing', created_at: null }
  ] };
  assert.deepEqual(historyInquiries(input).map(({ inquiry }) => inquiry.id), ['early', lead.id, 'late', 'missing']);
  assert.equal(historyInquiries(input).find(({ inquiry }) => inquiry.id === lead.id).primary, true);
  assert.equal(historyInquiries(input).find(({ inquiry }) => inquiry.id === 'early').primary, false);
  assert.ok(render({ lead: input }).indexOf('early') < render({ lead: input }).indexOf('late'));
});

test('loading, error, unavailable phone and zero calls are distinguishable', () => {
  assert.match(render(), /Загрузка…/);
  assert.match(render({ calls: { status: 'error', count: null } }), /Не удалось загрузить/);
  assert.match(render({ calls: { status: 'ready', count: null } }), /Нет номера телефона/);
  const zero = render({ calls: { status: 'ready', count: 0 } });
  assert.match(zero, /Звонки: <\/span>0/);
  assert.doesNotMatch(zero, /99|Не удалось|Загрузка/);
  assert.match(zero, /Обращения не считаются звонками/);
});

test('empty history renders a Russian empty state', () => {
  assert.match(render({ lead: null }), /Обращения не найдены/);
});

test('phone queries use backend last-ten-digit matching and deduplicate linked phones', () => {
  assert.deepEqual(historyPhones(lead), ['7012345678']);
  assert.deepEqual(historyPhones({ phone: '7012345678', linked_inquiries: [{ phone: '+7 701 234 56 78' }, { phone: '+7 702 345 67 89' }] }), ['7012345678', '7023456789']);
  assert.deepEqual(historyPhones({ phone: 'bad', linked_inquiries: [{ phone: '' }, { phone: '123' }] }), []);
});

test('call count includes all pages and every real call status, not contact attempts', async () => {
  const requests = [];
  const count = await countRealCalls(async params => {
    requests.push(params);
    return params.offset === 0
      ? Array.from({ length: 500 }, (_, index) => ({ id: `call-${index}`, status: ['answered', 'missed', 'rejected', 'busy', 'failed'][index % 5] }))
      : [{ id: 'last-call', status: 'answered' }];
  }, historyPhones(lead));
  assert.equal(count, 501);
  assert.deepEqual(requests, [
    { phone: '7012345678', limit: 500, offset: 0 },
    { phone: '7012345678', limit: 500, offset: 500 }
  ]);
});

test('exact page boundary fetches the next empty page instead of truncating', async () => {
  const offsets = [];
  assert.equal(await countRealCalls(async ({ offset }) => {
    offsets.push(offset);
    return offset === 0 ? Array.from({ length: 500 }, () => ({ id: null })) : [];
  }, ['7012345678']), 500);
  assert.deepEqual(offsets, [0, 500]);
});

test('counts records without IDs and deduplicates known IDs across phone queries', async () => {
  assert.equal(await countRealCalls(async ({ phone }) => phone === '7012345678'
    ? [{ id: 'same-call' }, { id: null }, { id: 'unique-call' }]
    : [{ id: 'same-call' }, { id: null }], ['7012345678', '7023456789']), 4);
});

test('no phone skips the API; successful empty history returns zero', async () => {
  assert.equal(await countRealCalls(() => { throw new Error('Must not fetch'); }, []), null);
  assert.equal(await countRealCalls(async () => [], ['7012345678']), 0);
});

test('failed, malformed and partially loaded responses never become a zero or partial count', async () => {
  await assert.rejects(countRealCalls(async () => { throw new Error('Forbidden'); }, ['7012345678']), /Forbidden/);
  await assert.rejects(countRealCalls(async () => ({ calls: [] }), ['7012345678']), /Некорректный ответ/);
  await assert.rejects(countRealCalls(async ({ offset }) => {
    if (offset) throw new Error('Page failed');
    return Array.from({ length: 500 }, (_, index) => ({ id: `call-${index}` }));
  }, ['7012345678']), /Page failed/);
});
