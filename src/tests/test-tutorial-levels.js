import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLevel } from '../engine/level-loader.js';
import { tick } from '../engine/state.js';

const here = dirname(fileURLToPath(import.meta.url));
const tutorialDir = join(here, '..', 'data', 'tutorial-levels');

const files = readdirSync(tutorialDir)
  .filter((name) => /^\d+\.json$/.test(name))
  .sort();

assert.equal(files.length, 7, `expected 7 tutorial levels, got ${files.length}`);

for (const file of files) {
  const id = file.replace(/\.json$/, '');
  test(`tutorial level ${id} loads and ticks`, () => {
    const raw = readFileSync(join(tutorialDir, file), 'utf8');
    const json = JSON.parse(raw);
    assert.equal(typeof json.tutorialHint, 'string', `level ${id} missing tutorialHint`);
    assert.ok(json.tutorialHint.length > 0, `level ${id} tutorialHint empty`);
    const state = loadLevel(json, 1);
    assert.equal(state.status, 'playing', `tutorial ${id} not playing on construction`);
    tick(state, 16);
    assert.equal(state.status, 'playing', `tutorial ${id} flipped status after one tick`);
    assert.equal(state.level.tutorialHint, json.tutorialHint, 'hint not preserved on load');
  });
}
