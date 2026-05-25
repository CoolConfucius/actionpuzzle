import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMidi } from '../audio/midi-parser.js';

function writeVlq(value) {
  if (value === 0) return [0];
  const stack = [];
  let v = value;
  stack.push(v & 0x7f);
  v >>= 7;
  while (v > 0) {
    stack.push((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return stack.reverse();
}

function header(format, tracks, tpq) {
  return [
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6,
    (format >> 8) & 0xff, format & 0xff,
    (tracks >> 8) & 0xff, tracks & 0xff,
    (tpq >> 8) & 0xff, tpq & 0xff,
  ];
}

function track(eventBytes) {
  const len = eventBytes.length;
  return [
    0x4d, 0x54, 0x72, 0x6b,
    (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff,
    ...eventBytes,
  ];
}

const END_OF_TRACK = [0x00, 0xff, 0x2f, 0x00];

test('parses tempo, program change, noteOn/noteOff with correct timeSec', () => {
  const tpq = 480;
  const ev = [
    0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20,
    0x00, 0xc0, 0x05,
    0x00, 0x90, 0x3c, 0x64,
    ...writeVlq(480),
    0x80, 0x3c, 0x40,
    ...END_OF_TRACK,
  ];
  const bytes = new Uint8Array([...header(1, 1, tpq), ...track(ev)]);
  const m = parseMidi(bytes);
  assert.equal(m.format, 1);
  assert.equal(m.ticksPerQuarter, 480);
  assert.equal(m.tempoMap.length, 1);
  assert.equal(m.tempoMap[0].usPerQuarter, 500000);
  assert.equal(m.tracks.length, 1);
  assert.equal(m.tracks[0].events.length, 2);
  const [on, off] = m.tracks[0].events;
  assert.equal(on.type, 'noteOn');
  assert.equal(on.note, 60);
  assert.equal(on.velocity, 100);
  assert.equal(on.program, 5);
  assert.equal(on.timeSec, 0);
  assert.equal(off.type, 'noteOff');
  assert.ok(Math.abs(off.timeSec - 0.5) < 1e-9);
});

test('VLQ boundary: 0x7F and 0x81 0x00 decode correctly via delta-time', () => {
  const tpq = 128;
  const ev = [
    0x7f, 0x90, 0x40, 0x50,
    0x81, 0x00, 0x80, 0x40, 0x00,
    ...END_OF_TRACK,
  ];
  const bytes = new Uint8Array([...header(0, 1, tpq), ...track(ev)]);
  const m = parseMidi(bytes);
  const evs = m.tracks[0].events;
  assert.equal(evs.length, 2);
  assert.ok(Math.abs(evs[0].timeSec - (127 / 128 * 0.5)) < 1e-9);
  assert.ok(Math.abs(evs[1].timeSec - (255 / 128 * 0.5)) < 1e-9);
});

test('running status reuses previous status byte', () => {
  const tpq = 96;
  const ev = [
    0x00, 0x90, 0x3c, 0x40,
    0x10, 0x3e, 0x40,
    0x10, 0x3c, 0x00,
    ...END_OF_TRACK,
  ];
  const bytes = new Uint8Array([...header(0, 1, tpq), ...track(ev)]);
  const m = parseMidi(bytes);
  const evs = m.tracks[0].events;
  assert.equal(evs.length, 3);
  assert.equal(evs[0].type, 'noteOn');
  assert.equal(evs[1].type, 'noteOn');
  assert.equal(evs[1].note, 62);
  assert.equal(evs[2].type, 'noteOff');
  assert.equal(evs[2].velocity, 0);
});

test('meta events other than tempo are skipped without crashing', () => {
  const tpq = 96;
  const ev = [
    0x00, 0xff, 0x03, 0x04, 0x54, 0x65, 0x73, 0x74,
    0x00, 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08,
    0x00, 0x90, 0x3c, 0x50,
    ...END_OF_TRACK,
  ];
  const bytes = new Uint8Array([...header(0, 1, tpq), ...track(ev)]);
  const m = parseMidi(bytes);
  assert.equal(m.tracks[0].events.length, 1);
  assert.equal(m.tracks[0].events[0].type, 'noteOn');
});

test('noteOn with velocity 0 normalizes to noteOff', () => {
  const tpq = 96;
  const ev = [
    0x00, 0x90, 0x3c, 0x00,
    ...END_OF_TRACK,
  ];
  const bytes = new Uint8Array([...header(0, 1, tpq), ...track(ev)]);
  const m = parseMidi(bytes);
  assert.equal(m.tracks[0].events[0].type, 'noteOff');
  assert.equal(m.tracks[0].events[0].velocity, 0);
});

test('SysEx event is skipped without crashing', () => {
  const tpq = 96;
  const ev = [
    0x00, 0xf0, 0x03, 0x7e, 0x7f, 0xf7,
    0x00, 0x90, 0x3c, 0x40,
    ...END_OF_TRACK,
  ];
  const bytes = new Uint8Array([...header(0, 1, tpq), ...track(ev)]);
  const m = parseMidi(bytes);
  assert.equal(m.tracks[0].events.length, 1);
  assert.equal(m.tracks[0].events[0].type, 'noteOn');
});

test('durationSec reflects last event timeSec', () => {
  const tpq = 480;
  const ev = [
    0x00, 0x90, 0x3c, 0x40,
    ...writeVlq(960),
    0x80, 0x3c, 0x40,
    ...END_OF_TRACK,
  ];
  const bytes = new Uint8Array([...header(0, 1, tpq), ...track(ev)]);
  const m = parseMidi(bytes);
  assert.ok(Math.abs(m.durationSec - 1.0) < 1e-9);
});

test('default tempo applies when no tempo meta present', () => {
  const tpq = 480;
  const ev = [
    ...writeVlq(240),
    0x90, 0x3c, 0x40,
    ...END_OF_TRACK,
  ];
  const bytes = new Uint8Array([...header(0, 1, tpq), ...track(ev)]);
  const m = parseMidi(bytes);
  assert.equal(m.tempoMap.length, 1);
  assert.equal(m.tempoMap[0].tick, 0);
  assert.equal(m.tempoMap[0].usPerQuarter, 500000);
  assert.ok(Math.abs(m.tracks[0].events[0].timeSec - 0.25) < 1e-9);
});
