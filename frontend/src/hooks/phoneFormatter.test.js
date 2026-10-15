import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { formatPhoneNumber, formatPhoneChange, PHONE_VALID_DIGITS } from './phoneFormatter.js';

// Exercise hook wiring with stubbed React hooks; no network or database access.
const source = readFileSync(new URL('./usePhoneInput.js', import.meta.url), 'utf8');
const context = vm.createContext({ formatPhoneNumber, formatPhoneChange, PHONE_VALID_DIGITS });
vm.runInContext(source.replace(/^import .*;\r?\n/gm, '')
  .replace(/^export \{.*\} from .*;\r?\n/gm, '')
  .replace(/export default .*;/g, '').replace(/export /g, '')
  + '\nglobalThis.format = formatPhoneChange;', context);
const format = (...args) => context.format(...args);

test('normalizes local whole-number input and separators', () => {
  assert.equal(format('87051234567'), '+77051234567');
  assert.equal(format('8 (705) 123-45-67'), '+77051234567');
});

test('normalizes incremental local input through the controlled plus prefix', () => {
  let displayed = '';
  for (const digit of '87051234567') displayed = format(displayed + digit, displayed);
  assert.equal(displayed, '+77051234567');
});

test('keeps canonical numbers, partial input, empty input and the length limit', () => {
  for (const value of ['+77051234567', '77051234567', '+7 (705) 123-45-67']) {
    assert.equal(format(value), '+77051234567');
  }
  assert.equal(format('8705123456'), '+7705123456');
  assert.equal(format('7705123456789'), '+77051234567');
  assert.equal(format('8705123456789'), '+77051234567');
  assert.equal(format(''), '');
  assert.equal(format('---'), '');
  assert.equal(format('+'), '+');
});

test('loading and synchronizing historical phones does not normalize or emit changes', () => {
  const states = [];
  const changes = [];
  context.useState = (initial) => {
    const current = typeof initial === 'function' ? initial() : initial;
    const index = states.push(current) - 1;
    return [current, (value) => { states[index] = value; }];
  };
  context.useCallback = (callback) => callback;
  context.useRef = () => ({ current: null });
  context.useEffect = () => {};
  vm.runInContext('globalThis.hook = usePhoneInput;', context);
  const hook = context.hook('8 (705) 123-45-67', value => changes.push(value));
  assert.equal(hook.value, '+87051234567');
  hook.syncValue('8 (705) 123-45-67');
  assert.equal(states[0], '+87051234567');
  hook.syncValue('+8613812345678');
  assert.equal(states[0], '+86138123456');
  hook.syncValue('+87051234567');
  assert.equal(states[0], '+87051234567');
  assert.deepEqual(changes, []);
  hook.handlePhoneChange({ target: { value: '87051234567' } });
  assert.deepEqual(changes, ['+77051234567']);
});

test('preserves explicit international input, including +8 country codes', () => {
  for (const value of ['+82101234567', '+8613812345678', '+442071234567', '+12025550123']) {
    assert.equal(format(value), value);
    assert.equal(format(value, '+7'), value);
  }
  assert.equal(format('+82 10 123 4567'), '+82101234567');
  let displayed = '+';
  for (const digit of '82101234567') displayed = format(displayed + digit, displayed);
  assert.equal(displayed, '+82101234567');
});

test('stored-value formatter retains the original display behavior', () => {
  assert.equal(formatPhoneNumber('8 (705) 123-45-67'), '+87051234567');
  assert.equal(formatPhoneNumber('+8613812345678'), '+86138123456');
  assert.equal(formatPhoneNumber('+'), '');
  assert.equal(formatPhoneNumber(''), '');
});

test('user changes have a separate formatter', () => {
  assert.equal(typeof formatPhoneChange, 'function');
});
