// Persistent achievements. Each definition has an id, label, and a predicate
// over { stats, runState, clearedLevelId, tutorialCompleted, explosions }.
// checkAchievements returns the set of newly-unlocked ids; caller is
// responsible for emitting popup events and persisting the unlocks map.

const STORAGE_KEY = 'achievements';

export const ACHIEVEMENTS = [
  {
    id: 'firstBlood',
    label: 'First Blood',
    description: 'Defeat your first enemy.',
    check: ({ stats }) => stats.totalKills >= 1,
  },
  {
    id: 'centurion',
    label: 'Centurion',
    description: 'Defeat 100 enemies (lifetime).',
    check: ({ stats }) => stats.totalKills >= 100,
  },
  {
    id: 'massacre',
    label: 'Massacre',
    description: 'Defeat 1000 enemies (lifetime).',
    check: ({ stats }) => stats.totalKills >= 1000,
  },
  {
    id: 'survivor',
    label: 'Survivor',
    description: 'Clear 10 levels in a single run without dying.',
    check: ({ stats }) => stats.longestStreak >= 10,
  },
  {
    id: 'firstSteps',
    label: 'First Steps',
    description: 'Finish the Tutorial.',
    check: ({ tutorialCompleted }) => !!tutorialCompleted,
  },
  {
    id: 'apotheosis',
    label: 'Apotheosis',
    description: 'Clear LV-42, the final level.',
    check: ({ clearedLevelId }) => clearedLevelId === '42',
  },
  {
    id: 'pyromaniac',
    label: 'Pyromaniac',
    description: 'Trigger 50 explosions (lifetime).',
    check: ({ stats }) => (stats.explosions || 0) >= 50,
  },
  {
    id: 'worldTour',
    label: 'World Tour',
    description: 'Clear at least one level in every world.',
    check: ({ stats }) => stats.bestLevelReached >= 37,
  },
  {
    id: 'tankHunter',
    label: 'Tank Hunter',
    description: 'Defeat 10 Titans (enemy6) — lifetime.',
    check: ({ stats }) => (stats.killsByType && stats.killsByType.enemy6) >= 10,
  },
  {
    id: 'phantomSlayer',
    label: 'Phantom Slayer',
    description: 'Defeat 5 Phantoms (enemy7) — lifetime.',
    check: ({ stats }) => (stats.killsByType && stats.killsByType.enemy7) >= 5,
  },
  {
    id: 'coinTycoon',
    label: 'Coin Tycoon',
    description: 'Accumulate 10,000 lifetime coins.',
    check: ({ campaign }) => !!campaign && (campaign.lifetimeCoinsEarned || 0) >= 10000,
  },
  {
    id: 'fullLoadout',
    label: 'Full Loadout',
    description: 'Own at least 3 upgrades on a single character.',
    check: ({ campaign }) => {
      if (!campaign || !campaign.upgrades) return false;
      for (const charKey of Object.keys(campaign.upgrades)) {
        const tree = campaign.upgrades[charKey];
        if (!tree) continue;
        let n = 0;
        for (const id of Object.keys(tree)) if (tree[id]) n++;
        if (n >= 3) return true;
      }
      return false;
    },
  },
  {
    id: 'speedrunner',
    label: 'Speedrunner',
    description: 'Clear any level in under 30 seconds.',
    check: ({ stats }) => stats.fastestClearMs > 0 && stats.fastestClearMs < 30000,
  },
  {
    id: 'endlessAdept',
    label: 'Endless Adept',
    description: 'Complete 2 endless loops.',
    check: ({ stats }) => (stats.bestEndlessLoop || 0) >= 2,
  },
  {
    id: 'masterOfAll',
    label: 'Master of All',
    description: 'Own at least one upgrade on every character (10).',
    check: ({ campaign }) => {
      if (!campaign || !campaign.upgrades) return false;
      const chars = ['bear', 'wolf', 'monkey', 'lion', 'pig', 'mole', 'rabbit', 'elephant', 'owl', 'fox'];
      for (const c of chars) {
        const tree = campaign.upgrades[c];
        if (!tree) return false;
        let any = false;
        for (const id of Object.keys(tree)) if (tree[id]) { any = true; break; }
        if (!any) return false;
      }
      return true;
    },
  },
  {
    id: 'marathon',
    label: 'Marathon',
    description: 'Play for one hour total.',
    check: ({ stats }) => (stats.totalPlayTimeMs || 0) >= 3600000,
  },
  {
    id: 'survivorElite',
    label: 'Survivor Elite',
    description: 'Clear 24 levels in a single run without dying.',
    check: ({ stats }) => stats.longestStreak >= 24,
  },
  {
    id: 'cloneArmy',
    label: 'Clone Army',
    description: 'Summon 25 clones (lifetime).',
    check: ({ stats }) => (stats.clonesSpawned || 0) >= 25,
  },
  {
    id: 'phoenix',
    label: 'Phoenix',
    description: 'Trigger Rebirth 10 times (lifetime).',
    check: ({ stats }) => (stats.rebirthsTriggered || 0) >= 10,
  },
  {
    id: 'lightspeedClear',
    label: 'Lightspeed',
    description: 'Clear any level in under 15 seconds.',
    check: ({ stats }) => stats.fastestClearMs > 0 && stats.fastestClearMs < 15000,
  },
  {
    id: 'flawlessRun',
    label: 'Flawless Run',
    description: 'Clear 6 levels in a single run without dying.',
    check: ({ stats }) => (stats.longestStreak || 0) >= 6,
  },
  {
    id: 'bombsAway',
    label: 'Bombs Away',
    description: 'Drop 25 proximity bombs (lifetime).',
    check: ({ stats }) => (stats.bombsDropped || 0) >= 25,
  },
  {
    id: 'bossRushChampion',
    label: 'Boss Rush Champion',
    description: 'Complete Boss Rush mode (clear all 7 world finales).',
    check: ({ stats }) => (stats.bossRushClears || 0) >= 1,
  },
];

function safeStore(store) {
  if (store) return store;
  if (typeof localStorage !== 'undefined' && localStorage !== null) return localStorage;
  return null;
}

export function readUnlocks(store) {
  const s = safeStore(store);
  if (!s) return {};
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

export function writeUnlocks(unlocks, store) {
  const s = safeStore(store);
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(unlocks));
  } catch (e) {
    // ignore
  }
}

// Returns array of achievement IDs newly unlocked by this check. Mutates the
// `unlocks` argument so the caller can persist it. `nowMs` is stored as the
// unlock timestamp.
export function checkAchievements(unlocks, ctx, nowMs) {
  const newly = [];
  if (!unlocks || !ctx || !ctx.stats) return newly;
  for (const def of ACHIEVEMENTS) {
    if (unlocks[def.id]) continue;
    let ok = false;
    try { ok = !!def.check(ctx); } catch (e) { ok = false; }
    if (ok) {
      unlocks[def.id] = Number.isFinite(nowMs) ? nowMs : Date.now();
      newly.push(def.id);
    }
  }
  return newly;
}

export function countUnlocked(unlocks) {
  if (!unlocks) return 0;
  let n = 0;
  for (const k of Object.keys(unlocks)) {
    if (unlocks[k]) n += 1;
  }
  return n;
}

export function lookupAchievement(id) {
  for (const def of ACHIEVEMENTS) {
    if (def.id === id) return def;
  }
  return null;
}

export function resetUnlocks(store) {
  writeUnlocks({}, store);
}
