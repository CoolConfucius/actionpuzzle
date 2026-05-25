import test from 'node:test';
import assert from 'node:assert';
import {
  readPbTimes,
  writePbTimes,
  getPb,
  recordClearTime,
  formatPbTime,
  clearPb,
  clearAllPbs,
} from '../engine/pb-times.js';

function makeStore() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data,
  };
}

test('pb: empty store returns empty object', () => {
  const s = makeStore();
  assert.deepEqual(readPbTimes(s), {});
  assert.equal(getPb('01', s), null);
});

test('pb: first clear records as PB', () => {
  const s = makeStore();
  const r = recordClearTime('01', 12345, s);
  assert.equal(r.isNewPb, true);
  assert.equal(r.previous, null);
  assert.equal(r.recorded, 12345);
  assert.equal(getPb('01', s), 12345);
});

test('pb: faster clear overwrites slower PB', () => {
  const s = makeStore();
  recordClearTime('01', 12345, s);
  const r = recordClearTime('01', 8000, s);
  assert.equal(r.isNewPb, true);
  assert.equal(r.previous, 12345);
  assert.equal(r.recorded, 8000);
  assert.equal(getPb('01', s), 8000);
});

test('pb: slower clear does not overwrite faster PB', () => {
  const s = makeStore();
  recordClearTime('01', 5000, s);
  const r = recordClearTime('01', 12000, s);
  assert.equal(r.isNewPb, false);
  assert.equal(r.previous, 5000);
  assert.equal(r.recorded, 5000);
  assert.equal(getPb('01', s), 5000);
});

test('pb: per-level isolation', () => {
  const s = makeStore();
  recordClearTime('01', 5000, s);
  recordClearTime('07', 9000, s);
  assert.equal(getPb('01', s), 5000);
  assert.equal(getPb('07', s), 9000);
});

test('pb: invalid inputs return no-op', () => {
  const s = makeStore();
  const r1 = recordClearTime('01', -1, s);
  assert.equal(r1.isNewPb, false);
  assert.equal(getPb('01', s), null);
  const r2 = recordClearTime('01', NaN, s);
  assert.equal(r2.isNewPb, false);
  const r3 = recordClearTime('', 1000, s);
  assert.equal(r3.isNewPb, false);
});

test('pb: corrupt storage falls back to empty', () => {
  const s = makeStore();
  s.setItem('pbTimes', '{not json');
  assert.deepEqual(readPbTimes(s), {});
});

test('pb: clearPb removes one level only', () => {
  const s = makeStore();
  recordClearTime('01', 1000, s);
  recordClearTime('02', 2000, s);
  clearPb('01', s);
  assert.equal(getPb('01', s), null);
  assert.equal(getPb('02', s), 2000);
});

test('pb: clearAllPbs wipes all', () => {
  const s = makeStore();
  recordClearTime('01', 1000, s);
  recordClearTime('02', 2000, s);
  clearAllPbs(s);
  assert.deepEqual(readPbTimes(s), {});
});

test('formatPbTime: seconds + centiseconds', () => {
  assert.equal(formatPbTime(0), '0.00s');
  assert.equal(formatPbTime(1234), '1.23s');
  assert.equal(formatPbTime(59990), '59.99s');
});

test('formatPbTime: minutes:seconds.centi', () => {
  assert.equal(formatPbTime(60000), '1:00.00');
  assert.equal(formatPbTime(125780), '2:05.78');
  assert.equal(formatPbTime(3600000), '60:00.00');
});

test('formatPbTime: invalid input renders --', () => {
  assert.equal(formatPbTime(-1), '--');
  assert.equal(formatPbTime(NaN), '--');
  assert.equal(formatPbTime('hello'), '--');
});
