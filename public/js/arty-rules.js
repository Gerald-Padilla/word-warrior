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
  const HERO_R = 18; // how close a shot must come to a hero's middle to hit them
  const HERO_MID = 22; // a hero's middle is this far above their feet
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
  const SHOW_MS = 900; // after a shot lands, how long before the next turn

  // Game length (turns in all, before the team with more HP wins) and difficulty (wind and time to aim).
  const TURNS = { full: 30, one: 16 };
  const LEVELS = {
    easy: { wind: 5, turnMs: 25000 },
    normal: { wind: 10, turnMs: 20000 },
    hard: { wind: 16, turnMs: 15000 },
  };

  // Every class's shot, and its special (when SKILLS is on). dmg at the middle of the blast (half at its
  // edge), r: blast size, crater: hole it leaves (0: none), grav/wind: how much gravity and wind move it,
  // direct: damage multiplier for hitting a hero head on, count/spread: several at once (degrees apart),
  // gap: one after another (ms), drill: goes this far into the ground first, bounce: bounces this many
  // times (each bounce blows up), bolt/boltR: lightning that also strikes everyone within boltR across,
  // heal/healR: heals teammates near the blast, drain: heals the shooter by this share of damage,
  // grow: raises a mound instead of digging, teleport: the shooter lands where it hits.
  const SHOTS = {
    knight: {
      name: 'SWORD BEAM', shot: { kind: 'slash', dmg: 30, r: 60, crater: 40 },
      special: { name: 'HOLY BLADE', text: 'a huge blade of light: big blast, big hit', shot: { kind: 'slash', dmg: 58, r: 85, crater: 60, big: 1.8 } },
    },
    barbarian: {
      name: 'SPINNING AXE', shot: { kind: 'axe', dmg: 36, r: 55, crater: 50, grav: 1.25 },
      special: { name: 'EARTHQUAKE', text: 'a giant crater that drops everyone around it', shot: { kind: 'axe', dmg: 42, r: 95, crater: 135, grav: 1.25, big: 1.8 } },
    },
    wizard: {
      name: 'FIREBALL', shot: { kind: 'fireball', dmg: 30, r: 75, crater: 50 },
      special: { name: 'METEOR', text: 'a flaming rock with a huge blast', shot: { kind: 'meteor', dmg: 62, r: 110, crater: 90 } },
    },
    archer: {
      name: 'PIERCING ARROW', shot: { kind: 'arrow', dmg: 24, r: 45, crater: 28, grav: 0.85, wind: 0.6, direct: 1.7 },
      special: { name: 'ARROW RAIN', text: 'five arrows at once, fanned out', shot: { kind: 'arrow', dmg: 22, r: 45, crater: 28, grav: 0.85, wind: 0.6, direct: 1.5, count: 5, spread: 4 } },
    },
    rogue: {
      name: 'DAGGER VOLLEY', shot: { kind: 'dagger', dmg: 17, r: 40, crater: 26, count: 2, gap: 260 },
      special: { name: 'SHADOW STEP', text: 'a dagger that takes you with it: you land where it hits', shot: { kind: 'dagger', dmg: 26, r: 45, crater: 26, teleport: true } },
    },
    cleric: {
      name: 'HOLY LIGHT', shot: { kind: 'beam', dmg: 25, r: 60, crater: 36, heal: 15, healR: 90 },
      special: { name: 'SANCTUARY', text: 'heals teammates near the blast by 40', shot: { kind: 'beam', dmg: 30, r: 90, crater: 40, heal: 40, healR: 230, big: 1.5 } },
    },
    ninja: {
      name: 'SHURIKEN', shot: { kind: 'shuriken', dmg: 13, r: 40, crater: 22, count: 3, spread: 3 },
      special: { name: 'SHURIKEN STORM', text: 'six shurikens at once', shot: { kind: 'shuriken', dmg: 14, r: 40, crater: 22, count: 6, spread: 4 } },
    },
    necromancer: {
      name: 'SOUL BOLT', shot: { kind: 'soul', dmg: 28, r: 55, crater: 34, wind: 0 },
      special: { name: 'SOUL DRAIN', text: 'a heavy bolt that heals you by half the damage', shot: { kind: 'soul', dmg: 48, r: 65, crater: 40, wind: 0, drain: 0.5, big: 1.6 } },
    },
    druid: {
      name: 'THORN VINE', shot: { kind: 'thorn', dmg: 27, r: 50, crater: 34, drill: 90 },
      special: { name: 'OVERGROWTH', text: 'raises a mound of earth where it lands (cover, or a bridge)', shot: { kind: 'thorn', dmg: 24, r: 60, crater: 0, grow: 75 } },
    },
    pirate: {
      name: 'CANNONBALL', shot: { kind: 'cannon', dmg: 34, r: 68, crater: 52, grav: 1.2 },
      special: { name: 'CANNON BARRAGE', text: 'three cannonballs, one after another', shot: { kind: 'cannon', dmg: 30, r: 64, crater: 48, grav: 1.2, count: 3, gap: 380 } },
    },
    bard: {
      name: 'POWER CHORD', shot: { kind: 'notes', dmg: 19, r: 50, crater: 30, bounce: 1 },
      special: { name: 'ENCORE', text: 'bounces three times, blowing up each time', shot: { kind: 'notes', dmg: 22, r: 55, crater: 32, bounce: 3 } },
    },
    valkyrie: {
      name: 'STORM SPEAR', shot: { kind: 'spear', dmg: 28, r: 50, crater: 34, bolt: 16, boltR: 50 },
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
  ];

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

  // Ground cells: 0 air, 1 earth, 2 stone (towers), 3 earth grown by a Druid. `depth`: how far each cell
  // is below the surface it was made with (for its color).
  class Terrain {
    constructor(seed, style) {
      this.seed = seed;
      this.style = STYLES[style] ? style : 0;
      this.cells = new Uint8Array(COLS * ROWS);
      this.depth = new Uint8Array(COLS * ROWS);
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
      if (key === 'islands') {
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
        } else {
          // A great mountain in the middle: lob it, or tunnel through it.
          const rough = waves(0, [[8, 120], [3, 37]]);
          surface = (cx) => ROWS * (0.72 - 0.55 * Math.exp(-(((cx - COLS / 2) / 70) ** 2))) + rough(cx);
        }
        for (let cx = 0; cx < COLS; cx++) fill(cx, surface(cx), ROWS);
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
      // How deep each cell is below its surface, for the colors.
      for (let cx = 0; cx < COLS; cx++) {
        let run = 0;
        for (let cy = 0; cy < ROWS; cy++) {
          const i = cy * COLS + cx;
          if (C[i]) {
            this.depth[i] = Math.min(255, run);
            run += 1;
          } else run = 0;
        }
      }
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
          if (kind === 0) this.cells[i] = 0;
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
    // CLIMB if their feet are in the ground. false: a wall too high to step up; null: nothing below.
    standAt(x, y) {
      let top = y;
      while (top > y - CLIMB - MAP.CELL && this.solid(x, top - 1)) top -= MAP.CELL;
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

  // Flies one shell until it hits the ground, a hero or leaves the map. heroes: [{ id, x, y }] (feet);
  // `skip` is the shooter's id (they can't hit themselves in the first moment). Returns the path (a point
  // every PATH_MS) and how it ended: { x, y, t, hit: 'ground' | 'hero' | 'gone', hero, vx, vy }.
  const STEP = 1 / 240;
  const PATH_MS = 30;
  function fly(terrain, heroes, skip, s, def, wind) {
    let { x, y, vx, vy } = s;
    const grav = GRAVITY * (def.grav ?? 1);
    const push = WIND_ACCEL * wind * (def.wind ?? 1);
    const path = [[0, Math.round(x), Math.round(y)]];
    let t = 0;
    let next = PATH_MS;
    let drilled = 0;
    const drill = def.drill || 0;
    while (t < 14000) {
      vx += push * STEP;
      vy += grav * STEP;
      x += vx * STEP;
      y += vy * STEP;
      t += STEP * 1000;
      if (t >= next) {
        path.push([Math.round(t), Math.round(x), Math.round(y)]);
        next += PATH_MS;
      }
      if (x < -300 || x > MAP.W + 300 || y > MAP.H + 60) return { path, end: { x, y, t, hit: 'gone' } };
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

  const Arty = {
    MAP, COLS, ROWS, GRAVITY, MAX_SPEED, WIND_ACCEL, HERO_R, HERO_MID, CLIMB, WALK_SPEED, STAMINA, HP, ANGLE_MIN, ANGLE_MAX,
    CHARGE_MS, KO_POINTS, WIN_POINTS, SPECIAL_MAX, SPECIAL_PER_DMG, SPECIAL_PER_HURT, SPECIAL_PER_TURN, SHOW_MS, TURNS, LEVELS,
    SHOTS, ITEMS, STYLES, Terrain, seeded, launch, fly, PATH_MS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Arty;
  else root.Arty = Arty;
})(typeof window !== 'undefined' ? window : globalThis);
