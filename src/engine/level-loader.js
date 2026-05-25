import { BALANCE } from './constants.js';
import { mulberry32 } from './rng.js';
import { createGrid } from './grid.js';

const DEFAULT_WIN_CONDITIONS = ['allEnemiesDefeated', 'allObjectsDestroyed'];
const DIRS = new Set(['up', 'down', 'left', 'right']);
const SKIN_IDS = new Set([
  'bear', 'wolf', 'lion', 'rabbit', 'pig', 'mole', 'monkey', 'elephant', 'owl', 'fox',
]);
const DEFAULT_P1_SKIN = 'bear';
const DEFAULT_P2_SKIN = 'bear';

export function loadLevel(json, runSeed, options) {
  if (json == null || typeof json !== 'object') {
    throw new Error('loadLevel: json must be an object');
  }
  validateDims(json);
  const cols = json.dims.cols;
  const rows = json.dims.rows;
  const grid = createGrid({ cols, rows });

  let nextObjectId = 1;
  const seenCells = new Set();
  const objects = Array.isArray(json.objects) ? json.objects : [];
  for (const obj of objects) {
    validateObjectPlacement(obj, cols, rows, seenCells);
    grid[obj.row][obj.col].object = { type: obj.type, id: nextObjectId++ };
  }

  const opts = options || {};
  const mode = typeof opts.mode === 'string' ? opts.mode : 'arcade';
  const p1Skin = resolveSkin(opts.skin, DEFAULT_P1_SKIN);
  const p2Skin = resolveSkin(opts.p2Skin, DEFAULT_P2_SKIN);

  const players = buildPlayers(json, grid, mode, p1Skin, p2Skin);
  // Campaign upgrades, when supplied, apply spawn-time effects (e.g. Bear's
  // Fast Start gives speedStacks=1 from the get-go). Test mode also receives
  // them so every ability is exercisable.
  if ((mode === 'campaign' || mode === 'campaign-coop' || mode === 'test')
      && opts.campaignUpgrades && typeof opts.campaignUpgrades === 'object') {
    applyCampaignSpawnUpgrades(players, opts.campaignUpgrades);
  }
  const seed0 = (runSeed === undefined ? 0 : runSeed) >>> 0;
  const level = buildLevelMeta(json, seed0);
  const seed = (hashLevelId(level.id) ^ seed0) >>> 0;
  const rng = mulberry32(seed);

  const state = {
    level,
    grid,
    players,
    enemies: [],
    pendingSpawns: [],
    movingObjects: [],
    balloons: [],
    explosions: [],
    commandQueue: [],
    eventQueue: [],
    timeMs: 0,
    levelTimeMs: 0,
    timeFreezeUntilMs: null,
    rng,
    status: 'playing',
    pauseState: 'running',
    nextEnemyId: 1,
    nextObjectId,
    nextBalloonId: 1,
    nextExplosionId: 1,
    nextCloneId: 1,
    clones: [],
    scoreMilestoneCrossed: 0,
    levelIntroAgeMs: 0,
  };

  placeEggs(state, level.eggCount);
  return state;
}

export function placeEggs(state, eggCount) {
  if (!Number.isFinite(eggCount) || eggCount <= 0) return;
  const grid = state.grid;
  const rockCells = collectRockCells(grid);
  if (rockCells.length === 0) return;

  const cap = Math.min(eggCount, rockCells.length);
  if (eggCount > rockCells.length && globalThis.DEBUG === true) {
    console.warn(
      `placeEggs: eggCount ${eggCount} exceeds rock cell count ${rockCells.length}; capping to ${rockCells.length}`,
    );
  }

  const overrides = dedupeCells(state.level.eggOverride || []);
  const overrideRockCells = overrides.filter((o) => isRockCell(grid, o.col, o.row));
  const takenOverrides = overrideRockCells.slice(0, cap);

  const takenKeys = new Set(takenOverrides.map(cellKey));
  const remainingRocks = rockCells.filter((c) => !takenKeys.has(cellKey(c)));
  shuffleInPlace(remainingRocks, state.rng);

  const randomFillCount = Math.max(0, cap - takenOverrides.length);
  const randomEggs = remainingRocks.slice(0, randomFillCount);

  for (const cell of takenOverrides.concat(randomEggs)) {
    grid[cell.row][cell.col].object = { type: 'egg', id: state.nextObjectId++ };
  }
}

export function hashLevelId(id) {
  const s = String(id);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export async function loadLevelByIdWithVariant(id, runState, baseUrl, fetchFn) {
  const isCoop = !!(runState && (runState.mode === 'coop' || runState.mode === 'campaign-coop'));
  if (isCoop) {
    const coopUrl = `${baseUrl}/${id}-coop.json`;
    try {
      const res = await fetchFn(coopUrl);
      if (res && res.ok) {
        return await res.json();
      }
    } catch (_e) {
      // fall through to solo
    }
  }
  const soloUrl = `${baseUrl}/${id}.json`;
  let res;
  try {
    res = await fetchFn(soloUrl);
  } catch (e) {
    throw new Error(`Level not found: ${id} at ${soloUrl} (status error: ${e && e.message ? e.message : 'fetch failed'})`);
  }
  if (!res || !res.ok) {
    const status = res ? res.status : 'unknown';
    throw new Error(`Level not found: ${id} at ${soloUrl} (status ${status})`);
  }
  return await res.json();
}

function resolveSkin(...candidates) {
  for (const c of candidates) {
    if (typeof c === 'string' && SKIN_IDS.has(c)) return c;
  }
  return DEFAULT_P1_SKIN;
}

function validateDims(json) {
  if (!json.dims || !Number.isInteger(json.dims.cols) || !Number.isInteger(json.dims.rows)) {
    throw new Error('loadLevel: dims must declare integer cols and rows');
  }
  if (json.dims.cols !== BALANCE.GRID_COLS || json.dims.rows !== BALANCE.GRID_ROWS) {
    throw new Error(
      `loadLevel: dims ${json.dims.cols}x${json.dims.rows} do not match BALANCE ${BALANCE.GRID_COLS}x${BALANCE.GRID_ROWS}`,
    );
  }
}

function validateObjectPlacement(obj, cols, rows, seenCells) {
  if (!obj || typeof obj.type !== 'string') {
    throw new Error(`loadLevel: object missing type: ${JSON.stringify(obj)}`);
  }
  if (!Number.isInteger(obj.col) || !Number.isInteger(obj.row)) {
    throw new Error(`loadLevel: object at non-integer cell: ${JSON.stringify(obj)}`);
  }
  if (obj.col < 0 || obj.col >= cols || obj.row < 0 || obj.row >= rows) {
    throw new Error(`loadLevel: object out of bounds: ${JSON.stringify(obj)}`);
  }
  const key = cellKey(obj);
  if (seenCells.has(key)) {
    throw new Error(`loadLevel: duplicate object placement at ${key}`);
  }
  seenCells.add(key);
}

function buildPlayers(json, grid, mode, p1Skin, p2Skin) {
  const isCoop = mode === 'coop' || mode === 'campaign-coop';
  const spawns = Array.isArray(json.playerSpawns) ? json.playerSpawns : [];
  let p1Spawn;
  let p2Spawn;
  if (isCoop) {
    const cols = json.dims.cols;
    const rows = json.dims.rows;
    const verticalMid = Math.floor(rows / 2);
    const leftQuarter = Math.floor(cols / 4);
    const rightQuarter = Math.floor((3 * cols) / 4);
    const fallback1 = normalizeSpawn(spawns[0], { col: 0, row: 0, dir: 'right' });
    p1Spawn = findOpenSpawn(grid, leftQuarter, verticalMid, 'right', fallback1);
    const fallback2 = normalizeSpawn(spawns[1], { col: cols - 1, row: 0, dir: 'left' });
    p2Spawn = findOpenSpawn(grid, rightQuarter, verticalMid, 'left', fallback2, p1Spawn);
  } else {
    // Single-player: P1 always spawns at the grid center regardless of what
    // the level JSON specifies — keeps single-player layouts predictable and
    // lets level designers focus on obstacle placement around the center.
    const cols = json.dims.cols;
    const rows = json.dims.rows;
    const centerCol = Math.floor(cols / 2);
    const centerRow = Math.floor(rows / 2);
    const fallback1 = normalizeSpawn(spawns[0], { col: centerCol, row: centerRow, dir: 'down' });
    p1Spawn = findOpenSpawn(grid, centerCol, centerRow, 'down', fallback1);
    p2Spawn = normalizeSpawn(spawns[1], p1Spawn);
  }
  return [
    makePlayer('p1', p1Spawn, true, p1Skin),
    makePlayer('p2', p2Spawn, isCoop || !!json.coop, p2Skin),
  ];
}

function findOpenSpawn(grid, targetCol, targetRow, dir, fallback, exclude) {
  const isExcluded = (c, r) => exclude && c === exclude.col && r === exclude.row;
  const isOpen = (c, r) => isCellOpen(grid, c, r) && !isExcluded(c, r);
  const openNeighborCount = (c, r) => {
    let n = 0;
    for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      if (isCellOpen(grid, c + dc, r + dr) && !isExcluded(c + dc, r + dr)) n++;
    }
    return n;
  };
  // BFS outward from formula position. Prefer the first cell with >= 3 open
  // neighbors (player can move at least 3 directions). Otherwise track best
  // score within a bounded search and return that.
  const rows = grid.length;
  const cols = grid[0] ? grid[0].length : 0;
  const visited = new Set();
  const key = (c, r) => `${c},${r}`;
  const queue = [{ col: targetCol, row: targetRow }];
  visited.add(key(targetCol, targetRow));
  let best = null;
  let bestScore = -1;
  const MAX_VISITED = 64;
  while (queue.length > 0) {
    const cur = queue.shift();
    if (isOpen(cur.col, cur.row)) {
      const s = openNeighborCount(cur.col, cur.row);
      if (s > bestScore) {
        best = cur;
        bestScore = s;
        if (s >= 3) break;
      }
    }
    if (visited.size >= MAX_VISITED) break;
    for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nc = cur.col + dc;
      const nr = cur.row + dr;
      const k = key(nc, nr);
      if (visited.has(k)) continue;
      visited.add(k);
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      queue.push({ col: nc, row: nr });
    }
  }
  if (best) return { col: best.col, row: best.row, dir };
  return fallback;
}

function isCellOpen(grid, col, row) {
  if (row < 0 || row >= grid.length) return false;
  const r = grid[row];
  if (col < 0 || col >= r.length) return false;
  return !r[col].object;
}

function normalizeSpawn(spawn, fallback) {
  if (!spawn) return { col: fallback.col, row: fallback.row, dir: fallback.dir };
  const dir = DIRS.has(spawn.dir) ? spawn.dir : 'down';
  const col = Number.isInteger(spawn.col) ? spawn.col : fallback.col;
  const row = Number.isInteger(spawn.row) ? spawn.row : fallback.row;
  return { col, row, dir };
}

function makePlayer(id, spawn, alive, character) {
  return {
    id,
    character,
    pos: { col: spawn.col, row: spawn.row },
    dir: spawn.dir,
    spawnPos: { col: spawn.col, row: spawn.row, dir: spawn.dir },
    move: null,
    speedStacks: 0,
    lives: alive ? BALANCE.LIFE_STOCKS_INITIAL : 0,
    score: 0,
    status: {},
    commandQueue: [],
    alive,
    deathTimeMs: null,
    upgrades: {},
    killsThisLevel: 0,
    inventory: {},
  };
}

// Apply spawn-time campaign upgrade effects. The map is keyed by character id
// and stores ownership booleans (e.g. { bear: { fastStart1: true } }).
function applyCampaignSpawnUpgrades(players, upgradeMap) {
  for (const player of players) {
    const owned = upgradeMap[player.character];
    if (!owned) continue;
    player.upgrades = { ...owned };

    // Bear's Fast Start tier. Highest owned tier wins.
    if (owned.fastStart3) player.speedStacks = 3;
    else if (owned.fastStart2) player.speedStacks = 2;
    else if (owned.fastStart1) player.speedStacks = 1;

    // Wolf's Berserk-Start ladder. Highest tier wins.
    if (owned.invBerserk) {
      let n = 0;
      if (owned.berserkStart3) n = 3;
      else if (owned.berserkStart2) n = 2;
      else if (owned.berserkStart) n = 1;
      if (n > 0) {
        player.inventory ??= {};
        player.inventory.berserk = (player.inventory.berserk || 0) + n;
      }
    }

    // Owl's Time-Start ladder.
    if (owned.invTimeFreeze) {
      let n = 0;
      if (owned.timeStart3) n = 3;
      else if (owned.timeStart2) n = 2;
      else if (owned.timeStart) n = 1;
      if (n > 0) {
        player.inventory ??= {};
        player.inventory.timeFreeze = (player.inventory.timeFreeze || 0) + n;
      }
    }

    // Fox's Stealth-Start ladder.
    if (owned.invInvisibility) {
      let n = 0;
      if (owned.stealthStart3) n = 3;
      else if (owned.stealthStart2) n = 2;
      else if (owned.stealthStart) n = 1;
      if (n > 0) {
        player.inventory ??= {};
        player.inventory.invisibility = (player.inventory.invisibility || 0) + n;
      }
    }

    // Mole's Burrow Spawn / Deep Burrow Spawn: extended start-of-level invuln.
    if (owned.deepBurrowSpawn || owned.burrowSpawn) {
      player.status ??= {};
      const mult = owned.deepBurrowSpawn ? 3 : 2;
      player.status.invulnUntilMs = (player.status.invulnUntilMs || 0)
        + BALANCE.RESPAWN_INVULN_MS * mult;
    }

    // Elephant's Big Heart ladder: +1 or +2 lives at level start.
    if (owned.bigHeart2) player.lives = (player.lives || 0) + 2;
    else if (owned.bigHeart) player.lives = (player.lives || 0) + 1;
  }
}

function buildLevelMeta(json, runSeed) {
  const derived = deriveSpawnFromList(json.enemySpawns);
  const hasExplicitBudget = json.enemyBudget && typeof json.enemyBudget === 'object' && Object.keys(json.enemyBudget).length > 0;
  const hasExplicitPattern = Array.isArray(json.enemySpawnPattern) && json.enemySpawnPattern.length > 0;
  return {
    id: String(json.id),
    world: Number.isFinite(json.world) ? json.world : 1,
    title: typeof json.title === 'string' ? json.title : `Level ${json.id}`,
    dims: { cols: json.dims.cols, rows: json.dims.rows },
    timeLimitMs: Number.isFinite(json.timeLimitMs) ? json.timeLimitMs : BALANCE.LEVEL_TIME_LIMIT_MS,
    music: typeof json.music === 'string' ? json.music : '',
    background: typeof json.background === 'string' ? json.background : '',
    enemyBudget: scaleBudget(hasExplicitBudget ? Object.assign({}, json.enemyBudget) : derived.budget),
    enemyCap: (Number.isFinite(json.enemyCap) ? json.enemyCap : 1) + (BALANCE.ENEMY_CAP_BONUS || 0),
    enemySpawnPattern: hasExplicitPattern ? json.enemySpawnPattern.slice() : derived.pattern,
    eggCount: Number.isFinite(json.eggCount) ? json.eggCount : 0,
    eggOverride: Array.isArray(json.eggOverride) ? json.eggOverride.slice() : [],
    balloonSchedule: Array.isArray(json.balloonSchedule) ? json.balloonSchedule.slice() : [],
    winConditions: Array.isArray(json.winConditions) && json.winConditions.length > 0
      ? json.winConditions.slice()
      : DEFAULT_WIN_CONDITIONS.slice(),
    tutorialHint: typeof json.tutorialHint === 'string' ? json.tutorialHint : '',
    tutorialSubhint: typeof json.tutorialSubhint === 'string' ? json.tutorialSubhint : '',
    runSeed,
  };
}

function collectRockCells(grid) {
  const cells = [];
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    for (let c = 0; c < row.length; c++) {
      const obj = row[c].object;
      if (obj && obj.type === 'rock') cells.push({ col: c, row: r });
    }
  }
  return cells;
}

function isRockCell(grid, col, row) {
  if (row < 0 || row >= grid.length) return false;
  const rowArr = grid[row];
  if (col < 0 || col >= rowArr.length) return false;
  const obj = rowArr[col].object;
  return !!(obj && obj.type === 'rock');
}

function dedupeCells(cells) {
  const seen = new Set();
  const out = [];
  for (const c of cells) {
    if (!c || !Number.isInteger(c.col) || !Number.isInteger(c.row)) continue;
    const k = cellKey(c);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ col: c.col, row: c.row });
  }
  return out;
}

function cellKey(cell) {
  return `${cell.col},${cell.row}`;
}

function scaleBudget(budget) {
  const mult = BALANCE.ENEMY_BUDGET_MULTIPLIER || 1;
  if (mult === 1 || !budget) return budget;
  const out = {};
  for (const k of Object.keys(budget)) {
    out[k] = Math.max(0, Math.floor(budget[k] * mult));
  }
  return out;
}

function deriveSpawnFromList(enemySpawns) {
  const budget = {};
  const pattern = [];
  if (!Array.isArray(enemySpawns)) return { budget, pattern: null };
  for (const s of enemySpawns) {
    if (!s || typeof s.type !== 'string') continue;
    budget[s.type] = (budget[s.type] || 0) + 1;
    pattern.push(s.type);
  }
  return { budget, pattern: pattern.length > 0 ? pattern : null };
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}
