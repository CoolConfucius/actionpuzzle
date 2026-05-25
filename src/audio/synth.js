// Web Audio SFX module: lazy AudioContext, per-event synthesized recipes, drain dispatcher.

let ctx = null;
let masterGain = null;
let volume = readStoredVolume();
let muted = false;

function readStoredVolume() {
  try {
    const raw = localStorage.getItem('audioVolume');
    const n = Number(raw);
    // Recovery: a prior bug in the settings overlay persisted 0 here when the
    // user muted, silencing SFX permanently across sessions. Treat anything
    // below 0.05 as bogus and fall back to default so existing players get
    // their sound back automatically.
    if (Number.isFinite(n) && n >= 0.05 && n <= 1) return n;
  } catch (e) {
    // localStorage unavailable; fall through
  }
  return 0.6;
}

function writeStoredVolume(v) {
  try {
    localStorage.setItem('audioVolume', String(v));
  } catch (e) {
    // ignore
  }
}

export function ensureContext() {
  if (ctx) {
    if (ctx.state === 'suspended') {
      try { ctx.resume(); } catch (e) { /* ignore */ }
    }
    return ctx;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : volume;
    masterGain.connect(ctx.destination);
    if (ctx.state === 'suspended') {
      try { ctx.resume(); } catch (e) { /* ignore */ }
    }
  } catch (e) {
    ctx = null;
    masterGain = null;
  }
  return ctx;
}

export function setVolume(v) {
  if (!Number.isFinite(v)) return;
  volume = Math.max(0, Math.min(1, v));
  writeStoredVolume(volume);
  if (masterGain && !muted) masterGain.gain.value = volume;
}

export function getVolume() {
  return volume;
}

export function setMuted(m) {
  muted = !!m;
  if (masterGain) masterGain.gain.value = muted ? 0 : volume;
}

export function toggleMute() {
  setMuted(!muted);
  return muted;
}

export function isMuted() {
  return muted;
}

function canPlay() {
  if (muted) return false;
  const c = ensureContext();
  return !!c;
}

function envGain(attackS, holdS, releaseS, peak = 1.0) {
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attackS);
  g.gain.linearRampToValueAtTime(peak, t + attackS + holdS);
  g.gain.linearRampToValueAtTime(0, t + attackS + holdS + releaseS);
  return { node: g, stopAt: t + attackS + holdS + releaseS + 0.02 };
}

function tone(freq, wave, attackS, holdS, releaseS, peak = 0.5) {
  const osc = ctx.createOscillator();
  osc.type = wave;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  const { node: g, stopAt } = envGain(attackS, holdS, releaseS, peak);
  osc.connect(g).connect(masterGain);
  osc.start();
  osc.stop(stopAt);
  return { osc, stopAt };
}

function sweepTone(freqStart, freqEnd, wave, durS, peak = 0.5) {
  const osc = ctx.createOscillator();
  osc.type = wave;
  const t = ctx.currentTime;
  osc.frequency.setValueAtTime(freqStart, t);
  osc.frequency.linearRampToValueAtTime(freqEnd, t + durS);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.01);
  g.gain.linearRampToValueAtTime(0, t + durS);
  osc.connect(g).connect(masterGain);
  osc.start();
  osc.stop(t + durS + 0.02);
}

function noiseBurst(durS, peak = 0.4, filterHz = 2000) {
  const bufSize = Math.max(1, Math.floor(ctx.sampleRate * durS));
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterHz;
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.005);
  g.gain.linearRampToValueAtTime(0, t + durS);
  src.connect(filter).connect(g).connect(masterGain);
  src.start();
  src.stop(t + durS + 0.02);
}

export function playMove() {
  if (!canPlay()) return;
  tone(220, 'square', 0.005, 0.01, 0.04, 0.12);
}

export function playHurl() {
  if (!canPlay()) return;
  sweepTone(180, 360, 'sawtooth', 0.12, 0.25);
  noiseBurst(0.10, 0.10, 1500);
}

export function playObjectStop(_objectType) {
  if (!canPlay()) return;
  tone(120, 'square', 0.002, 0.02, 0.08, 0.35);
  noiseBurst(0.06, 0.18, 800);
}

export function playObjectDestroy(_objectType) {
  if (!canPlay()) return;
  sweepTone(420, 140, 'square', 0.14, 0.28);
  noiseBurst(0.10, 0.15, 1200);
}

export function playExplode() {
  if (!canPlay()) return;
  // Layered impact: bright crackle on top of body thump on top of sub rumble.
  noiseBurst(0.08, 0.65, 3500);          // bright initial crack
  noiseBurst(0.42, 0.50, 1400);          // body
  noiseBurst(0.55, 0.20, 350);           // low rumble tail
  sweepTone(260, 60, 'sawtooth', 0.45, 0.38);
  sweepTone(120, 32, 'sine', 0.55, 0.30);
  // Brief metallic ping at the very front for added punch
  tone(880, 'triangle', 0.001, 0.02, 0.06, 0.22);
}

const ENEMY_TIMBRES = {
  enemy1: { baseHz: 440 },
  enemy2: { baseHz: 330 },
  enemy3: { baseHz: 520 },
  enemy4: { baseHz: 260 },
  enemy5: { baseHz: 620 },
  enemy6: { baseHz: 175 },
  enemy7: { baseHz: 880 },
};

export function playEnemyHit() {
  if (!canPlay()) return;
  // Heavy thud + brief metallic ring — tells the player "you hit it, but
  // it's not dead yet". Distinct from the cleaner playEnemyDefeated descend.
  noiseBurst(0.08, 0.35, 600);
  tone(180, 'sawtooth', 0.002, 0.04, 0.10, 0.30);
  tone(380, 'triangle', 0.001, 0.02, 0.08, 0.18);
}

export function playEnemyTeleport() {
  if (!canPlay()) return;
  // Quick rising chirp evocative of a teleport.
  sweepTone(220, 1100, 'sine', 0.18, 0.22);
}

export function playAchievementUnlock() {
  if (!canPlay()) return;
  // Celebratory ascending major triad + sparkle.
  const t = ctx.currentTime;
  [523, 659, 784, 1047].forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f, t + i * 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t + i * 0.06);
    g.gain.linearRampToValueAtTime(0.22, t + i * 0.06 + 0.01);
    g.gain.linearRampToValueAtTime(0, t + i * 0.06 + 0.25);
    osc.connect(g).connect(masterGain);
    osc.start(t + i * 0.06);
    osc.stop(t + i * 0.06 + 0.28);
  });
  // Sparkle on top
  tone(2093, 'sine', 0.001, 0.02, 0.30, 0.18);
}

// Short rising bell — fires when a campaign upgrade triggers in-play.
// Label-based pitch tinting so each ability has a recognizable signature.
const ABILITY_PITCH = {
  'STUN CLONE!': 1.00,
  'ECHO WAVE!':  0.85,
  'FIREBALL!':   1.30,
  'BOMB!':       0.75,
  'CANCEL!':     1.10,
  'HOWL!':       0.65,
  'REBIRTH!':    1.45,
  'LUCKY!':      1.20,
  'TRAMPOLINE!': 0.95,
  'BURROW!':     0.55,
};
export function playAbilityFire(label) {
  if (!canPlay()) return;
  const pitch = (label && ABILITY_PITCH[label]) || 1.0;
  const t = ctx.currentTime;
  [880 * pitch, 1175 * pitch].forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f, t + i * 0.04);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t + i * 0.04);
    g.gain.linearRampToValueAtTime(0.16, t + i * 0.04 + 0.01);
    g.gain.linearRampToValueAtTime(0, t + i * 0.04 + 0.18);
    osc.connect(g).connect(masterGain);
    osc.start(t + i * 0.04);
    osc.stop(t + i * 0.04 + 0.22);
  });
}

export function playShopPurchase() {
  if (!canPlay()) return;
  // Coin-clink: two quick chiming pitches.
  tone(1320, 'triangle', 0.001, 0.02, 0.08, 0.25);
  const t = ctx.currentTime + 0.05;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(1760, t);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.20, t + 0.005);
  g.gain.linearRampToValueAtTime(0, t + 0.18);
  osc.connect(g).connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.20);
}

export function playShopReject() {
  if (!canPlay()) return;
  // Brief descending buzz: "can't afford / not allowed".
  sweepTone(220, 110, 'sawtooth', 0.18, 0.18);
}

export function playLevelStart() {
  if (!canPlay()) return;
  // Bright two-note "get ready" gong.
  tone(659, 'triangle', 0.005, 0.06, 0.18, 0.25);
  const t = ctx.currentTime + 0.10;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(988, t);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.22, t + 0.005);
  g.gain.linearRampToValueAtTime(0, t + 0.20);
  osc.connect(g).connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.22);
}

export function playShopOpen() {
  if (!canPlay()) return;
  // Bright ascending arpeggio that says "browse my wares".
  const t = ctx.currentTime;
  [523, 659, 784].forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f, t + i * 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t + i * 0.05);
    g.gain.linearRampToValueAtTime(0.18, t + i * 0.05 + 0.005);
    g.gain.linearRampToValueAtTime(0, t + i * 0.05 + 0.18);
    osc.connect(g).connect(masterGain);
    osc.start(t + i * 0.05);
    osc.stop(t + i * 0.05 + 0.20);
  });
}

export function playEnemyDefeated(enemyType) {
  if (!canPlay()) return;
  const cfg = ENEMY_TIMBRES[enemyType] || ENEMY_TIMBRES.enemy1;
  const base = cfg.baseHz;
  // Titan (enemy6): heavier, slower descent with noise burst — "thunk of doom".
  if (enemyType === 'enemy6') {
    noiseBurst(0.30, 0.45, 800);
    sweepTone(base * 1.2, base * 0.4, 'sawtooth', 0.42, 0.30);
    sweepTone(base * 0.6, base * 0.3, 'square', 0.45, 0.25);
    return;
  }
  // Phantom (enemy7): high-pitched wail dissolving into static.
  if (enemyType === 'enemy7') {
    sweepTone(base * 1.4, base * 0.5, 'triangle', 0.35, 0.30);
    sweepTone(base * 2.0, base * 1.0, 'sine', 0.30, 0.20);
    noiseBurst(0.18, 0.18, 2400);
    return;
  }
  const durS = 0.20;
  const t = ctx.currentTime;
  const steps = [base, base * 0.75, base * 0.5];
  steps.forEach((freq, i) => {
    const startOff = (i * durS) / steps.length;
    const stepDur = durS / steps.length + 0.04;
    ['square', 'sawtooth'].forEach((wave) => {
      const osc = ctx.createOscillator();
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, t + startOff);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + startOff);
      g.gain.linearRampToValueAtTime(0.18, t + startOff + 0.01);
      g.gain.linearRampToValueAtTime(0, t + startOff + stepDur);
      osc.connect(g).connect(masterGain);
      osc.start(t + startOff);
      osc.stop(t + startOff + stepDur + 0.02);
    });
  });
}

export function playPlayerDeath() {
  if (!canPlay()) return;
  // Dramatic descending wail: bright initial cry, sustained mid, low groan.
  sweepTone(660, 110, 'sawtooth', 0.85, 0.38);
  sweepTone(440, 70, 'square', 0.95, 0.28);
  sweepTone(220, 40, 'triangle', 1.05, 0.22);
  noiseBurst(0.18, 0.20, 1200);
  // Subtle "stutter" via a second wave of descent
  const t = ctx.currentTime + 0.25;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(330, t);
  osc.frequency.linearRampToValueAtTime(80, t + 0.55);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.20, t + 0.02);
  g.gain.linearRampToValueAtTime(0, t + 0.60);
  osc.connect(g).connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.65);
}

// Dispatch per-type so each powerup has its own audible identity. The
// previous behavior (generic three-note arpeggio) is preserved as the
// fallback for score/multiplier/life pickups.
export function playPowerup(powerupType) {
  if (!canPlay()) return;
  switch (powerupType) {
    case 'berserk':       return playBerserkActivate();
    case 'invisibility':  return playInvisibilityActivate();
    case 'timeFreeze':    return playTimeFreezeActivate();
    case 'friedEgg':      return playFriedEggCollect();
    default:              return playGenericPowerup();
  }
}

function playGenericPowerup() {
  const t = ctx.currentTime;
  [523, 659, 784].forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f, t + i * 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t + i * 0.06);
    g.gain.linearRampToValueAtTime(0.22, t + i * 0.06 + 0.01);
    g.gain.linearRampToValueAtTime(0, t + i * 0.06 + 0.18);
    osc.connect(g).connect(masterGain);
    osc.start(t + i * 0.06);
    osc.stop(t + i * 0.06 + 0.20);
  });
}

// Berserk: aggressive descending growl + brief noise crack.
function playBerserkActivate() {
  sweepTone(330, 110, 'sawtooth', 0.32, 0.32);
  sweepTone(165, 55, 'sawtooth', 0.36, 0.20);
  noiseBurst(0.10, 0.30, 1800);
  tone(880, 'square', 0.001, 0.02, 0.06, 0.20);
}

// Invisibility: airy whoosh + high shimmering bell.
function playInvisibilityActivate() {
  sweepTone(220, 1320, 'sine', 0.45, 0.16);
  noiseBurst(0.30, 0.10, 4000);
  // Glassy chime descending
  const t = ctx.currentTime;
  [1320, 990, 660].forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f, t + i * 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t + i * 0.08);
    g.gain.linearRampToValueAtTime(0.14, t + i * 0.08 + 0.01);
    g.gain.linearRampToValueAtTime(0, t + i * 0.08 + 0.30);
    osc.connect(g).connect(masterGain);
    osc.start(t + i * 0.08);
    osc.stop(t + i * 0.08 + 0.32);
  });
}

// Time Freeze: crystalline chord stack — three triangle tones held together.
function playTimeFreezeActivate() {
  const t = ctx.currentTime;
  // Low boom for impact.
  sweepTone(110, 55, 'sine', 0.40, 0.25);
  // High icy cluster.
  [1568, 1976, 2349].forEach((f) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.10, t + 0.005);
    g.gain.linearRampToValueAtTime(0, t + 0.55);
    osc.connect(g).connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.58);
  });
}

// Fried egg: short bright two-tone chirp.
function playFriedEggCollect() {
  sweepTone(659, 988, 'square', 0.10, 0.22);
  tone(1318, 'triangle', 0.001, 0.02, 0.06, 0.15);
}

export function playLevelWon() {
  if (!canPlay()) return;
  const t = ctx.currentTime;
  [392, 523, 659, 784, 1047].forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(f, t + i * 0.10);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t + i * 0.10);
    g.gain.linearRampToValueAtTime(0.22, t + i * 0.10 + 0.01);
    g.gain.linearRampToValueAtTime(0, t + i * 0.10 + 0.22);
    osc.connect(g).connect(masterGain);
    osc.start(t + i * 0.10);
    osc.stop(t + i * 0.10 + 0.24);
  });
}

export function playPlayerRespawn() {
  if (!canPlay()) return;
  const t = ctx.currentTime;
  [262, 392, 523].forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, t + i * 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t + i * 0.07);
    g.gain.linearRampToValueAtTime(0.2, t + i * 0.07 + 0.01);
    g.gain.linearRampToValueAtTime(0, t + i * 0.07 + 0.15);
    osc.connect(g).connect(masterGain);
    osc.start(t + i * 0.07);
    osc.stop(t + i * 0.07 + 0.18);
  });
}

export function playGameOver() {
  if (!canPlay()) return;
  const t = ctx.currentTime;
  [392, 311, 247, 196].forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f, t + i * 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t + i * 0.18);
    g.gain.linearRampToValueAtTime(0.25, t + i * 0.18 + 0.02);
    g.gain.linearRampToValueAtTime(0, t + i * 0.18 + 0.32);
    osc.connect(g).connect(masterGain);
    osc.start(t + i * 0.18);
    osc.stop(t + i * 0.18 + 0.34);
  });
}

export function playUiSelect() {
  if (!canPlay()) return;
  tone(880, 'square', 0.005, 0.02, 0.06, 0.18);
}

export function playUiBack() {
  if (!canPlay()) return;
  tone(440, 'square', 0.005, 0.02, 0.08, 0.18);
}

export function playHurlPath() {
  if (!canPlay()) return;
  sweepTone(800, 1400, 'sine', 0.12, 0.18);
}

export function playEnemy4CastStart() {
  if (!canPlay()) return;
  const t = ctx.currentTime;
  const freqs = [392, 587];
  freqs.forEach((f) => {
    ['square', 'sawtooth'].forEach((wave) => {
      const osc = ctx.createOscillator();
      osc.type = wave;
      osc.frequency.setValueAtTime(f, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.008);
      g.gain.linearRampToValueAtTime(0.16, t + 0.06);
      g.gain.linearRampToValueAtTime(0, t + 0.18);
      osc.connect(g).connect(masterGain);
      osc.start(t);
      osc.stop(t + 0.20);
    });
  });
}

export function playEnemyWindup() {
  if (!canPlay()) return;
  sweepTone(180, 540, 'triangle', 0.30, 0.18);
}

export function playEnemySpawn() {
  if (!canPlay()) return;
  sweepTone(660, 220, 'square', 0.18, 0.22);
  noiseBurst(0.10, 0.10, 1800);
}

export function playTrapTriggered() {
  if (!canPlay()) return;
  sweepTone(520, 180, 'triangle', 0.22, 0.22);
  noiseBurst(0.18, 0.10, 600);
}

export function playChain(multiplier) {
  if (!canPlay()) return;
  // Rising arpeggio whose pitch climbs with each chain step. 2x = C5, 4x = E5, 8x = G5, 16x = C6, 32x = E6.
  const idx = Math.max(0, Math.min(4, Math.floor(Math.log2(Math.max(1, multiplier || 2))) - 1));
  const freqs = [523, 659, 784, 1047, 1319]; // C5, E5, G5, C6, E6
  const f = freqs[idx];
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(f, t);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.22, t + 0.005);
  g.gain.linearRampToValueAtTime(0, t + 0.20);
  osc.connect(g).connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.22);
  // Add a brief harmonic above
  const osc2 = ctx.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(f * 2, t + 0.02);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0, t + 0.02);
  g2.gain.linearRampToValueAtTime(0.10, t + 0.04);
  g2.gain.linearRampToValueAtTime(0, t + 0.18);
  osc2.connect(g2).connect(masterGain);
  osc2.start(t + 0.02);
  osc2.stop(t + 0.22);
}

export function playMilestoneLife() {
  if (!canPlay()) return;
  const t = ctx.currentTime;
  // C5, E5, G5, C6 - bright "1up" ascending arpeggio
  [523, 659, 784, 1047].forEach((f, i) => {
    ['triangle', 'square'].forEach((wave, w) => {
      const osc = ctx.createOscillator();
      osc.type = wave;
      const startOff = t + i * 0.08;
      osc.frequency.setValueAtTime(f, startOff);
      const g = ctx.createGain();
      const peak = w === 0 ? 0.20 : 0.10;
      g.gain.setValueAtTime(0, startOff);
      g.gain.linearRampToValueAtTime(peak, startOff + 0.01);
      g.gain.linearRampToValueAtTime(0, startOff + 0.28);
      osc.connect(g).connect(masterGain);
      osc.start(startOff);
      osc.stop(startOff + 0.30);
    });
  });
}

const DISPATCH = {
  move: () => playMove(),
  hurl: () => playHurl(),
  objectStop: (e) => playObjectStop(e.objectType),
  objectDestroy: (e) => playObjectDestroy(e.objectType),
  explode: () => playExplode(),
  enemyDefeated: (e) => playEnemyDefeated(e.enemyType),
  enemyWindup: () => playEnemyWindup(),
  enemySpawn: () => playEnemySpawn(),
  playerDeath: () => playPlayerDeath(),
  playerRespawn: () => playPlayerRespawn(),
  powerup: (e) => playPowerup(e.powerupType),
  levelWon: () => playLevelWon(),
  gameOver: () => playGameOver(),
  uiSelect: () => playUiSelect(),
  uiBack: () => playUiBack(),
  hurlPath: () => playHurlPath(),
  enemy4CastStart: () => playEnemy4CastStart(),
  trapTriggered: () => playTrapTriggered(),
  milestoneLife: () => playMilestoneLife(),
  enemyHit: () => playEnemyHit(),
  enemyTeleport: () => playEnemyTeleport(),
  achievementUnlock: () => playAchievementUnlock(),
  abilityFire: (e) => playAbilityFire(e && e.label),
  shopPurchase: () => playShopPurchase(),
  shopReject: () => playShopReject(),
  levelStart: () => playLevelStart(),
  shopOpen: () => playShopOpen(),
  scorePopup: (e) => {
    if (e && e.kind === 'chain') {
      const m = parseChainMultiplier(e.label);
      if (m) playChain(m);
    }
  },
};

function parseChainMultiplier(label) {
  if (typeof label !== 'string') return 0;
  const m = label.match(/x(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

export function drain(state) {
  if (!state || !state.eventQueue) return;
  const q = state.eventQueue;
  for (let i = 0; i < q.length; i++) {
    const ev = q[i];
    if (!ev || !ev.type) continue;
    const fn = DISPATCH[ev.type];
    if (fn) {
      try { fn(ev); } catch (e) { /* swallow audio errors */ }
    }
  }
  q.length = 0;
}
