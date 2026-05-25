import { gridToPx } from './sprites.js';
import { BALANCE } from '../engine/constants.js';

export const POPUP_DURATION_MS = 800;

const COLOR_BY_KIND = {
  eggCrack: '#FFF8DC',
  enemyKill: '#FFEE55',
  spawnCancel: '#FFCC44',
  friedEggPickup: '#FFCC44',
  timeBonus: '#88FFCC',
  hurlTrain: '#FF8833',
  levelClear: '#44EE66',
  scorePlus: '#FFCC22',
  chain: '#FF44FF',
  ability: '#66FFFF',
};

const SIZE_BY_KIND = {
  enemyKill: 14,
  hurlTrain: 13,
  levelClear: 15,
  timeBonus: 13,
  scorePlus: 13,
  chain: 16,
  ability: 15,
};

const EGG_CHAIN_COLORS = ['#FFD080', '#FFAA44', '#FF7733', '#FF3322'];
const EGG_CHAIN_DEFAULT = '#FFAA44';
const FALLBACK_COLOR = '#FFFFFF';

const DEFAULT_FONT_SIZE = 12;
const RISE_PX = 14;
const SHADOW_OFFSET = 1;

export function createPopupList() {
  return [];
}

export function consumePopupEvents(state, list) {
  if (!state || !state.eventQueue) return;
  for (let i = 0; i < state.eventQueue.length; i++) {
    const event = state.eventQueue[i];
    if (!event) continue;
    if (event.type === 'scorePopup') {
      const popup = {
        label: event.label,
        points: event.points,
        kind: event.kind,
        cell: event.cell,
        elapsed: 0,
      };
      if (event.chainDepth !== undefined) {
        popup.chainDepth = event.chainDepth;
      }
      list.push(popup);
    } else if (event.type === 'abilityFire') {
      list.push({
        label: event.label || 'ABILITY',
        kind: 'ability',
        cell: event.cell,
        elapsed: 0,
      });
    }
  }
}

export function tickPopups(list, dtMs) {
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].elapsed += dtMs;
    if (list[i].elapsed >= POPUP_DURATION_MS) {
      list.splice(i, 1);
    }
  }
}

export function drawPopups(ctx, list) {
  if (list.length === 0) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const popup of list) {
    drawSinglePopup(ctx, popup);
  }
  ctx.restore();
}

function drawSinglePopup(ctx, popup) {
  const progress = popup.elapsed / POPUP_DURATION_MS;
  const alpha = Math.max(0, 1 - progress);
  const yOffset = -RISE_PX * progress;
  const tile = BALANCE.TILE_PX;
  const px = gridToPx(popup.cell);
  const centerX = px.x + tile / 2;
  const centerY = px.y + tile / 2 + yOffset;
  const color = colorFor(popup);
  let size = SIZE_BY_KIND[popup.kind] || DEFAULT_FONT_SIZE;
  // Bonus size for big-money pops so a +1000 doesn't blend in with +100.
  if (Number.isFinite(popup.points)) {
    if (popup.points >= 1000) size += 4;
    else if (popup.points >= 500) size += 2;
  }
  // Brief "bounce" on appearance: 20% larger for the first 80ms, easing down.
  const POP_MS = 80;
  const popScale = popup.elapsed < POP_MS
    ? 1 + 0.20 * (1 - popup.elapsed / POP_MS)
    : 1;
  ctx.font = `bold ${Math.round(size * popScale)}px monospace`;
  const text = popup.label != null ? String(popup.label) : '';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#000000';
  ctx.fillText(text, centerX + SHADOW_OFFSET, centerY + SHADOW_OFFSET);
  ctx.fillStyle = color;
  ctx.fillText(text, centerX, centerY);
}

function colorFor(popup) {
  if (popup.kind === 'eggChain') {
    if (typeof popup.chainDepth !== 'number' || popup.chainDepth < 1) {
      return EGG_CHAIN_DEFAULT;
    }
    const idx = Math.min(popup.chainDepth - 1, EGG_CHAIN_COLORS.length - 1);
    return EGG_CHAIN_COLORS[idx];
  }
  return COLOR_BY_KIND[popup.kind] || FALLBACK_COLOR;
}
