// Shows a brief "W#L# Title" banner at the start of each level. Gameplay is
// frozen for the first LEVEL_COUNTDOWN_MS but no numerals are rendered —
// the player just sees the static level for a beat before they can act.
import { BALANCE } from '../engine/constants.js';

const DURATION_MS = 1600;
const FADE_MS = 250;

export function createLevelIntro() {
  return { activeId: null, elapsedMs: 0, label: '' };
}

// 3rd `title` arg accepted but ignored — titles were dropped by design.
// Call sites can be cleaned up gradually.
export function showLevelIntro(intro, levelId /* , _title */) {
  if (!intro) return;
  intro.activeId = levelId || '';
  intro.elapsedMs = 0;
  intro.label = formatWorldLevel(levelId);
}

export function tickLevelIntro(intro, dtMs) {
  if (!intro || !intro.activeId) return;
  intro.elapsedMs += dtMs;
  if (intro.elapsedMs >= DURATION_MS) intro.activeId = null;
}

export function drawLevelIntro(ctx, intro) {
  if (!intro || !intro.activeId) return;
  const W = BALANCE.GRID_COLS * BALANCE.TILE_PX;
  const hud = BALANCE.HUD_HEIGHT_PX;
  const playH = BALANCE.GRID_ROWS * BALANCE.TILE_PX;
  // Centered banner across the play area.
  const cy = hud + playH / 2;
  const visIn = Math.min(1, intro.elapsedMs / FADE_MS);
  const visOut = intro.elapsedMs > DURATION_MS - FADE_MS
    ? (DURATION_MS - intro.elapsedMs) / FADE_MS : 1;
  const visibility = Math.max(0, Math.min(visIn, visOut));
  if (visibility <= 0) return;
  ctx.save();
  ctx.globalAlpha = visibility * 0.7;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, cy - 28, W, 56);
  ctx.globalAlpha = visibility;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFCC66';
  ctx.font = 'bold 26px monospace';
  ctx.fillText(intro.label, W / 2, cy);
  ctx.restore();
}


function formatWorldLevel(id) {
  if (typeof id !== 'string' || !/^\d{2}$/.test(id)) return '';
  const n = parseInt(id, 10);
  if (!Number.isFinite(n) || n < 1) return '';
  const world = Math.floor((n - 1) / 6) + 1;
  const level = ((n - 1) % 6) + 1;
  return `W${world}L${level}`;
}
