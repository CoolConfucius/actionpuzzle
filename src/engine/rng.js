export function mulberry32(seed) {
  let state = seed | 0;
  return function rng() {
    state = (state + 0x6D2B79F5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickWeighted(rng, weights) {
  if (!Array.isArray(weights) || weights.length === 0) {
    throw new Error('pickWeighted: weights must be a non-empty array');
  }
  let total = 0;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i];
    if (w < 0 || !Number.isFinite(w)) {
      throw new Error('pickWeighted: weights must be non-negative finite numbers');
    }
    total += w;
  }
  if (total <= 0) {
    throw new Error('pickWeighted: total weight must be positive');
  }
  const r = rng() * total;
  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (r < cumulative) {
      return i;
    }
  }
  for (let i = weights.length - 1; i >= 0; i--) {
    if (weights[i] > 0) {
      return i;
    }
  }
  throw new Error('pickWeighted: unreachable');
}
