import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { validateLevel } from '../../scripts/validate-level.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEVELS_DIR = join(__dirname, '..', 'data', 'levels');
const VALIDATOR = join(__dirname, '..', '..', 'scripts', 'validate-level.mjs');

function validStub() {
  return {
    id: '01', world: 1, dims: { cols: 19, rows: 13 },
    playerSpawns: [{ playerSlot: 1, col: 1, row: 1, dir: 'down' }],
    objects: [{ type: 'rock', col: 6, row: 6 }],
    eggCount: 0,
    enemySpawns: [{ type: 'enemy1', atTimeMs: 0 }],
    enemyCap: 1,
    winConditions: ['allEnemiesDefeated'],
  };
}

test('minimal valid stub passes', () => {
  const r = validateLevel(validStub());
  assert.equal(r.ok, true);
  assert.equal(r.error, null);
});

test('missing eggCount yields exact message', () => {
  const lvl = validStub();
  delete lvl.eggCount;
  const r = validateLevel(lvl);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'missing required field: eggCount');
});

test('duplicate object at same cell', () => {
  const lvl = validStub();
  lvl.objects = [
    { type: 'rock', col: 5, row: 5 },
    { type: 'rock', col: 5, row: 5 },
  ];
  const r = validateLevel(lvl);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'duplicate object at (5,5)');
});

test('dims mismatch message uses U+00D7', () => {
  const lvl = validStub();
  lvl.dims = { cols: 12, rows: 11 };
  const r = validateLevel(lvl);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'dims mismatch: expected 19\u00D713');
});

test('unknown enemy type uses literal [i]', () => {
  const lvl = validStub();
  lvl.enemySpawns = [{ type: 'enemy9' }];
  const r = validateLevel(lvl);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'unknown enemySpawns[i].type: enemy9');
});

test('out-of-bounds object rejected', () => {
  const lvl = validStub();
  lvl.objects = [{ type: 'rock', col: 19, row: 0 }];
  const r = validateLevel(lvl);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'object out of bounds at (19,0)');
});

test('enemyCap < 1 rejected', () => {
  const lvl = validStub();
  lvl.enemyCap = 0;
  const r = validateLevel(lvl);
  assert.equal(r.ok, false);
  assert.match(r.error, /enemyCap/);
});

test('empty winConditions rejected', () => {
  const lvl = validStub();
  lvl.winConditions = [];
  const r = validateLevel(lvl);
  assert.equal(r.ok, false);
  assert.match(r.error, /winConditions/);
});

test('unknown object type rejected', () => {
  const lvl = validStub();
  lvl.objects = [{ type: 'banana', col: 2, row: 2 }];
  const r = validateLevel(lvl);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'unknown objects[i].type: banana');
});

test('semantic: zero enemy budget rejected', () => {
  const lvl = validStub();
  lvl.enemySpawns = [];
  const r = validateLevel(lvl);
  assert.equal(r.ok, false);
  assert.match(r.error, /semantic: zero enemy budget/);
});

test('semantic: player spawn on object rejected', () => {
  const lvl = validStub();
  lvl.objects = [{ type: 'rock', col: 1, row: 1 }];
  lvl.playerSpawns = [{ playerSlot: 1, col: 1, row: 1, dir: 'down' }];
  const r = validateLevel(lvl);
  assert.equal(r.ok, false);
  assert.match(r.error, /semantic: playerSpawn slot 1 on object rock at \(1,1\)/);
});

test('semantic: allObjectsDestroyed-only with no objects rejected', () => {
  const lvl = validStub();
  lvl.objects = [];
  lvl.enemySpawns = [{ type: 'enemy1', atTimeMs: 0 }];
  lvl.winConditions = ['allObjectsDestroyed'];
  const r = validateLevel(lvl);
  assert.equal(r.ok, false);
  assert.match(r.error, /semantic: only winCondition is allObjectsDestroyed/);
});

test('unknown background rejected', () => {
  const lvl = validStub();
  lvl.background = 'world-99';
  const r = validateLevel(lvl);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'unknown background: world-99');
});

test('unknown music rejected', () => {
  const lvl = validStub();
  lvl.music = 'never-gonna-give-you-up';
  const r = validateLevel(lvl);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'unknown music: never-gonna-give-you-up');
});

test('unknown balloon type rejected', () => {
  const lvl = validStub();
  lvl.balloonSchedule = [{ type: 'doubleBerserk', atTimeMs: 1000 }];
  const r = validateLevel(lvl);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'unknown balloonSchedule[i].type: doubleBerserk');
});

test('valid background, music, balloon types accepted', () => {
  const lvl = validStub();
  lvl.background = 'world-3';
  lvl.music = 'entertainer';
  lvl.balloonSchedule = [
    { type: 'scoreMultiplier3', atTimeMs: 1000 },
    { type: 'timeFreeze', atTimeMs: 2000 },
  ];
  const r = validateLevel(lvl);
  assert.equal(r.ok, true);
});

test('all level files validate clean', () => {
  let files = [];
  try {
    files = readdirSync(LEVELS_DIR).filter(f => /^\d+\.json$/.test(f));
  } catch (e) {
    assert.fail(`could not read levels dir: ${e.message}`);
  }
  assert.equal(files.length, 48, `expected 48 level files, found ${files.length}`);
  const failures = [];
  for (const f of files) {
    const raw = readFileSync(join(LEVELS_DIR, f), 'utf8');
    const json = JSON.parse(raw);
    const r = validateLevel(json);
    if (!r.ok) failures.push(`${f}: ${r.error}`);
  }
  assert.deepEqual(failures, [], `level files failed validation:\n${failures.join('\n')}`);
});

test('CLI exits 0 on valid file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lvl-'));
  const p = join(dir, 'ok.json');
  writeFileSync(p, JSON.stringify(validStub()));
  const r = spawnSync(process.execPath, [VALIDATOR, p]);
  assert.equal(r.status, 0, `stderr: ${r.stderr?.toString()}`);
});

test('CLI exits non-zero on invalid file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lvl-'));
  const p = join(dir, 'bad.json');
  const lvl = validStub();
  delete lvl.eggCount;
  writeFileSync(p, JSON.stringify(lvl));
  const r = spawnSync(process.execPath, [VALIDATOR, p]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr.toString(), /missing required field: eggCount/);
});
