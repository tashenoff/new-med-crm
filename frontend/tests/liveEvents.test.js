import test from 'node:test';
import { claimNotificationId } from '../src/utils/notificationIds.js';
import assert from 'node:assert/strict';
import { connectLiveEvents, crmCardNotification, liveEventsUrl } from '../src/api/liveEvents.js';

const created = { version: 1, event_id: 'crm.card.created:lead:1', type: 'crm.card.created', entity_type: 'lead', card_id: '1',
  title: 'A lead', timestamp: '2026-10-15T10:00:00Z' };

function fixture() {
  const sockets = [];
  const timers = new Map();
  const events = [];
  let timerId = 0;
  class FakeSocket {
    constructor(url) { this.url = url; this.sent = []; sockets.push(this); }
    send(data) { this.sent.push(JSON.parse(data)); }
    close(code = 1000) { this.closed = true; this.onclose?.({ code }); }
    message(event) { this.onmessage?.({ data: JSON.stringify(event) }); }
  }
  const stop = connectLiveEvents({ url: 'wss://example.com/api/ws/events', token: 'secret',
    onEvent: event => events.push(event), WebSocketImpl: FakeSocket,
    setTimer: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimer: id => timers.delete(id),
  });
  const nextTimer = () => {
    const [id, timer] = timers.entries().next().value;
    timers.delete(id);
    timer.fn();
    return timer.delay;
  };
  return { sockets, timers, events, stop, nextTimer };
}

test('endpoint follows configured protocol and base path without credentials', () => {
  assert.equal(liveEventsUrl('https://example.com/', 'https://front.test'), 'wss://example.com/api/ws/events');
  assert.equal(liveEventsUrl('http://localhost:8001/base/', 'https://front.test'), 'ws://localhost:8001/base/api/ws/events');
  assert.equal(liveEventsUrl('', 'https://front.test'), 'wss://front.test/api/ws/events');
  assert.equal(liveEventsUrl('/backend', 'https://front.test'), 'wss://front.test/backend/api/ws/events');
});

test('only versioned well-formed CRM lead card events become stable session notification IDs', () => {
  const notification = crmCardNotification(created);
  assert.equal(notification.id, 'crm.card.created:lead:1');
  assert.equal(notification.message, 'A lead');
  assert.equal(notification.title, 'Новая карточка CRM');
  assert.equal(notification.timestamp.toISOString(), created.timestamp.replace('Z', '.000Z'));
  assert.equal(notification.toast, true);
  assert.equal(crmCardNotification({ ...created, event_id: 'another-id' }).id, notification.id);
  for (const event of [null, {}, { ...created, version: 2 }, { ...created, type: 'unknown' },
    { ...created, type: 'deal.created' }, { ...created, entity_type: 'deal' },
    { ...created, event_id: '' }, { ...created, entity_type: undefined },
    { ...created, timestamp: 'invalid' }, { ...created, card_id: '' }, { ...created, title: null }]) {
    assert.equal(crmCardNotification(event), null);
  }
});

test('token is sent only in first frame and application events wait for auth acknowledgement', () => {
  const f = fixture();
  const socket = f.sockets[0];
  assert.equal(socket.url.includes('secret'), false);
  socket.onopen();
  assert.deepEqual(socket.sent, [{ type: 'authenticate', token: 'secret' }]);
  socket.message(created);
  assert.equal(f.events.length, 0);
  socket.message({ type: 'connection.ready', version: 1 });
  assert.equal(f.timers.size, 0);
  socket.onmessage({ data: '{bad json' });
  socket.message(created);
  assert.deepEqual(f.events, [created]);
  f.stop();
});

test('session dedup suppresses replay after reconnect/clear and resets on a new login', () => {
  const seen = new Set();
  const panel = [];
  const toasts = [];
  const deliver = event => {
    const notification = crmCardNotification(event);
    if (notification && claimNotificationId(seen, notification.id)) {
      panel.push(notification);
      toasts.push(notification);
    }
  };
  deliver(created);
  deliver(created);
  assert.equal(panel.length, 1);
  assert.equal(toasts.length, 1);
  panel.length = toasts.length = 0;
  deliver({ ...created, event_id: 'replayed-with-another-event-id' });
  assert.equal(panel.length, 0);
  assert.equal(toasts.length, 0);
  deliver({ ...created, card_id: '2' });
  assert.equal(panel.length, 1);
  seen.clear();
  deliver(created);
  assert.equal(panel.length, 2);
});

test('reconnect uses bounded exponential delays and resets after authentication', () => {
  const f = fixture();
  for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
    f.sockets.at(-1).close(1006);
    assert.equal(f.nextTimer(), delay);
  }
  f.sockets.at(-1).message({ type: 'connection.ready', version: 1 });
  f.sockets.at(-1).close(1006);
  assert.equal(f.nextTimer(), 1000);
  f.stop();
});

test('expired or rejected credentials stop reconnection', () => {
  const f = fixture();
  f.sockets[0].close(1008);
  assert.equal(f.timers.size, 0);
  f.stop();
});

test('handshake timeout closes the stalled socket and schedules reconnect', () => {
  const f = fixture();
  assert.equal(f.nextTimer(), 10000);
  assert.equal(f.sockets[0].closed, true);
  assert.equal(f.nextTimer(), 1000);
  f.stop();
});

test('logout/unmount cancels retry, closes the socket and ignores queued messages', () => {
  const f = fixture();
  const socket = f.sockets[0];
  const queuedHandler = socket.onmessage;
  socket.close(1006);
  f.stop();
  assert.equal(f.timers.size, 0);
  assert.equal(socket.closed, true);
  assert.equal(socket.onmessage, null);
  queuedHandler({ data: JSON.stringify(created) });
  assert.equal(f.events.length, 0);
});
