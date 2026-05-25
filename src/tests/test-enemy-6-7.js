// enemy6 "Titan" tank HP + enemy7 "Phantom" teleport behavior.
import test from 'node:test';
import assert from 'node:assert';
import { loadLevel } from '../engine/level-loader.js';
import { tick } from '../engine/state.js';
import { tickEnemies, damageEnemy } from '../engine/enemies.js';
import { applyExplosion, tickExplosions } from '../engine/explode.js';
import { BALANCE } from '../engine/constants.js';

const STUB_LEVEL = {
  id: '01',
  world: 1,
  title: 'Test',
  dims: { cols: 25, rows: 13 },
  timeLimitMs: 180000,
  playerSpawns: [{ playerSlot: 1, col: 1, row: 1, dir: 'down' }],
  objects: [],
  eggCount: 0,
  enemySpawns: [{ type: 'enemy1', atTimeMs: 5000 }],
  enemyCap: 2,
  winConditions: ['allEnemiesDefeated'],
};

function placeEnemy(state, type, col, row) {
  state.enemies = state.enemies || [];
  const enemy = {
    id: state.nextEnemyId++,
    type,
    pos: { col, row },
    dir: 'down',
    move: null,
    enteredFromDir: null,
    abilityCooldownUntilMs: 0,
    cast: null,
    hp: type === 'enemy6' ? 3 : 1,
    maxHp: type === 'enemy6' ? 3 : 1,
    teleportNextMs: type === 'enemy7' ? state.timeMs + 5000 : 0,
  };
  state.enemies.push(enemy);
  return enemy;
}

test('enemy6 starts with hp=3', () => {
  const state = loadLevel(STUB_LEVEL, 1);
  const e = placeEnemy(state, 'enemy6', 5, 5);
  assert.equal(e.hp, 3);
  assert.equal(e.maxHp, 3);
});

test('enemy7 starts with hp=1', () => {
  const state = loadLevel(STUB_LEVEL, 1);
  const e = placeEnemy(state, 'enemy7', 5, 5);
  assert.equal(e.hp, 1);
});

test('damageEnemy: Titan takes 3 hits before defeated', () => {
  const state = loadLevel(STUB_LEVEL, 1);
  const e = placeEnemy(state, 'enemy6', 5, 5);
  assert.equal(damageEnemy(state, e, 'test', 'p1', 1), false, 'first hit');
  assert.equal(e.hp, 2);
  assert.equal(damageEnemy(state, e, 'test', 'p1', 1), false, 'second hit');
  assert.equal(e.hp, 1);
  assert.equal(damageEnemy(state, e, 'test', 'p1', 1), true, 'third hit kills');
  assert.equal(state.enemies.includes(e), false);
  const hits = state.eventQueue.filter((ev) => ev.type === 'enemyHit');
  assert.equal(hits.length, 2);
  const defeats = state.eventQueue.filter((ev) => ev.type === 'enemyDefeated');
  assert.equal(defeats.length, 1);
});

test('damageEnemy: enemy5 (hp=1) dies in one hit', () => {
  const state = loadLevel(STUB_LEVEL, 1);
  const e = placeEnemy(state, 'enemy5', 5, 5);
  const killed = damageEnemy(state, e, 'test', 'p1', 1);
  assert.equal(killed, true);
  assert.equal(state.enemies.includes(e), false);
});

test('explosion overpowers Titan HP (lethal AOE)', () => {
  const state = loadLevel(STUB_LEVEL, 1);
  const titan = placeEnemy(state, 'enemy6', 5, 5);
  applyExplosion(state, { col: 5, row: 5 }, { hurlerId: 'p1' });
  tickExplosions(state, 16);
  assert.equal(state.enemies.includes(titan), false, 'titan eradicated by explosion');
});

test('enemy7 teleports after 5 seconds', () => {
  const state = loadLevel(STUB_LEVEL, 1);
  state.timeMs = 0;
  const phantom = placeEnemy(state, 'enemy7', 10, 10);
  const origPos = { col: phantom.pos.col, row: phantom.pos.row };
  // Tick to advance past the 5s mark
  for (let i = 0; i < 320; i++) tick(state, 16);
  // After 5+ seconds, phantom should have moved to a new cell.
  const moved = phantom.pos.col !== origPos.col || phantom.pos.row !== origPos.row;
  assert.equal(moved, true, 'phantom should have teleported by now');
  const teleEvents = state.eventQueue.filter((ev) => ev.type === 'enemyTeleport');
  assert.ok(teleEvents.length >= 1, `at least one teleport event (got ${teleEvents.length})`);
});

test('enemy7 teleport keeps distance >= 3 from player', () => {
  const state = loadLevel(STUB_LEVEL, 1);
  state.players[0].pos = { col: 8, row: 6 };
  const phantom = placeEnemy(state, 'enemy7', 10, 10);
  state.timeMs = 6000; // already past first teleport window
  phantom.teleportNextMs = state.timeMs;
  tickEnemies(state, 16);
  const dx = Math.abs(phantom.pos.col - 8);
  const dy = Math.abs(phantom.pos.row - 6);
  assert.ok(Math.max(dx, dy) >= 3, 'teleport landing must be at least 3 cells from player');
});

test('enemy6 awards correct score on defeat', () => {
  const state = loadLevel(STUB_LEVEL, 1);
  const e = placeEnemy(state, 'enemy6', 5, 5);
  damageEnemy(state, e, 'test', 'p1', 999); // overkill
  assert.equal(state.players[0].score, BALANCE.SCORE_E6_KILL);
});

test('enemy7 awards correct score on defeat', () => {
  const state = loadLevel(STUB_LEVEL, 1);
  const e = placeEnemy(state, 'enemy7', 5, 5);
  damageEnemy(state, e, 'test', 'p1', 999);
  assert.equal(state.players[0].score, BALANCE.SCORE_E7_KILL);
});
