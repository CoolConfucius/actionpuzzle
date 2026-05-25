import { getMode, setMode, formatBestLevelLabel } from '../engine/run-state.js';
import { playTrack, stop } from '../audio/music.js';
import characters from '../data/characters.json' with { type: 'json' };
import { readCampaign, getCoins } from '../engine/campaign.js';
import { todayKey, getDailyScore, levelIdForDate } from '../engine/daily.js';
import { readStats } from '../engine/lifetime-stats.js';
import { readLeaderboard } from '../engine/run-state.js';
import { specialtyForCharacter } from '../engine/upgrade-defs.js';

// Each skin id is a character id post-rethink (no cosmetic variants).
function specialtyForSkin(skinId) {
  return specialtyForCharacter(skinId) || '';
}

const BG_COLOR = '#1A1A2E';
const TITLE_COLOR = '#FFCC66';
const TEXT_COLOR = '#FFFFFF';
const DIM_COLOR = '#888899';
const HIGHLIGHT_COLOR = '#66FFAA';
const SWATCH_GLYPH_COLOR = '#202020';

const ROWS = ['start', 'mode', 'players', 'skin', 'skin2', 'help', 'achievements', 'best'];
const SKIN_IDS = ['bear', 'wolf', 'lion', 'rabbit', 'pig', 'mole', 'monkey', 'elephant', 'owl', 'fox'];
const DEFAULT_P1_SKIN = 'bear';
const DEFAULT_P2_SKIN = 'bear';
const STORAGE_KEY_P1 = 'skin';
const STORAGE_KEY_P2 = 'skinP2';
// Base modes cycled on the MODE row. Coop is a separate axis (see PLAYERS row)
// for Campaign and Arcade; the internal 'campaign-coop' and 'coop' ids are
// derived at START from (mode, players).
const MODES = ['arcade', 'campaign', 'tutorial', 'daily', 'endless', 'boss-rush', 'random', 'test'];
const COOP_CAPABLE = { campaign: true, arcade: true };
const PLAYERS_OPTIONS = ['single', 'local', 'online'];
const PLAYERS_LABELS = {
  single: 'SINGLE',
  local: 'LOCAL COOP',
  online: 'ONLINE COOP (coming soon)',
};

const MODE_LABELS = {
  arcade: 'ARCADE',
  campaign: 'CAMPAIGN',
  tutorial: 'TUTORIAL',
  daily: 'DAILY CHALLENGE',
  endless: 'ENDLESS',
  'boss-rush': 'BOSS RUSH',
  random: 'RANDOM 8',
  test: 'TEST MODE',
};

// Split a persisted internal mode id into (baseMode, players).
function splitMode(stored) {
  if (stored === 'campaign-coop') return { mode: 'campaign', players: 'local' };
  if (stored === 'coop') return { mode: 'arcade', players: 'local' };
  return { mode: stored, players: 'single' };
}

// Combine (baseMode, players) back into the internal engine id.
function effectiveMode(mode, players) {
  if (players === 'local' && mode === 'campaign') return 'campaign-coop';
  if (players === 'local' && mode === 'arcade') return 'coop';
  return mode;
}

let inMemorySkinP1 = DEFAULT_P1_SKIN;
let inMemorySkinP2 = DEFAULT_P2_SKIN;

function readStoredSkin(storageKey, fallback) {
  try {
    if (typeof localStorage !== 'undefined' && localStorage !== null) {
      const v = localStorage.getItem(storageKey);
      if (v && SKIN_IDS.indexOf(v) !== -1) return v;
    }
  } catch (e) {
    // private mode / disabled storage — fall through to default
  }
  return fallback;
}

function writeStoredSkin(storageKey, skinId) {
  try {
    if (typeof localStorage !== 'undefined' && localStorage !== null) {
      localStorage.setItem(storageKey, skinId);
    }
  } catch (e) {
    // ignore; caller's in-memory value still holds
  }
}

export function getSelectedSkin() {
  const stored = readStoredSkin(STORAGE_KEY_P1, null);
  if (stored) return stored;
  return SKIN_IDS.indexOf(inMemorySkinP1) !== -1 ? inMemorySkinP1 : DEFAULT_P1_SKIN;
}

export function setSelectedSkin(skinId) {
  if (SKIN_IDS.indexOf(skinId) === -1) return;
  inMemorySkinP1 = skinId;
  writeStoredSkin(STORAGE_KEY_P1, skinId);
}

export function getSelectedP2Skin() {
  const stored = readStoredSkin(STORAGE_KEY_P2, null);
  if (stored) return stored;
  return SKIN_IDS.indexOf(inMemorySkinP2) !== -1 ? inMemorySkinP2 : DEFAULT_P2_SKIN;
}

export function setSelectedP2Skin(skinId) {
  if (SKIN_IDS.indexOf(skinId) === -1) return;
  inMemorySkinP2 = skinId;
  writeStoredSkin(STORAGE_KEY_P2, skinId);
}

function cycleSkinForPlayer(playerSlot, delta) {
  const current = playerSlot === 2 ? getSelectedP2Skin() : getSelectedSkin();
  const idx = SKIN_IDS.indexOf(current);
  const base = idx === -1 ? 0 : idx;
  const next = SKIN_IDS[(base + delta + SKIN_IDS.length) % SKIN_IDS.length];
  if (playerSlot === 2) setSelectedP2Skin(next);
  else setSelectedSkin(next);
}

export function createTitleScreenState(bestLevelId) {
  const split = splitMode(getMode());
  return {
    cursor: 0,
    bestLevelId: bestLevelId || '01',
    mode: split.mode,
    players: split.players,
    startRequested: false,
    helpRequested: false,
    achievementsRequested: false,
    continueRequested: false,
    _musicStarted: false,
  };
}

export function consumeContinueRequest(ts) {
  if (!ts || !ts.continueRequested) return false;
  ts.continueRequested = false;
  return true;
}

export function consumeUpgradesViewerRequest(ts) {
  if (!ts || !ts.upgradesViewerRequested) return false;
  ts.upgradesViewerRequested = false;
  return true;
}

export function consumeLeaderboardRequest(ts) {
  if (!ts || !ts.leaderboardRequested) return false;
  ts.leaderboardRequested = false;
  return true;
}

export function consumePbTimesRequest(ts) {
  if (!ts || !ts.pbTimesRequested) return false;
  ts.pbTimesRequested = false;
  return true;
}

export function consumeShopRequest(ts) {
  if (!ts || !ts.shopRequested) return false;
  ts.shopRequested = false;
  return true;
}

export function consumeLevelSelectRequest(ts) {
  if (!ts || !ts.levelSelectRequested) return false;
  ts.levelSelectRequested = false;
  return true;
}

export function consumeHelpRequest(ts) {
  if (!ts || !ts.helpRequested) return false;
  ts.helpRequested = false;
  return true;
}

export function consumeAchievementsRequest(ts) {
  if (!ts || !ts.achievementsRequested) return false;
  ts.achievementsRequested = false;
  return true;
}

function isFirstTimePlayer() {
  try {
    const stats = readStats();
    if ((stats.runsPlayed || 0) > 0) return false;
    if ((stats.totalKills || 0) > 0) return false;
    const lb = readLeaderboard();
    if (Array.isArray(lb) && lb.length > 0) return false;
    return true;
  } catch (e) {
    return false;
  }
}

function drawTitleStarfield(ctx, width, height) {
  // 60 stars in three drifting "layers" for a sense of depth. Each layer has
  // its own speed; stars wrap around the screen. Time-based so it animates.
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  let seed = 0x12345678 >>> 0;
  ctx.save();
  for (let i = 0; i < 60; i++) {
    seed = Math.imul(seed + 1, 0x9e3779b1) >>> 0;
    const baseX = (seed >>> 16) % width;
    seed = Math.imul(seed + 1, 0x9e3779b1) >>> 0;
    const baseY = (seed >>> 16) % height;
    const layer = i % 3; // 0=slow, 1=medium, 2=fast
    const speed = [0.005, 0.012, 0.024][layer];
    const drift = (now * speed) % width;
    const x = ((baseX - drift) + width) % width;
    const y = baseY;
    const twinkle = 0.4 + 0.4 * Math.sin(now / 700 + (seed & 0xff));
    ctx.globalAlpha = (0.15 + ((seed & 0x7f) / 127) * 0.30) * twinkle;
    ctx.fillStyle = i % 7 === 0 ? '#FFCC66' : (i % 5 === 0 ? '#88CCFF' : '#FFFFFF');
    const sz = layer === 0 ? 1 : (layer === 2 ? 2 : 1);
    ctx.fillRect(x, y, sz, sz);
  }
  ctx.restore();
}

function lookupSkin(id) {
  const entry = characters && characters[id];
  if (entry && entry.color && entry.glyph) return entry;
  const fallback = characters && characters[DEFAULT_P1_SKIN];
  return fallback || { displayName: 'Theodore', color: '#7B4F2A', glyph: '🐻' };
}

function drawSkinSwatch(ctx, x, y, skinId) {
  const skin = lookupSkin(skinId);
  const size = 22;
  // Soft drop-shadow for the swatch so it pops off the dark backdrop.
  ctx.save();
  ctx.shadowBlur = 6;
  ctx.shadowColor = skin.color;
  ctx.fillStyle = skin.color;
  ctx.fillRect(x, y - size / 2, size, size);
  ctx.restore();
  ctx.fillStyle = SWATCH_GLYPH_COLOR;
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(skin.glyph, x + size / 2, y);
  // Border to keep contrast crisp
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y - size / 2, size, size);
}

export function drawTitleScreen(ctx, ts, widthPx, heightPx) {
  if (ts && !ts._musicStarted) {
    playTrack('fur-elise');
    ts._musicStarted = true;
  }

  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, widthPx, heightPx);

  // Faint twinkling backdrop — a few static stars so the title doesn't feel
  // sterile. Deterministic positions.
  drawTitleStarfield(ctx, widthPx, heightPx);

  // Title pulses with a soft glow.
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const pulse = 0.5 + 0.5 * Math.sin(now / 600);
  ctx.save();
  ctx.shadowBlur = 18 + pulse * 12;
  ctx.shadowColor = TITLE_COLOR;
  ctx.fillStyle = TITLE_COLOR;
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('COOL SAGE ARCADE', widthPx / 2, 80);
  ctx.restore();

  ctx.font = '14px monospace';
  ctx.fillStyle = DIM_COLOR;
  ctx.fillText('Press Enter to start', widthPx / 2, 110);

  // First-time hint: nothing in localStorage = brand-new player. Suggest the
  // tutorial. Pulse the text so it catches the eye.
  if (isFirstTimePlayer()) {
    const t = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const pulse = 0.5 + 0.5 * Math.sin(t / 400);
    ctx.fillStyle = '#66FFAA';
    ctx.globalAlpha = 0.6 + 0.4 * pulse;
    ctx.font = 'bold 12px monospace';
    ctx.fillText('First time? Cycle to Tutorial mode (T key).', widthPx / 2, 145);
    ctx.globalAlpha = 1;
  }

  const baseY = 170;
  const rowGap = 28;
  const selectedSkinP1 = getSelectedSkin();
  const selectedSkinP2 = getSelectedP2Skin();
  const coopCapable = !!COOP_CAPABLE[ts.mode];
  const isCoopMode = coopCapable && ts.players === 'local';

  ROWS.forEach((row, i) => {
    const y = baseY + i * rowGap;
    const selected = ts.cursor === i;
    const dim = (row === 'skin2' && !isCoopMode) || (row === 'players' && !coopCapable);
    const baseColor = dim ? DIM_COLOR : TEXT_COLOR;
    ctx.fillStyle = selected ? HIGHLIGHT_COLOR : baseColor;
    ctx.font = selected ? 'bold 16px monospace' : '16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    let text;
    let swatchSkin = null;
    if (row === 'start') text = (selected ? '> ' : '  ') + 'START';
    else if (row === 'mode') text = (selected ? '> ' : '  ') + 'MODE: ' + (MODE_LABELS[ts.mode] || ts.mode.toUpperCase());
    else if (row === 'players') {
      const label = coopCapable ? PLAYERS_LABELS[ts.players] : 'SINGLE';
      text = (selected && coopCapable ? '< ' : '  ') + 'PLAYERS: ' + label + (selected && coopCapable ? ' >' : '  ');
    }
    else if (row === 'skin') {
      const skin = lookupSkin(selectedSkinP1);
      text = (selected ? '< ' : '  ') + 'P1 SKIN: ' + skin.displayName.toUpperCase() + (selected ? ' >' : '  ');
      swatchSkin = selectedSkinP1;
    } else if (row === 'skin2') {
      const skin = lookupSkin(selectedSkinP2);
      text = (selected ? '< ' : '  ') + 'P2 SKIN: ' + skin.displayName.toUpperCase() + (selected ? ' >' : '  ');
      swatchSkin = selectedSkinP2;
    } else if (row === 'help') {
      text = (selected ? '> ' : '  ') + 'HELP';
    } else if (row === 'achievements') {
      text = (selected ? '> ' : '  ') + 'ACHIEVEMENTS';
    } else text = (selected ? '> ' : '  ') + 'BEST: ' + formatBestLevelLabel(ts.bestLevelId);
    ctx.fillText(text, widthPx / 2, y);
    if (swatchSkin) {
      drawSkinSwatch(ctx, widthPx / 2 + 130, y - 4, swatchSkin);
      // Specialty hint under the skin row (campaign-only relevance).
      const spec = specialtyForSkin(swatchSkin);
      if (spec && ts.mode === 'campaign') {
        ctx.save();
        ctx.fillStyle = DIM_COLOR;
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(spec, widthPx / 2, y + 10);
        ctx.restore();
      }
    }
  });

  if (ts.mode === 'campaign') {
    const camp = readCampaign();
    ctx.fillStyle = '#FFCC44';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    const owned = countOwnedUpgrades(camp);
    const label = ts.players === 'local' ? 'Campaign 2P' : 'Campaign';
    ctx.fillText(`${label}: ¢${getCoins(camp)}   upgrades owned: ${owned}`, widthPx / 2, heightPx - 70);
    ctx.fillStyle = '#66FFAA';
    if (ts.bestLevelId && ts.bestLevelId !== '01') {
      ctx.fillText(`C: continue (${formatBestLevelLabel(ts.bestLevelId)})  ·  G: levels  ·  S: shop  ·  U: upgrades`, widthPx / 2, heightPx - 54);
    } else {
      ctx.fillText('G: levels  ·  S: shop  ·  U: upgrades', widthPx / 2, heightPx - 54);
    }
    if (ts.players === 'local' && owned === 0 && getCoins(camp) === 0) {
      ctx.fillStyle = '#88CCFF';
      ctx.font = '11px monospace';
      ctx.fillText('Coop tip: P2 plays arrows + Enter + ShiftR + \\ (inventory)', widthPx / 2, heightPx - 36);
    }
  } else if (ts.mode === 'daily') {
    const key = todayKey();
    const best = getDailyScore(key);
    const level = levelIdForDate(key);
    ctx.fillStyle = '#FF88AA';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    const bestStr = best != null ? `today's best: ${best}` : 'no run yet';
    ctx.fillText(`Daily ${key} — LV-${level} — ${bestStr}`, widthPx / 2, heightPx - 56);
  } else if (ts.mode === 'endless') {
    const stats = readStats();
    const best = stats.bestEndlessLoop || 0;
    ctx.fillStyle = '#88CCFF';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    const bestStr = best > 0 ? `Best: ${best + 1} loops` : 'no run yet';
    ctx.fillText(`Endless — W8 looping with rising difficulty — ${bestStr}`, widthPx / 2, heightPx - 56);
  } else if (ts.mode === 'boss-rush') {
    const stats = readStats();
    const clears = stats.bossRushClears || 0;
    ctx.fillStyle = '#FF8866';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    const status = clears > 0 ? `cleared ${clears} time${clears === 1 ? '' : 's'}` : 'no clears yet';
    ctx.fillText(`Boss Rush — chain 7 world finales (LV-12 → LV-48) — ${status}`, widthPx / 2, heightPx - 56);
  } else if (ts.mode === 'random') {
    ctx.fillStyle = '#AAEEFF';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Random 8 — shuffled 8-level run from the full 48-level pool', widthPx / 2, heightPx - 56);
  } else if (ts.mode === 'test') {
    ctx.fillStyle = '#FFAAFF';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Test Mode — 4 sandbox levels for animation/SFX/ability QA. All upgrades granted.', widthPx / 2, heightPx - 56);
  }

  ctx.fillStyle = DIM_COLOR;
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Up/Down to move  Left/Right to cycle  Enter to start', widthPx / 2, heightPx - 38);
  ctx.fillText('L: leaderboard · P: PB times · T: cycle mode · H: help · A: achievements', widthPx / 2, heightPx - 24);
}

function countOwnedUpgrades(campaign) {
  if (!campaign || !campaign.upgrades) return 0;
  let n = 0;
  for (const charKey of Object.keys(campaign.upgrades)) {
    const tree = campaign.upgrades[charKey];
    if (!tree) continue;
    for (const id of Object.keys(tree)) if (tree[id]) n += 1;
  }
  return n;
}

function cycleMode(ts, delta) {
  const idx = MODES.indexOf(ts.mode);
  const base = idx === -1 ? 0 : idx;
  const next = MODES[(base + delta + MODES.length) % MODES.length];
  ts.mode = next;
  // Drop coop selection if the new mode doesn't support it, so START doesn't
  // resolve to a stale local-coop id after cycling into Tutorial/Daily/etc.
  if (!COOP_CAPABLE[next] && ts.players !== 'single') ts.players = 'single';
  setMode(effectiveMode(ts.mode, ts.players));
}

// Cycle SINGLE ↔ LOCAL COOP. Online is shown but not yet selectable.
function cyclePlayers(ts, delta) {
  if (!COOP_CAPABLE[ts.mode]) return;
  ts.players = ts.players === 'local' ? 'single' : 'local';
  setMode(effectiveMode(ts.mode, ts.players));
}

export function titleScreenKey(ts, key) {
  if (!ts) return;
  if (key === 'ArrowUp' || key === 'w' || key === 'W') {
    ts.cursor = (ts.cursor - 1 + ROWS.length) % ROWS.length;
    return;
  }
  if (key === 'ArrowDown' || key === 's' || key === 'S') {
    ts.cursor = (ts.cursor + 1) % ROWS.length;
    return;
  }
  if (key === 't' || key === 'T') {
    cycleMode(ts, 1);
    return;
  }
  // Continue: campaign-only shortcut that loads the next level after bestLevel.
  if ((key === 'c' || key === 'C')
      && (ts.mode === 'campaign')
      && ts.bestLevelId && ts.bestLevelId !== '01') {
    ts.continueRequested = true;
    return;
  }
  // Owned-upgrades viewer: U key, campaign modes only.
  if ((key === 'u' || key === 'U')
      && (ts.mode === 'campaign')) {
    ts.upgradesViewerRequested = true;
    return;
  }
  // Leaderboard viewer: L key, available in all modes.
  if (key === 'l' || key === 'L') {
    ts.leaderboardRequested = true;
    return;
  }
  // Help screen shortcut: H key.
  if (key === 'h' || key === 'H') {
    ts.helpRequested = true;
    return;
  }
  // PB Times viewer: P key.
  if (key === 'p' || key === 'P') {
    ts.pbTimesRequested = true;
    return;
  }
  // Achievements viewer: A key (replaces ArrowLeft fallback for the same key).
  if (key === 'a' || key === 'A') {
    ts.achievementsRequested = true;
    return;
  }
  // Campaign shortcuts: S = standalone shop browse, G = grind / level select.
  if ((key === 's' || key === 'S')
      && (ts.mode === 'campaign')) {
    ts.shopRequested = true;
    return;
  }
  if ((key === 'g' || key === 'G')
      && (ts.mode === 'campaign')) {
    ts.levelSelectRequested = true;
    return;
  }
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const row = ROWS[ts.cursor];
    const delta = key === 'ArrowLeft' ? -1 : 1;
    if (row === 'mode') {
      cycleMode(ts, delta);
      return;
    }
    if (row === 'players') {
      cyclePlayers(ts, delta);
      return;
    }
    if (row === 'skin') {
      cycleSkinForPlayer(1, delta);
      return;
    }
    if (row === 'skin2') {
      cycleSkinForPlayer(2, delta);
      return;
    }
  }
  if (key === 'Enter' || key === ' ') {
    const row = ROWS[ts.cursor];
    if (row === 'help') {
      ts.helpRequested = true;
    } else if (row === 'achievements') {
      ts.achievementsRequested = true;
    } else {
      ts.startRequested = true;
    }
  }
}

export function consumeStartRequest(ts) {
  if (ts && ts.startRequested) {
    ts.startRequested = false;
    return true;
  }
  return false;
}

export function stopTitleMusic(ts) {
  if (ts) ts._musicStarted = false;
  stop();
}
