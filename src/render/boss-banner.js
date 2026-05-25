// Boss-spawn announcement banner. Pulls from the eventQueue's enemySpawn
// events; shows "TITAN INCOMING" or "PHANTOM INCOMING" for ~1.5s when one
// of the tier-6/7 enemies emerges.
import { BALANCE } from '../engine/constants.js';

const DURATION_MS = 1600;
const SLIDE_MS = 220;

const LABELS = {
  enemy6: { text: 'TITAN INCOMING', color: '#FF8800' },
  enemy7: { text: 'PHANTOM INCOMING', color: '#9966FF' },
};

export function createBossBannerList() {
  return [];
}

export function consumeBossSpawnEvents(state, list) {
  if (!state || !state.eventQueue || !list) return;
  for (const ev of state.eventQueue) {
    if (!ev || ev.type !== 'enemySpawn') continue;
    if (ev.enemyType !== 'enemy6' && ev.enemyType !== 'enemy7') continue;
    list.push({ enemyType: ev.enemyType, elapsedMs: 0 });
  }
}

export function tickBossBanner(list, dtMs) {
  if (!list) return;
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].elapsedMs += dtMs;
    if (list[i].elapsedMs >= DURATION_MS) list.splice(i, 1);
  }
}

export function drawBossBanner(ctx, list) {
  if (!list || list.length === 0) return;
  const width = BALANCE.GRID_COLS * BALANCE.TILE_PX;
  const baseY = BALANCE.HUD_HEIGHT_PX + 50;
  // Stack newest on top so multi-spawn announcements are visible briefly.
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    const cfg = LABELS[entry.enemyType] || LABELS.enemy6;
    const slideIn = Math.min(1, entry.elapsedMs / SLIDE_MS);
    const slideOut = entry.elapsedMs > DURATION_MS - SLIDE_MS
      ? (DURATION_MS - entry.elapsedMs) / SLIDE_MS : 1;
    const vis = Math.max(0, Math.min(slideIn, slideOut));
    const y = baseY + i * 36;

    ctx.save();
    ctx.globalAlpha = vis;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, y - 18, width, 28);
    ctx.fillStyle = cfg.color;
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cfg.text, width / 2, y - 4);
    // Underline accent
    ctx.fillRect(width / 2 - 60, y + 8, 120, 2);
    ctx.restore();
  }
}
