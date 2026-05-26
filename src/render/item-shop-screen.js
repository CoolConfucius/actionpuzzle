// Item Shop screen. Tabs across the top group items by lane (Defense /
// Offense / Lives / Speed / Utility). Each lane shows a 3×2 grid where the
// top row is the consumable ladder (Tier I/II/III) and the bottom row is the
// permanent ladder (Tier I/II/III). Buying is gated by prereq on permanents.
import { ITEMS, LANES, LANE_META, itemsInLane, lookupItem } from '../engine/item-defs.js';
import { getCoins, ownsItem, itemCount } from '../engine/campaign.js';

const BG_COLOR = 'rgba(8,8,18,0.95)';
const PANEL_COLOR = '#1A1530';
const PANEL_BORDER = '#FFCC44';
const HIGHLIGHT_COLOR = '#66FFAA';
const TEXT_COLOR = '#FFFFFF';
const DIM_COLOR = '#9999AA';
const COIN_COLOR = '#FFCC44';
const OWNED_COLOR = '#88EE88';
const UNAFFORDABLE_COLOR = '#CC6666';
const LOCKED_COLOR = '#664488';

export function createItemShopState() {
  return {
    open: false,
    lane: 'defense',
    cursor: 0, // 0-5 within the lane's 3x2 grid; utility uses 0 only
    _hoverIdx: -1,
    _hoverBtn: '',
    _hoverTab: '',
    _cardBounds: [],
    _btnBounds: {},
    _tabBounds: {},
    closeRequested: false,
    backToSelectRequested: false,
    skillTreeRequested: false,
    purchaseAnimUntilMs: 0,
    purchaseAnimItemId: '',
    nextLevelId: '',
  };
}

export function openItemShop(state, opts) {
  if (!state) return;
  state.open = true;
  state.cursor = 0;
  state.lane = 'defense';
  state._hoverIdx = -1;
  state._hoverBtn = '';
  state._hoverTab = '';
  state.closeRequested = false;
  state.backToSelectRequested = false;
  state.skillTreeRequested = false;
  state.purchaseAnimUntilMs = 0;
  state.purchaseAnimItemId = '';
  state.nextLevelId = (opts && opts.nextLevelId) || '';
}

export function closeItemShop(state) {
  if (!state) return;
  state.open = false;
}

export function isItemShopOpen(state) {
  return !!(state && state.open);
}

function laneCards(state) {
  return itemsInLane(state.lane);
}

export function selectedItem(state) {
  if (!state || !state.open) return null;
  const list = laneCards(state);
  return list[state.cursor] || null;
}

export function navigateItemShop(state, delta) {
  if (!state || !state.open) return;
  const list = laneCards(state);
  if (list.length === 0) return;
  state.cursor = (state.cursor + delta + list.length) % list.length;
}

export function cycleLane(state, delta) {
  if (!state || !state.open) return;
  const idx = LANES.indexOf(state.lane);
  const base = idx === -1 ? 0 : idx;
  state.lane = LANES[(base + delta + LANES.length) % LANES.length];
  state.cursor = 0;
}

export function setLane(state, laneId) {
  if (!state || !state.open) return;
  if (LANES.indexOf(laneId) === -1) return;
  state.lane = laneId;
  state.cursor = 0;
}

export function consumeItemShopAction(state) {
  if (!state) return null;
  if (state.closeRequested) { state.closeRequested = false; return 'close'; }
  if (state.backToSelectRequested) { state.backToSelectRequested = false; return 'backToSelect'; }
  if (state.skillTreeRequested) { state.skillTreeRequested = false; return 'skillTree'; }
  return null;
}

export function markPurchaseAnimation(state, itemId, durationMs) {
  if (!state) return;
  const dur = Number.isFinite(durationMs) ? durationMs : 700;
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  state.purchaseAnimUntilMs = now + dur;
  state.purchaseAnimItemId = itemId || '';
}

export function drawItemShopScreen(ctx, state, campaign, widthPx, heightPx) {
  if (!state || !state.open) return;
  const W = widthPx || 1000;
  const H = heightPx || 552;

  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, W, H);

  const PW = Math.min(960, W - 40);
  const PH = Math.min(H - 30, 600);
  const px = Math.floor((W - PW) / 2);
  const py = Math.floor((H - PH) / 2);

  ctx.fillStyle = PANEL_COLOR;
  roundRect(ctx, px, py, PW, PH, 14);
  ctx.fill();
  ctx.strokeStyle = PANEL_BORDER;
  ctx.lineWidth = 2;
  roundRect(ctx, px, py, PW, PH, 14);
  ctx.stroke();

  // Header band
  ctx.fillStyle = COIN_COLOR;
  roundRect(ctx, px, py, PW, 44, 14);
  ctx.fill();
  ctx.fillStyle = '#101010';
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('🛒', px + 14, py + 22);
  ctx.font = 'bold 16px monospace';
  ctx.fillText('ITEM SHOP', px + 44, py + 22);

  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`¢${getCoins(campaign)}`, px + PW - 14, py + 22);

  // Tab row
  const TABS_Y = py + 50;
  const TAB_H = 32;
  const TAB_GAP = 6;
  const TAB_W = Math.floor((PW - 16 - (LANES.length - 1) * TAB_GAP) / LANES.length);
  state._tabBounds = {};
  for (let i = 0; i < LANES.length; i++) {
    const laneId = LANES[i];
    const meta = LANE_META[laneId];
    const tx = px + 8 + i * (TAB_W + TAB_GAP);
    const active = laneId === state.lane;
    const hovered = state._hoverTab === laneId;
    drawTab(ctx, tx, TABS_Y, TAB_W, TAB_H, `${meta.glyph}  ${meta.label}`, meta.color, active, hovered);
    state._tabBounds[laneId] = { x: tx, y: TABS_Y, w: TAB_W, h: TAB_H };
  }

  // Grid of items in this lane
  const cards = laneCards(state);
  const cardsAreaY = TABS_Y + TAB_H + 12;
  const cardsAreaH = py + PH - cardsAreaY - 70; // leave room for footer buttons

  const isUtility = state.lane === 'utility';
  const COLS = isUtility ? 1 : 3;
  const ROWS = isUtility ? 1 : 2;
  const GAP = 12;
  const baseX = px + 16;
  const baseW = PW - 32;
  const CARD_W = isUtility ? Math.min(420, baseW) : Math.floor((baseW - (COLS - 1) * GAP) / COLS);
  const CARD_H = Math.floor((cardsAreaH - (ROWS - 1) * GAP) / ROWS);
  const startX = isUtility ? (baseX + (baseW - CARD_W) / 2) : baseX;

  state._cardBounds = [];
  for (let i = 0; i < cards.length; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const cx = Math.floor(startX + col * (CARD_W + GAP));
    const cy = cardsAreaY + row * (CARD_H + GAP);
    const selected = i === state.cursor;
    const hovered = i === state._hoverIdx;
    drawItemCard(ctx, cx, cy, CARD_W, CARD_H, cards[i], campaign, selected, hovered, state);
    state._cardBounds.push({ i, itemId: cards[i].id, bounds: { x: cx, y: cy, w: CARD_W, h: CARD_H } });
  }

  // Footer button row
  const btnY = py + PH - 54;
  const btnH = 38;
  const btnGap = 10;
  const btns = [];
  btns.push({ id: 'buy', label: 'BUY  [Enter]', color: COIN_COLOR });
  btns.push({ id: 'skillTree', label: '✦  SKILL TREE', color: '#66CCFF' });
  btns.push({ id: 'backToSelect', label: 'CHANGE CHARACTER', color: '#88AACC' });
  btns.push({ id: 'close', label: state.nextLevelId ? 'CONTINUE  [Space]' : '← BACK', color: '#AAAAAA' });
  const totalW = PW - 32;
  const btnW = Math.floor((totalW - (btns.length - 1) * btnGap) / btns.length);
  state._btnBounds = {};
  for (let i = 0; i < btns.length; i++) {
    const bx = px + 16 + i * (btnW + btnGap);
    const hovered = state._hoverBtn === btns[i].id;
    drawActionButton(ctx, bx, btnY, btnW, btnH, btns[i].label, btns[i].color, hovered);
    state._btnBounds[btns[i].id] = { x: bx, y: btnY, w: btnW, h: btnH };
  }
}

function drawTab(ctx, x, y, w, h, label, color, active, hovered) {
  ctx.save();
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  if (active) {
    grad.addColorStop(0, color);
    grad.addColorStop(1, darken(color, 0.55));
  } else if (hovered) {
    grad.addColorStop(0, darken(color, 0.45));
    grad.addColorStop(1, darken(color, 0.75));
  } else {
    grad.addColorStop(0, '#22243A');
    grad.addColorStop(1, '#15172A');
  }
  ctx.fillStyle = grad;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = active ? color : (hovered ? darken(color, 0.4) : '#33334A');
  ctx.lineWidth = active ? 2 : 1;
  roundRect(ctx, x, y, w, h, 8);
  ctx.stroke();
  ctx.fillStyle = active ? '#101010' : (hovered ? '#FFFFFF' : '#BBBBCC');
  ctx.font = active ? 'bold 12px monospace' : '12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  ctx.restore();
}

function drawItemCard(ctx, x, y, w, h, item, campaign, selected, hovered, state) {
  const owned = item.type === 'permanent' && ownsItem(campaign, item.id);
  const count = itemCount(campaign, item.id);
  const coins = getCoins(campaign);
  const affordable = coins >= item.cost;
  const isPermanent = item.type === 'permanent';
  const isConsumable = item.type === 'consumable';
  const prereqMet = !item.prereq || ownsItem(campaign, item.prereq);
  const isMaxed = isConsumable && Number.isFinite(item.stackMax) && count >= item.stackMax;

  let scale = 1;
  if (state.purchaseAnimItemId === item.id) {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const remain = state.purchaseAnimUntilMs - now;
    if (remain > 0) {
      const t = 1 - remain / 700;
      const wobble = Math.sin(t * Math.PI * 4) * 0.06;
      scale = 1 + 0.10 * (1 - t) + wobble;
    }
  }

  ctx.save();
  if (selected || hovered || scale !== 1) {
    const bump = selected ? Math.max(scale, 1.03) : (hovered ? Math.max(scale, 1.02) : scale);
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.translate(cx, cy);
    ctx.scale(bump, bump);
    ctx.translate(-cx, -cy);
  }

  ctx.fillStyle = '#10122A';
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();

  // Stripe color: lane tint, dimmed if locked.
  ctx.fillStyle = prereqMet ? item.color : darken(item.color, 0.5);
  roundRect(ctx, x, y, w, 28, 12);
  ctx.fill();

  // Tier band (top-left tag)
  ctx.fillStyle = isPermanent ? '#101010' : 'rgba(0,0,0,0.4)';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`T${item.tier}`, x + 8, y + 14);
  ctx.textAlign = 'right';
  ctx.fillStyle = isPermanent ? '#101010' : '#101010';
  ctx.fillText(isPermanent ? 'PERMANENT' : 'CONSUMABLE', x + w - 8, y + 14);

  ctx.lineWidth = selected ? 3 : 1.5;
  ctx.strokeStyle = selected ? HIGHLIGHT_COLOR : (hovered ? '#FFFFFF66' : '#33334A');
  roundRect(ctx, x, y, w, h, 12);
  ctx.stroke();

  // Glyph
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `${Math.floor(h * 0.30)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(item.glyph, x + w / 2, y + h * 0.35);

  // Name
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = 'bold 12px monospace';
  ctx.fillText(item.label.toUpperCase(), x + w / 2, y + h * 0.55);

  // Blurb (wrapped)
  ctx.fillStyle = DIM_COLOR;
  ctx.font = '10px monospace';
  wrapText(ctx, item.blurb, x + 10, y + h * 0.63, w - 20, 12, 3);

  // Bottom area
  ctx.textAlign = 'left';
  ctx.fillStyle = item.color;
  ctx.font = '10px monospace';
  if (isConsumable) {
    ctx.fillText(`stack ${count}/${item.stackMax || 9}`, x + 10, y + h - 10);
  }

  ctx.textAlign = 'right';
  let status = '';
  let statusColor = COIN_COLOR;
  if (isPermanent && owned) { status = 'OWNED'; statusColor = OWNED_COLOR; }
  else if (!prereqMet) {
    const pre = lookupItem(item.prereq);
    status = `NEEDS T${pre ? pre.tier : '?'}`;
    statusColor = LOCKED_COLOR;
  } else if (isConsumable && isMaxed) { status = 'MAXED'; statusColor = OWNED_COLOR; }
  else if (!affordable) { status = `¢${item.cost}`; statusColor = UNAFFORDABLE_COLOR; }
  else { status = `¢${item.cost}`; statusColor = COIN_COLOR; }
  ctx.fillStyle = statusColor;
  ctx.font = 'bold 12px monospace';
  ctx.fillText(status, x + w - 10, y + h - 10);

  // Owned tint overlay for permanent items
  if (isPermanent && owned) {
    ctx.fillStyle = 'rgba(102,255,170,0.10)';
    roundRect(ctx, x + 4, y + 4, w - 8, h - 8, 10);
    ctx.fill();
  }
  // Locked tint overlay
  if (!prereqMet) {
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    roundRect(ctx, x + 4, y + 4, w - 8, h - 8, 10);
    ctx.fill();
  }
  // Consumable count badge (top-right area, below the tier band)
  if (isConsumable && count > 0) {
    const bx = x + w - 22;
    const by = y + 42;
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(bx, by, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(count), bx, by + 1);
  }
  ctx.restore();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  if (!text) return;
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = words[i];
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  const ll = Math.min(lines.length, maxLines || lines.length);
  for (let i = 0; i < ll; i++) {
    const t = i === ll - 1 && lines.length > ll ? lines[i].slice(0, -1) + '…' : lines[i];
    ctx.fillText(t, x + maxWidth / 2, y + i * lineHeight);
  }
}

function darken(hex, factor) {
  if (!hex || hex.length < 7) return 'rgba(0,0,0,0.4)';
  const r = parseInt(hex.substr(1, 2), 16);
  const g = parseInt(hex.substr(3, 2), 16);
  const b = parseInt(hex.substr(5, 2), 16);
  const f = Math.max(0, Math.min(1, 1 - factor));
  return `rgba(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)},1)`;
}

function drawActionButton(ctx, x, y, w, h, label, color, hovered) {
  ctx.save();
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, hovered ? color : darken(color, 0.35));
  grad.addColorStop(1, darken(color, 0.7));
  ctx.fillStyle = grad;
  roundRect(ctx, x, y, w, h, 9);
  ctx.fill();
  ctx.strokeStyle = hovered ? color : darken(color, 0.5);
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 9);
  ctx.stroke();
  ctx.fillStyle = hovered ? '#FFFFFF' : '#F5F5F5';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') { ctx.roundRect(x, y, w, h, r); return; }
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

function hits(b, x, y) {
  return b && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
}

export function itemShopHover(state, x, y) {
  if (!state || !state.open) return false;
  state._hoverIdx = -1;
  state._hoverBtn = '';
  state._hoverTab = '';
  for (const cb of state._cardBounds || []) {
    if (hits(cb.bounds, x, y)) { state._hoverIdx = cb.i; break; }
  }
  for (const k of Object.keys(state._btnBounds || {})) {
    if (hits(state._btnBounds[k], x, y)) { state._hoverBtn = k; break; }
  }
  for (const k of Object.keys(state._tabBounds || {})) {
    if (hits(state._tabBounds[k], x, y)) { state._hoverTab = k; break; }
  }
  return state._hoverIdx >= 0 || !!state._hoverBtn || !!state._hoverTab;
}

export function itemShopClick(state, x, y) {
  if (!state || !state.open) return null;
  for (const k of Object.keys(state._tabBounds || {})) {
    if (hits(state._tabBounds[k], x, y)) {
      setLane(state, k);
      return { type: 'switchLane', lane: k };
    }
  }
  for (const cb of state._cardBounds || []) {
    if (hits(cb.bounds, x, y)) {
      state.cursor = cb.i;
      return { type: 'buy', itemId: cb.itemId };
    }
  }
  for (const k of Object.keys(state._btnBounds || {})) {
    if (hits(state._btnBounds[k], x, y)) {
      if (k === 'buy') {
        const list = laneCards(state);
        return { type: 'buy', itemId: list[state.cursor] && list[state.cursor].id };
      }
      if (k === 'skillTree') { state.skillTreeRequested = true; return { type: 'skillTree' }; }
      if (k === 'backToSelect') { state.backToSelectRequested = true; return { type: 'backToSelect' }; }
      if (k === 'close') { state.closeRequested = true; return { type: 'close' }; }
    }
  }
  return null;
}

export function itemShopKey(state, key) {
  if (!state || !state.open) return null;
  if (key === 'Escape') { state.closeRequested = true; return null; }
  if (key === 'Tab') { cycleLane(state, 1); return null; }
  if (key === '1') { setLane(state, 'defense'); return null; }
  if (key === '2') { setLane(state, 'offense'); return null; }
  if (key === '3') { setLane(state, 'lives'); return null; }
  if (key === '4') { setLane(state, 'speed'); return null; }
  if (key === '5') { setLane(state, 'utility'); return null; }
  const list = laneCards(state);
  const COLS = state.lane === 'utility' ? 1 : 3;
  if (key === 'ArrowRight' || key === 'd' || key === 'D') {
    state.cursor = (state.cursor + 1) % list.length; return null;
  }
  if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
    state.cursor = (state.cursor - 1 + list.length) % list.length; return null;
  }
  if (key === 'ArrowDown' || key === 's') {
    state.cursor = (state.cursor + COLS) % list.length; return null;
  }
  if (key === 'ArrowUp' || key === 'w') {
    state.cursor = (state.cursor - COLS + list.length) % list.length; return null;
  }
  if (key === 'Enter') {
    return { type: 'buy', itemId: list[state.cursor] && list[state.cursor].id };
  }
  if (key === ' ' && state.nextLevelId) { state.closeRequested = true; return null; }
  if (key === 'S') { state.skillTreeRequested = true; return null; }
  return null;
}
