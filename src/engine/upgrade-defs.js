// Per-character upgrade definitions, per plans/2026-05-23-upgrade-rethink.md.
// Each entry: { id, character, label, cost, prereq, description, howto }
// prereq is the id of another upgrade for the same character, or null.

export const CHARACTER_SPECIALTY = {
  bear:     'Speed Specialist',
  wolf:     'Berserk Specialist',
  monkey:   'Clone Specialist',
  elephant: 'Life Specialist',
  lion:     'Fire Specialist',
  pig:      'Bounce Specialist',
  mole:     'Trap Specialist',
  rabbit:   'Bomb Specialist',
  owl:      'Time Specialist',
  fox:      'Stealth Specialist',
};

export const UPGRADES = [
  // Bear — Speed. Retention proves mastery; fast-start is the reward.
  // End-game trades further speed for enemy slowdown.
  { id: 'persistentSpeed1', character: 'bear', label: 'Persistent Speed I',  cost: 300,  prereq: null,              description: 'Keep 1 speedStack across death.',                                howto: 'Death no longer wipes 1 stack of speed — you spawn back with one fried-egg of momentum preserved.' },
  { id: 'fastStart1',       character: 'bear', label: 'Fast Start I',         cost: 250,  prereq: 'persistentSpeed1', description: 'Spawn each level at speed +1.',                                  howto: 'Every level begins at +1 speed even before you grab a fried-egg.' },
  { id: 'persistentSpeed2', character: 'bear', label: 'Persistent Speed II', cost: 750,  prereq: 'fastStart1',       description: 'Keep up to 2 speedStacks across death.',                         howto: 'Death keeps you at +2 if you had it. Aggressive play barely costs you.' },
  { id: 'fastStart2',       character: 'bear', label: 'Fast Start II',        cost: 600,  prereq: 'persistentSpeed2', description: 'Spawn each level at speed +2.',                                  howto: 'Spawn at +2 speed flat. Combine with fried-eggs to ramp fast.' },
  { id: 'persistentSpeed3', character: 'bear', label: 'Persistent Speed III',cost: 1800, prereq: 'fastStart2',       description: 'Keep up to 3 speedStacks across death.',                         howto: 'Death is barely a setback — your top speed stays with you.' },
  { id: 'fastStart3',       character: 'bear', label: 'Fast Start III',       cost: 1450, prereq: 'persistentSpeed3', description: 'Spawn each level at speed +3.',                                  howto: 'You start every level near your speed cap. Just one fried-egg and you\'re maxed.' },
  { id: 'speedOnKill',      character: 'bear', label: 'Speed on Kill',        cost: 800,  prereq: 'persistentSpeed1', description: '+1 speedStack every 5 kills per level.',                         howto: 'Each 5-kill milestone awards a free speedStack until the global cap.' },
  { id: 'speedOnKill2',     character: 'bear', label: 'Speed on Kill+',       cost: 1900, prereq: 'speedOnKill',      description: '+1 speedStack every 3 kills per level.',                         howto: 'Streaks pay off faster. Three enemies and you have a new stack.' },
  { id: 'slowEnemies1',     character: 'bear', label: 'Slow Enemies I',       cost: 2200, prereq: 'fastStart3',       description: 'All enemies move 10% slower for the rest of the run.',           howto: 'Once you\'re at top speed, this widens your speed advantage by slowing them.' },
  { id: 'slowEnemies2',     character: 'bear', label: 'Slow Enemies II',      cost: 4500, prereq: 'slowEnemies1',     description: 'All enemies move 20% slower (total).',                           howto: 'Even the fastest enemies stop being a credible threat at top speed.' },

  // Wolf — Berserk. invBerserk is the foundation; everything else gates on it.
  { id: 'invBerserk',       character: 'wolf', label: 'Inventory: Berserk',   cost: 250,  prereq: null,         description: 'Bank Berserk balloons in your Q slot; press Q (or \\ for P2) to activate.', howto: 'Berserk pickups no longer auto-fire — they go into your Q slot until you choose to use them.' },
  { id: 'berserkStart',     character: 'wolf', label: 'Berserk Start',        cost: 500,  prereq: 'invBerserk', description: 'Start every level with 1 banked Berserk.',                                  howto: 'You spawn with a Berserk ready to fire from your Q slot.' },
  { id: 'berserkStart2',    character: 'wolf', label: 'Berserk Start ×2',     cost: 1200, prereq: 'berserkStart', description: 'Start every level with 2 banked Berserks.',                                howto: 'Two Berserks loaded at spawn. Burst-clear two waves of enemies on demand.' },
  { id: 'berserkStart3',    character: 'wolf', label: 'Berserk Start ×3',     cost: 2800, prereq: 'berserkStart2', description: 'Start every level with 3 banked Berserks.',                                howto: 'Three pre-loaded Berserks. Practically immortal in the early-game pressure waves.' },
  { id: 'berserkPlus2',     character: 'wolf', label: 'Berserk +2s',          cost: 350,  prereq: 'invBerserk', description: 'Berserk lasts 2s longer.',                                                  howto: 'Each Berserk activation runs 2s longer — about 2 extra enemies cleared per use.' },
  { id: 'berserkPlus4',     character: 'wolf', label: 'Berserk +4s',          cost: 850,  prereq: 'berserkPlus2', description: 'Berserk lasts 4s longer (total).',                                         howto: 'Combined with +2s, your Berserk runs much longer per activation.' },
  { id: 'howlStun',         character: 'wolf', label: 'Howl Stun',            cost: 700,  prereq: 'invBerserk', description: 'Activating Berserk freezes the 3×3 around you for 2s.',                      howto: 'Q triggers Berserk AND stuns nearby enemies — perfect for kicking off the kill streak.' },
  { id: 'howlStun2',        character: 'wolf', label: 'Howl Range+',          cost: 1700, prereq: 'howlStun',   description: 'Howl Stun range 3×3 → 5×5.',                                                howto: 'A bigger stun radius — clear a 5×5 path before swinging into action.' },

  // Monkey — Clone
  { id: 'stunClone',        character: 'monkey', label: 'Stun Clone',         cost: 350,  prereq: null,        description: 'Press N to summon a 5s decoy that freezes adjacent enemies.',               howto: 'N drops a clone at your cell. Enemies within 1 step freeze. Buys 5s of safety.' },
  { id: 'longClone',        character: 'monkey', label: 'Long Clone',         cost: 850,  prereq: 'stunClone', description: 'Clone lasts 8s instead of 5s.',                                             howto: 'Decoys hold position longer — better for clearing extra space.' },
  { id: 'echoBlast',        character: 'monkey', label: 'Echo Blast',         cost: 700,  prereq: 'stunClone', description: 'Clones detonate as a small explosion when an enemy touches them.',          howto: 'If an enemy walks onto the clone cell, it explodes and kills them.' },
  { id: 'echoWave',         character: 'monkey', label: 'Echo Wave',          cost: 1000, prereq: 'echoBlast', description: 'Expiring clones release a 2-cell freeze pulse.',                            howto: 'Every clone that times out releases a freeze pulse — free crowd control.' },
  { id: 'bigEcho',          character: 'monkey', label: 'Big Echo',           cost: 1400, prereq: 'echoWave',  description: 'Expiration pulse range 2 → 3 cells.',                                       howto: 'The freeze pulse reaches farther — every clone is a tactical asset.' },
  { id: 'twinClone',        character: 'monkey', label: 'Twin Clone',         cost: 900,  prereq: 'stunClone', description: 'Up to 2 active clones instead of 1.',                                       howto: 'Press N twice. You can have two decoys out at once — set traps across the map.' },
  { id: 'tripleClone',      character: 'monkey', label: 'Triple Clone',       cost: 2200, prereq: 'twinClone', description: 'Up to 3 active clones instead of 2.',                                       howto: 'Three decoys on the field. Build a network of safe zones and ambushes.' },

  // Elephant — Life
  { id: 'lifePlusDrops',    character: 'elephant', label: 'Lifeplus Drops',   cost: 250,  prereq: null,              description: 'Life+1 balloons spawn 50% more often.',                                     howto: 'Spawn rolls favor red Life+1 balloons. Expect 1-2 extra lives per long run.' },
  { id: 'luckyDrop',        character: 'elephant', label: 'Lucky Drop',       cost: 600,  prereq: 'lifePlusDrops',   description: '15% chance an enemy drops a Life+1 balloon on defeat.',                     howto: 'Defeat enemies — sometimes they drop a red balloon. Adds up across a level.' },
  { id: 'luckyDrop2',       character: 'elephant', label: 'Lucky Drop+',      cost: 1450, prereq: 'luckyDrop',       description: '25% chance an enemy drops a Life+1 balloon on defeat.',                     howto: 'Higher drop rate. Most fights will give you an extra life balloon.' },
  { id: 'rebirth',          character: 'elephant', label: 'Rebirth',          cost: 1000, prereq: 'lifePlusDrops',   description: 'Once per level: instant respawn with invuln on first death.',               howto: 'Your first death each level is free — instant respawn with 2s invuln. No stock lost.' },
  { id: 'rebirth2',         character: 'elephant', label: 'Rebirth ×2',       cost: 2400, prereq: 'rebirth',         description: 'First TWO deaths per level are free (counter resets per level).',          howto: 'Two free deaths every level. Use them to scout dangerous patterns.' },
  { id: 'bigHeart',         character: 'elephant', label: 'Big Heart',        cost: 1500, prereq: 'rebirth',         description: 'Start each level with +1 bonus life on top of normal stocks.',              howto: 'Every level begins with 1 extra life.' },
  { id: 'bigHeart2',        character: 'elephant', label: 'Big Heart+',       cost: 3600, prereq: 'bigHeart',        description: 'Start each level with +2 bonus lives on top of normal stocks.',             howto: 'Every level begins with 2 extra lives. Combined with Rebirth ×2, you have huge safety margins.' },

  // Lion — Fire
  { id: 'rockToExplosive',  character: 'lion', label: 'Rock to Explosive',    cost: 400,  prereq: null,             description: 'F charges your next rock-hurl to explode (30s cooldown).',                  howto: 'Press F to arm. Your next rock hurl becomes a fireball. 30s cooldown after.' },
  { id: 'biggerBlast',      character: 'lion', label: 'Bigger Blast',         cost: 500,  prereq: 'rockToExplosive', description: 'Player-triggered fireballs get +1 radius (5×5).',                          howto: 'Your fireballs (from F or from hurling a fireball object) clear a 5×5 area.' },
  { id: 'megaBlast',        character: 'lion', label: 'Mega Blast',           cost: 1200, prereq: 'biggerBlast',     description: 'Player-triggered fireballs get +2 radius (7×7).',                          howto: 'Massive explosions — clear entire rooms in one shot.' },
  { id: 'twinBlast',        character: 'lion', label: 'Twin Blast',           cost: 700,  prereq: 'biggerBlast',     description: 'Rock-to-Explosive fires twice before cooldown.',                            howto: 'F charges 2 shots in a row before cooling down. Double the fireballs.' },
  { id: 'tripleBlast',      character: 'lion', label: 'Triple Blast',         cost: 1700, prereq: 'twinBlast',       description: 'Rock-to-Explosive fires three times before cooldown.',                      howto: 'F gets 3 charges before cooldown. Pure offensive overload.' },
  { id: 'quickCharge',      character: 'lion', label: 'Quick Charge',         cost: 800,  prereq: 'twinBlast',       description: 'Rock-to-Explosive cooldown is halved (30s → 15s).',                         howto: 'F resets twice as fast. Fireballs every 15s instead of every 30s.' },
  { id: 'instantCharge',    character: 'lion', label: 'Instant Charge',       cost: 1900, prereq: 'quickCharge',     description: 'Cooldown is halved again (15s → 7s).',                                     howto: 'Fireballs nearly on-demand. Spam through the late game.' },

  // Pig — Bounce
  { id: 'donutMastery',     character: 'pig', label: 'Donut Mastery',        cost: 300,  prereq: null,             description: 'Donuts bounce +1 extra time before stopping.',                              howto: 'Hurled donuts bounce 4 times instead of 3. More chances to chain hits.' },
  { id: 'donutMastery2',    character: 'pig', label: 'Donut Mastery+',       cost: 750,  prereq: 'donutMastery',   description: 'Donuts bounce +2 extra times (5 total instead of 3).',                     howto: 'Donuts now bounce 5 times. Set up complex room-clearing patterns.' },
  { id: 'powerPush',        character: 'pig', label: 'Power Push',           cost: 500,  prereq: null,             description: 'Hurled rocks travel 50% faster.',                                           howto: 'Rocks slide 50% faster. Easier to hit moving enemies.' },
  { id: 'powerPush2',       character: 'pig', label: 'Power Push+',          cost: 1200, prereq: 'powerPush',      description: 'Hurled rocks travel 100% faster (total).',                                  howto: 'Rocks fly nearly instantaneously. Almost impossible to dodge.' },
  { id: 'bounceImmunity',   character: 'pig', label: 'Bounce Immunity',      cost: 600,  prereq: 'donutMastery',   description: 'Player is immune to bouncing donuts (including own).',                      howto: 'Stand in the path of bouncing donuts safely.' },
  { id: 'trampoline',       character: 'pig', label: 'Trampoline',           cost: 700,  prereq: 'bounceImmunity', description: 'Catching your own bounced donut grants +1 speedStack for 5s.',              howto: 'With bounce immunity: stand in a returning donut\'s path to grab a speed boost.' },
  { id: 'superTrampoline',  character: 'pig', label: 'Super Trampoline',     cost: 1700, prereq: 'trampoline',     description: 'Trampoline grants +2 speedStacks for 8s.',                                  howto: 'Bigger speed boost, longer window — donut-catching becomes a core movement option.' },

  // Mole — Trap
  { id: 'trapCancel',       character: 'mole', label: 'Trap Cancel',          cost: 350,  prereq: null,             description: 'T cancels the nearest enemy3 trap-cast.',                                   howto: 'Press T during an Enemy3 windup to interrupt it. No trap appears.' },
  { id: 'counterTrap',      character: 'mole', label: 'Counter-Trap',         cost: 700,  prereq: 'trapCancel',     description: 'Stepping on a trap dispels it instead of slowing you.',                     howto: 'Walk into trap cells fearlessly. They poof and you keep your speed.' },
  { id: 'reflectiveTrap',   character: 'mole', label: 'Reflective Trap',      cost: 1700, prereq: 'counterTrap',    description: 'A dispelled trap also stuns its caster for 3s.',                            howto: 'Walking onto a trap freezes the Enemy3 that cast it — turn their attack against them.' },
  { id: 'burrowSpawn',      character: 'mole', label: 'Burrow Spawn',         cost: 500,  prereq: null,             description: 'Spawn invuln lasts 2× as long (4s).',                                       howto: 'Spawn shield doubles — 4s instead of 2s. Time to read the map.' },
  { id: 'deepBurrowSpawn',  character: 'mole', label: 'Deep Burrow Spawn',    cost: 1200, prereq: 'burrowSpawn',    description: 'Spawn invuln lasts 3× as long (6s).',                                       howto: 'Six full seconds of invulnerability at spawn — set up your opening without pressure.' },
  { id: 'moleBurrow',       character: 'mole', label: 'Mole Burrow',          cost: 800,  prereq: 'counterTrap',    description: 'T (when no trap-cast nearby) triggers a 2s burrow (30s cooldown).',         howto: 'Press T to vanish underground for 2s. Use it to escape pressure.' },
  { id: 'longBurrow',       character: 'mole', label: 'Long Burrow',          cost: 1900, prereq: 'moleBurrow',     description: 'Burrow lasts 3s; cooldown drops to 20s.',                                   howto: 'Longer escape window, faster reset. Burrow becomes a core tactic.' },

  // Rabbit — Bomb
  { id: 'easterEgg',        character: 'rabbit', label: 'Easter Egg',         cost: 350,  prereq: null,             description: 'Hurled egg becomes a 1-cell explosive.',                                    howto: 'When you hurl an egg, it explodes on impact instead of just cracking.' },
  { id: 'biggerEgg',        character: 'rabbit', label: 'Bigger Egg',         cost: 850,  prereq: 'easterEgg',      description: 'Hurled-egg explosions get +1 radius (5×5).',                                howto: 'Your hurled-egg detonations clear a 5×5 area — same scale as Lion\'s Bigger Blast.' },
  { id: 'bombCarrying',     character: 'rabbit', label: 'Bomb Carrying',      cost: 600,  prereq: 'easterEgg',      description: 'Banked eggs (Shift+egg) drop as proximity bombs (B key).',                  howto: 'Shift+egg banks it. Press B to drop a bomb that explodes when an enemy approaches.' },
  { id: 'chainReaction',    character: 'rabbit', label: 'Chain Reaction',     cost: 900,  prereq: 'bombCarrying',   description: 'Proximity bombs trigger at 2-cell range (was 1).',                          howto: 'B bombs detect enemies from farther away. One bomb sets off chain detonations.' },
  { id: 'megaChain',        character: 'rabbit', label: 'Mega Chain',         cost: 2150, prereq: 'chainReaction',  description: 'Proximity bombs trigger at 3-cell range.',                                  howto: 'Trigger radius reaches 3 cells — perimeter defense becomes trivial.' },
  { id: 'luckyFoot',        character: 'rabbit', label: 'Lucky Foot',         cost: 500,  prereq: null,             description: '+25% coin rewards.',                                                        howto: 'Multiplies every coin you earn by 1.25. Buy early for compounding effect.' },
  { id: 'luckyFoot2',       character: 'rabbit', label: 'Lucky Foot+',        cost: 1200, prereq: 'luckyFoot',      description: '+50% coin rewards (total).',                                                howto: 'All coin earnings are 50% higher. Late-game purchases come faster.' },

  // Owl — Time
  { id: 'invTimeFreeze',    character: 'owl', label: 'Inventory: Time Freeze', cost: 300,  prereq: null,             description: 'Bank Time-Freeze balloons; press Z (P1) to activate.',                       howto: 'Time-Freeze pickups go into your Z slot. Press Z when you need them.' },
  { id: 'timeStart',        character: 'owl', label: 'Time Start',             cost: 600,  prereq: 'invTimeFreeze',  description: 'Start every level with 1 banked Time Freeze.',                              howto: 'Spawn with one Time-Freeze ready to use.' },
  { id: 'timeStart2',       character: 'owl', label: 'Time Start ×2',          cost: 1450, prereq: 'timeStart',      description: 'Start with 2 banked Time Freezes.',                                         howto: 'Two pre-loaded Time-Freezes. Buy yourself 10 seconds of free clearing.' },
  { id: 'timeStart3',       character: 'owl', label: 'Time Start ×3',          cost: 3500, prereq: 'timeStart2',     description: 'Start with 3 banked Time Freezes.',                                         howto: 'Three Time-Freezes at spawn. Practically clear-on-demand for an entire level.' },
  { id: 'timePlus2',        character: 'owl', label: 'Time Freeze +2s',        cost: 450,  prereq: 'invTimeFreeze',  description: 'Time-Freeze duration +2s.',                                                 howto: 'Each activation lasts 2s longer — about 2 more enemies cleared per use.' },
  { id: 'timePlus4',        character: 'owl', label: 'Time Freeze +4s',        cost: 1100, prereq: 'timePlus2',      description: 'Time-Freeze duration +4s (total).',                                         howto: 'Combined with +2s, each Time-Freeze lasts much longer.' },
  { id: 'timeAfterglow',    character: 'owl', label: 'Afterglow',              cost: 900,  prereq: 'invTimeFreeze',  description: 'After Time-Freeze ends, enemies stay slowed for 2s.',                       howto: 'A grace period after the freeze: enemies are sluggish for 2 seconds — plenty of time to escape.' },
  { id: 'timeAfterglow2',   character: 'owl', label: 'Long Afterglow',         cost: 2150, prereq: 'timeAfterglow',  description: 'Post-freeze slow lasts 4s.',                                                howto: 'Even after freeze ends, enemies stay slow long enough to set up your next move.' },

  // Fox — Stealth (invisibility = damage immunity)
  { id: 'invInvisibility',  character: 'fox', label: 'Inventory: Invisibility', cost: 300,  prereq: null,             description: 'Bank Invisibility balloons; press X (P1) to activate.',                     howto: 'Invisibility pickups go into your X slot. Invisible = enemies ignore you AND you can\'t be damaged.' },
  { id: 'stealthStart',     character: 'fox', label: 'Stealth Start',           cost: 600,  prereq: 'invInvisibility',description: 'Start every level with 1 banked Invisibility.',                            howto: 'Spawn with one Invisibility ready.' },
  { id: 'stealthStart2',    character: 'fox', label: 'Stealth Start ×2',        cost: 1450, prereq: 'stealthStart',   description: 'Start with 2 banked Invisibilities.',                                      howto: 'Two pre-loaded Invisibilities. Burst through dense rooms safely.' },
  { id: 'stealthStart3',    character: 'fox', label: 'Stealth Start ×3',        cost: 3500, prereq: 'stealthStart2',  description: 'Start with 3 banked Invisibilities.',                                      howto: 'Three Invisibilities at spawn. Tank-style play without the lives.' },
  { id: 'stealthPlus2',     character: 'fox', label: 'Invisibility +2s',        cost: 450,  prereq: 'invInvisibility',description: 'Invisibility duration +2s.',                                               howto: 'Stay hidden longer per activation.' },
  { id: 'stealthPlus4',     character: 'fox', label: 'Invisibility +4s',        cost: 1100, prereq: 'stealthPlus2',   description: 'Invisibility duration +4s (total).',                                       howto: 'Combined with +2s: long, decisive invisibility windows.' },
  { id: 'ambushStrike',     character: 'fox', label: 'Ambush Strike',           cost: 900,  prereq: 'invInvisibility',description: 'First kill made while invisible scores 2×.',                               howto: 'The opening kill of every invisibility window is double points.' },
  { id: 'ambushStrike2',    character: 'fox', label: 'Phantom Killer',          cost: 2150, prereq: 'ambushStrike',   description: 'All kills made while invisible score 2×.',                                 howto: 'Every kill during invisibility is 2× score. Stack with Multiplier balloons for huge totals.' },
];

export function specialtyForCharacter(charId) {
  return CHARACTER_SPECIALTY[charId] || '';
}

export function upgradesForCharacter(charId) {
  return UPGRADES.filter((u) => u.character === charId);
}

export function lookupUpgrade(id) {
  for (const u of UPGRADES) {
    if (u.id === id) return u;
  }
  return null;
}

// Returns true if the upgrade can be purchased given current XP + ownership.
// Skills now cost per-character XP rather than coins.
export function isPurchaseable(upgrade, campaign) {
  if (!upgrade || !campaign) return false;
  const owned = campaign.upgrades && campaign.upgrades[upgrade.character];
  if (owned && owned[upgrade.id]) return false; // already owned
  if (upgrade.prereq) {
    if (!owned || !owned[upgrade.prereq]) return false;
  }
  const xpHave = (campaign.xp && campaign.xp[upgrade.character]) || 0;
  if (xpHave < upgrade.cost) return false;
  return true;
}

// Returns ownership state for an upgrade: { owned, prereqMet, affordable }.
// "affordable" is now based on per-character XP, not coins.
export function purchaseStatus(upgrade, campaign) {
  if (!upgrade || !campaign) return { owned: false, prereqMet: false, affordable: false };
  const ownedTree = (campaign.upgrades && campaign.upgrades[upgrade.character]) || {};
  const owned = !!ownedTree[upgrade.id];
  const prereqMet = !upgrade.prereq || !!ownedTree[upgrade.prereq];
  const xpHave = (campaign.xp && campaign.xp[upgrade.character]) || 0;
  const affordable = xpHave >= upgrade.cost;
  return { owned, prereqMet, affordable };
}
