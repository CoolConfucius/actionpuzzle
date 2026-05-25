import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, pickWeighted } from '../engine/rng.js';

test('mulberry32(42) first value matches canonical sequence', () => {
  const rng = mulberry32(42);
  const v = rng();
  const expected = 0.6011037519201636;
  assert.ok(Math.abs(v - expected) < 1e-12, `expected ~${expected}, got ${v}`);
});

test('two mulberry32(42) instances produce identical first 5 values', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 5; i++) {
    assert.equal(a(), b());
  }
});

test('different seeds produce different first values', () => {
  const a = mulberry32(42)();
  const b = mulberry32(43)();
  assert.notEqual(a, b);
});

test('pickWeighted returns the only nonzero index across 100 calls', () => {
  const rng = mulberry32(1);
  for (let i = 0; i < 100; i++) {
    assert.equal(pickWeighted(rng, [0, 1, 0, 0]), 1);
  }
});

test('pickWeighted respects relative magnitudes over 10000 samples', () => {
  const rng = mulberry32(12345);
  const counts = [0, 0, 0];
  for (let i = 0; i < 10000; i++) {
    counts[pickWeighted(rng, [1, 2, 1])] += 1;
  }
  assert.ok(counts[0] >= 2250 && counts[0] <= 2750, `counts[0] = ${counts[0]}`);
  assert.ok(counts[1] >= 4750 && counts[1] <= 5250, `counts[1] = ${counts[1]}`);
  assert.ok(counts[2] >= 2250 && counts[2] <= 2750, `counts[2] = ${counts[2]}`);
});

test('pickWeighted throws on empty weights', () => {
  assert.throws(() => pickWeighted(mulberry32(1), []), /non-empty/);
});

test('pickWeighted throws on all-zero weights', () => {
  assert.throws(() => pickWeighted(mulberry32(1), [0, 0, 0]), /positive/);
});

test('mulberry32(0) yields a usable finite sequence', () => {
  const rng = mulberry32(0);
  const v = rng();
  assert.ok(Number.isFinite(v));
  assert.ok(v >= 0 && v < 1, `expected v in [0,1), got ${v}`);
});
