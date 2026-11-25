// Artillery: the rules both the server and the screens use. Two teams take turns firing across a
// side-on battlefield: set the angle, charge the power, mind the wind. Shots blow craters in the ground;
// a hero with nothing under their feet falls, and falling off the bottom is a KO.
//
// The ground is a grid of cells made the same way everywhere from a seed, so the screens only need the
// seed and the list of craters to have exactly the server's ground.
(function (root) {
  const MAP = { W: 2400, H: 1200, CELL: 4 };
  const COLS = MAP.W / MAP.CELL; // 600
  const ROWS = MAP.H / MAP.CELL; // 300

  const GRAVITY = 1000; // units/s² pulling shots down
  const MAX_SPEED = 1400; // a shot at full power leaves at this speed
  const WIND_ACCEL = 18; // units/s² per point of wind
  // Heroes ride their pets (a hero without one stands): the hit area covers hero and mount, the same for all.
  const HERO_R = 28; // how close a shot must come to a hero's middle to hit them
  const HERO_MID = 40; // a hero's middle is this far above the ground they stand on
  const CLIMB = 14; // the highest step a hero can walk up
  const WALK_SPEED = 90; // units/s
  const STAMINA = 260; // how far a hero can walk in one turn
  const HP = 120;
  const ANGLE_MIN = -20;
  const ANGLE_MAX = 90;
  const CHARGE_MS = 1800; // holding FIRE this long reaches full power
  const KO_POINTS = 100;
  const WIN_POINTS = 150; // for every hero on the winning team
  const SPECIAL_MAX = 100; // special shot charge: from damage dealt and taken, and a little every turn
  const SPECIAL_PER_DMG = 1;
  const SPECIAL_PER_HURT = 0.5;
  const SPECIAL_PER_TURN = 10;
  const SHOW_MS = 2000; // after a shot lands, how long before the next turn (the screens stay on where it hit)

  // Jumping: forward, the way you face, out of a hole or over a gap. It costs stamina (the blue bar), so
  // you can jump a few times a turn. grav: how hard heroes fall (shots use GRAVITY).
  const JUMP = { vx: 120, vy: 430, cost: 80, grav: 1100 };

  // Mounts: a hero rides their pet, and each pet moves in its own way (0: no pet, on foot). jumpX/jumpY:
  // how much farther/higher it jumps, glide: the fastest it falls (units/s) when it jumps, climb: how
  // much higher a step it walks up, stamina/speed: how far and how fast it walks, jumpCost: what a jump
  // costs (times JUMP.cost), guard: damage taken (times), sure: never walks off into the drop, flap: can
  // jump once more in mid-air.
  const MOUNTS = [
    { name: 'ON FOOT', text: 'no mount: a plain jump' },
    { name: 'POUNCE', pet: 'CAT', text: 'jumps much higher', jumpY: 1.4 },
    { name: 'GLIDE', pet: 'OWL', text: 'jumps farther and floats gently down', jumpX: 1.3, glide: 150 },
    { name: 'STICKY', pet: 'SLIME', text: 'walks up walls three times as high', climb: 3 },
    { name: 'WINGS', pet: 'BABY DRAGON', text: 'has the longest jump of all', jumpX: 1.6, jumpY: 1.15 },
    { name: 'SWIFT', pet: 'FOX', text: 'walks half again as far, and faster', stamina: 1.5, speed: 1.5 },
    { name: 'HOP', pet: 'BUNNY', text: 'jumps for half the cost: twice as many jumps', jumpCost: 0.5 },
    { name: 'LEAP', pet: 'FROG', text: 'jumps higher and farther', jumpX: 1.35, jumpY: 1.25 },
    { name: 'SHELL', pet: 'TURTLE', text: 'takes 15% less damage, but walks less far', guard: 0.85, stamina: 0.75 },
    { name: 'SURE-FOOTED', pet: 'GOAT', text: 'climbs steep slopes and never walks off into the drop', climb: 2, sure: true },
    { name: 'FLAP', pet: 'BAT', text: 'jumps again in mid-air (tap JUMP while flying)', flap: true },
  ];

  // Ghosts: a hero who's knocked out haunts the battlefield. It floats anywhere over the field, through
  // anything (moved from its phone, `speed` units a second), and, `first` turns after it's out and then every
  // `every` turns, it can drop a ghost bomb straight down from where it is; the bomb falls once the turn's
  // shot has landed (or the turn runs out). Its hits score for the ghost. It starts `hover` over where it fell.
  const GHOST = { first: 2, every: 3, hover: 260, speed: 600, top: 60, bottom: 1140, bomb: { kind: 'ghost', dmg: 18, r: 45, crater: 26, wind: 0, big: 1.1 } };
  // How high a ghost floats at x when it first rises: well over the ground there (and never above the top).
  const ghostY = (terrain, x) => Math.max(GHOST.top, (terrain.groundBelow(x, 0) ?? MAP.H * 0.7) - GHOST.hover);
  // Where a ghost can be: anywhere on the map, not right at its edges.
  const ghostAt = (x, y) => [Math.round(Math.max(40, Math.min(MAP.W - 40, x))), Math.round(Math.max(GHOST.top, Math.min(GHOST.bottom, y)))];

  // Trampolines (on the free-for-all battlefields, on the floor or over the drop): step onto one (or jump
  // onto it, or JUMP while on it) and it throws you up onto the nearest perch the way you're going (any
  // perch if there's none that way, or straight up and down again if it can't reach one). Free: no walk
  // used. They can't be blown up. `w`: how wide (cells); `up`: how fast the straight-up bounce goes.
  const SPRING = { w: 14, up: 800 };
  // Portals (free-for-all battlefields): two pairs, each with its own color, on perches across the field.
  // Walk into one and you come out of its twin, facing away from it. `r`: how close counts as in it (across).
  const PORTAL = { r: 12, tall: 70, colors: ['#5fe0ff', '#ff9a3c'] };

  // Sudden death floods the battlefield: when it starts the water fills the lowest dip, then rises `rise`
  // every turn (no higher than `top`). Feet in the water hurt (dmg a turn); a hero under it drowns.
  const WATER = { rise: 24, top: 300, dmg: 15 };

  // A knockout during a shot plays in slow motion (the replay runs at `speed` for `ms`), so the server
  // waits that much longer before the next turn.
  const SLOWMO = { ms: 1100, speed: 0.25 };
  const SLOWMO_EXTRA = Math.round(SLOWMO.ms * (1 - SLOWMO.speed));

  // Free for all: every hero for themselves. The last one standing gets this bonus.
  const FFA_WIN_POINTS = 250;

  // Power-ups float over the middle of the battlefield: hit one with a shot (or a blast) and it's yours.
  // One appears at the start, then another every ORB.every turns while there are fewer than ORB.max.
  const ORB = { r: 30, every: 3, max: 2 };
  const ORBS = {
    potion: { name: 'POTION', text: '+35 HP', hp: 35 },
    fury: { name: 'FURY', text: 'next shot hits 50% harder', mult: 1.5 },
    shield: { name: 'SHIELD', text: 'half damage till next turn', guard: 0.5 },
    haste: { name: 'HASTE', text: 'goes twice as far next turn', stamina: 2 },
    triple: { name: 'TWIN SHOT', text: 'next shot fires twice' },
  };

  // A battle goes on until a team is wiped out. Game length sets when sudden death starts (from this turn
  // on, shots hit SUDDEN_STEP harder every turn, up to SUDDEN_MAX times as hard), so it always ends;
  // difficulty sets the wind and the time to aim. LAST_TURN: a battle still going after this many turns
  // (everyone hiding, say) goes to the team with more HP.
  const TURNS = { full: 30, one: 16 };
  const SUDDEN_STEP = 0.1;
  const SUDDEN_MAX = 4;
  const LAST_TURN = 200;
  const LEVELS = {
    easy: { wind: 5, turnMs: 25000 },
    normal: { wind: 10, turnMs: 20000 },
    hard: { wind: 16, turnMs: 15000 },
  };

  // Every class's two shots (SHOT 1 and SHOT 2) and its special (when SKILLS is on). dmg at the middle of
  // the blast (half at its edge), r: blast size, crater: hole it leaves (0: none), grav/wind: how much
  // gravity and wind move it, direct: damage multiplier for hitting a hero head on, count/spread: several
  // at once (degrees apart), gap: one after another (ms), drill: goes this far into the ground first,
  // bounce: bounces this many times (each bounce blows up), bolt/boltR: lightning that also strikes
  // everyone within boltR across, heal/healR: heals teammates near the blast, drain: heals the shooter by
  // this share of damage, grow: raises a mound instead of digging, teleport: the shooter lands where it
  // hits, straight: flies dead straight this far (no gravity or wind) before it drops, roll: lands and
  // rolls along the ground this far before it blows, split: splits into this many at the top of its arc,
  // cluster: bursts into bomblets. No shot steers itself: every hit is aimed.
  const SHOTS = {
    knight: {
      name: 'SWORD BEAM', shot: { kind: 'slash', dmg: 30, r: 60, crater: 40 },
      alt: { name: 'LANCE', text: 'flies dead straight a long way before it drops', shot: { kind: 'spear', dmg: 26, r: 45, crater: 30, straight: 650 } },
      special: { name: 'HOLY BLADE', text: 'a huge blade of light: big blast, big hit', shot: { kind: 'slash', dmg: 58, r: 85, crater: 60, big: 1.8 } },
    },
    barbarian: {
      name: 'SPINNING AXE', shot: { kind: 'axe', dmg: 36, r: 55, crater: 50, grav: 1.25 },
      alt: { name: 'BOULDER', text: 'lands and rolls along the ground before it blows', shot: { kind: 'boulder', dmg: 34, r: 60, crater: 46, grav: 1.2, roll: 420 } },
      special: { name: 'EARTHQUAKE', text: 'a giant crater that drops everyone around it', shot: { kind: 'axe', dmg: 42, r: 95, crater: 135, grav: 1.25, big: 1.8 } },
    },
    wizard: {
      name: 'FIREBALL', shot: { kind: 'fireball', dmg: 30, r: 75, crater: 50 },
      alt: { name: 'FROST SHARDS', text: 'splits into three at the top of its arc', shot: { kind: 'frost', dmg: 16, r: 45, crater: 26, split: 3 } },
      special: { name: 'METEOR', text: 'a flaming rock with a huge blast', shot: { kind: 'meteor', dmg: 62, r: 110, crater: 90 } },
    },
    archer: {
      name: 'PIERCING ARROW', shot: { kind: 'arrow', dmg: 24, r: 45, crater: 28, grav: 0.85, wind: 0.6, direct: 1.7 },
      alt: { name: 'EAGLE ARROW', text: 'a light arrow that flies flat and far, barely feeling the wind', shot: { kind: 'arrow', dmg: 20, r: 38, crater: 22, grav: 0.55, wind: 0.3, direct: 1.5 } },
      special: { name: 'ARROW RAIN', text: 'five arrows at once, fanned out', shot: { kind: 'arrow', dmg: 22, r: 45, crater: 28, grav: 0.85, wind: 0.6, direct: 1.5, count: 5, spread: 4 } },
    },
    rogue: {
      name: 'DAGGER VOLLEY', shot: { kind: 'dagger', dmg: 17, r: 40, crater: 26, count: 2, gap: 260 },
      alt: { name: 'CALTROPS', text: 'bursts into four little blasts where it lands', shot: { kind: 'dagger', dmg: 14, r: 40, crater: 22, cluster: { n: 4, dmg: 9, r: 32, crater: 16 } } },
      special: { name: 'SHADOW STEP', text: 'a dagger that takes you with it: you land where it hits', shot: { kind: 'dagger', dmg: 26, r: 45, crater: 26, teleport: true } },
    },
    cleric: {
      name: 'HOLY LIGHT', shot: { kind: 'beam', dmg: 25, r: 60, crater: 36, heal: 15, healR: 90 },
      alt: { name: 'SMITE', text: 'a beam of light, dead straight and deaf to the wind', shot: { kind: 'beam', dmg: 24, r: 45, crater: 26, straight: 900, wind: 0 } },
      special: { name: 'SANCTUARY', text: 'heals teammates near the blast by 40', shot: { kind: 'beam', dmg: 30, r: 90, crater: 40, heal: 40, healR: 230, big: 1.5 } },
    },
    ninja: {
      name: 'SHURIKEN', shot: { kind: 'shuriken', dmg: 13, r: 40, crater: 22, count: 3, spread: 3 },
      alt: { name: 'RICOCHET STAR', text: 'bounces twice, blowing up each time', shot: { kind: 'shuriken', dmg: 13, r: 38, crater: 20, bounce: 2 } },
      special: { name: 'SHURIKEN STORM', text: 'six shurikens at once', shot: { kind: 'shuriken', dmg: 14, r: 40, crater: 22, count: 6, spread: 4 } },
    },
    necromancer: {
      name: 'SOUL BOLT', shot: { kind: 'soul', dmg: 28, r: 55, crater: 34, wind: 0 },
      alt: { name: 'BONE BURST', text: 'bursts into five bone shards where it lands', shot: { kind: 'soul', dmg: 12, r: 38, crater: 20, wind: 0, cluster: { n: 5, dmg: 8, r: 30, crater: 14 } } },
      special: { name: 'SOUL DRAIN', text: 'a heavy bolt that heals you by half the damage', shot: { kind: 'soul', dmg: 48, r: 65, crater: 40, wind: 0, drain: 0.5, big: 1.6 } },
    },
    druid: {
      name: 'THORN VINE', shot: { kind: 'thorn', dmg: 27, r: 50, crater: 34, drill: 90 },
      alt: { name: 'SEED POD', text: 'splits into three seeds at the top of its arc', shot: { kind: 'seed', dmg: 15, r: 45, crater: 26, split: 3 } },
      special: { name: 'OVERGROWTH', text: 'raises a mound of earth where it lands (cover, or a bridge)', shot: { kind: 'thorn', dmg: 24, r: 60, crater: 0, grow: 75 } },
    },
    pirate: {
      name: 'CANNONBALL', shot: { kind: 'cannon', dmg: 34, r: 68, crater: 52, grav: 1.2 },
      alt: { name: 'GRAPESHOT', text: 'four small shots at once, spread wide', shot: { kind: 'grape', dmg: 11, r: 34, crater: 18, count: 4, spread: 7 } },
      special: { name: 'CANNON BARRAGE', text: 'three cannonballs, one after another', shot: { kind: 'cannon', dmg: 30, r: 64, crater: 48, grav: 1.2, count: 3, gap: 380 } },
    },
    bard: {
      name: 'POWER CHORD', shot: { kind: 'notes', dmg: 19, r: 50, crater: 30, bounce: 1 },
      alt: { name: 'DRUMROLL', text: 'lands and rolls along the ground before it blows', shot: { kind: 'drum', dmg: 26, r: 55, crater: 34, roll: 360 } },
      special: { name: 'ENCORE', text: 'bounces three times, blowing up each time', shot: { kind: 'notes', dmg: 22, r: 55, crater: 32, bounce: 3 } },
    },
    valkyrie: {
      name: 'STORM SPEAR', shot: { kind: 'spear', dmg: 28, r: 50, crater: 34, bolt: 16, boltR: 50 },
      alt: { name: 'THUNDER STRIKE', text: 'drills into the ground, then lightning strikes beside it', shot: { kind: 'spear', dmg: 22, r: 45, crater: 30, drill: 60, bolt: 16, boltR: 65 } },
      special: { name: 'THUNDERCLAP', text: 'lightning strikes everyone near where it lands', shot: { kind: 'spear', dmg: 30, r: 50, crater: 34, bolt: 40, boltR: 150 } },
    },
  };

  // Items: each hero has one of each per game. Using one doesn't end your turn.
  const ITEMS = {
    heal: { name: 'HEAL', text: '+40 HP', hp: 40 },
    double: { name: 'DOUBLE', text: 'fire twice this turn' },
  };

  // ---- the ground ----------------------------------------------------------------
  // Battlefields: how the ground is shaped, and its colors. Each is made from a seed, so every game on
  // one looks a little different.
  const STYLES = [
    { key: 'hills', name: 'ROLLING HILLS', sky: ['#3d7fd6', '#7dbbf0', '#c4e6f7'], grass: '#4fa865', dirt: ['#8b5a2b', '#7a4e25'], rock: '#5a5073' },
    { key: 'towers', name: 'TWIN TOWERS', sky: ['#24163f', '#a83f5c', '#f7a04a'], grass: '#3f8f4a', dirt: ['#6b4422', '#5c3a1e'], rock: '#4a3f63' },
    { key: 'islands', name: 'SKY ISLANDS', sky: ['#5ba8e8', '#a8d8f8', '#e8f6ff'], grass: '#6fd34f', dirt: ['#9a6a3a', '#8b5a2b'], rock: '#6e6488' },
    { key: 'canyon', name: 'RED CANYON', sky: ['#c4481a', '#f08040', '#ffd08a'], grass: '#c9a66b', dirt: ['#b5532a', '#9a4422'], rock: '#7a3a1e' },
    { key: 'peak', name: 'THE GREAT PEAK', sky: ['#1e2a4a', '#4a5a8a', '#9ab0d8'], grass: '#e8f0f8', dirt: ['#6e6488', '#5a5073'], rock: '#3a3452' },
    { key: 'bridge', name: 'BROKEN BRIDGE', sky: ['#2a1e4a', '#6a4a8a', '#e0a0a0'], grass: '#5fae4a', dirt: ['#7a5a3a', '#6b4a2e'], rock: '#4a4060' },
    { key: 'ziggurat', name: 'THE ZIGGURAT', sky: ['#4aa3df', '#9ad0ef', '#f5e6c8'], grass: '#e0c27a', dirt: ['#c9a66b', '#b8945a'], rock: '#8a6a3a' },
    { key: 'hollow', name: 'HOLLOW HILLS', sky: ['#0e1630', '#23305a', '#46508a'], grass: '#3f8f4a', dirt: ['#5c4a3a', '#4a3a2a'], rock: '#2e2a40' },
    { key: 'sawtooth', name: 'SAWTOOTH RIDGE', sky: ['#7fb0e0', '#c0dcf0', '#ffffff'], grass: '#f4f8fc', dirt: ['#8a96b8', '#7a86a8'], rock: '#4a5070' },
    { key: 'craters', name: 'CRATER FIELD', sky: ['#2a0e1e', '#5e1e2e', '#a04a3a'], grass: '#8a6a5a', dirt: ['#4a3a3a', '#3e3030'], rock: '#2a2020' },
    // Free for all only: no two sides, but perches at all heights, one for every hero.
    { key: 'pillars', ffa: true, back: 'mesas', name: 'STONE PILLARS', sky: ['#24506e', '#5a9ab0', '#f4c890'], grass: '#9bbf5a', dirt: ['#b0703c', '#9a5f30'], rock: '#6a3e2a' },
    { key: 'mushrooms', ffa: true, back: 'shrooms', name: 'MUSHROOM GROVE', sky: ['#0c1e30', '#1c4654', '#4a9a84'], grass: '#7fd06a', dirt: ['#5a3e5e', '#4a324e'], rock: '#2e2238', cap: ['#d94a4a', '#b83838'], spot: '#f4e8d8', stem: ['#eadfc4', '#d2c4a4'] },
    { key: 'arena', ffa: true, back: 'city', name: 'THE COLOSSEUM', sky: ['#3a7bd5', '#89c2e8', '#f6e0b0'], grass: '#e0c080', dirt: ['#c49a5a', '#b0874a'], rock: '#7a5a3a' },
    { key: 'drift', ffa: true, back: 'isles', name: 'DRIFTING ISLES', sky: ['#38286a', '#c06a9a', '#ffd0a0'], grass: '#8ee06a', dirt: ['#8a6a7a', '#7a5a6a'], rock: '#4a3a5a' },
    { key: 'ruins', ffa: true, back: 'towers', name: 'THE OLD RUINS', sky: ['#22324a', '#4e6a84', '#c8b89a'], grass: '#6aa84f', dirt: ['#6b5a44', '#5c4c38'], rock: '#3e3a44' },
  ];
  // The battlefields a battle can be on: team battles get the first ten, free for all the rest.
  const stylesFor = (ffa) => STYLES.map((s, i) => i).filter((i) => Boolean(STYLES[i].ffa) === Boolean(ffa));

  // Repeatable random numbers (mulberry32).
  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Ground cells: 0 air, 1 earth, 2 stone (towers), 3 earth grown by a Druid, 4 a mushroom's cap, 5 its
  // stem, 6 a trampoline (nothing blows it up). `depth`: how far each cell is below the surface it was made with (for its color).
  class Terrain {
    constructor(seed, style) {
      this.seed = seed;
      this.style = STYLES[style] ? style : 0;
      this.cells = new Uint8Array(COLS * ROWS);
      this.depth = new Uint8Array(COLS * ROWS);
      this.under = new Uint8Array(COLS * ROWS); // deep inside the earth: once dug out, a dark hollow (not sky)
      this.holes = []; // caves and pits, dug once the ground's colors are worked out
      this.perches = []; // free-for-all battlefields: where heroes start, [left, right, top] in cells
      this.springs = []; // ... their trampolines, [left, right, top] in cells
      this.portals = []; // ... and portals, { x, y (its foot), pair, side (the way out: 1 right, -1 left) } in units
      this.generate();
    }

    generate() {
      const rnd = seeded(this.seed);
      const key = STYLES[this.style].key;
      const C = this.cells;
      const fill = (cx, top, bottom, kind = 1) => {
        for (let cy = Math.max(0, Math.floor(top)); cy < Math.min(ROWS, Math.ceil(bottom)); cy++) C[cy * COLS + cx] = kind;
      };
      // A wavy line across the map, in rows: base, plus a few sine waves of random phase.
      const waves = (base, amps) => {
        const parts = amps.map(([amp, len]) => ({ amp, f: (Math.PI * 2) / len, p: rnd() * Math.PI * 2 }));
        return (cx) => base + parts.reduce((s, w) => s + w.amp * Math.sin(cx * w.f + w.p), 0);
      };
      if (STYLES[this.style].ffa) this.perchy(key, rnd, fill, waves);
      else if (key === 'islands') {
        // Floating islands over a bottomless drop; there's always one under each team's side.
        const xs = [0.12, 0.3, 0.5, 0.7, 0.88].map((f) => f * COLS + (rnd() - 0.5) * 30);
        for (const [i, x] of xs.entries()) {
          const half = 40 + rnd() * 25 + (i === 0 || i === 4 ? 12 : 0);
          const top = ROWS * (0.38 + rnd() * 0.2);
          const thick = 40 + rnd() * 30;
          const bump = waves(0, [[3, 37], [2, 13]]);
          for (let cx = Math.floor(x - half); cx <= Math.ceil(x + half); cx++) {
            if (cx < 0 || cx >= COLS) continue;
            const k = Math.abs(cx - x) / half;
            if (k > 1) continue;
            const t = top + bump(cx) + k * k * 8;
            fill(cx, t, top + thick * Math.pow(1 - k * k, 0.7));
          }
        }
      } else {
        let surface;
        if (key === 'hills') surface = waves(ROWS * 0.6, [[22, 260], [10, 90], [3, 31]]);
        else if (key === 'towers') surface = waves(ROWS * 0.66, [[10, 300], [5, 80], [2, 27]]);
        else if (key === 'canyon') {
          // High ground on both sides, a deep valley between.
          const rough = waves(0, [[6, 70], [2, 23]]);
          surface = (cx) => {
            const d = Math.abs(cx - COLS / 2) / (COLS / 2);
            return ROWS * (0.86 - 0.42 * Math.min(1, Math.max(0, (d - 0.12) / 0.3))) + rough(cx);
          };
        } else if (key === 'bridge') {
          // Two cliffs over a bottomless chasm; the bridge comes after.
          const rough = waves(0, [[5, 90], [2, 23]]);
          surface = (cx) => (Math.abs(cx - COLS / 2) < COLS * 0.13 ? ROWS + 10 : ROWS * 0.5 + rough(cx));
        } else if (key === 'ziggurat') {
          surface = waves(ROWS * 0.76, [[6, 200], [2, 41]]);
        } else if (key === 'hollow') {
          surface = waves(ROWS * 0.55, [[18, 240], [8, 80], [3, 29]]);
        } else if (key === 'sawtooth') {
          // Jagged peaks: a sawtooth wave, roughened.
          const period = 64 + rnd() * 20;
          const shift = rnd() * period;
          const rough = waves(0, [[3, 17], [2, 7]]);
          surface = (cx) => {
            const k = ((cx + shift) % period) / period;
            return ROWS * 0.62 - 38 * (1 - Math.abs(k * 2 - 1)) + rough(cx);
          };
        } else if (key === 'craters') {
          surface = waves(ROWS * 0.6, [[6, 220], [3, 61]]);
        } else {
          // A great mountain in the middle: lob it, or tunnel through it.
          const rough = waves(0, [[8, 120], [3, 37]]);
          surface = (cx) => ROWS * (0.72 - 0.55 * Math.exp(-(((cx - COLS / 2) / 70) ** 2))) + rough(cx);
        }
        for (let cx = 0; cx < COLS; cx++) fill(cx, surface(cx), ROWS);
        // Round holes: caves inside the hills, pits across the field (dug after the colors, below).
        const hole = (x, y, rx, ry) => this.holes.push([x, y, rx, ry]);
        if (key === 'bridge') {
          // A stone bridge across the chasm, with posts along the top.
          const y0 = Math.round(ROWS * 0.5) + 2;
          for (let cx = Math.floor(COLS * 0.35); cx < Math.ceil(COLS * 0.65); cx++) {
            fill(cx, y0, y0 + 7, 2);
            if (cx % 12 < 2) fill(cx, y0 - 4, y0, 2);
          }
        } else if (key === 'ziggurat') {
          // A stepped stone pyramid in the middle.
          const base = surface(COLS / 2);
          for (let step = 0; step < 6; step++) {
            const half = 100 - step * 16;
            const top = base - 10 * (step + 1);
            for (let cx = Math.round(COLS / 2 - half); cx < COLS / 2 + half; cx++) fill(cx, top, surface(cx) + 2, 2);
          }
        } else if (key === 'hollow') {
          // Caves under the surface: blow the roof in and whoever's on it drops through.
          for (let i = 0; i < 11; i++) {
            const x = 30 + rnd() * (COLS - 60);
            hole(x, surface(x) + 30 + rnd() * 50, 14 + rnd() * 18, 7 + rnd() * 9);
          }
        } else if (key === 'craters') {
          // Old pits, everywhere.
          for (let i = 0; i < 14; i++) {
            const x = 20 + rnd() * (COLS - 40);
            const r = 8 + rnd() * 16;
            hole(x, surface(x) - r * 0.3, r, r * 0.8);
          }
        }
        if (key === 'towers') {
          // A stone tower near each side, with battlements.
          for (const fx of [0.13, 0.87]) {
            const x0 = Math.round(fx * COLS - 14);
            let foot = ROWS;
            for (let cx = x0; cx < x0 + 28; cx++) foot = Math.min(foot, surface(cx));
            const top = foot - 55;
            for (let cx = x0; cx < x0 + 28; cx++) {
              const notch = (cx - x0) % 7 < 3 ? 0 : 4;
              fill(cx, top + notch, surface(cx) + 2, 2);
            }
          }
        }
      }
      // How deep each cell is below its surface, for the colors; deep earth shows dark when dug out. On the
      // free-for-all battlefields, earth under stone or a mushroom starts its own surface.
      const fresh = Boolean(STYLES[this.style].ffa);
      for (let cx = 0; cx < COLS; cx++) {
        let run = 0;
        for (let cy = 0; cy < ROWS; cy++) {
          const i = cy * COLS + cx;
          if (fresh && C[i] === 1 && cy && C[i - COLS] > 1) run = 0;
          if (C[i]) {
            this.depth[i] = Math.min(255, run);
            if (C[i] === 1 && run >= 8) this.under[i] = 1;
            run += 1;
          } else run = 0;
        }
      }
      // Now the caves and pits: their floors and walls keep the earth's colors, no grass.
      for (const [x, y, rx, ry] of this.holes) {
        for (let cy = Math.floor(y - ry); cy <= y + ry; cy++) {
          for (let cx = Math.floor(x - rx); cx <= x + rx; cx++) {
            if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) continue;
            if (((cx - x) / rx) ** 2 + ((cy - y) / ry) ** 2 <= 1) C[cy * COLS + cx] = 0;
          }
        }
      }
    }

    // The free-for-all battlefields: no two sides, but perches at all heights, one for every hero (they
    // share when there are more heroes than perches). Each goes in this.perches as [left, right, top].
    perchy(key, rnd, fill, waves) {
      const put = (cx, top, bottom, kind = 1) => {
        if (cx >= 0 && cx < COLS) fill(cx, top, bottom, kind);
      };
      const perch = (a, b, top) => this.perches.push([Math.max(2, Math.round(a)), Math.min(COLS - 3, Math.round(b)), Math.round(top)]);
      const later = []; // things to add once the trampolines are in
      const ground = (surface) => {
        for (let cx = 0; cx < COLS; cx++) fill(cx, surface(cx), ROWS);
      };
      // m things spread evenly from a to b (fractions of the width), wobbled a little.
      const spread = (m, a, b, wobble) => Array.from({ length: m }, (_, j) => (a + ((b - a) * j) / (m - 1)) * COLS + (rnd() - 0.5) * wobble);
      // m heights (rows) from lo to hi, a step apart, shuffled so each is well apart from the one before.
      const heights = (m, lo, hi, apart) => {
        const steps = Array.from({ length: m }, (_, k) => lo + ((hi - lo) * (k + 0.2 + rnd() * 0.6)) / m);
        let best = steps;
        let bestGap = -1;
        for (let t = 0; t < 12 && bestGap < apart; t++) {
          const order = steps.slice();
          for (let i = m - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
          }
          let gap = Infinity;
          for (let i = 1; i < m; i++) gap = Math.min(gap, Math.abs(order[i] - order[i - 1]));
          if (gap > bestGap) [best, bestGap] = [order, gap];
        }
        return best;
      };

      if (key === 'pillars') {
        // Tall pillars of rock with flat tops, over a gully.
        ground(waves(ROWS * 0.9, [[4, 140], [2, 37]]));
        const m = 7 + Math.floor(rnd() * 2);
        const xs = spread(m, 0.03, 0.97, 8);
        [xs[0], xs[m - 1]] = [4 + rnd() * 4, COLS - 5 - rnd() * 4]; // the end ones right at the edges
        const tops = heights(m, ROWS * 0.3, ROWS * 0.64, 24);
        xs.forEach((x, j) => {
          const top = tops[j];
          const half = 14 + rnd() * 5;
          const rough = waves(0, [[1.2, 13], [0.8, 5]]);
          const side = waves(0, [[2, 29], [1.2, 9]]);
          for (let cy = Math.floor(top - 3); cy < ROWS; cy++) {
            const w = half * (1 + 0.15 * ((cy - top) / (ROWS - top))) + side(cy);
            for (let cx = Math.floor(x - w); cx <= Math.ceil(x + w); cx++) {
              const shoulder = Math.max(0, Math.abs(cx - x) - (w - 4));
              if (cy >= top + rough(cx) + shoulder * 0.9) put(cx, cy, cy + 1);
            }
          }
          perch(x - half + 4, x + half - 4, top);
        });
      } else if (key === 'mushrooms') {
        // Giant mushrooms: stand on their caps, or blow their stems out from under each other.
        const floor = waves(ROWS * 0.84, [[7, 210], [3, 53]]);
        ground(floor);
        const shroom = (x, top, half, thick, stem, lean) => {
          const foot = floor(x + lean);
          for (let cy = Math.floor(top + thick * 0.5); cy < foot + 3; cy++) {
            const k = (cy - top) / (foot - top);
            const sx = x + lean * k * k;
            const w = stem * (1 + Math.max(0, k - 0.75) * 2.4); // flared at the foot
            for (let cx = Math.floor(sx - w); cx <= Math.ceil(sx + w); cx++) put(cx, cy, cy + 1, 5);
          }
          for (let cx = Math.floor(x - half); cx <= Math.ceil(x + half); cx++) {
            const k = Math.abs(cx - x) / half;
            if (k > 1) continue;
            const t = top + k * k * k * 7; // flat on top, drooping at the rim
            put(cx, t, t + Math.max(2, thick * (1 - k * k)), 4);
          }
        };
        const m = 6 + Math.floor(rnd() * 2);
        const xs = spread(m, 0.03, 0.97, 8);
        [xs[0], xs[m - 1]] = [4 + rnd() * 4, COLS - 5 - rnd() * 4]; // the end ones right at the edges
        const tops = heights(m, ROWS * 0.28, ROWS * 0.6, 26);
        const room = (0.94 * COLS) / (m - 1) / 2 - 12;
        xs.forEach((x, j) => {
          const half = Math.min(room, 24 + rnd() * 8);
          shroom(x, tops[j], half, 9 + rnd() * 4, 3.5 + rnd() * 1.5, (rnd() - 0.5) * 16);
          perch(x - half * 0.7, x + half * 0.7, tops[j]);
          if (j && j % 2 === 0) {
            // A little one in between, low enough to step over (every other gap), unless a trampoline's
            // there (they go in first).
            const mx = (xs[j - 1] + x) / 2 + (rnd() - 0.5) * 10;
            const r = 3 + rnd() * 2;
            later.push(() => {
              if (!this.springs.some(([a, b]) => mx > a - r - 4 && mx < b + r + 4)) shroom(mx, floor(mx) - 4, r, 2, 1, 0);
            });
          }
        });
      } else if (key === 'arena') {
        // Tiers of stone seats rising from a sandy floor to both edges, with a dais in the middle.
        const mid = COLS / 2 + (rnd() - 0.5) * 60;
        const base = ROWS * 0.86;
        const halfFloor = 55 + rnd() * 20;
        const surf = new Array(COLS).fill(null);
        const seats = [];
        for (const dir of [-1, 1]) {
          const n = 3 + Math.floor(rnd() * 2);
          const start = mid + dir * halfFloor;
          const span = (dir < 0 ? start : COLS - start) / n;
          let y = base;
          for (let s = 0; s < n; s++) {
            const below = y;
            y -= 22 + rnd() * 12;
            const a = start + dir * span * s; // the seat's front edge, toward the middle
            const b = start + dir * span * (s + 1);
            seats.push({ lo: Math.min(a, b), hi: Math.max(a, b), y, front: a, dir, below, back: s === n - 1 });
            for (let cx = Math.max(0, Math.floor(Math.min(a, b))); cx < Math.min(COLS, Math.ceil(Math.max(a, b))); cx++) surf[cx] = y;
          }
        }
        const sand = waves(0, [[1, 23], [0.6, 7]]);
        for (let cx = 0; cx < COLS; cx++) fill(cx, surf[cx] === null ? base + sand(cx) : surf[cx], ROWS);
        for (const s of seats) {
          // The seat's top, and its front (the step down toward the middle), are stone.
          for (let cx = Math.floor(s.lo); cx < Math.ceil(s.hi); cx++) put(cx, s.y, s.y + 3, 2);
          for (let k = 0; k < 5; k++) put(Math.round(s.front + s.dir * k) - (s.dir < 0 ? 1 : 0), s.y, s.below + 3, 2);
          // The top row of seats has a column at the field's edge.
          const edge = s.back ? 14 : 6;
          perch(s.lo + (s.dir < 0 ? edge : 6), s.hi - (s.dir > 0 ? edge : 6), s.y);
          if (!s.back) continue;
          const x = s.dir < 0 ? 4 : COLS - 5;
          for (let cx = x - 3; cx <= x + 3; cx++) put(cx, s.y - 44, s.y, 2);
          for (let cx = x - 5; cx <= x + 5; cx++) put(cx, s.y - 48, s.y - 44, 2);
        }
        const dh = 14 + rnd() * 4;
        const top = base - 10 - rnd() * 4;
        for (let cx = Math.floor(mid - dh); cx <= Math.ceil(mid + dh); cx++) put(cx, top + (Math.abs(cx - mid) > dh - 3 ? 3 : 0), base + 3, 2);
        perch(mid - dh + 4, mid + dh - 4, top);
      } else if (key === 'drift') {
        // Little islands adrift at all heights, over a bottomless drop.
        const m = 9 + Math.floor(rnd() * 3);
        const xs = spread(m, 0.05, 0.95, 8);
        const room = (0.9 * COLS) / (m - 1) / 2 - 10;
        let high = rnd() < 0.5;
        xs.forEach((x) => {
          const top = ROWS * (high ? 0.26 + rnd() * 0.14 : 0.5 + rnd() * 0.16);
          high = !high;
          const half = Math.min(room, 18 + rnd() * 10);
          const thick = 26 + rnd() * 14;
          const bump = waves(0, [[2, 31], [1.5, 11]]);
          for (let cx = Math.floor(x - half); cx <= Math.ceil(x + half); cx++) {
            const k = Math.abs(cx - x) / half;
            if (k > 1) continue;
            put(cx, top + bump(cx) + k * k * 6, top + 4 + thick * Math.pow(1 - k, 0.9));
          }
          perch(x - half + 4, x + half - 4, top);
        });
      } else {
        // Broken stone floors floating on what's left of their columns, two storeys of them, over grass
        // strewn with rubble. The columns are broken off well over the ground: walk under them.
        const floor = waves(ROWS * 0.86, [[5, 180], [2, 41]]);
        ground(floor);
        const slab = (x, half, top, legs) => {
          const thick = 6 + rnd() * 2;
          const bite = [2 + rnd() * 6, 2 + rnd() * 6]; // how far each end has crumbled
          for (let cx = Math.floor(x - half); cx <= Math.ceil(x + half); cx++) {
            const left = half - Math.abs(cx - x);
            const b = bite[cx < x ? 0 : 1];
            const k = left < b ? 1 - left / b : 0;
            put(cx, top + k * 3 + (k ? rnd() * 1.5 : 0), top + thick - k * 2, 2);
          }
          if (legs.length === 2) {
            // An arch between the two columns.
            const span = Math.abs(legs[1][0] - legs[0][0]) / 2;
            for (let cx = Math.floor(x - span); cx <= Math.ceil(x + span); cx++) {
              const u = Math.min(1, Math.abs(cx - x) / span);
              put(cx, top + thick, top + thick + 12 * (1 - Math.sqrt(1 - u * u)), 2);
            }
          }
          for (const [lx, broken] of legs) {
            const foot = floor(lx);
            const end = broken ? top + thick + 6 + rnd() * 14 : foot - 18 - rnd() * 6;
            for (let cx = Math.round(lx - 3); cx <= Math.round(lx + 3); cx++) put(cx, top + thick, end, 2);
            for (let cx = Math.round(lx - 5); cx <= Math.round(lx + 5); cx++) {
              put(cx, top + thick, top + thick + 2, 2);
              put(cx, foot - 1, foot + 2, 2);
            }
          }
          perch(x - half + 5, x + half - 5, top);
        };
        const xs = spread(4, 0.12, 0.88, 16);
        const tops = heights(4, ROWS * 0.55, ROWS * 0.68, 12);
        xs.forEach((x, j) => {
          const half = 24 + rnd() * 6;
          const broken = rnd() < 0.4 ? Math.floor(rnd() * 2) : -1;
          slab(x, half, tops[j], [[x - half * 0.55, broken === 0], [x + half * 0.55, broken === 1]]);
        });
        const ups = heights(3, ROWS * 0.28, ROWS * 0.42, 14);
        for (let j = 0; j < 3; j++) {
          const x = (xs[j] + xs[j + 1]) / 2 + (rnd() - 0.5) * 12;
          slab(x, 18 + rnd() * 6, ups[j], [[x, false]]);
        }
        // Rubble.
        for (let i = 0; i < 5; i++) {
          const x = 10 + rnd() * (COLS - 20);
          const w = 3 + rnd() * 4;
          const h = 2 + rnd() * 2;
          for (let cx = Math.floor(x - w); cx <= Math.ceil(x + w); cx++) put(cx, floor(x) - h, floor(x) + 2, 2);
        }
      }
      this.perches.sort((p, q) => p[0] - q[0]);
      this.trampolines();
      for (const f of later) f();
      this.gates(rnd);
    }

    // Trampolines, in the open with nothing over them. On the floor: one on every stretch you can walk along
    // (walls, like a pillar's foot or a mushroom's stem, end a stretch), more on a long one, so nobody who
    // ends up down there is stuck; the floor is levelled round each. Where there's no floor, three floating
    // low over the drop, spread out.
    trampolines() {
      const C = this.cells;
      const at = (cx, cy) => C[cy * COLS + cx];
      // Each column: the top of whatever's in it (null: nothing), and the top of the floor rising from the
      // bottom of the map (null: none).
      const sky = [];
      const floor = [];
      for (let cx = 0; cx < COLS; cx++) {
        let cy = 0;
        while (cy < ROWS && !at(cx, cy)) cy++;
        sky.push(cy < ROWS ? cy : null);
        let fy = ROWS - 1;
        while (fy >= 0 && at(cx, fy)) fy--;
        floor.push(fy < ROWS - 1 ? fy + 1 : null);
      }
      const low = (cx) => cx >= 0 && cx < COLS && floor[cx] !== null && floor[cx] >= ROWS * 0.74;
      // Can one half wide go here, centered on c: open earth floor (near enough flat), or open drop?
      const fits = (c, half, drop) => {
        let lo = ROWS;
        let hi = 0;
        for (let cx = c - half - 3; cx <= c + half + 3; cx++) {
          if (cx < 0 || cx >= COLS) return false;
          if (drop) {
            if (sky[cx] !== null) return false;
            continue;
          }
          if (!low(cx) || sky[cx] !== floor[cx] || at(cx, floor[cx]) !== 1) return false;
          lo = Math.min(lo, floor[cx]);
          hi = Math.max(hi, floor[cx]);
        }
        return hi - lo <= 8;
      };
      const picks = []; // [column, half, over the drop]
      const place = (from, to, want, apart, drop) => {
        for (const half of [SPRING.w / 2, 5]) {
          let best = null;
          for (let c = from; c <= to; c++) {
            if (!fits(c, half, drop) || picks.some(([q]) => Math.abs(q - c) < apart)) continue;
            if (best === null || Math.abs(c - want) < Math.abs(best - want)) best = c;
          }
          if (best !== null) return picks.push([best, half, drop]);
        }
        return 0;
      };
      let from = null;
      for (let cx = 0; cx <= COLS; cx++) {
        const on = low(cx) && (from === null || Math.abs(floor[cx] - floor[cx - 1]) <= 4);
        if (on && from === null) from = cx;
        if (on) continue;
        if (from !== null) {
          const to = cx - 1;
          const n = Math.max(1, Math.round((to - from) / 160));
          for (let k = 0; k < n; k++) place(from, to, from + ((to - from) * (k + 0.5)) / n, 40, false);
        }
        from = low(cx) ? cx : null; // a step too high to walk up starts another stretch
      }
      if (!picks.length) for (const f of [0.2, 0.5, 0.8]) place(0, COLS - 1, f * COLS, 70, true);
      for (const [c, half, drop] of picks.sort((a, b) => a[0] - b[0])) {
        let level = Math.round(ROWS * 0.9);
        if (!drop) {
          // Level the floor round it (halfway between its highest and lowest), sloping gently back to
          // the floor on each side.
          let lo = ROWS;
          let hi = 0;
          for (let cx = c - half - 3; cx <= c + half + 3; cx++) [lo, hi] = [Math.min(lo, floor[cx]), Math.max(hi, floor[cx])];
          level = Math.round((lo + hi) / 2);
          for (let cx = c - half - 10; cx <= c + half + 10; cx++) {
            if (!low(cx)) continue;
            const out = Math.max(0, Math.abs(cx - c) - half - 3) / 8;
            const want = Math.round(level + (floor[cx] - level) * Math.min(1, out));
            for (let cy = Math.min(want, floor[cx]); cy < Math.max(want, floor[cx]); cy++) C[cy * COLS + cx] = cy < want ? 0 : 1;
          }
        }
        for (let cx = c - half; cx < c + half; cx++) for (let cy = level - 2; cy < level; cy++) C[cy * COLS + cx] = 6;
        this.springs.push([c - half, c + half - 1, level - 2]);
      }
    }

    // Two pairs of portals on four perches spread across the field (one from each quarter, the pairs
    // crossing over): each at one end of its perch, leading out toward the middle of it. The perch's spot
    // for a hero to start on moves over to make room.
    gates(rnd) {
      const P = this.perches;
      if (P.length < 4) return;
      const four = [0, 1, 2, 3].map((q) => {
        const ids = P.map((p, j) => j).filter((j) => Math.floor((j * 4) / P.length) === q);
        return ids[Math.floor(rnd() * ids.length)];
      });
      [[four[0], four[2]], [four[1], four[3]]].forEach((pair, k) => {
        for (const j of pair) {
          const p = P[j];
          const side = rnd() < 0.5 ? 1 : -1;
          const cx = side > 0 ? p[0] + 1 : p[1] - 1;
          const x = (cx + 0.5) * MAP.CELL;
          const y = this.groundBelow(x, (p[2] - 6) * MAP.CELL) ?? p[2] * MAP.CELL;
          this.portals.push({ x, y, pair: k, side });
          if (p[1] - p[0] >= 16) {
            if (side > 0) p[0] += 7;
            else p[1] -= 7;
          }
        }
      });
    }

    // What's at (x, y), in units: a cell kind (0 air, also off the map).
    kind(x, y) {
      const cx = Math.floor(x / MAP.CELL);
      const cy = Math.floor(y / MAP.CELL);
      if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) return 0;
      return this.cells[cy * COLS + cx];
    }

    // Is (x, y), in units, solid ground?
    solid(x, y) {
      const cx = Math.floor(x / MAP.CELL);
      const cy = Math.floor(y / MAP.CELL);
      if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) return false;
      return this.cells[cy * COLS + cx] !== 0;
    }

    // Blow a round hole. Returns the bounding box of cells it changed (for the screens' redraw).
    carve(x, y, r) {
      return this.paint(x, y, r, 0);
    }

    // Raise a round mound of earth (Druid's Overgrowth), filling only air.
    grow(x, y, r) {
      return this.paint(x, y, r, 3);
    }

    paint(x, y, r, kind) {
      const c = MAP.CELL;
      const x0 = Math.max(0, Math.floor((x - r) / c));
      const x1 = Math.min(COLS - 1, Math.floor((x + r) / c));
      const y0 = Math.max(0, Math.floor((y - r) / c));
      const y1 = Math.min(ROWS - 1, Math.floor((y + r) / c));
      const r2 = (r / c) ** 2;
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const dx = cx + 0.5 - x / c;
          const dy = cy + 0.5 - y / c;
          if (dx * dx + dy * dy > r2) continue;
          const i = cy * COLS + cx;
          if (kind === 0) {
            if (this.cells[i] !== 6) this.cells[i] = 0;
          }
          else if (!this.cells[i]) {
            this.cells[i] = kind;
            this.depth[i] = 0;
          }
        }
      }
      return { x0, y0, x1, y1 };
    }

    // The first solid ground at or below y in this column (units), or null: a drop to the bottom.
    groundBelow(x, y) {
      const cx = Math.floor(x / MAP.CELL);
      if (cx < 0 || cx >= COLS) return null;
      for (let cy = Math.max(0, Math.floor(y / MAP.CELL)); cy < ROWS; cy++) {
        if (this.cells[cy * COLS + cx]) return cy * MAP.CELL;
      }
      return null;
    }

    // Where a hero at x with feet at y would stand: on the ground under their feet, stepping up as much as
    // `climb` if their feet are in the ground. false: a wall too high to step up; null: nothing below.
    standAt(x, y, climb = CLIMB) {
      let top = y;
      while (top > y - climb - MAP.CELL && this.solid(x, top - 1)) top -= MAP.CELL;
      if (this.solid(x, top - 1)) return false;
      return this.groundBelow(x, top);
    }
  }

  // ---- shots in flight ---------------------------------------------------------------
  // Where a shot starts and how fast it goes, from a hero's feet, facing (1 right, -1 left), angle and power.
  function launch(x, y, face, angle, power) {
    const a = (Math.max(ANGLE_MIN, Math.min(ANGLE_MAX, angle)) * Math.PI) / 180;
    const speed = (MAX_SPEED * Math.max(0, Math.min(100, power))) / 100;
    const dx = Math.cos(a) * face;
    const dy = -Math.sin(a);
    return { x: x + dx * 20, y: y - HERO_MID + dy * 20, vx: dx * speed, vy: dy * speed };
  }

  // Flies one shell until it hits the ground, a hero or leaves the map (or, for a shell that splits, until
  // the top of its arc). heroes: [{ id, x, y }] (feet); `skip` is the shooter's id (they can't hit
  // themselves in the first moment). orbs: power-ups [{ id, x, y }] it takes on the way through.
  // Returns the path (a point every PATH_MS), the power-ups it went through (grabs: [{ id, t }]) and how
  // it ended: { x, y, t, hit: 'ground' | 'hero' | 'gone' | 'split', hero, vx, vy }.
  const STEP = 1 / 240;
  const PATH_MS = 30;
  function fly(terrain, heroes, skip, s, def, wind, orbs = []) {
    const grabs = [];
    const res = flyPath(terrain, heroes, skip, s, def, wind, orbs, grabs);
    res.grabs = grabs;
    return res;
  }
  function flyPath(terrain, heroes, skip, s, def, wind, orbs, grabs) {
    let { x, y, vx, vy } = s;
    const grav = GRAVITY * (def.grav ?? 1);
    const push = WIND_ACCEL * wind * (def.wind ?? 1);
    const path = [[0, Math.round(x), Math.round(y)]];
    let t = 0;
    let next = PATH_MS;
    let drilled = 0;
    let flown = 0;
    const drill = def.drill || 0;
    const straight = def.straight || 0;
    while (t < 14000) {
      if (flown < straight) {
        flown += Math.hypot(vx, vy) * STEP; // still flying straight: no gravity, no wind
      } else {
        vx += push * STEP;
        vy += grav * STEP;
      }
      x += vx * STEP;
      y += vy * STEP;
      t += STEP * 1000;
      if (def.split && vy >= 0 && t > 120) {
        path.push([Math.round(t), Math.round(x), Math.round(y)]);
        return { path, end: { x, y, t, hit: 'split', vx, vy } };
      }
      if (t >= next) {
        path.push([Math.round(t), Math.round(x), Math.round(y)]);
        next += PATH_MS;
      }
      if (x < -300 || x > MAP.W + 300 || y > MAP.H + 60) return { path, end: { x, y, t, hit: 'gone' } };
      for (const o of orbs) {
        if (Math.hypot(o.x - x, o.y - y) < ORB.r + 6 && !grabs.some((g) => g.id === o.id)) grabs.push({ id: o.id, t: Math.round(t) });
      }
      for (const h of heroes) {
        if (h.id === skip && t < 250) continue;
        if (Math.hypot(h.x - x, h.y - HERO_MID - y) < HERO_R + 4) {
          path.push([Math.round(t), Math.round(x), Math.round(y)]);
          return { path, end: { x, y, t, hit: 'hero', hero: h.id, vx, vy } };
        }
      }
      if (terrain.solid(x, y)) {
        if (drilled < drill) {
          drilled += Math.hypot(vx, vy) * STEP;
          continue;
        }
        path.push([Math.round(t), Math.round(x), Math.round(y)]);
        return { path, end: { x, y, t, hit: 'ground', vx, vy } };
      }
    }
    return { path, end: { x, y, t, hit: 'gone' } };
  }

  // A hero's jump, from their feet at (x, y) with this speed: up and along until they land, bump into a
  // wall (they drop straight down) or a ceiling, or fall off the bottom. glide: the fastest they fall.
  // Returns the path (a point every PATH_MS), where they land, how long it took, and whether they fell.
  function hop(terrain, x, y, vx, vy, glide = 0) {
    const path = [[0, Math.round(x), Math.round(y)]];
    const tall = HERO_MID * 1.5; // the top of the hero (on their mount)
    let t = 0;
    let next = PATH_MS;
    while (t < 8000) {
      vy += JUMP.grav * STEP;
      if (glide && vy > glide) vy = glide;
      t += STEP * 1000;
      // Along: a wall at the body's height stops them (a low step doesn't: they land on it).
      const nx = x + vx * STEP;
      if (vx && (nx < 12 || nx > MAP.W - 12 || terrain.solid(nx, y - CLIMB - 2) || terrain.solid(nx, y - HERO_MID) || terrain.solid(nx, y - tall))) vx = 0;
      else x = nx;
      const ny = y + vy * STEP;
      if (vy < 0) {
        if (terrain.solid(x, ny - tall)) vy = 0; // a ceiling: bump, and down they come
        else y = ny;
      } else if (terrain.solid(x, ny) || terrain.solid(x, y)) {
        // Landed: stand on top of whatever they came down on.
        let top = terrain.groundBelow(x, Math.min(y, ny));
        let up = 0;
        while (top !== null && terrain.solid(x, top - 1) && up < 60) {
          top -= MAP.CELL;
          up += MAP.CELL;
        }
        y = top === null ? ny : top;
        path.push([Math.round(t), Math.round(x), Math.round(y)]);
        return { path, x, y, t: Math.round(t), fell: false };
      } else y = ny;
      if (t >= next) {
        path.push([Math.round(t), Math.round(x), Math.round(y)]);
        next += PATH_MS;
      }
      if (y > MAP.H + 80) return { path, x, y: MAP.H + 80, t: Math.round(t), fell: true };
    }
    return { path, x, y, t: Math.round(t), fell: y > MAP.H };
  }

  const Arty = {
    MAP, COLS, ROWS, GRAVITY, MAX_SPEED, WIND_ACCEL, HERO_R, HERO_MID, CLIMB, WALK_SPEED, STAMINA, HP, ANGLE_MIN, ANGLE_MAX,
    CHARGE_MS, KO_POINTS, WIN_POINTS, SUDDEN_STEP, SUDDEN_MAX, LAST_TURN, SPECIAL_MAX, SPECIAL_PER_DMG, SPECIAL_PER_HURT, SPECIAL_PER_TURN, SHOW_MS, TURNS, LEVELS,
    SHOTS, ITEMS, STYLES, stylesFor, JUMP, MOUNTS, ORB, ORBS, GHOST, SPRING, PORTAL, WATER, SLOWMO, SLOWMO_EXTRA, FFA_WIN_POINTS, ghostY, ghostAt, Terrain, seeded, launch, fly, hop, PATH_MS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Arty;
  else root.Arty = Arty;
})(typeof window !== 'undefined' ? window : globalThis);
