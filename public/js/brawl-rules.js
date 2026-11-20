// Duel: the rules both the server and the screens use. Arena layouts, each class's duel kit (HP, speed,
// attack, perk and skill), the monsters, the power-ups, and the collision helpers. In the code the mode
// is called "brawl", because "duel" already names the team battle's code.
(function (root) {
  // The arena is W x H units (16:9), drawn in tiles of TILE units.
  const ARENA = { W: 1600, H: 900, TILE: 50 };
  const COLS = ARENA.W / ARENA.TILE; // 32
  const ROWS = ARENA.H / ARENA.TILE; // 18

  // Game length and pace. A full game is 4 minutes, one round 2. The Dragon King (boss option, full game
  // only) storms in for the last minute. Difficulty sets how many monsters come, how hard they hit and how
  // often new ones arrive.
  const LENGTH_MS = { full: 240000, one: 120000 };
  const BOSS_LEFT_MS = 60000;
  const LEVELS = {
    easy: { mob: 0.7, dmg: 0.75, spawn: 1.3 },
    normal: { mob: 1, dmg: 1, spawn: 1 },
    hard: { mob: 1.35, dmg: 1.3, spawn: 0.8 },
  };

  const TICK_MS = 25; // the server's simulation step
  const SNAP_EVERY = 2; // ...and it sends the screens a snapshot every this many steps (20 a second)
  const HERO_R = 18;
  const RESPAWN_MS = 3000; // a knocked-out hero is back after this long
  const SPAWN_SAFE_MS = 2000; // ...and can't be hurt for this long (until they attack)
  const KO_POINTS = 100;
  const SHUTDOWN_STREAK = 3; // knocking out a hero on this many KOs in a row...
  const SHUTDOWN_BONUS = 50; // ...is worth this much more
  const ASSIST_MS = 8000; // the last hero to hurt someone this recently gets the KO, even if a monster finishes them
  const CHARGE_MAX = 100; // skill charge: from damage dealt, KOs and time
  const CHARGE_PER_DMG = 0.2;
  const CHARGE_PER_SEC = 2;
  const CHARGE_PER_KO = 20;

  // What every class fights with in a duel. atk: kind (how it looks, as in the other modes), dmg, cd (ms
  // between attacks), speed (units/s), range, r (hit size), pierce (extra targets it passes through),
  // count/spread (several at once, radians apart), splash/splashR (blast where it lands), knock (push),
  // slow (ms the target is slowed), homing (turn rate, radians/s), heal (HP back per hit).
  const KITS = {
    knight: {
      hp: 120, speed: 215,
      atk: { kind: 'slash', dmg: 16, cd: 420, speed: 720, range: 330, r: 16, pierce: 1 },
      perk: { name: 'IRON GUARD', text: 'takes 20% less damage' },
      skill: { name: 'SHIELD WALL', text: 'blocks all damage for 3 seconds' },
    },
    barbarian: {
      hp: 150, speed: 205,
      atk: { kind: 'axe', dmg: 27, cd: 650, speed: 560, range: 290, r: 18, pierce: 9 },
      perk: { name: 'BLOODLUST', text: 'up to +50% damage as your HP runs low' },
      skill: { name: 'WHIRLWIND', text: 'spin for 2.5 seconds, hitting everything around you' },
    },
    wizard: {
      hp: 95, speed: 210,
      atk: { kind: 'fireball', dmg: 20, cd: 700, speed: 520, range: 480, r: 14, splash: 10, splashR: 70 },
      perk: { name: 'ARCANE MIND', text: 'your skill charges 40% faster' },
      skill: { name: 'METEOR', text: 'a meteor crashes down where you aim: a huge blast' },
    },
    archer: {
      hp: 95, speed: 225,
      atk: { kind: 'arrow', dmg: 15, cd: 450, speed: 950, range: 640, r: 10, pierce: 1 },
      perk: { name: 'EAGLE EYE', text: '+25% damage on far targets' },
      skill: { name: 'ARROW FAN', text: 'fires 11 arrows in a wide fan' },
    },
    rogue: {
      hp: 105, speed: 240,
      atk: { kind: 'dagger', dmg: 11, cd: 480, speed: 820, range: 330, r: 9, count: 3, spread: 0.2 },
      perk: { name: 'SLY', text: 'moves 12% faster' },
      skill: { name: 'SHADOW STEP', text: 'dash ahead and vanish for 3 seconds; your next hit does double' },
    },
    cleric: {
      hp: 115, speed: 215,
      atk: { kind: 'beam', dmg: 15, cd: 400, speed: 650, range: 420, r: 13, heal: 4 },
      perk: { name: 'BLESSED', text: 'power-ups last 50% longer, potions heal 50% more' },
      skill: { name: 'SANCTUARY', text: 'heals 50 HP and blasts nearby foes away' },
    },
    ninja: {
      hp: 95, speed: 245,
      atk: { kind: 'shuriken', dmg: 9, cd: 220, speed: 860, range: 380, r: 10 },
      perk: { name: 'EVASION', text: '20% chance to dodge a hit' },
      skill: { name: 'SHURIKEN STORM', text: 'two rings of shurikens fly out in every direction' },
    },
    necromancer: {
      hp: 105, speed: 215,
      atk: { kind: 'soul', dmg: 13, cd: 480, speed: 480, range: 540, r: 13, homing: 3.2 },
      perk: { name: 'SOUL HARVEST', text: 'heals 5 HP per monster slain, 20 per hero KO' },
      skill: { name: 'RAISE DEAD', text: '3 ghosts rise and hunt your foes for 8 seconds' },
    },
    druid: {
      hp: 115, speed: 215,
      atk: { kind: 'thorn', dmg: 15, cd: 400, speed: 650, range: 390, r: 12, slow: 1200 },
      perk: { name: 'LIFE BLOOM', text: 'heals 5 HP a second after 3 seconds unhurt' },
      skill: { name: 'OVERGROWTH', text: 'thorny vines around you slow and hurt foes for 5 seconds' },
    },
    pirate: {
      hp: 125, speed: 205,
      atk: { kind: 'cannon', dmg: 22, cd: 800, speed: 600, range: 450, r: 14, splash: 12, splashR: 80, knock: 160 },
      perk: { name: 'PLUNDER', text: '+50% points from monsters, and they drop more power-ups' },
      skill: { name: 'CANNON BARRAGE', text: '6 cannonballs pound the area where you aim' },
    },
    bard: {
      hp: 105, speed: 220,
      atk: { kind: 'notes', dmg: 13, cd: 430, speed: 560, range: 430, r: 22, pierce: 9 },
      perk: { name: 'ECHO', text: 'every 4th attack plays twice' },
      skill: { name: 'BATTLE HYMN', text: 'stuns foes around you; you move and attack faster for 5 seconds' },
    },
    valkyrie: {
      hp: 120, speed: 220,
      atk: { kind: 'spear', dmg: 24, cd: 750, speed: 1000, range: 620, r: 11, pierce: 2 },
      perk: { name: 'VALOR', text: '+25% damage while above half HP' },
      skill: { name: 'THUNDERCLAP', text: 'lightning strikes every foe around you and stuns them' },
    },
  };

  // The perks' and skills' numbers, used by the server.
  const PERK = {
    guard: 0.8, // knight: damage taken
    bloodlust: 0.5, // barbarian: extra damage at 0 HP (less as HP is higher)
    arcane: 1.4, // wizard: skill charge
    eagleFar: 350, eagle: 1.25, // archer: past this far, this much damage
    sly: 1.12, // rogue: speed
    blessedTime: 1.5, blessedHeal: 1.5, // cleric
    dodge: 0.2, // ninja
    harvestMob: 5, harvestKo: 20, // necromancer
    bloomAfter: 3000, bloomHps: 5, // druid
    plunderPts: 1.5, plunderDrop: 2, // pirate
    echoEvery: 4, // bard
    valor: 1.25, // valkyrie, above half HP
  };
  const SKILL = {
    wallMs: 3000, wallSpeed: 0.7,
    whirlMs: 2500, whirlEvery: 250, whirlDmg: 16, whirlR: 85, whirlSpeed: 1.25,
    meteorAhead: 320, meteorDelay: 800, meteorR: 140, meteorDmg: 60,
    fanCount: 11, fanSpread: 1.75,
    stepDist: 260, stealthMs: 3000, stealthHit: 2,
    sanctHeal: 50, sanctR: 140, sanctDmg: 20, sanctKnock: 260,
    stormCount: 12, stormWaves: 2, stormGap: 220,
    ghosts: 3, ghostMs: 8000,
    growMs: 5000, growR: 170, growDps: 16, growSlow: 0.45,
    barrageCount: 6, barrageAhead: 330, barrageSpread: 110, barrageR: 85, barrageDmg: 30, barrageGap: 160,
    hymnMs: 5000, hymnR: 170, hymnStun: 1200, hymnSpeed: 1.3, hymnRate: 1.4,
    thunderR: 210, thunderDmg: 35, thunderStun: 1300,
  };

  // Monsters. Bats and ghosts fly over walls; slimes and skulls walk around them. Skulls keep their distance
  // and spit fireballs. pts: what slaying one is worth. drop: chance of leaving a power-up.
  const MONSTERS = {
    slime: { hp: 34, r: 17, speed: 72, dmg: 8, hitMs: 800, pts: 10, drop: 0.08 },
    bat: { hp: 16, r: 14, speed: 150, dmg: 6, hitMs: 700, pts: 15, drop: 0.08, fly: true },
    skull: { hp: 42, r: 16, speed: 80, dmg: 8, hitMs: 800, pts: 25, drop: 0.16, shotMs: 2400, shotDmg: 12, shotSpeed: 330, shotRange: 560, keep: 260 },
    boss: { hp: 900, hpPerHero: 300, r: 62, speed: 55, dmg: 22, hitMs: 900, pts: 300, fly: true,
      fireMs: 3200, fireCount: 7, fireSpread: 0.9, fireDmg: 14, fireSpeed: 360, fireRange: 700, callMs: 9000, call: 3 },
    ghost: { hp: 30, r: 14, speed: 190, dmg: 8, hitMs: 600, pts: 0, fly: true }, // the Necromancer's Raise Dead
  };
  const MONSTER_TYPES = ['slime', 'bat', 'skull', 'boss', 'ghost'];
  const BOSS_PTS_PER_DMG = 1 / 3; // everyone who hurts the Dragon King scores this per point of damage

  // Power-ups lie on the arena floor; walk over one to take it. ms: how long it lasts (0: at once).
  const ITEMS = {
    potion: { name: 'HEALTH POTION', short: 'HEAL', heal: 40, weight: 26, ms: 0 },
    haste: { name: 'HASTE', short: 'HASTE', weight: 14, ms: 8000, speed: 1.4 },
    shield: { name: 'SHIELD', short: 'SHIELD', weight: 12, ms: 5000 },
    fury: { name: 'FURY', short: 'FURY', weight: 14, ms: 8000, dmg: 2 },
    triple: { name: 'MULTI-SHOT', short: 'MULTI', weight: 14, ms: 8000, spread: 0.26 },
    slow: { name: 'SLOW TIME', short: 'SLOW', weight: 8, ms: 5000, speed: 0.6 },
    bomb: { name: 'BOMB', short: 'BOMB', weight: 12, ms: 0, dmg: 45, r: 170 },
  };
  const ITEM_KEYS = Object.keys(ITEMS);
  const ITEM_EVERY_MS = [7000, 11000]; // a new power-up appears this often...
  const ITEM_LIFE_MS = 20000; // ...and lies there this long
  const ITEM_R = 22; // pick-up reach (on top of the hero's own size)

  // Powder kegs blow up when shot, hurting everything around them, and roll back in a while later.
  const KEG = { hp: 30, r: 20, blastR: 120, dmg: 40, backMs: 25000 };

  // Hero flags in snapshots.
  const F = {
    alive: 1, safe: 2, shield: 4, fury: 8, haste: 16, triple: 32, stealth: 64, stun: 128,
    slow: 256, wall: 512, whirl: 1024, hymn: 2048, away: 4096,
  };

  // Arena layouts on the 32 x 18 tile grid. Each lists the left half; the right half mirrors it, so both
  // sides play the same. Blocks: [x, y, w, h, kind]; kegs: [x, y] (tile centers). Monster gates stay clear:
  // the middle of each edge.
  const LAYOUTS = [
    {
      name: 'COURTYARD',
      blocks: [[6, 4, 2, 2, 'wall'], [6, 12, 2, 2, 'wall'], [11, 3, 3, 1, 'wall'], [11, 14, 3, 1, 'wall'],
        [10, 8, 1, 1, 'crate'], [10, 9, 1, 1, 'crate'], [15, 8, 2, 2, 'wall'], [3, 8, 1, 2, 'crate']],
      kegs: [[9, 5], [9, 12], [14, 9]],
    },
    {
      name: 'RUINS',
      blocks: [[4, 3, 4, 1, 'wall'], [4, 4, 1, 2, 'wall'], [4, 14, 4, 1, 'wall'], [4, 12, 1, 2, 'wall'],
        [10, 6, 1, 1, 'crate'], [11, 6, 1, 1, 'crate'], [10, 11, 2, 1, 'crate'], [13, 8, 1, 2, 'wall'], [8, 8, 1, 2, 'crate']],
      kegs: [[7, 7], [7, 10], [15, 4], [15, 13]],
    },
    {
      name: 'CROSSROADS',
      blocks: [[5, 5, 2, 2, 'crate'], [5, 11, 2, 2, 'crate'], [10, 2, 1, 4, 'wall'], [10, 12, 1, 4, 'wall'],
        [13, 7, 1, 1, 'wall'], [13, 10, 1, 1, 'wall'], [2, 3, 1, 1, 'crate'], [2, 14, 1, 1, 'crate']],
      kegs: [[8, 8], [8, 9], [15, 3], [15, 14]],
    },
  ];
  // Where monsters come in: the middle of each edge.
  const GATES = [
    { x: ARENA.W / 2, y: 24 }, { x: ARENA.W / 2, y: ARENA.H - 24 }, { x: 24, y: ARENA.H / 2 }, { x: ARENA.W - 24, y: ARENA.H / 2 },
  ];

  // A layout in arena units: solid blocks (walls and crates) and kegs, mirrored, no doubles.
  function buildLayout(index) {
    const L = LAYOUTS[((index % LAYOUTS.length) + LAYOUTS.length) % LAYOUTS.length];
    const T = ARENA.TILE;
    const seen = new Set();
    const blocks = [];
    for (const [x, y, w, h, kind] of L.blocks) {
      for (const bx of [x, COLS - x - w]) {
        const key = `${bx},${y},${w},${h}`;
        if (seen.has(key)) continue;
        seen.add(key);
        blocks.push({ x: bx * T, y: y * T, w: w * T, h: h * T, kind });
      }
    }
    const kegs = [];
    const kseen = new Set();
    for (const [x, y] of L.kegs) {
      for (const kx of [x, COLS - 1 - x]) {
        const key = `${kx},${y}`;
        if (kseen.has(key)) continue;
        kseen.add(key);
        kegs.push({ x: (kx + 0.5) * T, y: (y + 0.5) * T });
      }
    }
    return { name: L.name, blocks, kegs };
  }

  // ---- collision -------------------------------------------------------
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Pushes a circle out of a block. Returns the new center, or null if they don't touch.
  function pushOutRect(x, y, r, b) {
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return null;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      return { x: cx + (dx / d) * r, y: cy + (dy / d) * r };
    }
    // The center is inside the block: out the nearest side.
    const left = x - b.x;
    const right = b.x + b.w - x;
    const top = y - b.y;
    const bottom = b.y + b.h - y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) return { x: b.x - r, y };
    if (m === right) return { x: b.x + b.w + r, y };
    if (m === top) return { x, y: b.y - r };
    return { x, y: b.y + b.h + r };
  }

  function pushOutCircle(x, y, r, c) {
    const dx = x - c.x;
    const dy = y - c.y;
    const min = r + c.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min) return null;
    const d = Math.sqrt(d2) || 1;
    return { x: c.x + (dx / d) * min, y: c.y + (dy / d) * min };
  }

  // Moves a circle by (dx, dy), sliding along blocks and round things (kegs) and staying in the arena.
  function moveCircle(x, y, r, dx, dy, blocks, rounds = []) {
    let nx = x + dx;
    let ny = y + dy;
    for (let pass = 0; pass < 2; pass++) {
      for (const b of blocks) {
        const p = pushOutRect(nx, ny, r, b);
        if (p) { nx = p.x; ny = p.y; }
      }
      for (const c of rounds) {
        const p = pushOutCircle(nx, ny, r, c);
        if (p) { nx = p.x; ny = p.y; }
      }
    }
    return { x: clamp(nx, r, ARENA.W - r), y: clamp(ny, r, ARENA.H - r) };
  }

  // Is the point inside a block (grown by r)?
  function inBlock(x, y, r, blocks) {
    return blocks.some((b) => x > b.x - r && x < b.x + b.w + r && y > b.y - r && y < b.y + b.h + r);
  }

  // Does the straight line from (x1, y1) to (x2, y2) cross a block?
  function lineBlocked(x1, y1, x2, y2, blocks) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    for (const b of blocks) {
      let t0 = 0;
      let t1 = 1;
      let hit = true;
      for (const [p, q] of [[-dx, x1 - b.x], [dx, b.x + b.w - x1], [-dy, y1 - b.y], [dy, b.y + b.h - y1]]) {
        if (p === 0) {
          if (q < 0) { hit = false; break; }
        } else {
          const t = q / p;
          if (p < 0) { if (t > t1) { hit = false; break; } if (t > t0) t0 = t; }
          else { if (t < t0) { hit = false; break; } if (t < t1) t1 = t; }
        }
      }
      if (hit) return true;
    }
    return false;
  }

  const BrawlRules = {
    ARENA, COLS, ROWS, LENGTH_MS, BOSS_LEFT_MS, LEVELS, TICK_MS, SNAP_EVERY, HERO_R, RESPAWN_MS, SPAWN_SAFE_MS,
    KO_POINTS, SHUTDOWN_STREAK, SHUTDOWN_BONUS, ASSIST_MS, CHARGE_MAX, CHARGE_PER_DMG, CHARGE_PER_SEC, CHARGE_PER_KO,
    KITS, PERK, SKILL, MONSTERS, MONSTER_TYPES, BOSS_PTS_PER_DMG, ITEMS, ITEM_KEYS, ITEM_EVERY_MS, ITEM_LIFE_MS, ITEM_R,
    KEG, F, LAYOUTS, GATES, buildLayout, moveCircle, inBlock, lineBlocked, pushOutRect, clamp,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = BrawlRules;
  else root.BrawlRules = BrawlRules;
})(typeof window !== 'undefined' ? window : globalThis);
