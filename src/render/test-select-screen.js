// Test-mode level selector. Vertical list of curated test levels with
// short descriptions. Arrow up/down to navigate, Enter to load, Esc to back.

const BG_COLOR = '#0A0F1A';
const TITLE_COLOR = '#FFAAFF';
const DIM_COLOR = '#AABBCC';
const TEXT_COLOR = '#FFFFFF';
const HIGHLIGHT_COLOR = '#FF88AA';

export const TEST_LEVELS = [
  { id: '01', label: 'T1: Object Shatter Test', desc: 'Hurl/break rocks, eggs, donuts, fireballs. Watch the per-type shatter FX.' },
  { id: '02', label: 'T2: Balloon Parade',      desc: 'Every powerup type rises in turn. Test each pop animation and SFX.' },
  { id: '03', label: 'T3: Enemy Zoo',           desc: 'One of each enemy type. Test frozen overlay, hit feedback, death poof.' },
  { id: '04', label: 'T4: Ability Sandbox',     desc: 'All upgrades granted. Cycle skins on title to test each character ability.' },
];

export function createTestSelectState() {
  return { open: false, cursor: 0 };
}

export function openTestSelect(sel) {
  if (!sel) return;
  sel.open = true;
  sel.cursor = 0;
}

export function closeTestSelect(sel) {
  if (!sel) return;
  sel.open = false;
}

export function isTestSelectOpen(sel) {
  return !!(sel && sel.open);
}

export function navigateTestSelect(sel, delta) {
  if (!sel || !sel.open) return;
  const n = TEST_LEVELS.length;
  sel.cursor = ((sel.cursor + delta) % n + n) % n;
}

export function selectedTestLevelId(sel) {
  if (!sel) return null;
  const entry = TEST_LEVELS[sel.cursor];
  return entry ? entry.id : null;
}

export function drawTestSelect(ctx, sel, widthPx, heightPx) {
  if (!sel || !sel.open) return;
  const W = widthPx || 912;
  const H = heightPx || 756;
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.fillStyle = TITLE_COLOR;
  ctx.font = 'bold 24px monospace';
  ctx.fillText('TEST MODE — pick a level', W / 2, 60);

  ctx.fillStyle = DIM_COLOR;
  ctx.font = '12px monospace';
  ctx.fillText('Up/Down to navigate · Enter to load · Esc to return', W / 2, 84);

  const topY = 130;
  const rowH = 100;
  ctx.textAlign = 'left';
  for (let i = 0; i < TEST_LEVELS.length; i++) {
    const entry = TEST_LEVELS[i];
    const selected = sel.cursor === i;
    const y = topY + i * rowH;
    const xLeft = 80;
    const w = W - xLeft * 2;

    // Card background
    ctx.fillStyle = selected ? '#22335A' : '#111122';
    ctx.fillRect(xLeft, y, w, rowH - 16);
    ctx.strokeStyle = selected ? HIGHLIGHT_COLOR : '#222233';
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(xLeft, y, w, rowH - 16);

    // Label
    ctx.fillStyle = selected ? HIGHLIGHT_COLOR : TEXT_COLOR;
    ctx.font = selected ? 'bold 18px monospace' : 'bold 16px monospace';
    ctx.fillText(entry.label, xLeft + 16, y + 30);

    // Description
    ctx.fillStyle = DIM_COLOR;
    ctx.font = '13px monospace';
    ctx.fillText(entry.desc, xLeft + 16, y + 56);

    // Cursor arrow
    if (selected) {
      ctx.fillStyle = HIGHLIGHT_COLOR;
      ctx.font = 'bold 16px monospace';
      ctx.fillText('▶', xLeft - 24, y + 36);
    }
  }
}
