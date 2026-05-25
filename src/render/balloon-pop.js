// Balloon pop animation: a brief shred + expanding ring when a powerup
// balloon is collected (touch OR projectile). Tinted by powerup type so the
// player can see WHAT they grabbed even from across the screen.
import { gridToPx } from './sprites.js';
import { BALANCE, COLORS } from '../engine/constants.js';

const TOTAL_DURATION_MS = 320;
const RING_DURATION_MS = 260;
const SHRED_COUNT = 8;
const SHRED_SPEED_MIN = 80;
const SHRED_SPEED_MAX = 180;
const SHRED_DRAG = 3.5;
const SHRED_GRAVITY = 240;

function colorForPowerup(type) {
  if (type && COLORS[type]) return COLORS[type];
  // Fallback for types not in the COLORS map.
  switch (type) {
    case 'friedEgg': return COLORS.friedEggYolk || '#FFCC44';
    default: return '#FFFFFF';
  }
}

export function consumeBalloonPopEvents(state, list) {
  if (!state || !state.eventQueue || !list) return;
  const queue = state.eventQueue;
  for (let i = 0; i < queue.length; i++) {
    const ev = queue[i];
    if (!ev || ev.type !== 'balloonPop' || !ev.cell) continue;
    list.push(makeEntry(ev.cell.col, ev.cell.row, ev.powerupType));
  }
}

function makeEntry(col, row, powerupType) {
  const tile = BALANCE.TILE_PX;
  const { x, y } = gridToPx({ col, row });
  const cx = x + tile / 2;
  const cy = y + tile / 2;
  const color = colorForPowerup(powerupType);
  const shreds = [];
  for (let i = 0; i < SHRED_COUNT; i++) {
    const angle = (i / SHRED_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
    const speed = SHRED_SPEED_MIN + Math.random() * (SHRED_SPEED_MAX - SHRED_SPEED_MIN);
    shreds.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 30, // slight upward bias
      angle: Math.random() * Math.PI * 2,
      angVel: (Math.random() - 0.5) * 12,
      length: 4 + Math.random() * 4,
      width: 1.5 + Math.random() * 1.5,
    });
  }
  return {
    centerX: cx,
    centerY: cy,
    color,
    shreds,
    elapsedMs: 0,
  };
}

export function tickBalloonPops(list, dtMs) {
  if (!list) return;
  const dt = Math.max(0, dtMs) / 1000;
  for (let i = list.length - 1; i >= 0; i--) {
    const entry = list[i];
    entry.elapsedMs += dtMs;
    for (const s of entry.shreds) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += SHRED_GRAVITY * dt;
      const drag = Math.pow(1 - 0.85, dt * SHRED_DRAG / 4);
      s.vx *= drag;
      s.angle += s.angVel * dt;
    }
    if (entry.elapsedMs >= TOTAL_DURATION_MS) list.splice(i, 1);
  }
}

export function drawBalloonPops(ctx, list) {
  if (!list || list.length === 0) return;
  ctx.save();
  for (const entry of list) drawEntry(ctx, entry);
  ctx.restore();
}

function drawEntry(ctx, entry) {
  // Expanding ring — short flash showing the pop happened HERE.
  if (entry.elapsedMs < RING_DURATION_MS) {
    const t = entry.elapsedMs / RING_DURATION_MS;
    const r = BALANCE.TILE_PX * (0.30 + 0.65 * t);
    ctx.globalAlpha = Math.max(0, 0.7 * (1 - t));
    ctx.strokeStyle = entry.color;
    ctx.lineWidth = 2.5 * (1 - t * 0.6);
    ctx.beginPath();
    ctx.arc(entry.centerX, entry.centerY, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Rubber shreds — short rotated rectangles flying outward like burst latex.
  const shredLife = Math.max(0, 1 - entry.elapsedMs / TOTAL_DURATION_MS);
  if (shredLife > 0) {
    ctx.fillStyle = entry.color;
    for (const s of entry.shreds) {
      ctx.globalAlpha = shredLife;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.fillRect(-s.length / 2, -s.width / 2, s.length, s.width);
      ctx.restore();
    }
  }
}
