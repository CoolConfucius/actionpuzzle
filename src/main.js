import { loadLevel } from './engine/level-loader.js';
import { tick } from './engine/state.js';
import { awardScore } from './engine/score.js';
import { BALANCE } from './engine/constants.js';
import {
  readStats,
  writeStats,
  recordEvents,
  recordPlayTime,
  recordRunEnd,
  recordFastestClear,
  recordEndlessLoop,
  recordBossRushClear,
} from './engine/lifetime-stats.js';
import { recordClearTime, formatPbTime, clearAllPbs } from './engine/pb-times.js';
import { todayKey, levelIdForDate, recordDailyScore, getDailyScore, seedForDate } from './engine/daily.js';
import { readUnlocks, writeUnlocks, checkAchievements, resetUnlocks } from './engine/achievements.js';
import {
  readCampaign,
  writeCampaign,
  awardCoinsForEnemyKills,
  awardCoinsForLevelClear,
  spendCoins,
  grantUpgrade,
  awardCoins,
  resetCampaign,
} from './engine/campaign.js';
import { resetStats as resetLifetimeStats } from './engine/lifetime-stats.js';
import { purchaseStatus, UPGRADES } from './engine/upgrade-defs.js';
import {
  createShopState,
  openShop,
  closeShop,
  isShopOpen,
  navigateShop,
  selectedShopUpgrade,
  drawShopScreen,
  cycleShopCharacter,
  shopClick,
  shopHover,
} from './render/shop-screen.js';
import {
  createLevelSelectState,
  openLevelSelect,
  closeLevelSelect,
  isLevelSelectOpen,
  navigateLevelSelect,
  selectedLevelId as levelSelectId,
  drawLevelSelect,
} from './render/level-select-screen.js';
import {
  createTestSelectState,
  openTestSelect,
  closeTestSelect,
  isTestSelectOpen,
  navigateTestSelect,
  selectedTestLevelId,
  drawTestSelect,
} from './render/test-select-screen.js';
import {
  createToastList,
  pushAchievementToast,
  tickAchievementToasts,
  drawAchievementToasts,
} from './render/achievement-toast.js';
import {
  createBossBannerList,
  consumeBossSpawnEvents,
  tickBossBanner,
  drawBossBanner,
} from './render/boss-banner.js';
import {
  createLevelIntro,
  showLevelIntro,
  tickLevelIntro,
  drawLevelIntro,
} from './render/level-intro.js';
import {
  applyLevelClearBonuses,
  isInLevelTransition,
  tickLevelTransition,
  prepareNextLevelLoad,
} from './engine/level-transition.js';
import {
  createRunState,
  recordLevelClear,
  resetRun,
  beginCampaignRetry,
  isCampaign,
  isFinalLevelId,
  getMode,
  beginNameEntry,
  isNameEntryActive,
  nameEntryKey,
  submitScore,
  generateRandomRunSequence,
} from './engine/run-state.js';
import { render } from './render/canvas.js';
import { drawGameOverScreen } from './render/game-over-screen.js';
import {
  createTitleScreenState,
  drawTitleScreen,
  titleScreenKey,
  titleScreenClick,
  titleScreenHover,
  consumeStartRequest,
  consumeHelpRequest,
  consumeAchievementsRequest,
  consumeContinueRequest,
  consumeUpgradesViewerRequest,
  consumeLeaderboardRequest,
  consumePbTimesRequest,
  consumeShopRequest,
  consumeLevelSelectRequest,
  getSelectedSkin,
  getSelectedP2Skin,
} from './render/title-screen.js';
import { drawHelpScreen, scrollHelpScreen, resetHelpScroll } from './render/help-screen.js';
import { drawAchievementsScreen } from './render/achievements-screen.js';
import { drawUpgradesViewer } from './render/upgrades-viewer.js';
import { drawLeaderboardScreen } from './render/leaderboard-screen.js';
import { drawPbTimesScreen } from './render/pb-times-screen.js';
import {
  createPauseMenu,
  openPauseMenu,
  closePauseMenu,
  isPauseMenuOpen,
  navigatePauseMenu,
  selectedPauseMenuAction,
  drawPauseMenu,
  pauseMenuClick,
  pauseMenuHover,
} from './render/pause-menu.js';
import {
  createSettingsOverlay,
  openSettings,
  closeSettings,
  isSettingsOpen,
  handleSettingsKey,
  handleSettingsClick,
  handleSettingsDrag,
  endSettingsDrag,
  settingsHover,
  tickSettings,
  drawSettings,
} from './render/settings-overlay.js';
import {
  createAdminOverlay,
  openAdminOverlay,
  closeAdminOverlay,
  isAdminOverlayOpen,
  navigateAdminOverlay,
  activateAdminAction,
  activateSoundTestEntry,
  exitSoundTest,
  handleAdminInputKey,
  resolveAdminConfirm,
  drawAdminOverlay,
} from './render/admin-overlay.js';
import { drawTutorialOverlay } from './render/tutorial-overlay.js';
import { tickPopups, consumePopupEvents } from './render/popups.js';
import { tickExplosionFx, consumeExplosionEvents } from './render/explosion-fx.js';
import { tickLaneTelegraph, consumeHurlPathEvents } from './render/lane-telegraph.js';
import { tickDeathPoofs, consumeEnemyDeathEvents } from './render/death-poof.js';
import { tickShatter, consumeShatterEvents } from './render/shatter.js';
import { tickBalloonPops, consumeBalloonPopEvents } from './render/balloon-pop.js';
import { tickScreenShake, consumeShakeEvents } from './render/screen-shake.js';
import { installKeyboard } from './input/keyboard.js';
import * as audio from './audio/synth.js';
import * as music from './audio/music.js';
import { activateInventoryItem } from './engine/powerup.js';
import { spawnClone } from './engine/clones.js';

// Canvas size derived from grid + tile + HUD so it stays in sync if the
// game's resolution ever changes again. 19 * 48 = 912 wide; 15 * 48 + 36 = 756 tall.
const LOGICAL_WIDTH_PX = BALANCE.GRID_COLS * BALANCE.TILE_PX;
const LOGICAL_HEIGHT_PX = BALANCE.GRID_ROWS * BALANCE.TILE_PX + BALANCE.HUD_HEIGHT_PX;
const MAX_DT_MS = 100;

const KNOWN_TRACKS = new Set([
  'morning-mood',
  'canon-in-d',
  'entertainer',
  'turkish-march',
  'mountain-king',
  'beethovens-fifth',
  'fur-elise',
  'victory-fanfare',
]);

// Music cycles by position within world (1..6), not by world. W1L1 + W2L1 + W3L1 share track 1.
const MUSIC_BY_POSITION = [
  'morning-mood',
  'canon-in-d',
  'entertainer',
  'turkish-march',
  'mountain-king',
  'beethovens-fifth',
];

// In single-player modes the second player slot exists in state.players but
// spawns dead (alive=false). Detect "single-player" by the active mode rather
// than by player-array length so the retargeting works in every solo mode
// (arcade, campaign, tutorial, daily, endless, boss-rush, random, test).
function singlePlayerActive() {
  const mode = getMode();
  return mode !== 'coop' && mode !== 'campaign-coop';
}
function effectivePlayerId(requestedId) {
  return singlePlayerActive() ? 'p1' : requestedId;
}

// Dispatch a character's signature ability for the given player. Each
// character has at most one activatable ability; characters without an
// activation (bear, elephant, pig) are no-ops here — their specialty plays
// out passively.
function triggerCharacterAbility(state, playerId) {
  if (!state || !Array.isArray(state.players)) return;
  const p = state.players.find((pp) => pp && pp.id === playerId);
  if (!p || p.alive === false) return;
  const upgrades = p.upgrades || {};
  switch (p.character) {
    case 'wolf':
      if (upgrades.invBerserk) activateInventoryItem(state, p.id, 'berserk');
      return;
    case 'owl':
      if (upgrades.invTimeFreeze) activateInventoryItem(state, p.id, 'timeFreeze');
      return;
    case 'fox':
      if (upgrades.invInvisibility) activateInventoryItem(state, p.id, 'invisibility');
      return;
    case 'lion':
      if (upgrades.rockToExplosive) triggerLionFireballCharge(state, p);
      return;
    case 'monkey':
      if (upgrades.stunClone) triggerMonkeyClone(state, p);
      return;
    case 'rabbit':
      if (upgrades.bombCarrying) triggerRabbitBomb(state, p);
      return;
    case 'mole':
      if (upgrades.trapCancel || upgrades.moleBurrow) triggerMoleTrapOrBurrow(state, p);
      return;
    default:
      return;
  }
}

function triggerLionFireballCharge(state, p) {
  const cooldownReady = !(p.explosiveCooldownUntilMs && p.explosiveCooldownUntilMs > state.timeMs);
  if (!cooldownReady) return;
  p.explosiveQueuedUntilMs = state.timeMs + 5000;
  state.eventQueue ??= [];
  state.eventQueue.push({ type: 'abilityFire', label: 'FIREBALL!', cell: { col: p.pos.col, row: p.pos.row } });
}

function triggerMonkeyClone(state, p) {
  const ok = spawnClone(state, p);
  if (ok) {
    state.eventQueue ??= [];
    state.eventQueue.push({ type: 'abilityFire', label: 'STUN CLONE!', cell: { col: p.pos.col, row: p.pos.row } });
  } else {
    try { audio.playShopReject(); } catch (e) { /* ignore */ }
  }
}

function triggerRabbitBomb(state, p) {
  if (!p.inventory || (p.inventory.eggBomb || 0) <= 0) return;
  const cell = state.grid[p.pos.row] && state.grid[p.pos.row][p.pos.col];
  if (!cell || cell.object) return;
  cell.object = { type: 'fireball', id: state.nextObjectId++ };
  cell.proximityBomb = true;
  p.inventory.eggBomb -= 1;
  state.eventQueue ??= [];
  state.eventQueue.push({ type: 'objectStop', cell: { col: p.pos.col, row: p.pos.row }, objectType: 'fireball' });
  state.eventQueue.push({ type: 'abilityFire', label: 'BOMB!', cell: { col: p.pos.col, row: p.pos.row } });
}

function triggerMoleTrapOrBurrow(state, p) {
  const upgrades = p.upgrades || {};
  if (upgrades.trapCancel && Array.isArray(state.enemies)) {
    let best = null;
    let bestDist = 999;
    for (const en of state.enemies) {
      if (!en || !en.cast || en.cast.kind !== 'trap') continue;
      const d = Math.abs(en.pos.col - p.pos.col) + Math.abs(en.pos.row - p.pos.row);
      if (d < bestDist) { bestDist = d; best = en; }
    }
    if (best) {
      best.cast = null;
      state.eventQueue ??= [];
      state.eventQueue.push({ type: 'trapCancelled', cell: { col: best.pos.col, row: best.pos.row } });
      state.eventQueue.push({ type: 'abilityFire', label: 'CANCEL!', cell: { col: p.pos.col, row: p.pos.row } });
      return;
    }
  }
  if (upgrades.moleBurrow) {
    const cdUntil = p.moleBurrowCooldownUntilMs || 0;
    if (state.timeMs < cdUntil) return;
    const isLong = !!upgrades.longBurrow;
    const durationMs = isLong ? 3000 : 2000;
    const cooldownMs = isLong ? 20000 : 30000;
    p.status ??= {};
    p.status.invulnUntilMs = Math.max(p.status.invulnUntilMs || 0, state.timeMs + durationMs);
    p.moleBurrowCooldownUntilMs = state.timeMs + cooldownMs;
    state.eventQueue ??= [];
    state.eventQueue.push({ type: 'abilityFire', label: 'BURROW!', cell: { col: p.pos.col, row: p.pos.row } });
  }
}

const TEST_LEVEL_COUNT = 4;

function pickupColorFor(powerupType) {
  switch (powerupType) {
    case 'lifePlus': return '#FF6688';
    case 'berserk': return '#FF66CC';
    case 'invisibility': return '#88CCFF';
    case 'timeFreeze': return '#66FFCC';
    case 'friedEgg': return '#FFCC44';
    case 'scorePlus500':
    case 'scorePlus1000':
    case 'scorePlus2500': return '#FFEE66';
    case 'multiplier2':
    case 'multiplier3':
    case 'scoreMultiplier':
    case 'scoreMultiplier2':
    case 'scoreMultiplier3': return '#FFFFFF';
    default: return '#88FFFF';
  }
}

function computeMusicForLevel(levelJson) {
  if (!levelJson) return null;
  // World 0 levels (tutorial + test) honor their explicit music field so the
  // author can deliberately pick a track for each. Regular worlds (1-8) use
  // the position-based cycle so the soundtrack feels structured.
  if (levelJson.world === 0 && typeof levelJson.music === 'string') {
    return levelJson.music;
  }
  const id = levelJson.id;
  if (typeof id === 'string' && /^\d{2}$/.test(id)) {
    const n = parseInt(id, 10);
    if (n >= 1 && n <= 48) {
      return MUSIC_BY_POSITION[(n - 1) % 6];
    }
  }
  if (typeof levelJson.music === 'string') return levelJson.music;
  return null;
}

// globalThis.DEBUG === true enables otherwise-suppressed diagnostics.
const warnedTrackNames = new Set();
function warnUnknownTrackOnce(name) {
  if (globalThis.DEBUG === true) {
    console.warn('music: unknown track name', name);
    return;
  }
  if (warnedTrackNames.has(name)) return;
  warnedTrackNames.add(name);
  console.warn('music: unknown track name', name);
}

function parseBootConfig() {
  const params = new URLSearchParams(window.location.search);
  const levelParam = params.get('level');
  const levelId = /^\d{2}$/.test(levelParam || '') ? levelParam : '01';
  const debug = params.get('debug') === '1';
  const seedParam = params.get('seed');
  const runSeed = seedParam && /^\d+$/.test(seedParam)
    ? (parseInt(seedParam, 10) & 0xffffffff)
    : (Date.now() & 0xffffffff);
  return { levelId, debug, runSeed };
}

function setupCanvas() {
  const canvas = document.getElementById('game');
  if (!canvas) {
    console.error('boot: #game canvas not found in DOM');
    return null;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('boot: 2d context unavailable on #game canvas');
    return null;
  }
  const dpr = window.devicePixelRatio && window.devicePixelRatio > 0
    ? window.devicePixelRatio
    : 1;
  canvas.width = LOGICAL_WIDTH_PX * dpr;
  canvas.height = LOGICAL_HEIGHT_PX * dpr;
  ctx.scale(dpr, dpr);
  applyResponsiveSize(canvas);
  window.addEventListener('resize', () => applyResponsiveSize(canvas));
  return { canvas, ctx };
}

// Scale CSS display size to fit viewport while preserving logical aspect.
// Guarantees the full grid + HUD are always on screen at any window size.
function applyResponsiveSize(canvas) {
  const aspect = LOGICAL_WIDTH_PX / LOGICAL_HEIGHT_PX;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let w = vw;
  let h = w / aspect;
  if (h > vh) {
    h = vh;
    w = h * aspect;
  }
  canvas.style.width = Math.floor(w) + 'px';
  canvas.style.height = Math.floor(h) + 'px';
}

function drawError(ctx, message) {
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, LOGICAL_WIDTH_PX, LOGICAL_HEIGHT_PX);
  ctx.fillStyle = '#FF8888';
  ctx.font = '14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(message, LOGICAL_WIDTH_PX / 2, LOGICAL_HEIGHT_PX / 2);
}

async function fetchLevel(levelId, mode) {
  let folder = 'levels';
  if (mode === 'tutorial') folder = 'tutorial-levels';
  else if (mode === 'test') folder = 'test-levels';
  const res = await fetch(`./data/${folder}/${levelId}.json`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Endless mode tightens spawns and bumps the enemy cap as loops accumulate.
function scaleLevelForEndless(json, loops) {
  if (!json || loops <= 0) return json;
  const scaleFactor = Math.max(0.5, 1 - loops * 0.1);
  const out = JSON.parse(JSON.stringify(json));
  if (Array.isArray(out.enemySpawns)) {
    for (const s of out.enemySpawns) {
      if (typeof s.atTimeMs === 'number') s.atTimeMs = Math.round(s.atTimeMs * scaleFactor);
    }
  }
  if (typeof out.enemyCap === 'number') {
    out.enemyCap = Math.min(8, out.enemyCap + Math.min(loops, 3));
  }
  return out;
}

const TUTORIAL_FINAL_LEVEL = '07';

function adoptStateInPlace(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  for (const key of Object.keys(source)) target[key] = source[key];
}

async function boot() {
  const surface = setupCanvas();
  if (!surface) return;
  const { ctx } = surface;

  const bootConfig = parseBootConfig();
  if (bootConfig.debug) {
    globalThis.DEBUG = true;
    globalThis.__getState = () => state;
    globalThis.__getRunState = () => runState;
    globalThis.__getMode = () => getMode();
  }
  let currentSeed = bootConfig.runSeed;
  const runState = createRunState();

  let phase = 'title';
  let titleState = createTitleScreenState(runState.bestLevel);
  let pendingStartLevelId = bootConfig.levelId;
  let state = null;
  let musicMuted = false;
  let currentTrackName = null;
  // Random-mode run state — sequence is generated once at run start.
  let randomRunSeed = 0;
  let randomRunSequence = [];
  let randomRunIndex = 0;
  const pauseMenu = createPauseMenu();
  const adminOverlay = createAdminOverlay();
  const settingsOverlay = createSettingsOverlay(runState, audio);

  function applyAdminAction(result) {
    if (!result) return;
    if (result.kind === 'jumpLevel') {
      const levelId = result.levelId;
      const n = parseInt(levelId, 10);
      if (n >= 1 && n <= 36) {
        closeAdminOverlay(adminOverlay);
        if (phase !== 'play') {
          pendingStartLevelId = levelId;
          startGameplay(levelId);
        } else {
          startGameplay(levelId);
        }
      }
      return;
    }
    if (result.kind === 'addScore' && state && Array.isArray(state.players) && state.players[0]) {
      const p = state.players[0];
      try {
        awardScore(state, p.id, result.amount, 'scorePlus', { col: p.pos.col, row: p.pos.row });
      } catch (e) { /* ignore */ }
      return;
    }
    if (result.kind === 'dropPowerups' && state) {
      dropAdminPowerups(state);
      return;
    }
    if (result.kind === 'playSound') {
      playSoundTestEntry(result.id, result.args || []);
      return;
    }
    if (result.kind === 'addCoins') {
      awardCoins(campaignState, result.amount);
      writeCampaign(campaignState);
      return;
    }
    if (result.kind === 'resetCampaign') {
      resetCampaign();
      Object.assign(campaignState, readCampaign());
      return;
    }
    if (result.kind === 'resetStats') {
      resetLifetimeStats();
      Object.assign(lifetimeStats, readStats());
      return;
    }
    if (result.kind === 'resetPbs') {
      clearAllPbs();
      return;
    }
    if (result.kind === 'resetAchievements') {
      resetUnlocks();
      for (const k of Object.keys(achievementUnlocks)) delete achievementUnlocks[k];
      return;
    }
    if (result.kind === 'clearLevel') {
      clearLevelImmediately();
      return;
    }
    if (result.kind === 'restartLevel') {
      restartCurrentLevel();
      return;
    }
    if (result.kind === 'unlockAllUpgrades') {
      unlockAllUpgradesNow();
      return;
    }
  }

  function restartCurrentLevel() {
    if (!state || !state.level) return;
    const levelId = state.level.id;
    closeAdminOverlay(adminOverlay);
    // Same path as the admin level-jump: re-runs through startGameplay,
    // which resets the entire run state, score, and reloads the level json.
    startGameplay(levelId);
  }

  function clearLevelImmediately() {
    if (!state || !state.grid) return;
    // Remove every non-fried-egg object and all enemies, then let winLoss fire.
    for (let r = 0; r < state.grid.length; r++) {
      const row = state.grid[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (!cell) continue;
        if (cell.object && cell.object.type !== 'fried-egg') {
          cell.object = null;
        }
        cell.proximityBomb = false;
        cell.windup = null;
        cell.hazard = null;
      }
    }
    state.enemies = [];
    state.pendingSpawns = [];
    state.movingObjects = [];
    state.explosions = [];
    // Empty the enemy budget so winLoss treats all enemies as defeated.
    if (state.level && state.level.enemyBudget) {
      for (const k of Object.keys(state.level.enemyBudget)) {
        state.level.enemyBudget[k] = 0;
      }
    }
  }

  function unlockAllUpgradesNow() {
    campaignState.upgrades = campaignState.upgrades || {};
    // Enumerate every upgrade from upgrade-defs so this stays in sync with
    // any future catalog changes without manual editing.
    for (const u of UPGRADES) {
      campaignState.upgrades[u.character] = campaignState.upgrades[u.character] || {};
      campaignState.upgrades[u.character][u.id] = true;
    }
    writeCampaign(campaignState);
  }

  function playSoundTestEntry(id, args) {
    const map = {
      move: audio.playMove,
      hurl: audio.playHurl,
      hurlPath: audio.playHurlPath,
      objectStop: audio.playObjectStop,
      objectDestroy: audio.playObjectDestroy,
      explode: audio.playExplode,
      enemyWindup: audio.playEnemyWindup,
      enemySpawn: audio.playEnemySpawn,
      enemy4CastStart: audio.playEnemy4CastStart,
      trapTriggered: audio.playTrapTriggered,
      playerDeath: audio.playPlayerDeath,
      playerRespawn: audio.playPlayerRespawn,
      powerup: audio.playPowerup,
      milestoneLife: audio.playMilestoneLife,
      levelWon: audio.playLevelWon,
      gameOver: audio.playGameOver,
      uiSelect: audio.playUiSelect,
      uiBack: audio.playUiBack,
      enemyHit: audio.playEnemyHit,
      enemyTeleport: audio.playEnemyTeleport,
      achievementUnlock: audio.playAchievementUnlock,
      shopPurchase: audio.playShopPurchase,
      shopReject: audio.playShopReject,
      levelStart: audio.playLevelStart,
      shopOpen: audio.playShopOpen,
    };
    // Enemy-defeated variants share a function with different args.
    if (id && id.startsWith('enemyDefeated')) {
      try { audio.playEnemyDefeated(args[0]); } catch (e) { /* ignore */ }
      return;
    }
    // Chain variants share a function with multiplier args.
    if (id && id.startsWith('chain')) {
      try { audio.playChain(args[0]); } catch (e) { /* ignore */ }
      return;
    }
    // Ability-fire variants share playAbilityFire with different label args.
    if (id && id.startsWith('abilityFire')) {
      try { audio.playAbilityFire(args[0]); } catch (e) { /* ignore */ }
      return;
    }
    const fn = map[id];
    if (typeof fn === 'function') {
      try { fn(...args); } catch (e) { /* ignore */ }
    }
  }

  function dropAdminPowerups(s) {
    const types = ['berserk', 'invisibility', 'timeFreeze', 'lifePlus',
      'scorePlus500', 'scorePlus1000', 'multiplier2'];
    const p = s.players && s.players[0];
    if (!p) return;
    s.balloons = s.balloons || [];
    let nextId = s.nextObjectId || 1000;
    for (let i = 0; i < types.length; i++) {
      const angle = (i / types.length) * Math.PI * 2;
      const dCol = Math.round(Math.cos(angle) * 2);
      const dRow = Math.round(Math.sin(angle) * 2);
      const col = Math.max(0, Math.min((s.level && s.level.dims && s.level.dims.cols - 1) || 16, p.pos.col + dCol));
      const row = Math.max(0, Math.min((s.level && s.level.dims && s.level.dims.rows - 1) || 12, p.pos.row + dRow));
      s.balloons.push({
        id: nextId++,
        type: types[i],
        col,
        row,
        colFloat: col,
        rowFloat: row,
        spawnTimeMs: s.timeMs || 0,
      });
    }
    s.nextObjectId = nextId;
  }

  function handlePauseAction(action) {
    if (action === 'resume') {
      closePauseMenu(pauseMenu);
      if (state) state.pauseState = 'running';
      try { music.resume(); } catch (err) { /* ignore */ }
      return;
    }
    if (action === 'toggleSound') {
      try { audio.toggleMute(); } catch (err) { /* ignore */ }
      return;
    }
    if (action === 'toggleMusic') {
      musicMuted = !musicMuted;
      try { music.setMuted(musicMuted); } catch (err) { /* ignore */ }
      return;
    }
    if (action === 'settings') {
      openSettings(settingsOverlay, 'pause');
      return;
    }
    if (action === 'returnHome') {
      closePauseMenu(pauseMenu);
      if (state) state.pauseState = 'running';
      phase = 'title';
      resetRun(runState);
      titleState = createTitleScreenState(runState.bestLevel);
      finalLevelCleared = false;
      levelClearRecorded = false;
      transients.popups.length = 0;
      transients.explosionFx.length = 0;
      transients.laneTelegraph.length = 0;
      try { music.stop(); } catch (err) { /* ignore */ }
      currentTrackName = null;
      return;
    }
  }

  function pauseMenuStatus() {
    let sfxMuted = false;
    try {
      sfxMuted = typeof audio.isMuted === 'function' ? !!audio.isMuted() : false;
    } catch (err) { /* ignore */ }
    const runInfo = state && state.level
      ? {
          label: formatLevelLabel(state.level.id),
          levelTimeMs: state.levelTimeMs || 0,
          score: (Array.isArray(state.players) ? state.players.reduce((a, p) => a + (p.score || 0), 0) : 0),
          mode: getMode(),
          streak: runStreak,
        }
      : null;
    return { sfxMuted, musicMuted, runInfo };
  }

  function formatLevelLabel(id) {
    if (typeof id !== 'string' || !/^\d{2}$/.test(id)) return '';
    const n = parseInt(id, 10);
    if (!Number.isFinite(n) || n < 1) return '';
    const world = Math.floor((n - 1) / 6) + 1;
    const level = ((n - 1) % 6) + 1;
    return `W${world}L${level}`;
  }

  function levelOpts() {
    // Read mode fresh: user can change mode on title screen between boot and gameplay,
    // and runState.mode is captured at boot time only.
    const mode = getMode();
    // Test mode grants every upgrade to both players so each ability is
    // exercisable without grinding campaign coins first.
    let upgrades = campaignState.upgrades || {};
    if (mode === 'test') {
      upgrades = {};
      for (const u of UPGRADES) {
        upgrades[u.character] = upgrades[u.character] || {};
        upgrades[u.character][u.id] = true;
      }
    }
    return {
      mode,
      skin: getSelectedSkin(),
      p2Skin: getSelectedP2Skin(),
      campaignUpgrades: upgrades,
    };
  }

  function routeMusicForLevel(levelJson) {
    const desired = computeMusicForLevel(levelJson);
    // Don't eagerly remember desired-vs-current. playTrack already short-
    // circuits same-name calls when the track is loaded and unpaused; if the
    // previous attempt silently failed (404, AudioContext bad state), this
    // path will now retry instead of being stuck on a stale "we think it's
    // playing" flag.
    if (globalThis.DEBUG === true) {
      console.warn(`music: route -> ${desired}`);
    }
    if (!desired) {
      try { music.stop(); } catch (e) { /* ignore */ }
      currentTrackName = null;
      return;
    }
    if (!KNOWN_TRACKS.has(desired)) {
      warnUnknownTrackOnce(desired);
    }
    try {
      music.playTrack(desired);
      currentTrackName = desired;
    } catch (e) { /* ignore */ }
  }

  const lifetimeStats = readStats();
  const achievementUnlocks = readUnlocks();
  const achievementToasts = createToastList();
  const bossBanners = createBossBannerList();
  const levelIntro = createLevelIntro();
  const campaignState = readCampaign();
  let campaignDirty = false;
  const shopState = createShopState();
  let shopBlocksNextLevel = false; // set true after transition done, cleared by space
  let currentRunIsReplay = false; // halves campaign coin rewards on grind runs
  const levelSelectState = createLevelSelectState();
  const testSelectState = createTestSelectState();

  function persistCampaignIfDirty() {
    if (!campaignDirty) return;
    writeCampaign(campaignState);
    campaignDirty = false;
  }

  function attemptShopPurchase() {
    const upgrade = selectedShopUpgrade(shopState);
    if (!upgrade) {
      try { audio.playShopReject(); } catch (e) { /* ignore */ }
      return false;
    }
    const status = purchaseStatus(upgrade, campaignState);
    if (status.owned || !status.prereqMet || !status.affordable) {
      try { audio.playShopReject(); } catch (e) { /* ignore */ }
      return false;
    }
    if (!spendCoins(campaignState, upgrade.cost)) {
      try { audio.playShopReject(); } catch (e) { /* ignore */ }
      return false;
    }
    grantUpgrade(campaignState, upgrade.character, upgrade.id);
    campaignDirty = true;
    persistCampaignIfDirty();
    try { audio.playShopPurchase(); } catch (e) { /* ignore */ }
    return true;
  }

  function continuePastShop() {
    closeShop(shopState);
    shopBlocksNextLevel = false;
    transitionToNextLevel();
  }

  // Theodore's "Speed on Kill" upgrade: +1 speedStack every 5 enemies killed
  // within a single level. Counter resets on death (via clearPowerupsOnDeath).
  function applyCampaignKillEffects(s) {
    if (!s || !Array.isArray(s.players) || !s.players[0]) return;
    const p = s.players[0];
    if (!p.upgrades || !p.upgrades.speedOnKill) return;
    let kills = 0;
    for (const ev of s.eventQueue) {
      if (ev && ev.type === 'enemyDefeated') kills += 1;
    }
    if (kills === 0) return;
    const before = p.killsThisLevel || 0;
    p.killsThisLevel = before + kills;
    // Tier 2 (Speed on Kill+) raises stack every 3 kills instead of every 5.
    const divisor = p.upgrades.speedOnKill2 ? 3 : 5;
    const milestonesPassed = Math.floor(p.killsThisLevel / divisor) - Math.floor(before / divisor);
    if (milestonesPassed > 0) {
      p.speedStacks = (p.speedStacks || 0) + milestonesPassed;
    }
  }

  // Elephant's "Lucky Drop" (15%) and "Lucky Drop+" (25%): per-kill chance
  // that a lifePlus balloon spawns at the defeat cell.
  function applyMonkeyLuckyDrop(s) {
    if (!s || !Array.isArray(s.players) || !s.players[0]) return;
    const owner = s.players.find((p) => p && p.upgrades && (p.upgrades.luckyDrop || p.upgrades.luckyDrop2));
    if (!owner) return;
    const chance = owner.upgrades.luckyDrop2 ? 0.25 : 0.15;
    s.balloons = s.balloons || [];
    const rng = typeof s.rng === 'function' ? s.rng : Math.random;
    for (const ev of s.eventQueue) {
      if (!ev || ev.type !== 'enemyDefeated') continue;
      if (!ev.cell || rng() >= chance) continue;
      s.balloons.push({
        id: s.nextBalloonId++,
        type: 'lifePlus',
        col: ev.cell.col,
        colFloat: ev.cell.col,
        rowFloat: ev.cell.row + 1, // start 1 cell below the kill so it rises into view
        ageMs: 0,
        phaseOffset: rng() * BALANCE.BALLOON_SWAY_PERIOD_MS,
      });
      s.eventQueue.push({
        type: 'abilityFire',
        label: 'LUCKY!',
        cell: { col: ev.cell.col, row: ev.cell.row },
      });
    }
  }

  const transients = {
    popups: [],
    explosionFx: [],
    laneTelegraph: [],
    deathPoofs: [],
    shatter: [],
    balloonPops: [],
    achievementToasts,
  };

  let last = performance.now();
  let lastFrameMs = 0;
  let prevPauseState = 'running';
  let loadingNext = false;
  let restarting = false;
  let levelClearRecorded = false;
  let finalLevelCleared = false;
  let keyboardInstalled = false;
  let runEndedThisFrame = false;
  let runStreak = 0;

  function processAchievements(ctx) {
    const now = Date.now();
    const newly = checkAchievements(achievementUnlocks, ctx, now);
    if (newly.length === 0) return;
    writeUnlocks(achievementUnlocks);
    for (const id of newly) {
      pushAchievementToast(achievementToasts, id);
      try { audio.playAchievementUnlock(); } catch (e) { /* ignore */ }
    }
  }

  const unlockAudio = () => {
    try { audio.ensureContext(); } catch (e) { /* ignore */ }
    try { music.unlock(); } catch (e) { /* ignore */ }
  };
  // Listeners are NOT { once: true } — AudioContext can be suspended again
  // (e.g., on tab blur in some browsers). Re-running on every gesture is cheap
  // and ensures the next gesture can re-resume.
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  // Canvas mouse routing. The CSS scales the canvas to fit the viewport;
  // events use clientX/Y, so we convert to internal canvas coordinates by
  // multiplying by the ratio of internal-to-displayed width.
  const canvasEl = document.getElementById('game');
  if (canvasEl) {
    const toCanvasXY = (ev) => {
      const rect = canvasEl.getBoundingClientRect();
      const xCss = ev.clientX - rect.left;
      const yCss = ev.clientY - rect.top;
      const sx = LOGICAL_WIDTH_PX / Math.max(1, rect.width);
      const sy = LOGICAL_HEIGHT_PX / Math.max(1, rect.height);
      return { x: xCss * sx, y: yCss * sy };
    };

    // Settings sliders need drag support, not just click. mousedown starts a
    // drag; mousemove updates the value while the button is held; mouseup
    // ends the drag.
    canvasEl.addEventListener('mousedown', (ev) => {
      if (!isSettingsOpen(settingsOverlay)) return;
      // click handler already updates the value; this just primes the drag.
    });
    window.addEventListener('mouseup', () => {
      endSettingsDrag(settingsOverlay);
    });

    canvasEl.addEventListener('mousemove', (ev) => {
      const { x, y } = toCanvasXY(ev);
      let cursorPointer = false;
      if (isSettingsOpen(settingsOverlay)) {
        if (settingsOverlay._dragging) handleSettingsDrag(settingsOverlay, x, y);
        cursorPointer = settingsHover(settingsOverlay, x, y);
      } else if (isPauseMenuOpen(pauseMenu)) {
        pauseMenuHover(pauseMenu, x, y);
        cursorPointer = pauseMenu._hoverRow >= 0;
      } else if (isShopOpen(shopState)) {
        shopHover(shopState, x, y);
        cursorPointer = (shopState._hoverRow >= 0 || shopState._hoverChar !== 0);
      } else if (phase === 'title') {
        titleScreenHover(titleState, x, y);
        cursorPointer = (titleState._hoverRow != null && titleState._hoverRow >= 0);
      }
      canvasEl.style.cursor = cursorPointer ? 'pointer' : 'default';
    });

    canvasEl.addEventListener('click', (ev) => {
      const { x, y } = toCanvasXY(ev);
      if (isSettingsOpen(settingsOverlay)) {
        handleSettingsClick(settingsOverlay, x, y);
        return;
      }
      if (isPauseMenuOpen(pauseMenu)) {
        const action = pauseMenuClick(pauseMenu, x, y);
        if (action) handlePauseAction(action);
        return;
      }
      if (isShopOpen(shopState)) {
        const click = shopClick(shopState, x, y);
        if (click) {
          if (click.type === 'cycleChar') cycleShopCharacter(shopState, click.delta);
          else if (click.type === 'buy') attemptShopPurchase();
        }
        return;
      }
      if (phase === 'title') {
        titleScreenClick(titleState, x, y);
        return;
      }
    });

    canvasEl.addEventListener('wheel', (ev) => {
      if (phase !== 'help') return;
      scrollHelpScreen(ev.deltaY);
      ev.preventDefault();
    }, { passive: false });
  }

  window.addEventListener('blur', () => {
    if (state && state.pauseState === 'running') {
      state.pauseState = 'blurred';
      state.eventQueue.length = 0;
    }
    try { music.pause(); } catch (e) { /* ignore */ }
  });
  window.addEventListener('focus', () => {
    if (state && state.pauseState === 'blurred') {
      state.pauseState = 'running';
    }
    last = performance.now();
    try { music.resume(); } catch (e) { /* ignore */ }
  });

  // Tab visibility recovery: when the tab returns to the foreground after
  // being backgrounded (where setTimeout gets throttled and AudioContext may
  // suspend), nudge the music stack to wake up and re-arm.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    try { music.unlock(); } catch (e) { /* ignore */ }
    try { music.resume(); } catch (e) { /* ignore */ }
  });

  window.addEventListener('keydown', (e) => {
    // Backtick toggles admin overlay (works from any phase).
    if (e.key === '`' || e.code === 'Backquote') {
      if (isAdminOverlayOpen(adminOverlay)) {
        closeAdminOverlay(adminOverlay);
      } else {
        openAdminOverlay(adminOverlay);
      }
      e.preventDefault();
      return;
    }
    // Shop intermission captures keys before pause/admin/etc.
    if (isShopOpen(shopState)) {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        navigateShop(shopState, -1);
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        navigateShop(shopState, 1);
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowLeft') {
        cycleShopCharacter(shopState, -1);
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowRight') {
        cycleShopCharacter(shopState, 1);
        e.preventDefault();
        return;
      }
      if (e.key === 'Enter') {
        attemptShopPurchase();
        e.preventDefault();
        return;
      }
      if (e.key === ' ' || e.code === 'Space') {
        // Browse mode (from title) just closes; in-game mode advances.
        if (shopState.browseMode) {
          closeShop(shopState);
        } else {
          continuePastShop();
        }
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') {
        if (shopState.browseMode) {
          closeShop(shopState);
        }
        e.preventDefault();
        return;
      }
      e.preventDefault();
      return;
    }
    // Test-mode level select screen captures keys when open.
    if (isTestSelectOpen(testSelectState)) {
      if (e.key === 'Escape') {
        closeTestSelect(testSelectState);
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowUp') {
        navigateTestSelect(testSelectState, -1);
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowDown') {
        navigateTestSelect(testSelectState, 1);
        e.preventDefault();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        const id = selectedTestLevelId(testSelectState);
        if (id) {
          closeTestSelect(testSelectState);
          pendingStartLevelId = id;
          startGameplay(id);
        }
        e.preventDefault();
        return;
      }
      e.preventDefault();
      return;
    }
    // Level select screen captures keys when open.
    if (isLevelSelectOpen(levelSelectState)) {
      if (e.key === 'Escape') {
        closeLevelSelect(levelSelectState);
        e.preventDefault();
        return;
      }
      // Arrow keys only — S is reserved for "open shop" below, so we don't
      // also let it navigate. W/A/D are unused (would conflict with shop hint).
      if (e.key === 'ArrowUp') {
        navigateLevelSelect(levelSelectState, 0, -1);
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowDown') {
        navigateLevelSelect(levelSelectState, 0, 1);
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowLeft') {
        navigateLevelSelect(levelSelectState, -1, 0);
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowRight') {
        navigateLevelSelect(levelSelectState, 1, 0);
        e.preventDefault();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        const id = levelSelectId(levelSelectState);
        if (id) {
          const bestN = parseInt(runState.bestLevel || '01', 10);
          const lvlN = parseInt(id, 10);
          if (lvlN <= bestN + 1) {
            closeLevelSelect(levelSelectState);
            pendingStartLevelId = id;
            startGameplay(id);
          } else {
            try { audio.playShopReject(); } catch (err) { /* ignore */ }
          }
        }
        e.preventDefault();
        return;
      }
      // From level select: pressing S opens the shop directly.
      if (e.key === 's' || e.key === 'S') {
        closeLevelSelect(levelSelectState);
        shopState.character = getSelectedSkin() || 'bear';
        openShop(shopState, shopState.character, '', true);
        try { audio.playShopOpen(); } catch (err) { /* ignore */ }
        e.preventDefault();
        return;
      }
      e.preventDefault();
      return;
    }
    if (isAdminOverlayOpen(adminOverlay)) {
      // Confirmation prompt for destructive resets takes priority.
      if (adminOverlay.pendingConfirm) {
        if (e.key === 'y' || e.key === 'Y') {
          const r = resolveAdminConfirm(adminOverlay, true);
          if (r) applyAdminAction(r);
          e.preventDefault();
          return;
        }
        if (e.key === 'n' || e.key === 'N' || e.key === 'Escape') {
          resolveAdminConfirm(adminOverlay, false);
          e.preventDefault();
          return;
        }
        e.preventDefault();
        return;
      }
      // Level-input sub-mode captures digits/backspace/enter first.
      const inputResult = handleAdminInputKey(adminOverlay, e.key);
      if (inputResult) {
        if (inputResult.kind === 'jumpLevel') applyAdminAction(inputResult);
        e.preventDefault();
        return;
      }
      // Sound-test sub-mode: Esc exits to main admin, Enter plays the entry.
      if (adminOverlay.inSoundTest) {
        if (e.key === 'Escape') {
          exitSoundTest(adminOverlay);
          e.preventDefault();
          return;
        }
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
          navigateAdminOverlay(adminOverlay, -1);
          e.preventDefault();
          return;
        }
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
          navigateAdminOverlay(adminOverlay, 1);
          e.preventDefault();
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          const sr = activateSoundTestEntry(adminOverlay);
          if (sr) applyAdminAction(sr);
          e.preventDefault();
          return;
        }
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') {
        closeAdminOverlay(adminOverlay);
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        navigateAdminOverlay(adminOverlay, -1);
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        navigateAdminOverlay(adminOverlay, 1);
        e.preventDefault();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        const result = activateAdminAction(adminOverlay);
        if (result) applyAdminAction(result);
        e.preventDefault();
        return;
      }
      e.preventDefault();
      return;
    }
    // Settings overlay captures all keys when open.
    if (isSettingsOpen(settingsOverlay)) {
      const handled = handleSettingsKey(settingsOverlay, e);
      if (handled) {
        if (!isSettingsOpen(settingsOverlay)) {
          // Overlay closed itself — nothing more to do.
        }
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') {
        closeSettings(settingsOverlay);
        e.preventDefault();
        return;
      }
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      if (isPauseMenuOpen(pauseMenu)) {
        handlePauseAction('resume');
      } else if (phase === 'help' || phase === 'achievements' || phase === 'upgrades' || phase === 'leaderboard' || phase === 'pbtimes') {
        if (phase === 'help') resetHelpScroll();
        phase = 'title';
      } else if (phase === 'play' && state && state.status === 'playing') {
        openPauseMenu(pauseMenu);
        state.pauseState = 'paused';
        try { music.pause(); } catch (err) { /* ignore */ }
      }
      e.preventDefault();
      return;
    }
    if (phase === 'help') {
      if (e.key === 'ArrowDown' || e.key === 'j' || e.key === 'J') {
        scrollHelpScreen(24);
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'k' || e.key === 'K') {
        scrollHelpScreen(-24);
        e.preventDefault();
        return;
      }
      if (e.key === 'PageDown') {
        scrollHelpScreen(200);
        e.preventDefault();
        return;
      }
      if (e.key === 'PageUp') {
        scrollHelpScreen(-200);
        e.preventDefault();
        return;
      }
    }
    if ((phase === 'help' || phase === 'achievements' || phase === 'upgrades' || phase === 'leaderboard' || phase === 'pbtimes') && (e.key === 'Enter' || e.key === ' ')) {
      if (phase === 'help') resetHelpScroll();
      phase = 'title';
      e.preventDefault();
      return;
    }
    if (isPauseMenuOpen(pauseMenu)) {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        navigatePauseMenu(pauseMenu, -1);
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        navigatePauseMenu(pauseMenu, 1);
        e.preventDefault();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        const action = selectedPauseMenuAction(pauseMenu);
        if (action) handlePauseAction(action);
        e.preventDefault();
        return;
      }
      e.preventDefault();
      return;
    }
    if (e.key === 'm' || e.key === 'M') {
      musicMuted = !musicMuted;
      try { music.setMuted(musicMuted); } catch (err) { /* ignore */ }
      return;
    }
    // Unified ability activation. Key "1" for P1 (WASD player), "6" for P2
    // (arrow player). In single-player modes both keys retarget to P1 so the
    // player can use whichever hand is comfortable. Each character has at
    // most one activatable ability; bear/elephant/pig are passive.
    if (e.key === '1' && phase === 'play' && state) {
      triggerCharacterAbility(state, effectivePlayerId('p1'));
      e.preventDefault();
      return;
    }
    if (e.key === '6' && phase === 'play' && state) {
      triggerCharacterAbility(state, effectivePlayerId('p2'));
      e.preventDefault();
      return;
    }
    if (phase === 'title') {
      const k = e.key;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter'].includes(k)) {
        e.preventDefault();
      }
      titleScreenKey(titleState, k);
      return;
    }
    if (e.key === 'p' || e.key === 'P') {
      if (state) {
        if (state.pauseState === 'paused') {
          try { music.resume(); } catch (err) { /* ignore */ }
        } else if (state.pauseState === 'running') {
          try { music.pause(); } catch (err) { /* ignore */ }
        }
      }
      return;
    }
    if (state && (state.status === 'gameOver' || state.status === 'lost')) {
      // Name entry takes precedence over the "press SPACE to return" flow.
      if (isNameEntryActive(runState)) {
        if (e.key === 'Enter') {
          nameEntryKey(runState, 'Enter');
          submitScore(runState, runState.nameEntry.name);
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (e.key === 'Backspace') {
          nameEntryKey(runState, 'Backspace');
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (typeof e.key === 'string' && e.key.length === 1 && /[A-Za-z0-9]/.test(e.key)) {
          nameEntryKey(runState, e.key);
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // Block other keys (incl. SPACE) so the user doesn't accidentally skip.
        if (e.code === 'Space' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      } else if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        handleRestartAfterGameOver();
      } else if ((e.key === 'r' || e.key === 'R')
          && (getMode() === 'campaign' || getMode() === 'campaign-coop')
          && state && state.level) {
        // Campaign retry: re-load the failed level with fresh lives + score.
        // Keeps cross-run campaign progress (coins, upgrades, bestLevel) intact.
        e.preventDefault();
        e.stopPropagation();
        restartCampaignLevel(state.level.id);
      }
    }
  }, true);

  async function startGameplay(levelId) {
    let levelJson;
    const mode = getMode();
    let id = levelId;
    if (mode === 'tutorial') id = '01';
    else if (mode === 'test') id = '01';
    else if (mode === 'daily') id = levelIdForDate(todayKey());
    else if (mode === 'endless') id = '43';
    else if (mode === 'boss-rush') id = '12';
    else if (mode === 'random') {
      // Seed the random run from the current millisecond — different sequence
      // every time the player launches Random mode, but stable within the run.
      randomRunSeed = (Date.now() & 0xffffffff) >>> 0;
      randomRunSequence = generateRandomRunSequence(randomRunSeed);
      randomRunIndex = 0;
      id = randomRunSequence[0];
    }
    // Daily mode uses the date-derived seed so every player gets the same
    // randomized spawns/balloons on a given day.
    if (mode === 'daily') currentSeed = seedForDate(todayKey());
    try {
      levelJson = await fetchLevel(id, mode);
    } catch (err) {
      console.error('boot: failed to load level', levelId, err);
      drawError(ctx, `Failed to load level ${levelId}`);
      return false;
    }
    let fresh;
    try {
      fresh = loadLevel(levelJson, currentSeed, levelOpts());
    } catch (err) {
      console.error('boot: loadLevel failed', err);
      drawError(ctx, 'Level load error');
      return false;
    }
    if (state) {
      // adoptStateInPlace preserves the existing object identity so the
      // installKeyboard closure (which captured the original state ref) keeps
      // routing commands correctly across return-to-home → new game.
      adoptStateInPlace(state, fresh);
    } else {
      state = fresh;
    }
    if (!keyboardInstalled) {
      installKeyboard(state);
      keyboardInstalled = true;
    }
    transients.popups.length = 0;
    transients.explosionFx.length = 0;
    transients.laneTelegraph.length = 0;
    levelClearRecorded = false;
    prevPauseState = state.pauseState;
    routeMusicForLevel(levelJson);
    // Replay detection: in campaign modes, if the loaded level is at or below
    // the player's best-cleared level, treat this as a grind replay (halved
    // coin rewards). Endless / Daily / Tutorial are not "campaign replays".
    if (mode === 'campaign' || mode === 'campaign-coop') {
      const cur = parseInt(id, 10);
      const best = parseInt(runState.bestLevel || '01', 10);
      currentRunIsReplay = Number.isFinite(cur) && Number.isFinite(best) && cur <= best;
    } else {
      currentRunIsReplay = false;
    }
    showLevelIntro(levelIntro, state.level && state.level.id, state.level && state.level.title);
    try { audio.playLevelStart(); } catch (e) { /* ignore */ }
    phase = 'play';
    return true;
  }

  function handleRestartAfterGameOver() {
    // F12: out of lives returns to main menu (no auto-restart).
    closePauseMenu(pauseMenu);
    phase = 'title';
    titleState = createTitleScreenState(runState.bestLevel);
    try { music.stop(); } catch (err) { /* ignore */ }
    currentTrackName = null;
  }

  async function restartRun() {
    if (restarting) return;
    restarting = true;
    resetRun(runState);
    finalLevelCleared = false;
    currentSeed = (Date.now() & 0xffffffff);
    try {
      const json = await fetchLevel('01', getMode());
      const fresh = loadLevel(json, currentSeed, levelOpts());
      adoptStateInPlace(state, fresh);
      transients.popups.length = 0;
      transients.explosionFx.length = 0;
      transients.laneTelegraph.length = 0;
      levelClearRecorded = false;
      currentTrackName = null;
      routeMusicForLevel(json);
      showLevelIntro(levelIntro, state.level && state.level.id, state.level && state.level.title);
    } catch (err) {
      console.error('restart: failed to load W1L1', err);
    } finally {
      restarting = false;
    }
  }

  async function restartCampaignLevel(failedLevelId) {
    if (restarting) return;
    restarting = true;
    beginCampaignRetry(runState, failedLevelId);
    finalLevelCleared = false;
    currentSeed = (Date.now() & 0xffffffff);
    try {
      const json = await fetchLevel(failedLevelId, getMode());
      const fresh = loadLevel(json, currentSeed, levelOpts());
      if (Array.isArray(fresh.players)) {
        for (const p of fresh.players) {
          p.lives = BALANCE.LIFE_STOCKS_INITIAL;
          p.score = 0;
        }
      }
      adoptStateInPlace(state, fresh);
      transients.popups.length = 0;
      transients.explosionFx.length = 0;
      transients.laneTelegraph.length = 0;
      levelClearRecorded = false;
      currentTrackName = null;
      routeMusicForLevel(json);
      showLevelIntro(levelIntro, state.level && state.level.id, state.level && state.level.title);
    } catch (err) {
      console.error('restart: failed to load campaign retry level', failedLevelId, err);
    } finally {
      restarting = false;
    }
  }

  async function transitionToNextLevel() {
    if (loadingNext) return;
    loadingNext = true;
    const clearedId = state.level ? state.level.id : null;
    let { nextLevelId, carry } = prepareNextLevelLoad(state);
    // Tutorial mode ends after the final tutorial level — flag it so the
    // game-over screen can show "TUTORIAL COMPLETE" rather than "GAME OVER".
    if (getMode() === 'tutorial' && clearedId === TUTORIAL_FINAL_LEVEL) {
      nextLevelId = null;
      state.tutorialCompleted = true;
    }
    // Daily Challenge ends after the single-level run (win-or-lose).
    if (getMode() === 'daily') {
      nextLevelId = null;
      state.dailyCompleted = true;
    }
    // Endless: after the W8 finale, loop back to W8L1 with an iteration tick.
    if (getMode() === 'endless' && clearedId === '48') {
      nextLevelId = '43';
      state.endlessLoopCount = (state.endlessLoopCount || 0) + 1;
    }
    // Boss Rush: hop between world finales, ending after LV-48.
    if (getMode() === 'boss-rush') {
      const seq = ['12', '18', '24', '30', '36', '42', '48'];
      const idx = seq.indexOf(clearedId);
      if (idx === -1 || idx === seq.length - 1) {
        nextLevelId = null;
      } else {
        nextLevelId = seq[idx + 1];
      }
    }
    // Test mode: walk through the curated test-level set, loop back to 01
    // after the final one so the author can re-test on a single sitting.
    if (getMode() === 'test') {
      const n = parseInt(clearedId, 10);
      if (Number.isFinite(n)) {
        const nextN = (n % TEST_LEVEL_COUNT) + 1;
        nextLevelId = String(nextN).padStart(2, '0');
      }
    }
    // Random mode: step through the pre-generated 8-level sequence.
    if (getMode() === 'random') {
      randomRunIndex += 1;
      // Expose progress for the game-over summary.
      state.randomRunIndex = randomRunIndex;
      state.randomRunLength = randomRunSequence.length;
      if (randomRunIndex >= randomRunSequence.length) {
        nextLevelId = null;
      } else {
        nextLevelId = randomRunSequence[randomRunIndex];
      }
    }
    if (nextLevelId == null) {
      if (clearedId && isFinalLevelId(clearedId)) {
        finalLevelCleared = true;
      }
      // Boss Rush only completes when the player clears LV-48 in the rush —
      // (clearedId === '48' && mode === 'boss-rush'). Other "next is null"
      // cases (game over, single-level modes) don't count.
      if (getMode() === 'boss-rush' && clearedId === '48') {
        try { recordBossRushClear(lifetimeStats); writeStats(lifetimeStats); } catch (e) { /* ignore */ }
        finalLevelCleared = true;
      }
      state.status = 'gameOver';
      state.transition = null;
      loadingNext = false;
      try { music.stop(); } catch (e) { /* ignore */ }
      currentTrackName = null;
      return;
    }
    try {
      let nextJson = await fetchLevel(nextLevelId, getMode());
      // Endless scaling: each loop past the first compresses spawn times and
      // raises the enemy cap. Caps prevent immediate-spawn-grinder loops.
      if (getMode() === 'endless' && (state.endlessLoopCount || 0) > 0) {
        const loops = state.endlessLoopCount;
        nextJson = scaleLevelForEndless(nextJson, loops);
      }
      const nextState = loadLevel(nextJson, currentSeed, levelOpts());
      for (const carried of carry.players) {
        const fresh = nextState.players.find((p) => p.id === carried.id);
        if (fresh) {
          fresh.lives = carried.lives;
          fresh.score = carried.score;
        }
      }
      // Carry the endless loop counter forward across the level reload.
      const carriedLoopCount = state.endlessLoopCount || 0;
      adoptStateInPlace(state, nextState);
      if (getMode() === 'endless') state.endlessLoopCount = carriedLoopCount;
      showLevelIntro(levelIntro, state.level && state.level.id, state.level && state.level.title);
      transients.popups.length = 0;
      transients.explosionFx.length = 0;
      transients.laneTelegraph.length = 0;
      levelClearRecorded = false;
      routeMusicForLevel(nextJson);
    } catch (err) {
      console.error('boot: failed to load next level', err);
    } finally {
      loadingNext = false;
    }
  }

  function frame(now) {
    const rawDt = now - last;
    let dtMs = Math.min(rawDt, MAX_DT_MS);
    if (adminOverlay.speed2x) dtMs *= 2;
    last = now;

    if (adminOverlay.godMode && state && Array.isArray(state.players)) {
      for (const p of state.players) {
        if (!p) continue;
        p.status = p.status || {};
        p.status.invulnUntilMs = Number.MAX_SAFE_INTEGER;
      }
    }

    if (phase === 'title') {
      drawTitleScreen(ctx, titleState, LOGICAL_WIDTH_PX, LOGICAL_HEIGHT_PX);
      if (isShopOpen(shopState)) {
        drawShopScreen(ctx, shopState, campaignState, LOGICAL_WIDTH_PX, LOGICAL_HEIGHT_PX);
        if (isAdminOverlayOpen(adminOverlay)) {
          drawAdminOverlay(ctx, adminOverlay, LOGICAL_WIDTH_PX, LOGICAL_HEIGHT_PX);
        }
        requestAnimationFrame(frame);
        return;
      }
      if (isTestSelectOpen(testSelectState)) {
        drawTestSelect(ctx, testSelectState, LOGICAL_WIDTH_PX, LOGICAL_HEIGHT_PX);
      } else if (isLevelSelectOpen(levelSelectState)) {
        drawLevelSelect(ctx, levelSelectState, runState.bestLevel, LOGICAL_WIDTH_PX, LOGICAL_HEIGHT_PX);
        if (isAdminOverlayOpen(adminOverlay)) {
          drawAdminOverlay(ctx, adminOverlay, LOGICAL_WIDTH_PX, LOGICAL_HEIGHT_PX);
        }
        requestAnimationFrame(frame);
        return;
      }
      if (consumeStartRequest(titleState)) {
        // Campaign START opens the level-select / shop screen instead of
        // jumping straight into LV-01. Players pick where to drop in (gated
        // by the unlock check inside the level-select Enter handler) or
        // press S there to enter the shop.
        const m = getMode();
        if (m === 'campaign' || m === 'campaign-coop') {
          openLevelSelect(levelSelectState);
        } else if (m === 'test') {
          openTestSelect(testSelectState);
        } else {
          startGameplay(pendingStartLevelId);
        }
      } else if (consumeContinueRequest(titleState)) {
        // Campaign continue: load the level after the best one reached.
        const bestN = parseInt(runState.bestLevel || '01', 10);
        if (Number.isFinite(bestN) && bestN >= 1 && bestN < 48) {
          const nextId = String(bestN + 1).padStart(2, '0');
          startGameplay(nextId);
        } else if (bestN >= 48) {
          startGameplay('48'); // already cleared everything → replay finale
        }
      } else if (consumeHelpRequest(titleState)) {
        phase = 'help';
      } else if (consumeAchievementsRequest(titleState)) {
        phase = 'achievements';
      } else if (consumeUpgradesViewerRequest(titleState)) {
        phase = 'upgrades';
      } else if (consumeLeaderboardRequest(titleState)) {
        phase = 'leaderboard';
      } else if (consumePbTimesRequest(titleState)) {
        phase = 'pbtimes';
      } else if (consumeShopRequest(titleState)) {
        // Standalone shop browse from title (campaign mode only).
        shopState.character = getSelectedSkin() || 'bear';
        openShop(shopState, shopState.character, '', true);
        try { audio.playShopOpen(); } catch (e) { /* ignore */ }
      } else if (consumeLevelSelectRequest(titleState)) {
        openLevelSelect(levelSelectState);
      }
      if (isAdminOverlayOpen(adminOverlay)) {
        drawAdminOverlay(ctx, adminOverlay, LOGICAL_WIDTH_PX, LOGICAL_HEIGHT_PX);
      }
      requestAnimationFrame(frame);
      return;
    }

    if (phase === 'help') {
      drawHelpScreen(ctx, LOGICAL_WIDTH_PX, LOGICAL_HEIGHT_PX);
      if (isAdminOverlayOpen(adminOverlay)) {
        drawAdminOverlay(ctx, adminOverlay, LOGICAL_WIDTH_PX, LOGICAL_HEIGHT_PX);
      }
      requestAnimationFrame(frame);
      return;
    }

    if (phase === 'achievements') {
      drawAchievementsScreen(ctx, LOGICAL_WIDTH_PX, LOGICAL_HEIGHT_PX);
      if (isAdminOverlayOpen(adminOverlay)) {
        drawAdminOverlay(ctx, adminOverlay, LOGICAL_WIDTH_PX, LOGICAL_HEIGHT_PX);
      }
      requestAnimationFrame(frame);
      return;
    }

    if (phase === 'upgrades') {
      drawUpgradesViewer(ctx, LOGICAL_WIDTH_PX, LOGICAL_HEIGHT_PX);
      if (isAdminOverlayOpen(adminOverlay)) {
        drawAdminOverlay(ctx, adminOverlay, LOGICAL_WIDTH_PX, LOGICAL_HEIGHT_PX);
      }
      requestAnimationFrame(frame);
      return;
    }

    if (phase === 'leaderboard') {
      drawLeaderboardScreen(ctx, LOGICAL_WIDTH_PX, LOGICAL_HEIGHT_PX);
      if (isAdminOverlayOpen(adminOverlay)) {
        drawAdminOverlay(ctx, adminOverlay, LOGICAL_WIDTH_PX, LOGICAL_HEIGHT_PX);
      }
      requestAnimationFrame(frame);
      return;
    }

    if (phase === 'pbtimes') {
      drawPbTimesScreen(ctx, LOGICAL_WIDTH_PX, LOGICAL_HEIGHT_PX);
      if (isAdminOverlayOpen(adminOverlay)) {
        drawAdminOverlay(ctx, adminOverlay, LOGICAL_WIDTH_PX, LOGICAL_HEIGHT_PX);
      }
      requestAnimationFrame(frame);
      return;
    }

    const paused = state.pauseState !== 'running';
    const gameOver = state.status === 'gameOver' || state.status === 'lost';

    if (paused && prevPauseState === 'running') {
      state.eventQueue.length = 0;
    }
    prevPauseState = state.pauseState;

    if (!paused && !gameOver) {
      recordPlayTime(lifetimeStats, dtMs);
      if (state.status === 'won' && !isInLevelTransition(state) && !loadingNext) {
        if (!levelClearRecorded) {
          recordLevelClear(runState, state);
          levelClearRecorded = true;
          runStreak += 1;
          if (state) state.runStreak = runStreak;
          const levelId = state.level && state.level.id;
          const clearMs = state.levelTimeMs;
          if (levelId && Number.isFinite(clearMs)) {
            const pb = recordClearTime(levelId, clearMs, undefined);
            state.lastClearPb = {
              isNewPb: pb.isNewPb,
              previous: pb.previous,
              recorded: pb.recorded,
              clearMs,
            };
            recordFastestClear(lifetimeStats, clearMs);
          }
          // Campaign C1: award level-clear coins (base + time bonus).
          if ((getMode() === 'campaign' || getMode() === 'campaign-coop')) {
            const limit = (state.level && state.level.timeLimitMs) || 0;
            const remaining = Math.max(0, limit - (state.levelTimeMs || 0));
            const timeBonusPts = Math.floor(remaining / 1000) * (BALANCE.TIME_BONUS_PER_SEC || 0);
            const mult = currentRunIsReplay ? 0.5 : 1;
            const coinsAwarded = awardCoinsForLevelClear(campaignState, timeBonusPts, mult);
            state.lastCampaignClearCoins = coinsAwarded;
            state.lastCoinAwardAtMs = state.timeMs || 0;
            state.isReplayRun = currentRunIsReplay;
            campaignDirty = true;
          }
        }
        applyLevelClearBonuses(state);
      }

      if (isInLevelTransition(state)) {
        const done = tickLevelTransition(state, dtMs);
        consumePopupEvents(state, transients.popups);
        tickPopups(transients.popups, dtMs);
        tickExplosionFx(transients.explosionFx, dtMs);
        tickLaneTelegraph(transients.laneTelegraph, dtMs);
        if (done && !loadingNext) {
          // Campaign-mode shop intermission: pause before loading next level so
          // the player can spend coins. Skipped on the final level (handled by
          // transitionToNextLevel's null-next path) and outside campaign mode.
          const mode = getMode();
          const clearedId = state.level ? state.level.id : null;
          const willHaveNext = clearedId && /^\d{2}$/.test(clearedId) && parseInt(clearedId, 10) < 48
            && mode !== 'daily' && mode !== 'tutorial';
          if ((mode === 'campaign' || mode === 'campaign-coop') && willHaveNext && !shopBlocksNextLevel) {
            shopBlocksNextLevel = true;
            shopState.character = getSelectedSkin() || 'bear';
            const nextN = parseInt(clearedId, 10) + 1;
            const nextId = String(nextN).padStart(2, '0');
            openShop(shopState, shopState.character, nextId);
            try { audio.playShopOpen(); } catch (e) { /* ignore */ }
          } else if (!shopBlocksNextLevel) {
            transitionToNextLevel();
          }
        }
      } else {
        tick(state, dtMs);
        recordEvents(lifetimeStats, state.eventQueue);
        if (state.eventQueue.some((e) => e && e.type === 'playerDeath')) {
          runStreak = 0;
          if (state) state.runStreak = 0;
        }
        // Campaign C1: award per-enemy-kill coins from this tick's events.
        if ((getMode() === 'campaign' || getMode() === 'campaign-coop')) {
          // Replays grind at half-reward to keep first-clear runs meaningful.
          // Rabbit's "Lucky Foot" (+25%) and "Lucky Foot+" (+50%) stack as
          // a single coin-source multiplier. Tier 2 wins over tier 1.
          const p0 = state.players && state.players[0];
          let mult = currentRunIsReplay ? 0.5 : 1;
          if (p0 && p0.upgrades) {
            if (p0.upgrades.luckyFoot2) mult *= 1.50;
            else if (p0.upgrades.luckyFoot) mult *= 1.25;
          }
          const coined = awardCoinsForEnemyKills(campaignState, state.eventQueue, mult);
          if (coined > 0) campaignDirty = true;
          applyCampaignKillEffects(state);
          applyMonkeyLuckyDrop(state);
        }
              // Pickup flash: powerup events flash the receiving player. Color is
        // chosen by powerup type so each pickup reads instantly (red for life,
        // gold for fried egg/score, magenta for berserk, cyan for invisibility,
        // teal for time freeze, white for multipliers).
        for (const ev of state.eventQueue) {
          if (ev && ev.type === 'powerup' && ev.playerId) {
            const p = state.players.find((pp) => pp.id === ev.playerId);
            if (p) {
              p.pickupFlashUntilMs = state.timeMs + 600;
              p.pickupFlashStartedMs = state.timeMs;
              p.pickupFlashColor = pickupColorFor(ev.powerupType);
            }
          }
        }
        processAchievements({ stats: lifetimeStats, campaign: campaignState });
        consumePopupEvents(state, transients.popups);
        consumeExplosionEvents(state, transients.explosionFx);
        consumeHurlPathEvents(state, transients.laneTelegraph);
        consumeEnemyDeathEvents(state, transients.deathPoofs);
        consumeShatterEvents(state, transients.shatter);
        consumeBalloonPopEvents(state, transients.balloonPops);
        consumeShakeEvents(state);
        consumeBossSpawnEvents(state, bossBanners);
        tickPopups(transients.popups, dtMs);
        tickExplosionFx(transients.explosionFx, dtMs);
        tickLaneTelegraph(transients.laneTelegraph, dtMs);
        tickDeathPoofs(transients.deathPoofs, dtMs);
        tickShatter(transients.shatter, dtMs);
        tickBalloonPops(transients.balloonPops, dtMs);
        tickScreenShake(dtMs);
      }
    }
    tickAchievementToasts(achievementToasts, dtMs);
    tickBossBanner(bossBanners, dtMs);
    tickLevelIntro(levelIntro, dtMs);

    persistCampaignIfDirty();

    if (gameOver && !runEndedThisFrame) {
      runEndedThisFrame = true;
      let runScore = 0;
      if (state && Array.isArray(state.players)) {
        for (const p of state.players) runScore += (p.score || 0);
      }
      runState.runScore = runScore;
      const bestLevel = runState && runState.bestLevel ? runState.bestLevel : '01';
      recordRunEnd(lifetimeStats, runScore, bestLevel, runStreak);
      if (state && state.endlessLoopCount) {
        recordEndlessLoop(lifetimeStats, state.endlessLoopCount);
      }
      writeStats(lifetimeStats);
      processAchievements({
        stats: lifetimeStats,
        campaign: campaignState,
        clearedLevelId: state && state.level ? state.level.id : null,
        tutorialCompleted: !!(state && state.tutorialCompleted),
      });
      // Arcade & co-op: surface the name-entry → leaderboard flow on death.
      // Campaign skips it (its own ending). Tutorial skips it. Anyone with
      // a zero score (e.g. instant death on L1) also skips so the leaderboard
      // doesn't pile up zeros.
      const mode = getMode();
      // Arcade & co-op modes go to leaderboard. Campaign / campaign-coop /
      // tutorial / daily use their own end-of-run flows.
      const eligibleMode = mode === 'arcade' || mode === 'coop';
      if (eligibleMode && runScore > 0 && !runState.nameEntry) {
        beginNameEntry(runState);
      }
      // Daily Challenge: record today's score (single-level run, win-or-lose).
      if (mode === 'daily' && runScore > 0) {
        const dayKey = todayKey();
        const levelId = state && state.level ? state.level.id : '';
        const r = recordDailyScore(dayKey, runScore, levelId);
        state.lastDailyResult = r;
      }
    }
    if (!gameOver && runEndedThisFrame) {
      runEndedThisFrame = false;
      runStreak = 0;
    }

    render(ctx, state, transients);
    if (getMode() === 'tutorial' || getMode() === 'test') {
      drawTutorialOverlay(ctx, state);
    }
    drawAchievementToasts(ctx, achievementToasts);
    drawBossBanner(ctx, bossBanners);
    drawLevelIntro(ctx, levelIntro);
    if (isShopOpen(shopState)) {
      drawShopScreen(ctx, shopState, campaignState, LOGICAL_WIDTH_PX, LOGICAL_HEIGHT_PX);
    }

    if (gameOver) {
      const allowLeaderboard = !isCampaign() || finalLevelCleared;
      drawGameOverScreen(ctx, state, runState, LOGICAL_WIDTH_PX, LOGICAL_HEIGHT_PX, {
        suppressLeaderboard: !allowLeaderboard,
        victorious: finalLevelCleared,
      });
      state.eventQueue.length = 0;
    } else if (isPauseMenuOpen(pauseMenu)) {
      drawPauseMenu(ctx, pauseMenu, LOGICAL_WIDTH_PX, LOGICAL_HEIGHT_PX, pauseMenuStatus());
    } else if (paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, LOGICAL_WIDTH_PX, LOGICAL_HEIGHT_PX);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', LOGICAL_WIDTH_PX / 2, LOGICAL_HEIGHT_PX / 2);
    } else {
      audio.drain(state);
    }

    if (isAdminOverlayOpen(adminOverlay)) {
      drawAdminOverlay(ctx, adminOverlay, LOGICAL_WIDTH_PX, LOGICAL_HEIGHT_PX);
    }
    if (isSettingsOpen(settingsOverlay)) {
      tickSettings(settingsOverlay, dtMs);
      drawSettings(ctx, settingsOverlay);
    }

    if (bootConfig.debug) {
      lastFrameMs = rawDt;
      ctx.fillStyle = '#000';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`dt:${lastFrameMs.toFixed(1)}ms seed:${currentSeed} mode:${getMode()}`, 4, 12);
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

boot();
