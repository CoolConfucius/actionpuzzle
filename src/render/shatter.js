// Per-type shatter visuals for destroyed grid objects (rock, egg, donut).
// Each type has a distinct animation that respects its base color:
//   - rock:  heavy gray-brown chunks tumbling outward with rotation
//   - egg:   white shell fragments + a faint yolk splat in the center
//   - donut: curved arc pieces flying off the ring + a few sprinkles
// Pure render-layer; consumes 'objectDestroy' events.
import { gridToPx } from './sprites.js';
import { BALANCE, COLORS } from '../engine/constants.js';

const TOTAL_DURATION_MS = 420;

const TYPE_CONFIG = {
  rock: {
    pieces: 6,
    pieceSizeMin: 5,
    pieceSizeMax: 9,
    speedMin: 60,
    speedMax: 140,
    gravity: 280,
    drag: 3.5,
    rotateSpeedMin: -8,
    rotateSpeedMax: 8,
    fill: () => COLORS.rock || '#8B5A2B',
    accent: '#5A3A1A',
    shape: 'chunk',
  },
  egg: {
    pieces: 7,
    pieceSizeMin: 4,
    pieceSizeMax: 7,
    speedMin: 80,
    speedMax: 180,
    gravity: 240,
    drag: 4.0,
    rotateSpeedMin: -10,
    rotateSpeedMax: 10,
    fill: () => COLORS.egg || '#FFF8DC',
    accent: COLORS.friedEggYolk || '#FFCC44',
    shape: 'shell',
  },
  donut: {
    pieces: 5,
    pieceSizeMin: 7,
    pieceSizeMax: 11,
    speedMin: 70,
    speedMax: 150,
    gravity: 180,
    drag: 3.0,
    rotateSpeedMin: -14,
    rotateSpeedMax: 14,
    fill: () => COLORS.donut || '#9966CC',
    accent: '#FFDDFF',
    shape: 'arc',
  },
};

export function consumeShatterEvents(state, list) {
  if (!state || !state.eventQueue || !list) return;
  const queue = state.eventQueue;
  for (let i = 0; i < queue.length; i++) {
    const ev = queue[i];
    if (!ev || !ev.cell) continue;
    if (ev.type === 'objectDestroy') {
      const cfg = TYPE_CONFIG[ev.objectType];
      if (!cfg) continue;
      list.push(makeEntry(ev.cell.col, ev.cell.row, ev.objectType, cfg));
    } else if (ev.type === 'enemySpawn') {
      // Enemy emergence: rock-shatter so it reads as "enemy breaking out of
      // the rock". Reuses the rock cfg — same chunky brown debris.
      list.push(makeEntry(ev.cell.col, ev.cell.row, 'rock', TYPE_CONFIG.rock));
    }
  }
}

function makeEntry(col, row, type, cfg) {
  const tile = BALANCE.TILE_PX;
  const { x, y } = gridToPx({ col, row });
  const cx = x + tile / 2;
  const cy = y + tile / 2;
  const pieces = [];
  for (let i = 0; i < cfg.pieces; i++) {
    const baseAngle = (i / cfg.pieces) * Math.PI * 2;
    const jitter = (Math.random() - 0.5) * 0.5;
    const angle = baseAngle + jitter;
    const speed = cfg.speedMin + Math.random() * (cfg.speedMax - cfg.speedMin);
    pieces.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 30, // small upward bias on shatter
      angle: Math.random() * Math.PI * 2,
      angVel: cfg.rotateSpeedMin + Math.random() * (cfg.rotateSpeedMax - cfg.rotateSpeedMin),
      size: cfg.pieceSizeMin + Math.random() * (cfg.pieceSizeMax - cfg.pieceSizeMin),
      shapeSeed: Math.random(),
      accent: Math.random() < 0.3, // some pieces use the accent color
    });
  }
  return { centerX: cx, centerY: cy, type, cfg, pieces, elapsedMs: 0 };
}

export function tickShatter(list, dtMs) {
  if (!list) return;
  const dt = Math.max(0, dtMs) / 1000;
  for (let i = list.length - 1; i >= 0; i--) {
    const entry = list[i];
    entry.elapsedMs += dtMs;
    const cfg = entry.cfg;
    for (const p of entry.pieces) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += cfg.gravity * dt;
      const drag = Math.pow(1 - 0.85, dt * cfg.drag / 4);
      p.vx *= drag;
      p.angle += p.angVel * dt;
    }
    if (entry.elapsedMs >= TOTAL_DURATION_MS) list.splice(i, 1);
  }
}

export function drawShatter(ctx, list) {
  if (!list || list.length === 0) return;
  ctx.save();
  for (const entry of list) drawEntry(ctx, entry);
  ctx.restore();
}

function drawEntry(ctx, entry) {
  const life = Math.max(0, 1 - entry.elapsedMs / TOTAL_DURATION_MS);
  if (life <= 0) return;
  const cfg = entry.cfg;
  const fillColor = cfg.fill();

  // Type-specific center splat for the first ~120ms — sells the impact moment.
  if (entry.elapsedMs < 120) {
    const t = entry.elapsedMs / 120;
    ctx.globalAlpha = 0.5 * (1 - t);
    if (entry.type === 'egg') {
      // Yolk splat — small yellow disc.
      ctx.fillStyle = cfg.accent;
      ctx.beginPath();
      ctx.arc(entry.centerX, entry.centerY, 6 + 6 * t, 0, Math.PI * 2);
      ctx.fill();
    } else if (entry.type === 'donut') {
      // Crumbly puff ring.
      ctx.strokeStyle = cfg.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(entry.centerX, entry.centerY, 8 + 8 * t, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Rock — dust puff.
      ctx.fillStyle = cfg.accent;
      ctx.beginPath();
      ctx.arc(entry.centerX, entry.centerY, 5 + 5 * t, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (const p of entry.pieces) {
    const color = p.accent ? cfg.accent : fillColor;
    ctx.globalAlpha = life;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = color;
    if (cfg.shape === 'chunk') drawChunk(ctx, p.size, p.shapeSeed);
    else if (cfg.shape === 'shell') drawShell(ctx, p.size, p.shapeSeed);
    else if (cfg.shape === 'arc') drawArc(ctx, p.size, p.shapeSeed, color);
    ctx.restore();
  }
}

// Rough quadrilateral — rocky chunk.
function drawChunk(ctx, size, seed) {
  const r = size;
  const wobble = 0.35;
  ctx.beginPath();
  ctx.moveTo(-r, -r * (1 - wobble * (0.5 - seed)));
  ctx.lineTo( r * (1 - wobble * seed), -r);
  ctx.lineTo( r, r * (1 - wobble * seed));
  ctx.lineTo(-r * (1 - wobble * (0.5 - seed)), r);
  ctx.closePath();
  ctx.fill();
}

// Egg-shell fragment — curved triangle.
function drawShell(ctx, size, seed) {
  const r = size;
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.quadraticCurveTo(0, -r * (1.2 + seed * 0.4), r, 0);
  ctx.quadraticCurveTo(0, -r * 0.2, -r, 0);
  ctx.closePath();
  ctx.fill();
}

// Donut arc fragment — short curved ring section.
function drawArc(ctx, size, seed, color) {
  const r = size;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, r * 0.5);
  ctx.beginPath();
  const sweep = 1 + seed * 1.5;
  ctx.arc(0, 0, r, -sweep / 2, sweep / 2);
  ctx.stroke();
}
