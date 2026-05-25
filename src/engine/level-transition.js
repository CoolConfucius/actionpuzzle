import { BALANCE } from './constants.js';
import { awardScore } from './score.js';

export const LEVEL_CLEAR_DURATION_MS = 2000;

export function applyLevelClearBonuses(state) {
  if (state.transition) return;

  const remainingMs = Math.max(0, BALANCE.LEVEL_TIME_LIMIT_MS - state.levelTimeMs);
  const remainingSec = Math.floor(remainingMs / 1000);
  const timeBonus = remainingSec * BALANCE.TIME_BONUS_PER_SEC;
  const flatBonus = BALANCE.LEVEL_CLEAR_BONUS;

  for (const player of state.players) {
    if (!player.alive || player.lives <= 0) continue;
    if (timeBonus > 0) {
      awardScore(state, player.id, timeBonus, 'timeBonus', player.pos);
    }
    awardScore(state, player.id, flatBonus, 'levelClear', player.pos);
    if (player.status) {
      delete player.status.scoreMultiplier;
      delete player.status.berserkUntilMs;
      delete player.status.invisibleUntilMs;
    }
  }

  state.timeFreezeUntilMs = null;

  state.transition = {
    startedMs: state.timeMs,
    endsMs: state.timeMs + LEVEL_CLEAR_DURATION_MS,
    nextLevelId: computeNextLevelId(state.level && state.level.id),
    bannerText: 'LEVEL CLEAR',
  };
}

export function isInLevelTransition(state) {
  return state.transition != null;
}

export function tickLevelTransition(state, dtMs) {
  if (!state.transition) return false;
  state.timeMs += dtMs;
  return state.timeMs >= state.transition.endsMs;
}

export function prepareNextLevelLoad(state) {
  const nextLevelId = state.transition
    ? state.transition.nextLevelId
    : computeNextLevelId(state.level && state.level.id);
  const carryPlayers = state.players
    .filter((p) => p.alive && p.lives > 0)
    .map((p) => ({ id: p.id, lives: p.lives, score: p.score }));
  return { nextLevelId, carry: { players: carryPlayers } };
}

function computeNextLevelId(currentId) {
  if (typeof currentId !== 'string' || !/^\d{2}$/.test(currentId)) return null;
  const n = parseInt(currentId, 10);
  if (n >= 48) return null;
  const next = n + 1;
  return next < 10 ? `0${next}` : `${next}`;
}
