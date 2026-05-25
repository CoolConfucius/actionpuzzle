// Lightweight screen-shake state. Kicked by explosion events; decays per tick.
// Kept local to render-layer (no engine plumbing). Returns the current
// (dx, dy) offset for the gameplay region; HUD stays still.

const DEFAULT_DURATION_MS = 180;
const DEFAULT_AMPLITUDE_PX = 4.0;
const PLAYER_DEATH_AMPLITUDE_PX = 5.5;
const PLAYER_DEATH_DURATION_MS = 260;

let amplitude = 0;       // current peak displacement in pixels
let durationLeftMs = 0;  // shake remaining
let totalDurationMs = 0; // for decay calculation

export function consumeShakeEvents(state) {
  if (!state || !state.eventQueue) return;
  for (const ev of state.eventQueue) {
    if (!ev) continue;
    if (ev.type === 'explode') kick(DEFAULT_AMPLITUDE_PX, DEFAULT_DURATION_MS);
    else if (ev.type === 'playerDeath') kick(PLAYER_DEATH_AMPLITUDE_PX, PLAYER_DEATH_DURATION_MS);
  }
}

function kick(amp, durMs) {
  // Don't downgrade an in-progress strong shake with a weak one; instead,
  // additively bump amplitude and refresh duration to whichever is longer.
  amplitude = Math.max(amplitude, amp);
  if (durMs > durationLeftMs) {
    durationLeftMs = durMs;
    totalDurationMs = durMs;
  }
}

export function tickScreenShake(dtMs) {
  if (durationLeftMs <= 0) {
    amplitude = 0;
    return;
  }
  durationLeftMs = Math.max(0, durationLeftMs - dtMs);
  if (durationLeftMs <= 0) {
    amplitude = 0;
    totalDurationMs = 0;
  }
}

export function currentShakeOffset() {
  if (amplitude <= 0 || durationLeftMs <= 0) return { dx: 0, dy: 0 };
  // Decay amplitude linearly with remaining time so the shake winds down.
  const decay = totalDurationMs > 0 ? (durationLeftMs / totalDurationMs) : 0;
  const amp = amplitude * decay;
  const dx = (Math.random() * 2 - 1) * amp;
  const dy = (Math.random() * 2 - 1) * amp;
  return { dx, dy };
}

export function resetScreenShake() {
  amplitude = 0;
  durationLeftMs = 0;
  totalDurationMs = 0;
}
