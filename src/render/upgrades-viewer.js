// Owned-upgrades viewer. Read-only — shows every campaign upgrade grouped
// by character, marked ★ if owned. Accessible from the title screen.
import { UPGRADES, upgradesForCharacter } from '../engine/upgrade-defs.js';
import { readCampaign, getCoins } from '../engine/campaign.js';

const BG_COLOR = '#0A0F1A';
const TITLE_COLOR = '#FFCC66';
const HEADER_COLOR = '#66FFAA';
const OWNED_COLOR = '#FFEE66';
const LOCKED_COLOR = '#666677';
const TEXT_COLOR = '#FFFFFF';
const DIM_COLOR = '#AABBCC';

const CHARACTERS = ['bear', 'wolf', 'monkey', 'lion', 'pig', 'mole', 'rabbit', 'elephant', 'owl', 'fox'];

function isOwned(campaign, charId, upgradeId) {
  if (!campaign || !campaign.upgrades) return false;
  const tree = campaign.upgrades[charId];
  return !!(tree && tree[upgradeId]);
}

function countOwnedTotal(campaign) {
  let n = 0;
  for (const u of UPGRADES) {
    if (isOwned(campaign, u.character, u.id)) n++;
  }
  return n;
}

export function drawUpgradesViewer(ctx, widthPx, heightPx) {
  const W = widthPx || 680;
  const H = heightPx || 552;
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, W, H);

  const campaign = readCampaign();

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.fillStyle = TITLE_COLOR;
  ctx.font = 'bold 22px monospace';
  ctx.fillText('CAMPAIGN UPGRADES', W / 2, 32);

  ctx.fillStyle = HEADER_COLOR;
  ctx.font = '12px monospace';
  ctx.fillText(`${countOwnedTotal(campaign)} / ${UPGRADES.length} owned   ·   ¢${getCoins(campaign)} coins`, W / 2, 52);

  // Two columns of characters (4 left, 4 right) — now 8 characters total.
  const colWidth = (W - 32) / 2;
  const leftX = 16;
  const rightX = 16 + colWidth;
  const leftChars = CHARACTERS.slice(0, 4);
  const rightChars = CHARACTERS.slice(4);

  drawCharColumn(ctx, leftChars, leftX, 80, colWidth - 8, campaign);
  drawCharColumn(ctx, rightChars, rightX, 80, colWidth - 8, campaign);

  ctx.textAlign = 'center';
  ctx.fillStyle = DIM_COLOR;
  ctx.font = '11px monospace';
  ctx.fillText('Esc or Enter to return', W / 2, H - 18);
}

function drawCharColumn(ctx, chars, x, y0, w, campaign) {
  let y = y0;
  ctx.textBaseline = 'alphabetic';
  for (const char of chars) {
    ctx.fillStyle = HEADER_COLOR;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(char.toUpperCase(), x, y);
    y += 18;
    const ups = upgradesForCharacter(char);
    for (const u of ups) {
      const owned = isOwned(campaign, char, u.id);
      ctx.fillStyle = owned ? OWNED_COLOR : LOCKED_COLOR;
      ctx.font = '11px monospace';
      const icon = owned ? '★' : '·';
      ctx.fillText(`${icon} ${u.label}`, x + 12, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = owned ? OWNED_COLOR : DIM_COLOR;
      ctx.fillText(owned ? 'OWNED' : `¢${u.cost}`, x + w - 4, y);
      ctx.textAlign = 'left';
      y += 14;
    }
    y += 8;
  }
}
