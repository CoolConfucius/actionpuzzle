// Achievement-unlock toast: a sliding card at the top-right of the canvas,
// shown for ~3.5s on unlock, then fades out. Multiple unlocks queue and
// display sequentially.
import { BALANCE } from '../engine/constants.js';
import { lookupAchievement } from '../engine/achievements.js';

const TOAST_W = 240;
const TOAST_H = 56;
const TOAST_LIFE_MS = 3500;
const SLIDE_MS = 280;

export function createToastList() {
  return [];
}

export function pushAchievementToast(list, achievementId) {
  if (!list) return;
  const def = lookupAchievement(achievementId);
  if (!def) return;
  list.push({
    id: achievementId,
    label: def.label,
    description: def.description,
    elapsedMs: 0,
  });
}

export function tickAchievementToasts(list, dtMs) {
  if (!list) return;
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].elapsedMs += dtMs;
    if (list[i].elapsedMs >= TOAST_LIFE_MS) list.splice(i, 1);
  }
}

export function drawAchievementToasts(ctx, list) {
  if (!list || list.length === 0) return;
  const width = BALANCE.GRID_COLS * BALANCE.TILE_PX;
  // Show only the oldest toast at a time, so they don't overlap.
  const t = list[0];
  if (!t) return;
  const baseY = BALANCE.HUD_HEIGHT_PX + 8;
  const slideIn = Math.min(1, t.elapsedMs / SLIDE_MS);
  const slideOut = t.elapsedMs > TOAST_LIFE_MS - SLIDE_MS
    ? (TOAST_LIFE_MS - t.elapsedMs) / SLIDE_MS
    : 1;
  const visibility = Math.min(slideIn, Math.max(0, slideOut));
  const xTarget = width - TOAST_W - 8;
  const x = xTarget + (TOAST_W + 16) * (1 - visibility);

  ctx.save();
  ctx.globalAlpha = visibility;
  ctx.fillStyle = 'rgba(15,10,30,0.92)';
  ctx.fillRect(x, baseY, TOAST_W, TOAST_H);
  ctx.strokeStyle = '#FFCC44';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, baseY + 1, TOAST_W - 2, TOAST_H - 2);

  ctx.fillStyle = '#FFCC44';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('★ ACHIEVEMENT', x + 8, baseY + 6);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 13px monospace';
  ctx.fillText(t.label, x + 8, baseY + 22);

  ctx.fillStyle = '#AACCFF';
  ctx.font = '10px monospace';
  ctx.fillText(t.description, x + 8, baseY + 40);

  ctx.restore();
}
