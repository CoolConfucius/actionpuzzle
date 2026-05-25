// Quick particle burst at an enemy's death cell. Tints by enemy type so
// kill-streaks read distinctly. Pure visual; consumes 'enemyDefeated' events.
import { gridToPx } from './sprites.js';
import { BALANCE, COLORS } from '../engine/constants.js';

const PARTICLE_COUNT = 9;
const PARTICLE_SPEED_MIN = 70;
const PARTICLE_SPEED_MAX = 170;
const PARTICLE_DRAG = 5.0;
const PARTICLE_SIZE_MIN = 2.5;
const PARTICLE_SIZE_MAX = 4;
const TOTAL_DURATION_MS = 360;
const RING_DURATION_MS = 220;
const RING_MAX_SCALE = 1.8;

function paletteFor(enemyType) {
  const tint = (enemyType && COLORS[enemyType]) || '#DDDDDD';
  // Bright accent + tint + soft white so the burst pops on every background.
  return ['#FFFFFF', tint, tint, '#FFEEAA'];
}

export function consumeEnemyDeathEvents(state, list) {
  if (!state || !state.eventQueue || !list) return;
  const queue = state.eventQueue;
  for (let i = 0; i < queue.length; i++) {
    const ev = queue[i];
    if (!ev || ev.type !== 'enemyDefeated' || !ev.cell) continue;
    list.push(makeEntry(ev.cell.col, ev.cell.row, ev.enemyType));
  }
}

function makeEntry(centerCol, centerRow, enemyType) {
  const tile = BALANCE.TILE_PX;
  const { x, y } = gridToPx({ col: centerCol, row: centerRow });
  const cx = x + tile / 2;
  const cy = y + tile / 2;
  const palette = paletteFor(enemyType);
  const particles = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const baseAngle = (i / PARTICLE_COUNT) * Math.PI * 2;
    const jitter = (Math.random() - 0.5) * 0.6;
    const angle = baseAngle + jitter;
    const speed = PARTICLE_SPEED_MIN + Math.random() * (PARTICLE_SPEED_MAX - PARTICLE_SPEED_MIN);
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color: palette[i % palette.length],
      size: PARTICLE_SIZE_MIN + Math.random() * (PARTICLE_SIZE_MAX - PARTICLE_SIZE_MIN),
    });
  }
  return {
    centerX: cx,
    centerY: cy,
    elapsedMs: 0,
    particles,
    ringColor: (enemyType && COLORS[enemyType]) || '#FFFFFF',
  };
}

export function tickDeathPoofs(list, dtMs) {
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

export function drawDeathPoofs(ctx, list) {
  if (!list || list.length === 0) return;
  ctx.save();
  for (const entry of list) drawEntry(ctx, entry);
  ctx.restore();
}

function drawEntry(ctx, entry) {
  // Expanding tint ring — a faint hint of where the enemy was.
  if (entry.elapsedMs < RING_DURATION_MS) {
    const t = entry.elapsedMs / RING_DURATION_MS;
    const ringR = (BALANCE.TILE_PX * 0.55) * (0.5 + (RING_MAX_SCALE - 0.5) * t);
    ctx.globalAlpha = Math.max(0, 0.45 * (1 - t));
    ctx.strokeStyle = entry.ringColor;
    ctx.lineWidth = 2 * (1 - t * 0.5);
    ctx.beginPath();
    ctx.arc(entry.centerX, entry.centerY, ringR, 0, Math.PI * 2);
    ctx.stroke();
  }
  const life = Math.max(0, 1 - entry.elapsedMs / TOTAL_DURATION_MS);
  if (life > 0) {
    for (const p of entry.particles) {
      ctx.globalAlpha = life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }
}
