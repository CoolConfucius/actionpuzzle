import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLevel } from '../engine/level-loader.js';
import { tick } from '../engine/state.js';

const here = dirname(fileURLToPath(import.meta.url));
const levelsDir = join(here, '..', 'data', 'levels');

const levelFiles = readdirSync(levelsDir)
  .filter((name) => /^\d+\.json$/.test(name))
  .sort();

assert.ok(levelFiles.length > 0, 'no level JSON files found in src/data/levels/');

for (const file of levelFiles) {
  const id = file.replace(/\.json$/, '');
  test(`level ${id} catalog smoke`, () => {
    const raw = readFileSync(join(levelsDir, file), 'utf8');
    const json = JSON.parse(raw);
    const state = loadLevel(json, 1);

    assert.equal(state.status, 'playing', `level ${id} not playing on construction`);

    const budget = state.level.enemyBudget || {};
    const total = Object.values(budget).reduce((a, b) => a + b, 0);
    assert.ok(total > 0, `level ${id} has enemyBudget total = 0`);

    tick(state, 16);
    assert.equal(state.status, 'playing', `level ${id} flipped status after one tick`);

    let spawnPipelineActive =
      (state.pendingSpawns?.length || 0) + (state.enemies?.length || 0) > 0;

    for (let i = 0; i < 625 && !spawnPipelineActive; i++) {
      if (state.status !== 'playing') break;
      tick(state, 16);
      spawnPipelineActive =
        (state.pendingSpawns?.length || 0) + (state.enemies?.length || 0) > 0;
    }

    assert.ok(
      spawnPipelineActive,
      `level ${id}: no pendingSpawns and no enemies after ~10s; spawn pipeline appears unwired`,
    );
  });
}
