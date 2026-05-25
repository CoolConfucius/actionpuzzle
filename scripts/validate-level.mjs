import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { BALANCE } from '../src/engine/constants.js';

const REQUIRED_FIELDS = [
  'id', 'world', 'dims', 'playerSpawns', 'objects',
  'eggCount', 'enemySpawns', 'enemyCap', 'winConditions',
];

const OBJECT_TYPES = new Set(['rock', 'fireball', 'donut', 'egg', 'fried-egg']);
const ENEMY_TYPES = new Set(['enemy1', 'enemy2', 'enemy3', 'enemy4', 'enemy5', 'enemy6', 'enemy7', 'enemy8']);
const WIN_CONDITIONS = new Set(['allEnemiesDefeated', 'allObjectsDestroyed']);
const DIRS = new Set(['up', 'down', 'left', 'right']);
const BACKGROUNDS = new Set([
  'world-1', 'world-2', 'world-3', 'world-4', 'world-5', 'world-6', 'world-7', 'world-8',
]);
const MUSIC_TRACKS = new Set([
  'morning-mood', 'canon-in-d', 'entertainer',
  'turkish-march', 'mountain-king', 'beethovens-fifth', 'fur-elise',
  'victory-fanfare',
]);
const BALLOON_TYPES = new Set([
  'berserk', 'invisibility', 'timeFreeze', 'lifePlus',
  'scorePlus500', 'scorePlus1000', 'scorePlus2500',
  'multiplier2', 'multiplier3',
  'scoreMultiplier', 'scoreMultiplier2', 'scoreMultiplier3',
]);

function fail(msg) {
  return { ok: false, error: msg };
}

function isInt(n) {
  return typeof n === 'number' && Number.isInteger(n);
}

function checkShape(json) {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    return fail('level must be a JSON object');
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in json)) {
      return fail(`missing required field: ${field}`);
    }
  }

  const expectedCols = BALANCE.GRID_COLS;
  const expectedRows = BALANCE.GRID_ROWS;

  if (typeof json.dims !== 'object' || json.dims === null
      || json.dims.cols !== expectedCols || json.dims.rows !== expectedRows) {
    return fail(`dims mismatch: expected ${expectedCols}\u00D7${expectedRows}`);
  }

  if (typeof json.id !== 'string') return fail('id must be a string');
  if (!isInt(json.world)) return fail('world must be an integer');
  if (!isInt(json.eggCount) || json.eggCount < 0) return fail('eggCount must be a non-negative integer');
  if (!isInt(json.enemyCap) || json.enemyCap < 1) return fail('enemyCap must be >= 1');

  if (!Array.isArray(json.winConditions) || json.winConditions.length === 0) {
    return fail('winConditions must be a non-empty array');
  }
  for (const wc of json.winConditions) {
    if (!WIN_CONDITIONS.has(wc)) {
      return fail(`unknown winCondition: ${wc}`);
    }
  }

  if (!Array.isArray(json.playerSpawns)) return fail('playerSpawns must be an array');
  for (const ps of json.playerSpawns) {
    if (!isInt(ps.playerSlot)) {
      return fail(`playerSpawn missing or invalid playerSlot`);
    }
    if (!isInt(ps.col) || !isInt(ps.row) || ps.col < 0 || ps.row < 0
        || ps.col >= expectedCols || ps.row >= expectedRows) {
      return fail(`playerSpawn out of bounds at (${ps.col},${ps.row})`);
    }
    if (!DIRS.has(ps.dir)) return fail(`playerSpawn invalid dir: ${ps.dir}`);
  }

  if (!Array.isArray(json.objects)) return fail('objects must be an array');
  const seen = new Set();
  for (const obj of json.objects) {
    if (!OBJECT_TYPES.has(obj.type)) {
      return fail(`unknown objects[i].type: ${obj.type}`);
    }
    if (!isInt(obj.col) || !isInt(obj.row) || obj.col < 0 || obj.row < 0
        || obj.col >= expectedCols || obj.row >= expectedRows) {
      return fail(`object out of bounds at (${obj.col},${obj.row})`);
    }
    const key = `${obj.col},${obj.row}`;
    if (seen.has(key)) {
      return fail(`duplicate object at (${obj.col},${obj.row})`);
    }
    seen.add(key);
  }

  if (!Array.isArray(json.enemySpawns)) return fail('enemySpawns must be an array');
  for (const es of json.enemySpawns) {
    if (!ENEMY_TYPES.has(es.type)) {
      return fail(`unknown enemySpawns[i].type: ${es.type}`);
    }
  }

  if (typeof json.background === 'string' && json.background.length > 0
      && !BACKGROUNDS.has(json.background)) {
    return fail(`unknown background: ${json.background}`);
  }

  if (typeof json.music === 'string' && json.music.length > 0
      && !MUSIC_TRACKS.has(json.music)) {
    return fail(`unknown music: ${json.music}`);
  }

  if (Array.isArray(json.balloonSchedule)) {
    for (const b of json.balloonSchedule) {
      if (!b || typeof b.type !== 'string') {
        return fail(`balloonSchedule entry missing type: ${JSON.stringify(b)}`);
      }
      if (!BALLOON_TYPES.has(b.type)) {
        return fail(`unknown balloonSchedule[i].type: ${b.type}`);
      }
    }
  }

  return { ok: true, error: null };
}

function checkSemantics(json) {
  const objects = json.objects;
  const wins = json.winConditions;

  if (json.enemySpawns.length === 0) {
    return fail('semantic: zero enemy budget (enemySpawns empty)');
  }

  const objByCell = new Map();
  for (const obj of objects) {
    objByCell.set(`${obj.col},${obj.row}`, obj);
  }
  for (const ps of json.playerSpawns) {
    const hit = objByCell.get(`${ps.col},${ps.row}`);
    if (hit) {
      return fail(`semantic: playerSpawn slot ${ps.playerSlot} on object ${hit.type} at (${ps.col},${ps.row})`);
    }
  }

  if (wins.length === 1 && wins[0] === 'allObjectsDestroyed' && objects.length === 0) {
    return fail('semantic: only winCondition is allObjectsDestroyed but objects is empty');
  }

  return { ok: true, error: null };
}

export function validateLevel(json) {
  const shape = checkShape(json);
  if (!shape.ok) return shape;
  return checkSemantics(json);
}

const isCli = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  const path = process.argv[2];
  if (!path) {
    process.stderr.write('usage: node scripts/validate-level.mjs <path-to-level.json>\n');
    process.exit(1);
  }
  let json;
  try {
    const raw = readFileSync(path, 'utf8');
    json = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`failed to parse ${path}: ${e.message}\n`);
    process.exit(1);
  }
  const result = validateLevel(json);
  if (!result.ok) {
    process.stderr.write(`${result.error}\n`);
    process.exit(1);
  }
  process.exit(0);
}
