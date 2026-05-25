// Help screen — full-screen reference of controls and mechanics. Opened from
// title screen via the HELP row; Esc returns. No gameplay effect.

const BG_COLOR = '#0A0F1A';
const TITLE_COLOR = '#FFCC66';
const SECTION_COLOR = '#66FFAA';
const TEXT_COLOR = '#FFFFFF';
const DIM_COLOR = '#888899';

const TITLE_FONT = 'bold 24px monospace';
const SECTION_FONT = 'bold 14px monospace';
const ROW_FONT = '12px monospace';
const FOOT_FONT = '11px monospace';

const SECTIONS = [
  {
    name: 'CONTROLS',
    rows: [
      ['Move', 'P1: WASD     P2: Arrows'],
      ['Hurl object', 'P1: Space    P2: Enter'],
      ['Destroy object', 'P1: Shift L  P2: Shift R'],
      ['Character ability', 'P1: 1   P2: 6  (dispatches by character)'],
      ['  Wolf', 'use stored Berserk (Q slot)'],
      ['  Owl', 'use stored Time Freeze'],
      ['  Fox', 'use stored Invisibility'],
      ['  Lion', 'charge next rock-hurl into fireball'],
      ['  Monkey', 'drop a stun clone at your cell'],
      ['  Rabbit', 'drop a proximity bomb at your cell'],
      ['  Mole', 'cancel nearest trap-cast, or burrow'],
      ['  Bear / Elephant / Pig', 'passive — no ability key'],
      ['Pause', 'Esc or P'],
      ['Mute music', 'M'],
      ['Title menus', 'L:lboard P:PB U:upgrades G:levels S:shop'],
      ['Admin/tester menu', '` (backtick)'],
    ],
  },
  {
    name: 'OBJECTIVE',
    rows: [
      ['Win', 'Clear all enemies, or destroy all objects.'],
      ['Lose', 'All lives lost while still on the level.'],
      ['Score', 'Kill enemies + crack eggs + clear bonuses.'],
      ['Lives', '1 extra life every 50,000 points.'],
    ],
  },
  {
    name: 'OBJECTS',
    rows: [
      ['Rock', 'Standard. Hurled rocks slide and kill.'],
      ['Egg', 'Cracks for points. Spawns enemies if untouched.'],
      ['Fireball', 'Explodes on impact (3x3 radius).'],
      ['Donut', 'Bounces back once before stopping.'],
      ['Fried egg', 'Walk over for +1 speed (stacks).'],
    ],
  },
  {
    name: 'POWERUP BALLOONS',
    rows: [
      ['Berserk', 'Touch enemies to kill (timed).'],
      ['Invisibility', 'Enemies ignore you (timed).'],
      ['Time freeze', 'Enemies & spawns paused.'],
      ['Life +1', 'Adds a life stock.'],
      ['Score +500/1000/2500', 'Bonus points.'],
      ['Multiplier x2 / x3', 'Doubles/triples scoring (timed).'],
    ],
  },
  {
    name: 'MODES',
    rows: [
      ['Arcade', 'Single player. Top-20 leaderboard on death.'],
      ['Campaign', 'Earn coins, buy permanent upgrades between levels.'],
      ['Campaign 2P', 'Local 2P campaign; shared coin pool.'],
      ['Coop', 'Local 2P arcade, shared lives & score.'],
      ['Tutorial', '6 levels teaching basics, hazards, bouncing, and bosses.'],
      ['Daily', 'Date-seeded single-level challenge.'],
      ['Endless', 'Loop W8 with rising difficulty after LV-48.'],
      ['Boss Rush', 'Chain 7 world finales (LV-12 → LV-48).'],
      ['Random 8', 'Shuffled 8-level run, new sequence every time.'],
    ],
  },
  {
    name: 'CAMPAIGN',
    rows: [
      ['Coins (¢)', 'From enemy kills + level clears.'],
      ['Shop', 'Press S from title, or post-level intermission.'],
      ['Level select', 'Press G from title to replay cleared levels.'],
      ['Replay grind', 'Cleared levels award 50% coins (no spoiling).'],
      ['Continue', 'Press C to resume after best level.'],
      ['Inventory', 'Some upgrades store powerups; press Q to use.'],
    ],
  },
  {
    name: 'ABILITIES (CAMPAIGN ONLY)',
    rows: [
      ['Theodore (Speed)', 'Passive: spawns + speed cap upgrades. No key.'],
      ['Wolf (Berserk)',   'Q: trigger banked Berserk (with invBerserk).'],
      ['Monkey (Clone)',   'N: drop stun clone (5s decoy).'],
      ['Elephant (Life)',  'Passive: extra life balloons and rebirth.'],
      ['Lion (Fire)',      'F: charge next rock hurl into a fireball.'],
      ['Pig (Bounce)',     'Passive: donut mastery, immunity, trampoline.'],
      ['Mole (Trap)',      'T: cancel nearby trap-cast or burrow.'],
      ['Rabbit (Bomb)',    'B: drop proximity bomb (with bombCarrying).'],
    ],
  },
];

let scrollY = 0;
let lastMaxScroll = 0;
const SCROLL_STEP = 24;

// Compute content height from the section data only — no drawing. Mirrors the
// y-advance arithmetic in drawSectionStack so we can clamp scrollY BEFORE the
// next draw and avoid a one-frame overshoot when the user holds Down at the
// bottom.
function measureContentHeight() {
  let y = 0;
  for (const sec of SECTIONS) {
    y += 18; // section header line
    y += sec.rows.length * 15;
    y += 8;  // post-section gap
  }
  return y;
}
const CONTENT_HEIGHT = measureContentHeight();

export function scrollHelpScreen(delta) {
  scrollY = Math.max(0, Math.min(lastMaxScroll, scrollY + delta));
}

export function resetHelpScroll() {
  scrollY = 0;
}

export function drawHelpScreen(ctx, widthPx, heightPx) {
  const W = widthPx || 912;
  const H = heightPx || 756;
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.fillStyle = TITLE_COLOR;
  ctx.font = TITLE_FONT;
  ctx.fillText('HELP', W / 2, 40);

  // Single column, centered. Label column sits at the panel's left margin;
  // values get a generous gutter so longer descriptions don't crash into them.
  const labelX = Math.max(24, Math.floor((W - 560) / 2));
  const valueX = labelX + 200;

  const bodyTop = 60;
  const bodyBottom = H - 26;
  const startY = 20; // relative to bodyTop after translate

  // Clamp BEFORE drawing so a held-down key can't render a one-frame overshoot
  // at the bottom. Cache maxScroll so the key handler can clamp at the source.
  const viewH = bodyBottom - bodyTop;
  const maxScroll = Math.max(0, CONTENT_HEIGHT - viewH + 8);
  lastMaxScroll = maxScroll;
  if (scrollY > maxScroll) scrollY = maxScroll;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, bodyTop, W, bodyBottom - bodyTop);
  ctx.clip();
  ctx.translate(0, bodyTop - scrollY);
  drawSectionStack(ctx, SECTIONS, labelX, valueX, startY);
  ctx.restore();

  // Edge fades hint that more content lies above/below.
  if (scrollY > 0) drawEdgeFade(ctx, 0, bodyTop, W, 18, true);
  if (scrollY < maxScroll) drawEdgeFade(ctx, 0, bodyBottom - 18, W, 18, false);

  ctx.textAlign = 'center';
  ctx.fillStyle = DIM_COLOR;
  ctx.font = FOOT_FONT;
  const hint = maxScroll > 0 ? '↑/↓ or wheel to scroll · Esc or Enter to return' : 'Esc or Enter to return';
  ctx.fillText(hint, W / 2, H - 10);
}

function drawEdgeFade(ctx, x, y, w, h, topward) {
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  if (topward) {
    grad.addColorStop(0, 'rgba(10,15,26,1)');
    grad.addColorStop(1, 'rgba(10,15,26,0)');
  } else {
    grad.addColorStop(0, 'rgba(10,15,26,0)');
    grad.addColorStop(1, 'rgba(10,15,26,1)');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
}

function drawSectionStack(ctx, sections, labelX, valueX, startY) {
  ctx.textBaseline = 'alphabetic';
  let y = startY;
  for (const sec of sections) {
    ctx.textAlign = 'left';
    ctx.fillStyle = SECTION_COLOR;
    ctx.font = SECTION_FONT;
    ctx.fillText(sec.name, labelX, y);
    y += 18;
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = ROW_FONT;
    for (const [label, value] of sec.rows) {
      ctx.fillStyle = '#CCCCCC';
      ctx.fillText(label, labelX, y);
      ctx.fillStyle = TEXT_COLOR;
      ctx.fillText(value, valueX, y);
      y += 15;
    }
    y += 8;
  }
  return y;
}
