// Explosion VFX as a shockwave of expanding circles — one per affected cell.
// The wave radiates from the center; outer cells pop later than the center,
// so the player can SEE the radius of effect propagating outward. Particles
// still shatter outward from the center for the impact moment.
import { gridToPx } from './sprites.js';
import { BALANCE } from '../engine/constants.js';

const TILE_PX = BALANCE.TILE_PX;
const GRID_COLS = BALANCE.GRID_COLS;
const GRID_ROWS = BALANCE.GRID_ROWS;

// Per-cell circle puff: starts small at the cell center, expands to fill the
// cell, then fades. Color crossfades from white-hot core → orange → faded.
const CIRCLE_LIFETIME_MS = 320;
// Outer cells delay relative to center, scaled by chebyshev distance.
const PER_RING_DELAY_MS = 55;

// Center shockwave ring (large, low-alpha)
const SHOCKWAVE_DURATION_MS = 340;
const SHOCKWAVE_MAX_SCALE = 2.6;

// Particle burst from the center.
const PARTICLE_COUNT = 18;
const PARTICLE_SPEED_MIN = 110;
const PARTICLE_SPEED_MAX = 260;
const PARTICLE_DRAG = 4.5;
const PARTICLE_SIZE_MIN = 2.5;
const PARTICLE_SIZE_MAX = 4.5;
const PARTICLE_COLORS = ['#FFFFFF', '#FFD24A', '#FF8833', '#FFB14A'];
const PARTICLE_LIFETIME_MS = 420;

const TOTAL_DURATION_MS = Math.max(SHOCKWAVE_DURATION_MS, PARTICLE_LIFETIME_MS, CIRCLE_LIFETIME_MS + PER_RING_DELAY_MS * 4);

export function consumeExplosionEvents(state, list) {
  if (!state || !state.eventQueue || !list) return;
  const queue = state.eventQueue;
  for (let i = 0; i < queue.length; i++) {
    const ev = queue[i];
    if (!ev || !ev.cell) continue;
    if (ev.type === 'explode') {
      const radius = typeof ev.radius === 'number' ? ev.radius : 1;
      list.push(makeEntry(ev.cell.col, ev.cell.row, radius));
    } else if (ev.type === 'playerDeath') {
      // Small kill-poof — handled in the rounded-puff style too.
      list.push(makeEntry(ev.cell.col, ev.cell.row, 0, { small: true }));
    }
  }
}

function makeEntry(centerCol, centerRow, radius, opts) {
  const small = !!(opts && opts.small);
  const { x, y } = gridToPx({ col: centerCol, row: centerRow });
  const cx = x + TILE_PX / 2;
  const cy = y + TILE_PX / 2;
  const circles = [];
  // Always include the center cell. For radius > 0 add every cell within
  // chebyshev distance ≤ radius. Each circle gets a start-delay scaled by
  // distance, so the wave radiates from center outward.
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const c = centerCol + dc;
      const r = centerRow + dr;
      if (c < 0 || c >= GRID_COLS || r < 0 || r >= GRID_ROWS) continue;
      const dist = Math.max(Math.abs(dc), Math.abs(dr));
      const cellPx = gridToPx({ col: c, row: r });
      circles.push({
        cx: cellPx.x + TILE_PX / 2,
        cy: cellPx.y + TILE_PX / 2,
        delayMs: dist * PER_RING_DELAY_MS,
        // Center circle is slightly hotter / larger; outer circles still feel
        // like part of the same explosion but read as "wave reaching here".
        intensity: dist === 0 ? 1.0 : (1 - dist * 0.12),
      });
    }
  }
  const particles = [];
  if (!small) {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const baseAngle = (i / PARTICLE_COUNT) * Math.PI * 2;
      const jitter = (Math.random() - 0.5) * 0.45;
      const angle = baseAngle + jitter;
      const speed = PARTICLE_SPEED_MIN + Math.random() * (PARTICLE_SPEED_MAX - PARTICLE_SPEED_MIN);
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
        size: PARTICLE_SIZE_MIN + Math.random() * (PARTICLE_SIZE_MAX - PARTICLE_SIZE_MIN),
      });
    }
  }
  return { centerX: cx, centerY: cy, circles, particles, elapsedMs: 0, small };
}

export function tickExplosionFx(list, dtMs) {
  if (!list) return;
  const dt = Math.max(0, dtMs) / 1000;
  for (let i = list.length - 1; i >= 0; i--) {
    const entry = list[i];
    entry.elapsedMs += dtMs;
    for (const p of entry.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const drag = Math.pow(1 - 0.85, dt * PARTICLE_DRAG / 4);
      p.vx *= drag;
      p.vy *= drag;
    }
    if (entry.elapsedMs >= TOTAL_DURATION_MS) {
      list.splice(i, 1);
    }
  }
}

export function drawExplosionFx(ctx, list) {
  if (!list || list.length === 0) return;
  ctx.save();
  for (const entry of list) drawEntry(ctx, entry);
  ctx.restore();
}

function drawEntry(ctx, entry) {
  // 1) Center shockwave ring — a single big outline expanding fast.
  if (!entry.small && entry.elapsedMs < SHOCKWAVE_DURATION_MS) {
    const t = entry.elapsedMs / SHOCKWAVE_DURATION_MS;
    const ringR = (TILE_PX * 0.5) * (0.4 + (SHOCKWAVE_MAX_SCALE - 0.4) * t);
    ctx.globalAlpha = Math.max(0, 0.6 * (1 - t));
    ctx.strokeStyle = '#FFD24A';
    ctx.lineWidth = 3 * (1 - t * 0.5);
    ctx.beginPath();
    ctx.arc(entry.centerX, entry.centerY, ringR, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 2) Per-cell circle puffs. Each cell pops in turn as the wave reaches it.
  for (const circle of entry.circles) {
    const local = entry.elapsedMs - circle.delayMs;
    if (local < 0 || local >= CIRCLE_LIFETIME_MS) continue;
    const t = local / CIRCLE_LIFETIME_MS;
    // Quick grow (0 → ~80% in first 25%) then hold + fade.
    const grow = t < 0.25 ? (t / 0.25) : 1;
    const radius = TILE_PX * 0.46 * grow * circle.intensity;
    // Color crossfade: white-hot core → orange → fade out.
    let fillColor;
    if (t < 0.20) fillColor = '#FFFFFF';
    else if (t < 0.55) fillColor = '#FFD24A';
    else fillColor = '#FF8833';
    const alpha = circle.intensity * (1 - t) * 0.85;
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.arc(circle.cx, circle.cy, radius, 0, Math.PI * 2);
    ctx.fill();
    // Soft outer glow ring on the same cell — sells the "puff" boundary.
    if (t > 0.10) {
      ctx.globalAlpha = Math.max(0, alpha * 0.6);
      ctx.strokeStyle = '#FFB14A';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(circle.cx, circle.cy, radius + 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // 3) Particle shatter from center.
  if (!entry.small) {
    const particleLife = Math.max(0, 1 - entry.elapsedMs / PARTICLE_LIFETIME_MS);
    if (particleLife > 0) {
      for (const p of entry.particles) {
        ctx.globalAlpha = particleLife;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
