// Tutorial mode hint banner. Renders the active level's `tutorialHint` string
// in a translucent band at the top of the play area. Drawn only when the
// current run mode is 'tutorial' and the level provides a hint.
import { BALANCE } from '../engine/constants.js';

const BAND_HEIGHT_PX = 36;
const BG_COLOR = 'rgba(20,10,30,0.78)';
const BORDER_COLOR = '#66FFAA';
const TEXT_COLOR = '#FFEE88';
const SUB_COLOR = '#AACCFF';
const FONT_PRIMARY = 'bold 14px monospace';
const FONT_SUB = '11px monospace';

export function drawTutorialOverlay(ctx, state) {
  if (!state || !state.level) return;
  const hint = state.level.tutorialHint;
  if (typeof hint !== 'string' || hint.length === 0) return;
  const width = BALANCE.GRID_COLS * BALANCE.TILE_PX;
  const y = BALANCE.HUD_HEIGHT_PX;

  ctx.save();
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, y, width, BAND_HEIGHT_PX);
  ctx.strokeStyle = BORDER_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, y + BAND_HEIGHT_PX);
  ctx.lineTo(width, y + BAND_HEIGHT_PX);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = FONT_PRIMARY;
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillText(hint, width / 2, y + BAND_HEIGHT_PX / 2 - 6);

  const sub = state.level.tutorialSubhint;
  if (typeof sub === 'string' && sub.length > 0) {
    ctx.font = FONT_SUB;
    ctx.fillStyle = SUB_COLOR;
    ctx.fillText(sub, width / 2, y + BAND_HEIGHT_PX / 2 + 10);
  }
  ctx.restore();
}
