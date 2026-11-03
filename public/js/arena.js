// The battlefield: pixel background, falling monsters with words, heroes, attacks and effects.
// Used by both the host screen and phones. A team battle is a different scene: two armies face off and
// fling word-carrying attacks at each other (see the "team battle" sections).
(function () {
  const { heroSprite, petSprite, monsterSprite, axeSprite, powerSprite, bossSprite, specialSprite } = window.Art;
  const { COLORS, MONSTERS, POWERS, SPECIAL_ART } = window.Art;
  const { TEAMS, EMOTES } = window.WW;

  // One look per round, so a game goes from a sunny morning to dusk to a burning night, then the boss's lair.
  // orb: the sun or moon (x, y and r are shares of the sky). ambient: what moves in the sky.
  const THEMES = {
    slime: {
      sky: ['#3d7fd6', '#4f93e0', '#64a7ea', '#7dbbf0', '#9ccff4', '#c4e6f7'],
      orb: { sun: true, color: '#fff3b0', rim: '#ffd23f', x: 0.72, y: 0.16, r: 0.07 },
      stars: 0, ambient: ['clouds'], cloud: '#ffffff', cloudShade: '#d7e9f7',
      mountain: '#6f8fc4', hill: '#4e8a52', castle: '#4f4a68', window: '#ffd23f',
      grass: '#3f9b3d', grassLight: '#68c74f', dirt: '#6b4422', dirtDark: '#4a2e14',
    },
    bat: {
      sky: ['#24163f', '#3f1f58', '#6b2a60', '#a83f5c', '#e0664a', '#f7a04a'],
      orb: { sun: true, color: '#ffd27a', rim: '#ff8a3c', x: 0.7, y: 0.62, r: 0.11 },
      stars: 0.35, ambient: ['clouds', 'bats'], cloud: '#e88a7a', cloudShade: '#b85f6a',
      mountain: '#3a1f45', hill: '#24162e', castle: '#1a0f22', window: '#ffd23f',
      grass: '#2f7d4a', grassLight: '#4fa865', dirt: '#3e2c22', dirtDark: '#2a1c14',
    },
    skull: {
      sky: ['#0c0410', '#1e0812', '#3a0c10', '#5e140e', '#8a240e', '#c4481a'],
      orb: { color: '#ff9a3c', rim: '#d4671f', x: 0.72, y: 0.2, r: 0.07 },
      stars: 1, ambient: ['embers'], glow: '#ff5a1f',
      mountain: '#2a0c0c', hill: '#1e0808', castle: '#120404', window: '#ff5a1f',
      grass: '#5a3a2a', grassLight: '#7d4f30', dirt: '#3a1a10', dirtDark: '#24100a',
    },
    boss: {
      sky: ['#040106', '#10030a', '#24050c', '#40080c', '#6e1208', '#b02c0a'],
      orb: null,
      stars: 0.5, ambient: ['embers', 'lightning'], glow: '#ff3b1f', volcano: true,
      mountain: '#1c0707', hill: '#120404', castle: '#080202', window: '#ff3b1f',
      grass: '#3a1a10', grassLight: '#ff5a1f', dirt: '#241008', dirtDark: '#150804',
    },
  };

  const ATTACK = {
    knight: 'slash', wizard: 'fireball', archer: 'arrow', rogue: 'dagger', cleric: 'beam', barbarian: 'axe',
    ninja: 'shuriken', necromancer: 'soul', druid: 'thorn', pirate: 'cannon', bard: 'notes', valkyrie: 'spear',
  };
  // Trail left behind each kind of attack in flight.
  const TRAIL = { soul: '#7dff6b', thorn: '#4fa865', cannon: '#8691a6', spear: '#fff6b0', shuriken: '#d5dbe6' };

  // Class skills: how each one looks, when its hits land (ms after it's cast, for the i-th target) and the
  // glow a boost leaves on the hero until it's used up.
  const SKILL_FX = {
    knight: 'rally', barbarian: 'berserk', cleric: 'favor', druid: 'grow', wizard: 'meteor', rogue: 'backstab',
    archer: 'arrows', ninja: 'shuriken', pirate: 'cannon', valkyrie: 'thunder', necromancer: 'raise', bard: 'encore',
  };
  const IMPACT = {
    meteor: (i) => 700 + i * 220, arrows: (i) => 640 + i * 110, backstab: (i) => 380 + i * 230, shuriken: (i) => 560 + i * 90,
    cannon: (i) => 560 + i * 180, thunder: (i) => 430 + i * 90, raise: (i) => 650 + i * 160,
  };
  const impactAt = (style, i) => (IMPACT[style] || ((n) => 500 + n * 120))(i);
  const AURA = { rally: '#ffd23f', berserk: '#ff4d4d', favor: '#fff6b0', grow: '#6fe08b' };

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  function seeded(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class Arena {
    // stage: the small preview in the hero creator - one big hero on the left, monsters to hit on the right.
    constructor(canvas, { mode = 'host', now = () => Date.now(), selfId = null, stage = false } = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.mode = mode;
      this.now = now;
      this.selfId = selfId;
      this.stage = stage;
      this.typo = false; // phone: what you typed has gone off course after the matching part in `typed`
      this.players = new Map();
      this.heroPos = new Map();
      this.heroHop = new Map();
      this.words = new Map();
      this.dying = [];
      this.projectiles = [];
      this.particles = [];
      this.texts = [];
      this.monster = 'slime';
      this.typed = '';
      this.reserveRight = 0;
      this.reserveTop = 0;
      this.teamMode = false; // team battle
      this.myTeam = null; // phone: your team (drawn on the near side); host: red is on the left
      this.effects = [{}, {}]; // team battle power-ups: per team, name -> active until (server ms)
      this.geo = null; // team battle layout, from layoutDuel()
      this.flashAt = -1e9;
      this.boss = null; // boss round: { hp, max, down } from the server, plus hitAt / downAt here
      this.iceUntil = 0; // special words: an ice word has slowed everything until then (server ms)
      this.shakeUntil = 0;
      this.shakePow = 0;
      this.callouts = []; // big words across the field ("ON FIRE!")
      this.emotes = new Map(); // playerId -> { e, t0 }
      this.auraAt = new Map(); // playerId -> last streak-flame particle time
      this.boltAt = 0; // boss lair lightning
      this.skillFx = []; // class skills playing out (see castSkill)
      this.skillHits = new Map(); // word or attack id -> the skill target that will hit it
      this.cutins = []; // fighting-game banners naming the hero and their skill
      this.auras = new Map(); // playerId -> { left, color }: a skill boost on their next words
      this.hiddenUntil = new Map(); // playerId -> time: a Rogue mid-Backstab is out of sight
      this.onHit = null;
      this.onEscape = null;
      this.lastFrame = performance.now();
      new ResizeObserver(() => this.resize()).observe(canvas);
      this.resize();
      document.fonts?.ready.then(() => this.resize());
      requestAnimationFrame(this.loop);
    }

    // ---- setup ---------------------------------------------------------
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      this.dpr = dpr;
      const W = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
      const H = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
      this.canvas.width = W;
      this.canvas.height = H;
      this.W = W;
      this.H = H;
      this.landscape = W > H * 1.15;
      if (this.stage) {
        this.U = Math.max(2, Math.round(H / 26));
        this.fontPx = Math.max(16, Math.round((this.U * 2) / 8) * 8);
        this.groundY = H - 3 * this.U;
      } else if (this.mode === 'host') {
        this.U = Math.max(2, Math.round(H / 170));
        this.fontPx = Math.max(16, Math.round(H / 46 / 8) * 8);
        this.groundY = H - 9 * this.U;
      } else if (this.landscape) {
        // A phone on its side or a PC window: size things off the height so heroes don't fill the screen.
        this.U = Math.max(2, Math.round(H / 90));
        this.fontPx = Math.max(16, Math.round(Math.max(13 * dpr, this.U * 3.2) / 8) * 8);
        this.groundY = H - 5 * this.U;
      } else {
        this.U = Math.max(2, Math.round(Math.min(W / 62, H / 52)));
        this.fontPx = Math.max(16, Math.round((13 * dpr) / 8) * 8);
        this.groundY = H - 5 * this.U;
      }
      this.feetY = this.groundY + 3 * this.U;
      this.buildBackground();
      this.layoutHeroes();
    }

    setTheme(monster) {
      if (!MONSTERS[monster] || monster === this.monster) return;
      this.monster = monster;
      this.buildBackground();
    }

    setReserveRight(cssPx) {
      this.reserveRight = cssPx * (this.dpr || 1);
    }

    // Words enter the field below this line (e.g. under the host's top bar).
    setReserveTop(cssPx) {
      const px = cssPx * (this.dpr || 1);
      if (px === this.reserveTop) return;
      this.reserveTop = px;
      this.layoutHeroes();
    }

    setTeamMode(on, myTeam = null) {
      if (on === this.teamMode && myTeam === this.myTeam) return;
      this.teamMode = on;
      this.myTeam = myTeam;
      this.layoutHeroes();
    }

    setEffects(effects) {
      this.effects = effects || [{}, {}];
    }

    effectOn(team, name) {
      return (this.effects[team]?.[name] || 0) > this.now();
    }

    buildBackground() {
      const U = this.U;
      const th = THEMES[this.monster] || THEMES.slime;
      const bw = Math.ceil(this.W / U);
      const bh = Math.ceil(this.H / U);
      const gr = Math.floor(this.groundY / U);
      const c = document.createElement('canvas');
      c.width = bw;
      c.height = bh;
      const g = c.getContext('2d');
      const rnd = seeded(1337);

      // Sky in dithered bands.
      const n = th.sky.length;
      for (let y = 0; y < gr; y++) {
        const t = (y / gr) * n;
        const i = Math.min(n - 1, Math.floor(t));
        g.fillStyle = th.sky[i];
        g.fillRect(0, y, bw, 1);
        if (th.sky[i + 1] && t - i > 0.7) {
          g.fillStyle = th.sky[i + 1];
          for (let x = y % 2; x < bw; x += 2) g.fillRect(x, y, 1, 1);
        }
      }

      // Stars (none by day, a few at dusk); some twinkle at runtime.
      this.stars = [];
      const starCount = Math.round(((bw * gr) / 70) * th.stars);
      for (let i = 0; i < starCount; i++) {
        const x = Math.floor(rnd() * bw);
        const y = Math.floor(rnd() * gr * (th.stars < 1 ? 0.35 : 0.65));
        g.fillStyle = rnd() < 0.8 ? 'rgba(255,255,255,0.55)' : '#ffe9a8';
        g.fillRect(x, y, 1, 1);
        if (rnd() < 0.12) this.stars.push({ x, y, phase: rnd() * 6 });
      }

      // Sun or moon.
      const orb = th.orb;
      if (orb) {
        const r = Math.max(4, Math.round(Math.min(bw, gr) * orb.r));
        const mx = Math.floor(bw * (this.mode === 'host' ? orb.x : Math.min(0.85, orb.x + 0.08)));
        const my = Math.floor(gr * orb.y);
        if (orb.sun) {
          // A soft halo, then the disc.
          g.fillStyle = orb.rim;
          g.globalAlpha = 0.25;
          for (let dy = -r - 2; dy <= r + 2; dy++) {
            for (let dx = -r - 2; dx <= r + 2; dx++) if (dx * dx + dy * dy <= (r + 2) * (r + 2) && (dx + dy) % 2 === 0) g.fillRect(mx + dx, my + dy, 1, 1);
          }
          g.globalAlpha = 1;
        }
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy > r * r) continue;
            g.fillStyle = dx * dx + dy * dy > (r - 1) * (r - 1) && (orb.sun || dx > 0) ? orb.rim : orb.color;
            g.fillRect(mx + dx, my + dy, 1, 1);
          }
        }
        if (!orb.sun) {
          g.fillStyle = orb.rim;
          g.fillRect(mx - Math.round(r / 3), my - Math.round(r / 4), 2, 2);
          g.fillRect(mx + Math.round(r / 4), my + Math.round(r / 3), 2, 1);
          g.fillRect(mx - Math.round(r / 6), my + Math.round(r / 2), 1, 1);
        }
      }

      // A glow along the horizon on fiery nights.
      if (th.glow) {
        g.fillStyle = th.glow;
        for (let y = Math.round(gr * 0.6); y < gr; y++) {
          g.globalAlpha = ((y - gr * 0.6) / (gr * 0.4)) * 0.35;
          for (let x = y % 2; x < bw; x += 2) g.fillRect(x, y, 1, 1);
        }
        g.globalAlpha = 1;
      }

      // Mountains; the boss's lair has a volcano in the middle.
      const p1 = rnd() * 6;
      const p2 = rnd() * 6;
      g.fillStyle = th.mountain;
      for (let x = 0; x < bw; x++) {
        let h = Math.round(gr * 0.32 + Math.sin(x * 0.045 + p1) * gr * 0.09 + Math.sin(x * 0.13 + p2) * gr * 0.035);
        if (th.volcano) h = Math.max(h, Math.round(gr * 0.62 - Math.abs(x - bw / 2) * 1.1));
        g.fillRect(x, gr - h, 1, h);
      }
      if (th.volcano) {
        // Lava running down from the crater.
        const top = Math.round(gr * 0.38);
        g.fillStyle = th.glow;
        for (let y = top; y < gr; y++) {
          const spread = (y - top) * 0.25;
          for (const off of [-spread, spread * 0.6]) if (rnd() < 0.8) g.fillRect(Math.round(bw / 2 + off + Math.sin(y * 0.3) * 1.5), y, 1, 1);
        }
        g.fillStyle = '#ffd23f';
        g.fillRect(Math.round(bw / 2) - 2, top, 4, 1);
      }

      // Castle silhouette with lit windows.
      const s = Math.max(1, Math.round(gr / 70));
      const cx = Math.floor(bw * 0.28);
      const base = gr - Math.round(gr * 0.1);
      const keepW = 16 * s;
      const keepH = 16 * s;
      const towerW = 6 * s;
      const towerH = 24 * s;
      g.fillStyle = th.castle;
      g.fillRect(cx - keepW / 2, base - keepH, keepW, keepH);
      for (const tx of [cx - keepW / 2 - towerW + s, cx + keepW / 2 - s]) {
        g.fillRect(tx, base - towerH, towerW, towerH);
        for (let k = 0; k < towerW; k += 2 * s) g.fillRect(tx + k, base - towerH - 2 * s, s, 2 * s);
        g.fillStyle = th.window;
        g.fillRect(tx + Math.floor(towerW / 2) - Math.floor(s / 2), base - towerH + 5 * s, s, 2 * s);
        g.fillStyle = th.castle;
      }
      for (let k = 0; k < keepW; k += 2 * s) g.fillRect(cx - keepW / 2 + k, base - keepH - 2 * s, s, 2 * s);
      g.fillRect(cx - s, base - keepH - 8 * s, 2 * s, 6 * s); // spire
      g.fillStyle = th.window;
      g.fillRect(cx - 4 * s, base - keepH + 5 * s, s, 2 * s);
      g.fillRect(cx + 3 * s, base - keepH + 5 * s, s, 2 * s);
      g.fillRect(cx - s, base - 5 * s, 2 * s, 5 * s);

      // Near hills.
      const p3 = rnd() * 6;
      g.fillStyle = th.hill;
      for (let x = 0; x < bw; x++) {
        const h = Math.round(gr * 0.1 + Math.sin(x * 0.07 + p3) * gr * 0.035);
        g.fillRect(x, gr - h, 1, h);
      }

      // Ground: grass lip, then dirt with specks.
      g.fillStyle = th.dirt;
      g.fillRect(0, gr, bw, bh - gr);
      g.fillStyle = th.grass;
      g.fillRect(0, gr, bw, 2);
      g.fillStyle = th.grassLight;
      for (let x = 0; x < bw; x++) {
        if (rnd() < 0.45) g.fillRect(x, gr - 1, 1, 1);
        if (rnd() < 0.3) g.fillRect(x, gr, 1, 1);
      }
      g.fillStyle = th.dirtDark;
      for (let i = 0; i < bw * (bh - gr) * 0.12; i++) g.fillRect(Math.floor(rnd() * bw), gr + 2 + Math.floor(rnd() * (bh - gr)), 1, 1);

      this.bg = c;
      // What drifts across the sky, in background pixels.
      this.th = th;
      this.clouds = th.ambient.includes('clouds')
        ? Array.from({ length: 5 }, () => ({ x: rnd() * bw, y: 2 + rnd() * gr * 0.3, w: 8 + Math.floor(rnd() * 10), speed: 0.5 + rnd() * 0.8 }))
        : [];
      this.skyBats = th.ambient.includes('bats')
        ? Array.from({ length: 6 }, () => ({ x: rnd(), y: 0.08 + rnd() * 0.3, speed: 0.012 + rnd() * 0.02, phase: rnd() * 6 }))
        : [];
      this.embers = [];
    }

    // Clouds, distant bats, rising embers and lightning: behind the words, in front of the sky.
    drawAmbient(t, dt) {
      const ctx = this.ctx;
      const U = this.U;
      const th = this.th;
      const bw = this.bg.width;
      for (const c of this.clouds) {
        const x = ((c.x + (t / 1000) * c.speed) % (bw + c.w * 2)) - c.w;
        const y = Math.round(c.y);
        ctx.fillStyle = th.cloudShade;
        ctx.fillRect(Math.round(x) * U, (y + 2) * U, c.w * U, U);
        ctx.fillStyle = th.cloud;
        ctx.fillRect(Math.round(x) * U, (y + 1) * U, c.w * U, U);
        ctx.fillRect(Math.round(x + 2) * U, y * U, Math.max(2, c.w - 5) * U, U);
        ctx.fillRect(Math.round(x + 4) * U, (y - 1) * U, Math.max(1, Math.floor(c.w / 3)) * U, U);
      }
      for (const b of this.skyBats) {
        const x = (((b.x + (t / 1000) * b.speed) % 1.2) - 0.1) * this.W;
        const y = b.y * this.groundY + Math.sin(t / 400 + b.phase) * U * 2;
        const up = Math.floor(t / 140 + b.phase * 3) % 2 ? -1 : 1;
        ctx.fillStyle = '#1a0f22';
        this.block(x, y, U, '#1a0f22');
        for (const s of [-1, 1]) {
          this.block(x + s * U, y, U, '#1a0f22');
          this.block(x + s * 2 * U, y + up * U, U, '#1a0f22');
        }
      }
      if (th.ambient.includes('embers')) {
        if (Math.random() < dt / (this.mode === 'host' ? 40 : 90)) {
          this.embers.push({ x: rand(0, this.W), y: this.groundY, vy: -rand(0.02, 0.06) * U, life: rand(2200, 3800), t0: t, sway: rand(0, 6) });
        }
        this.embers = this.embers.filter((e) => t - e.t0 < e.life);
        for (const e of this.embers) {
          const k = (t - e.t0) / e.life;
          e.y += e.vy * dt;
          ctx.globalAlpha = Math.min(1, (1 - k) * 1.5);
          ctx.fillStyle = k < 0.4 ? '#ffd23f' : k < 0.75 ? '#ff7b1c' : '#b02c0a';
          ctx.fillRect(Math.round(e.x + Math.sin(t / 500 + e.sway) * U * 3), Math.round(e.y), U, U);
        }
        ctx.globalAlpha = 1;
      }
      if (th.ambient.includes('lightning')) {
        if (t >= (this.nextBoltAt || 0)) {
          this.boltAt = t;
          this.nextBoltAt = t + rand(5000, 11000);
          const pts = [];
          let x = rand(0.1, 0.9) * this.W;
          for (let y = 0; y < this.groundY * 0.55; y += U * 3) {
            x += rand(-2.5, 2.5) * U;
            pts.push([x, y]);
          }
          this.bolt = pts;
        }
        if (t - this.boltAt < 160 && this.bolt) {
          ctx.globalAlpha = Math.floor((t - this.boltAt) / 40) % 2 ? 0.08 : 0.22;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, this.W, this.groundY);
          ctx.globalAlpha = 1;
          for (const [x, y] of this.bolt) this.block(x, y, U * 1.5, '#fff6d0');
        }
      }
    }

    // ---- players -------------------------------------------------------
    setPlayers(list) {
      const seen = new Set();
      for (const p of list) {
        seen.add(p.id);
        const isNew = !this.players.has(p.id);
        this.players.set(p.id, p);
        if (isNew && this.mode === 'host' && this.ready) this.pendingSparkle = [...(this.pendingSparkle || []), p.id];
      }
      for (const id of [...this.players.keys()]) if (!seen.has(id)) this.players.delete(id);
      this.layoutHeroes();
      this.ready = true;
      for (const id of this.pendingSparkle || []) {
        const pos = this.heroPos.get(id);
        if (pos) this.sparkle(pos.x, this.feetY - 8 * pos.hu, this.colorOf(id).Q, 18);
      }
      this.pendingSparkle = [];
    }

    layoutHeroes() {
      this.heroPos.clear();
      if (!this.W) return;
      if (this.stage) {
        for (const id of this.players.keys()) this.heroPos.set(id, { x: this.W * 0.27, hu: this.U });
        return;
      }
      if (this.teamMode) {
        this.layoutDuel();
        return;
      }
      if (this.mode === 'phone') {
        this.layoutCrowd([...this.players.keys()]);
        return;
      }
      const list = [...this.players.values()];
      const n = list.length;
      if (!n) return;
      const avail = this.W * 0.96;
      let hu = this.U;
      while (hu > 2 && n * 20 * hu > avail) hu--;
      const spacing = Math.min(avail / n, 30 * hu);
      const start = (this.W - spacing * n) / 2 + spacing / 2;
      list.forEach((p, i) => this.heroPos.set(p.id, { x: start + i * spacing, hu, spacing }));
    }

    // Phones: your hero stands big in the middle; the others crowd in smaller on both sides,
    // nearest the middle first. Others go in first so your hero is drawn on top.
    layoutCrowd(ids) {
      const U = this.U;
      const others = ids.filter((id) => id !== this.selfId);
      const gap = 9 * U;
      const sideW = this.W / 2 - gap - U;
      const perSide = Math.ceil(others.length / 2);
      let hu = Math.max(2, Math.round(U / 2));
      let spacing = perSide ? Math.min(18 * hu, sideW / perSide) : 0;
      while (hu > 2 && spacing < 11 * hu) {
        hu--;
        spacing = Math.min(18 * hu, sideW / perSide);
      }
      others.forEach((id, i) => {
        const side = i % 2 ? 1 : -1;
        this.heroPos.set(id, { x: this.W / 2 + side * (gap + spacing * (Math.floor(i / 2) + 0.5)), hu });
      });
      if (this.selfId && ids.includes(this.selfId)) this.heroPos.set(this.selfId, { x: this.W / 2, hu: U });
    }

    // ---- team battle: layout ---------------------------------------------
    // Two armies face each other. Side-on (big screen, landscape) your team - red on the big screen -
    // stands on the left and the enemy on the right, mirrored to face you. On a phone held upright the
    // enemy lines a rampart across the top and your team stands on the ground below.
    layoutDuel() {
      const { W, U } = this;
      const near = this.myTeam ?? 0;
      const g = { near, far: 1 - near, horizontal: this.mode === 'host' || this.landscape };
      const list = [...this.players.values()];
      const sides = [0, 1].map((t) => list.filter((p) => p.team === t));
      const fp = this.fontPx;
      g.plateH = Math.round(fp * 1.8);
      g.gap = Math.round(fp / 2);

      if (g.horizontal) {
        const zoneW = W * (this.mode === 'host' ? 0.2 : 0.24);
        const most = Math.max(1, ...sides.map((s) => s.length));
        // Up to three ranks; back ranks stand a little higher and are drawn first.
        let hu = U;
        const perRow = () => Math.max(1, Math.floor((zoneW * 0.9) / (11 * hu)));
        while (hu > 2 && Math.ceil(most / perRow()) > 3) hu--;
        const cols = perRow();
        const step = (zoneW * 0.9) / cols;
        const placed = [];
        for (const t of [0, 1]) {
          const left = t === near;
          const order = [...sides[t]].sort((a, b) => (b.id === this.selfId) - (a.id === this.selfId));
          order.forEach((p, i) => {
            const row = Math.floor(i / cols);
            const fromFront = (i % cols + 0.5 + (row % 2) * 0.35) * step;
            const x = left ? zoneW * 0.95 - fromFront : W - zoneW * 0.95 + fromFront;
            const size = p.id === this.selfId ? Math.round(hu * 1.3) : hu;
            placed.push([p.id, { x, hu: size, feet: this.feetY - row * 5 * hu, flip: !left, row }]);
          });
        }
        placed.sort((a, b) => b[1].row - a[1].row || (a[0] === this.selfId) - (b[0] === this.selfId));
        for (const [id, pos] of placed) this.heroPos.set(id, pos);
        g.zoneW = zoneW;
        g.armyHu = hu;
        g.front = [0, 1].map((t) => (t === near ? zoneW : W - zoneW));
        // Attack words sit in rows across the top of each team's half; attacks cruise below them
        // (lanes are worked out each frame, once we know how many rows the attack words need).
        g.top = this.reserveTop + 2 * U;
        g.chest = this.feetY - 10 * hu;
        g.laneFloor = this.feetY - 30 * hu;
        this.setLanes(g, 1);
      } else {
        // Upright phone: the enemy on a rampart along the top.
        const farIds = sides[g.far].map((p) => p.id);
        let huF = Math.max(2, Math.round(U * 0.45));
        const avail = W * 0.94;
        while (huF > 2 && farIds.length * 12 * huF > avail) huF--;
        const spacing = farIds.length ? Math.min(18 * huF, avail / farIds.length) : 0;
        g.bandTop = this.reserveTop;
        g.bandBottom = this.reserveTop + 20 * huF;
        farIds.forEach((id, i) => {
          const x = (W - spacing * farIds.length) / 2 + spacing * (i + 0.5);
          this.heroPos.set(id, { x, hu: huF, feet: g.bandBottom - 2 * huF });
        });
        this.layoutCrowd(sides[g.near].map((p) => p.id));
        g.huF = huF;
        g.chest = this.feetY - 9 * U;
        g.farChest = g.bandBottom - 10 * huF;
        // Your attack words sit in rows just above your team's heads.
        g.slotBottom = this.feetY - 17 * U - g.gap;
      }
      this.geo = g;
    }

    colorOf(id) {
      const p = this.players.get(id);
      return COLORS[p ? p.color : 0] || COLORS[0];
    }

    heroOrigin(id) {
      const pos = this.heroPos.get(id);
      if (pos) return { x: pos.x, y: (pos.feet ?? this.feetY) - 13 * pos.hu };
      // Phones: other heroes attack from off-screen below.
      return { x: ((hash(id) % 1000) / 1000) * this.W * 0.9 + this.W * 0.05, y: this.H + 4 * this.U };
    }

    // Middle of a team's army, where attacks land.
    armyPoint(team) {
      const g = this.geo;
      const own = [...this.heroPos.entries()].filter(([id]) => this.players.get(id)?.team === team);
      if (own.length) {
        const x = own.reduce((s, [, p]) => s + p.x, 0) / own.length;
        const nearSide = team === g.near;
        if (!g.horizontal) return { x, y: nearSide ? g.chest : g.farChest };
        return { x: nearSide ? Math.max(x, g.front[team] - g.zoneW / 2) : Math.min(x, g.front[team] + g.zoneW / 2), y: g.chest };
      }
      if (!g.horizontal) return { x: this.W / 2, y: team === g.near ? g.chest : g.farChest };
      return { x: team === g.near ? g.zoneW / 2 : this.W - g.zoneW / 2, y: g.chest };
    }

    // ---- words ---------------------------------------------------------
    setWords(list) {
      this.words.clear();
      for (const w of list) this.words.set(w.id, w);
    }

    addWord(w) {
      this.words.set(w.id, w);
    }

    layoutWord(w, now) {
      const U = this.U;
      const spr = monsterSprite(this.monster, 0);
      const mw = spr.width * U;
      const mh = spr.height * U;
      const fp = this.fontPx;
      const plateW = w.text.length * fp + fp;
      const plateH = Math.round(fp * 1.8);
      const stackH = mh + U + plateH;
      const p = (now - w.spawn) / w.dur;
      const top = lerp(this.reserveTop - stackH, this.groundY - stackH, p);
      const fieldW = Math.max(this.W * 0.4, this.W - this.reserveRight);
      const half = Math.max(mw, plateW) / 2 + U;
      let cx = half * 2 > fieldW ? fieldW / 2 : clamp(w.x * fieldW, half, fieldW - half);
      if (this.monster === 'bat') cx += Math.sin(now / 280 + w.id) * U * 2;
      if (this.monster === 'skull') cx += Math.sin(now / 520 + w.id) * U * 1.5;
      if (this.monster === 'boss') cx += Math.sin(now / 360 + w.id) * U * 1.5;
      return { p, cx, top, mw, mh, plateW, plateH, cy: top + mh / 2, py: top + mh + U };
    }

    // k: the server's kill event (points, plus streak multiplier, perk, special word, bomb blast).
    kill(wordId, playerId, points, k = {}) {
      const w = this.words.get(wordId);
      if (!w) return;
      this.words.delete(wordId);
      const L = this.layoutWord(w, this.now());
      const color = this.colorOf(playerId);
      const dying = { w, L, color, t0: performance.now() };
      this.dying.push(dying);
      const player = this.players.get(playerId);
      const showName = this.mode === 'host' || playerId !== this.selfId;
      const tags = [];
      if (k.special === 'gold') tags.push('GOLD x3');
      if (k.mult > 1) tags.push(`x${k.mult} STREAK`);
      if (k.perk) tags.push('PERK');
      if (k.boosted) tags.push('BOOST');
      if (k.skill) tags.push('SKILL');
      const land = () => {
        this.dying = this.dying.filter((d) => d !== dying);
        this.explode(L.cx, L.cy, color);
        this.floatText(L.cx, L.top, `+${points}`, k.special === 'gold' ? '#ffd23f' : color.Q, showName && player ? player.name : null, tags.join(' '));
        if (w.text.length >= 9 || k.special) this.shake(k.special === 'bomb' ? 3 : 1.5, 260);
        if (k.special === 'bomb') {
          for (let i = 0; i < 3; i++) this.particles.push({ ring: true, x: L.cx, y: L.cy, t0: performance.now() + i * 90, life: 420, color: ['#ffd23f', '#ff7b1c', '#ffffff'][i] });
          this.flash('#ff7b1c');
        }
        if (k.special === 'ice') this.flash('#7fd4ff');
        if (this.onHit) this.onHit(playerId);
      };
      if (k.boosted) this.useBoost(playerId);
      // A bomb's blast takes everything at once; no attack flies for those.
      if (k.bomb) {
        land();
        return;
      }
      // A skill's own effect delivers this hit (see castSkill); the word holds still until it lands.
      const tg = k.skill && this.skillHits.get(wordId);
      if (tg) {
        dying.held = true;
        tg.pos = { x: L.cx, y: L.cy };
        tg.onImpact = land;
        return;
      }
      this.heroHop.set(playerId, performance.now());
      this.launch(player ? player.cls : 'knight', this.heroOrigin(playerId), { x: L.cx, y: L.cy }, color, land);
    }

    // ---- boss round, special words, juice ---------------------------------
    setBoss(b) {
      if (!b) {
        this.boss = null;
        return;
      }
      this.boss = { ...(this.boss || {}), ...b };
    }

    bossHit(hp, dmg) {
      if (!this.boss) return;
      this.boss.hp = hp;
      this.boss.hitAt = performance.now();
      const B = this.bossLayout();
      if (!B) return;
      this.sparkle(B.cx + rand(-0.3, 0.3) * B.w, B.cy + rand(-0.2, 0.3) * B.h, '#ffd23f', 10);
      this.floatText(B.cx + rand(-0.25, 0.25) * B.w, B.y + B.h * 0.3, `-${dmg}`, '#ff6b7a', null);
    }

    bossDown() {
      if (!this.boss) return;
      this.boss.hp = 0;
      this.boss.down = true;
      this.boss.downAt = performance.now();
      const B = this.bossLayout();
      if (B) {
        for (let i = 0; i < 6; i++) {
          setTimeout(() => this.explode(B.cx + rand(-0.4, 0.4) * B.w, B.cy + rand(-0.3, 0.3) * B.h, { Q: '#ffd23f', P: '#ff7b1c' }), i * 180);
        }
      }
      this.shake(5, 1200);
      this.flash('#ffffff');
      this.clearWords();
    }

    setIce(until) {
      this.iceUntil = until || 0;
    }

    shake(pow, ms) {
      const t = performance.now();
      this.shakePow = Math.max(t < this.shakeUntil ? this.shakePow : 0, pow);
      this.shakeUntil = Math.max(this.shakeUntil, t + ms);
    }

    // A big word across the middle of the field for a moment.
    // Callouts that overlap in time stack in rows instead of printing over each other.
    callout(text, color, sub) {
      const t = performance.now();
      this.callouts = this.callouts.filter((c) => t - c.t0 < 1500);
      let row = 0;
      while (this.callouts.some((c) => c.row === row)) row++;
      if (row > 2) {
        this.callouts.shift();
        row = 0;
        while (this.callouts.some((c) => c.row === row)) row++;
      }
      this.callouts.push({ text, color, sub, row, t0: t });
    }

    emote(playerId, e) {
      this.emotes.set(playerId, { e, t0: performance.now() });
    }

    // ---- class skills ----------------------------------------------------
    // c: the server's skill:cast ({ id, skill, name, targets, souls, boost }), sent just before the hits.
    // A banner names the hero, the field dims around them, and the skill's own effect travels from the
    // hero to each target; the hits (word:kill / duel:block with `skill`) wait for it to arrive.
    castSkill(c, desc) {
      const t0 = performance.now();
      const style = SKILL_FX[c.skill] || 'rally';
      const fx = { style, by: c.id, t0, souls: c.souls || 0, targets: [], seed: hash(`${c.id}:${t0}`) };
      (c.targets || []).forEach((id, i) => {
        const w = this.words.get(id);
        const L = w && (w.kind ? this.duelPos(w, this.now()) : this.layoutWord(w, this.now()));
        const tg = { id, i, impact: t0 + impactAt(style, i), pos: L ? { x: L.cx, y: L.cy } : null, onImpact: null, done: false };
        fx.targets.push(tg);
        this.skillHits.set(id, tg);
      });
      const last = fx.targets.length ? fx.targets[fx.targets.length - 1].impact - t0 : 0;
      fx.end = t0 + Math.max(1300, last + 600, fx.souls ? 900 + fx.souls * 160 : 0);
      this.skillFx.push(fx);
      if (c.boost > 0) this.auras.set(c.id, { left: c.boost, color: AURA[style] || '#7fd4ff' });
      if (style === 'backstab') {
        this.hiddenUntil.set(c.id, t0 + last + 250);
        const o = this.heroOrigin(c.id);
        this.puff(o.x, o.y + 6 * this.U, ['#3d3550', '#5a4f73', '#1b1426'], 18);
      }
      this.heroHop.set(c.id, t0);
      const p = this.players.get(c.id);
      this.cutins = this.cutins.filter((x) => t0 - x.t0 < 1300).slice(-1);
      this.cutins.push({ by: c.id, name: c.name, desc, hero: p ? p.name : '', color: this.colorOf(c.id), t0 });
    }

    // A boosted word was typed: one less left on the hero's glow.
    useBoost(playerId) {
      const a = this.auras.get(playerId);
      if (!a) return;
      a.left -= 1;
      if (a.left <= 0) this.auras.delete(playerId);
    }

    // What the skill scored, over the hero's head once its effect has played.
    skillTotal(playerId, total) {
      if (!total) return;
      setTimeout(() => {
        const o = this.heroOrigin(playerId);
        this.floatText(o.x, o.y - 10 * this.U, `+${total}`, '#7fd4ff', null, 'SKILL');
      }, 650);
    }

    targetPos(tg) {
      if (tg.pos) return tg.pos;
      const w = this.words.get(tg.id);
      const L = w && (w.kind ? this.duelPos(w, this.now()) : this.layoutWord(w, this.now()));
      return L ? { x: L.cx, y: L.cy } : { x: this.W / 2, y: this.H * 0.3 };
    }

    // The field darkens around the hero who used a skill, so everyone sees whose it was.
    drawSpotlight(t) {
      const c = this.cutins.find((x) => t - x.t0 < 1000);
      if (!c) return;
      const k = (t - c.t0) / 1000;
      const a = 0.45 * Math.min(1, k / 0.12) * Math.min(1, (1 - k) / 0.35);
      const o = this.heroOrigin(c.by);
      const pos = this.heroPos.get(c.by);
      const r = (pos ? pos.hu : this.U) * 15;
      const ctx = this.ctx;
      ctx.save();
      ctx.fillStyle = `rgba(10, 6, 18, ${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.rect(0, 0, this.W, this.H);
      ctx.arc(o.x, o.y, r, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
      ctx.restore();
      // A ring in the hero's color around them.
      ctx.globalAlpha = Math.min(1, a * 2.2);
      for (let i = 0; i < 24; i++) {
        const ang = (i / 24) * Math.PI * 2 + t / 400;
        this.block(o.x + Math.cos(ang) * r, o.y + Math.sin(ang) * r, this.U, c.color.Q);
      }
      ctx.globalAlpha = 1;
    }

    drawSkills(t) {
      const keep = [];
      for (const fx of this.skillFx) {
        for (const tg of fx.targets) {
          if (!tg.done && t >= tg.impact) {
            tg.done = true;
            this.skillHits.delete(tg.id);
            this.impact(fx, tg);
            if (tg.onImpact) tg.onImpact();
          }
        }
        if (t > fx.end) {
          for (const tg of fx.targets) if (!tg.done && tg.onImpact) tg.onImpact();
          for (const tg of fx.targets) this.skillHits.delete(tg.id);
          continue;
        }
        keep.push(fx);
        this.drawSkill(fx, t);
      }
      this.skillFx = keep;
    }

    // The flash where a skill's hit lands, on top of the word's own explosion.
    impact(fx, tg) {
      const p = this.targetPos(tg);
      const U = this.U;
      const colors = { meteor: ['#ffd23f', '#ff7b1c', '#e8371c'], thunder: ['#ffffff', '#7fd4ff', '#fff6b0'], cannon: ['#8691a6', '#d5dbe6', '#1b1426'] };
      if (colors[fx.style]) {
        this.particles.push({ ring: true, x: p.x, y: p.y, t0: performance.now(), life: 320, color: colors[fx.style][0] });
        this.puff(p.x, p.y + 2 * U, colors[fx.style], 12);
      }
      if (fx.style === 'meteor') this.shake(2.5, 300);
      if (fx.style === 'thunder') {
        this.shake(1.5, 200);
        this.flash('#fff6d0');
      }
      if (fx.style === 'cannon') this.shake(1.2, 180);
    }

    drawSkill(fx, t) {
      const ctx = this.ctx;
      const U = this.U;
      const age = t - fx.t0;
      const o = this.heroOrigin(fx.by);
      const color = this.colorOf(fx.by);
      const field = Math.max(this.W * 0.4, this.W - this.reserveRight);
      const top = this.reserveTop - 6 * U;
      const flightOf = (tg, ms) => clamp((t - (tg.impact - ms)) / ms, 0, 1);
      const live = (tg, ms) => !tg.done && t >= tg.impact - ms;
      const sk = 1.8; // skills draw their attacks bigger than everyday ones
      // Every target wears a pulsing marker in the caster's color until the hit lands.
      for (const tg of fx.targets) {
        if (tg.done) continue;
        const p = this.targetPos(tg);
        const r = U * (5 + Math.sin(t / 70) * 0.8);
        ctx.globalAlpha = Math.min(1, age / 120);
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          this.block(p.x + sx * r, p.y + sy * r * 0.7, U, color.Q);
          this.block(p.x + sx * (r - U), p.y + sy * r * 0.7, U, color.Q);
          this.block(p.x + sx * r, p.y + sy * (r * 0.7 - U), U, color.Q);
        }
        ctx.globalAlpha = 1;
      }
      switch (fx.style) {
        case 'rally': {
          // Golden shockwaves roll out from the knight under a raised banner.
          for (let r = 0; r < 3; r++) {
            const k = (age - r * 160) / 700;
            if (k < 0 || k > 1) continue;
            ctx.globalAlpha = 1 - k;
            for (let i = 0; i < 28; i++) {
              const ang = (i / 28) * Math.PI * 2;
              this.block(o.x + Math.cos(ang) * U * (3 + k * 22), o.y + Math.sin(ang) * U * (3 + k * 12), U, i % 2 ? '#ffd23f' : '#fff6b0');
            }
          }
          ctx.globalAlpha = Math.min(1, (fx.end - t) / 300);
          const fy = o.y - 14 * U - Math.min(1, age / 300) * 6 * U;
          for (let s = 0; s < 9; s++) this.block(o.x, fy + s * U, U, '#8b5a2b');
          for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 5; col++) this.block(o.x + U * (1 + col), fy + U * row + Math.sin(t / 120 + col) * U * 0.4, U, col === 2 && row === 1 ? '#ffd23f' : color.P);
          }
          ctx.globalAlpha = 1;
          break;
        }
        case 'berserk': {
          // Red rage: the barbarian roars, flames burst from the ground around them.
          if (age < 600 && Math.random() < 0.9) {
            for (let i = 0; i < 3; i++) {
              this.particles.push({
                x: o.x + rand(-7, 7) * U, y: o.y + 10 * U, vx: rand(-0.01, 0.01) * U, vy: -rand(0.04, 0.09) * U, g: 0,
                life: rand(350, 650), t0: t, size: U * (Math.random() < 0.4 ? 2 : 1), color: ['#ff4d4d', '#ff7b1c', '#ffd23f'][i],
              });
            }
          }
          const k = age / 500;
          if (k < 1) {
            ctx.globalAlpha = 1 - k;
            for (let i = 0; i < 20; i++) {
              const ang = (i / 20) * Math.PI * 2;
              this.block(o.x + Math.cos(ang) * U * (4 + k * 14), o.y + Math.sin(ang) * U * (4 + k * 8), U * 1.5, '#ff4d4d');
            }
            ctx.globalAlpha = 1;
          }
          if (age < 200) this.shake(1.5, 220);
          break;
        }
        case 'favor': {
          // A pillar of holy light comes down on the cleric, with a halo over their head.
          const k = age / 1200;
          const w = U * (6 + Math.sin(t / 60) * 0.8);
          ctx.globalAlpha = 0.55 * Math.min(1, age / 150) * Math.max(0, 1 - k);
          ctx.fillStyle = '#fff6b0';
          ctx.fillRect(Math.round(o.x - w / 2), 0, Math.round(w), Math.round(o.y + 10 * U));
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(Math.round(o.x - w / 6), 0, Math.round(w / 3), Math.round(o.y + 10 * U));
          ctx.globalAlpha = Math.max(0, 1 - k);
          for (let i = 0; i < 12; i++) {
            const ang = (i / 12) * Math.PI * 2;
            this.block(o.x + Math.cos(ang) * U * 4, o.y - 9 * U + Math.sin(ang) * U * 1.2, U, '#ffd23f');
          }
          ctx.globalAlpha = 1;
          if (Math.random() < 0.5) this.sparkle(o.x + rand(-4, 4) * U, rand(top, o.y), '#fff6b0', 1);
          break;
        }
        case 'grow': {
          // Vines curl up out of the ground around the druid, shedding leaves.
          const k = Math.min(1, age / 650);
          ctx.globalAlpha = Math.min(1, (fx.end - t) / 400);
          for (let v = 0; v < 6; v++) {
            const bx = o.x + (v - 2.5) * 3 * U;
            const h = Math.round((8 + (v % 3) * 4) * k);
            for (let s = 0; s < h; s++) {
              const sx = bx + Math.sin(s * 0.6 + v) * U * 1.2;
              this.block(sx, o.y + 12 * U - s * U, U, s % 3 ? '#2f7d4a' : '#4fa865');
              if (s % 4 === 3) this.block(sx + U * (v % 2 ? 1 : -1), o.y + 12 * U - s * U, U, '#8be36b');
            }
          }
          ctx.globalAlpha = 1;
          if (Math.random() < 0.35) {
            this.particles.push({
              x: o.x + rand(-9, 9) * U, y: o.y - rand(0, 8) * U, vx: rand(-0.01, 0.01) * U, vy: rand(-0.01, 0.005) * U,
              g: 0, life: 900, t0: t, size: U, color: '#6fe08b', sway: rand(0, 6),
            });
          }
          break;
        }
        case 'meteor': {
          // A magic circle over the wizard, then a meteor crashes down out of the sky onto each target.
          if (age < 700) {
            ctx.globalAlpha = Math.min(1, (700 - age) / 200);
            for (let i = 0; i < 16; i++) {
              const ang = (i / 16) * Math.PI * 2 + t / 150;
              this.block(o.x + Math.cos(ang) * U * 6, o.y - 12 * U + Math.sin(ang) * U * 2, U, i % 2 ? '#ff7b1c' : '#ffd23f');
            }
            ctx.globalAlpha = 1;
          }
          for (const tg of fx.targets) {
            if (!live(tg, 520)) continue;
            const p = this.targetPos(tg);
            const q = flightOf(tg, 520);
            const side = o.x < field / 2 ? -1 : 1;
            const x = lerp(p.x + side * this.W * 0.22, p.x, q);
            const y = lerp(top, p.y, q);
            const R = U * sk * 2.4;
            for (let s = 7; s >= 1; s--) {
              const tr = R * (1 - s / 9);
              this.block(x + side * s * R * 0.55, y - s * R * 0.75, tr * 1.6, s % 2 ? '#ff7b1c' : '#e8371c');
            }
            this.block(x, y, R * 2.2, '#7a1010');
            this.block(x, y, R * 1.8, '#e8371c');
            this.block(x - R * 0.15, y - R * 0.15, R * 1.2, '#ff7b1c');
            this.block(x - R * 0.35, y - R * 0.35, R * 0.6, '#ffd23f');
            if (Math.random() < 0.8) this.particles.push({ x: x + rand(-1, 1) * R, y: y + rand(-1, 1) * R, vx: 0, vy: -0.01 * U, g: 0, life: 300, t0: t, size: U * 1.5, color: ['#ffd23f', '#ff7b1c', '#e8371c'][Math.floor(rand(0, 3))] });
          }
          break;
        }
        case 'arrows': {
          // The archer looses a volley straight up; it comes down as rain on every target.
          if (age < 360) {
            for (let i = 0; i < 3; i++) {
              const y = lerp(o.y - 8 * U, top, age / 360);
              this.drawBolt('arrow', o.x + (i - 1) * 3 * U, y - i * U * 2, 0, -1, -Math.PI / 2, color, t, sk);
            }
          }
          for (const tg of fx.targets) {
            if (!live(tg, 280)) continue;
            const p = this.targetPos(tg);
            this.drawBolt('arrow', p.x, lerp(top, p.y, flightOf(tg, 280)), 0, 1, Math.PI / 2, color, t, sk);
          }
          break;
        }
        case 'backstab': {
          // The rogue vanishes, then strikes from the shadows behind each target.
          for (const tg of fx.targets) {
            const d = t - (tg.impact - 140);
            if (d < 0 || d > 420) continue;
            const p = this.targetPos(tg);
            const spr = heroSprite(this.players.get(fx.by) || { cls: 'rogue' });
            const s = Math.max(1, Math.round(U * 0.9));
            ctx.globalAlpha = Math.max(0, 1 - d / 420) * 0.8;
            this.drawSprite(spr, Math.round(p.x - 12 * s), Math.round(p.y - 8 * s), s, false);
            ctx.globalAlpha = Math.max(0, 1 - Math.max(0, d - 140) / 280);
            const len = Math.min(1, d / 120) * 9;
            for (let i = -len; i <= len; i++) {
              this.block(p.x + i * U, p.y + i * U * 0.8, U * 1.6, '#ffffff');
              this.block(p.x + i * U, p.y - i * U * 0.8, U * 1.6, '#ff6b7a');
            }
            ctx.globalAlpha = 1;
          }
          if (!fx.back && t >= (this.hiddenUntil.get(fx.by) || 0)) {
            fx.back = true; // the rogue steps back out of the shadows
            this.puff(o.x, o.y + 6 * U, ['#3d3550', '#5a4f73'], 12);
          }
          break;
        }
        case 'shuriken': {
          // Shuriken spin up around the ninja, then curve out to their targets.
          if (age < 600) {
            ctx.globalAlpha = Math.min(1, (600 - age) / 200);
            for (let i = 0; i < 8; i++) {
              const ang = (i / 8) * Math.PI * 2 + age / 80;
              this.drawBolt('shuriken', o.x + Math.cos(ang) * U * 8, o.y + Math.sin(ang) * U * 5, 1, 0, 0, color, t + i * 30, sk);
            }
            ctx.globalAlpha = 1;
          }
          for (const tg of fx.targets) {
            if (!live(tg, 320)) continue;
            const p = this.targetPos(tg);
            const q = flightOf(tg, 320);
            const bend = (tg.i % 2 ? 1 : -1) * this.W * 0.12;
            const cx = (o.x + p.x) / 2 + bend;
            const cy = Math.min(o.y, p.y) - 6 * U;
            const x = (1 - q) * (1 - q) * o.x + 2 * (1 - q) * q * cx + q * q * p.x;
            const y = (1 - q) * (1 - q) * o.y + 2 * (1 - q) * q * cy + q * q * p.y;
            this.drawBolt('shuriken', x, y, 1, 0, 0, color, t, sk);
            if (Math.random() < 0.6) this.particles.push({ x, y, vx: 0, vy: 0, g: 0, life: 160, t0: t, size: U, color: '#d5dbe6' });
          }
          break;
        }
        case 'cannon': {
          // A cannon rolls out beside the pirate and lobs a ball at each target.
          const side = o.x < field / 2 ? 1 : -1;
          const cx = o.x + side * 9 * U;
          const cy = o.y + 9 * U;
          const fired = fx.targets.filter((tg) => t >= tg.impact - 420);
          const kick = fired.length && t - (fired[fired.length - 1].impact - 420) < 120 ? -side * U : 0;
          ctx.globalAlpha = Math.min(1, age / 150, (fx.end - t) / 300);
          for (let i = 0; i < 6; i++) this.block(cx + kick + side * i * U, cy - i * U * 0.6, U * 2, i < 5 ? '#1b1426' : '#5a4f73');
          this.block(cx + kick - side * U, cy + 1.5 * U, U * 2, '#8b5a2b');
          this.block(cx + kick + side * U, cy + 1.5 * U, U * 2, '#8b5a2b');
          ctx.globalAlpha = 1;
          for (const tg of fx.targets) {
            const d = t - (tg.impact - 420);
            if (d >= 0 && d < 40) this.puff(cx + side * 6 * U, cy - 4 * U, ['#d5dbe6', '#8691a6', '#ffffff'], 6);
            if (!live(tg, 420)) continue;
            const p = this.targetPos(tg);
            const q = flightOf(tg, 420);
            const x = lerp(cx + side * 6 * U, p.x, q);
            const y = lerp(cy - 4 * U, p.y, q) - Math.sin(q * Math.PI) * this.H * 0.18;
            this.drawBolt('cannon', x, y, 1, 0, 0, color, t, sk);
          }
          break;
        }
        case 'thunder': {
          // The valkyrie raises her spear and lightning strikes down on every target.
          if (age < 400 && Math.random() < 0.7) this.sparkle(o.x + rand(-3, 3) * U, o.y - rand(6, 14) * U, '#7fd4ff', 1);
          for (const tg of fx.targets) {
            const d = t - (tg.impact - 70);
            if (d < 0 || d > 240) continue;
            const p = this.targetPos(tg);
            const r = seeded(fx.seed + tg.i * 977);
            let x = p.x + (r() - 0.5) * 10 * U;
            ctx.globalAlpha = d < 140 ? 1 : 1 - (d - 140) / 100;
            for (let y = top; y < p.y; y += U * 2) {
              const nx = lerp(x, p.x, (y - top) / (p.y - top)) + (r() - 0.5) * 4 * U;
              this.block(nx, y, U * 4, '#4da6ff');
              this.block(nx, y, U * 2.4, '#7fd4ff');
              this.block(nx, y, U * 1.2, '#ffffff');
              x = nx;
            }
            ctx.globalAlpha = 1;
          }
          break;
        }
        case 'raise': {
          // Ghosts of the words that got away rise from the ground and fly into the necromancer; anything
          // still needed is struck by soul bolts.
          for (let g = 0; g < fx.souls; g++) {
            const d = age - g * 160;
            if (d < 0 || d > 900) continue;
            const q = d / 900;
            const sx = field * (0.15 + 0.7 * ((hash(`${fx.seed}:${g}`) % 1000) / 1000));
            const x = lerp(sx, o.x, q * q);
            const y = lerp(this.groundY, o.y, q) - Math.sin(q * Math.PI) * this.H * 0.2;
            ctx.globalAlpha = Math.min(1, (1 - q) * 3);
            this.drawBolt('soul', x, y, 0, -1, 0, color, t + g * 50, sk);
            ctx.globalAlpha = 1;
            if (Math.random() < 0.5) this.particles.push({ x, y, vx: 0, vy: -0.01 * U, g: 0, life: 300, t0: t, size: U, color: '#7dff6b' });
          }
          for (const tg of fx.targets) {
            if (!live(tg, 380)) continue;
            const p = this.targetPos(tg);
            const q = flightOf(tg, 380);
            this.drawBolt('soul', lerp(o.x, p.x, q), lerp(o.y, p.y, q), p.x - o.x, p.y - o.y, 0, color, t, sk);
          }
          break;
        }
        case 'encore': {
          // A spotlight on the bard and a burst of notes spiralling up around them.
          const k = age / 1200;
          ctx.globalAlpha = 0.28 * Math.max(0, 1 - k);
          ctx.fillStyle = '#fff6b0';
          ctx.beginPath();
          ctx.moveTo(o.x - 3 * U, 0);
          ctx.lineTo(o.x + 3 * U, 0);
          ctx.lineTo(o.x + 12 * U, o.y + 12 * U);
          ctx.lineTo(o.x - 12 * U, o.y + 12 * U);
          ctx.fill();
          ctx.globalAlpha = Math.max(0, 1 - k);
          for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2 + age / 200;
            const r = U * (4 + age / 60);
            this.drawBolt('notes', o.x + Math.cos(ang) * r, o.y - 4 * U + Math.sin(ang) * r * 0.5 - age / 25, 1, 0, 0, color, t, sk);
          }
          ctx.globalAlpha = 1;
          break;
        }
        default:
          break;
      }
    }

    // The banner: the hero's portrait and their skill's name slide in from the hero's side of the field.
    drawCutins(t) {
      const ctx = this.ctx;
      const U = this.U;
      const fp = this.fontPx;
      this.cutins = this.cutins.filter((c) => t - c.t0 < 1300);
      const field = Math.max(this.W * 0.4, this.W - this.reserveRight);
      const bh = Math.round(Math.max(fp * 3.2, (this.groundY - this.reserveTop) * (this.mode === 'host' ? 0.15 : 0.13)));
      this.cutins.forEach((c, row) => {
        const k = (t - c.t0) / 1300;
        const fromLeft = this.heroOrigin(c.by).x < field / 2;
        const dir = fromLeft ? 1 : -1;
        const slide = k < 0.12 ? 1 - k / 0.12 : k > 0.82 ? -(k - 0.82) / 0.18 : 0;
        const ox = -dir * slide * field;
        const y = Math.round(this.reserveTop + (this.groundY - this.reserveTop) * 0.5 - bh / 2 + row * (bh + 2 * U));
        ctx.globalAlpha = k > 0.82 ? Math.max(0, 1 - (k - 0.82) / 0.18) : 1;
        // Band in the hero's color, with speed stripes.
        ctx.fillStyle = '#1b1426';
        ctx.fillRect(Math.round(ox), y - U, field, bh + 2 * U);
        ctx.fillStyle = c.color.p;
        ctx.fillRect(Math.round(ox), y, field, bh);
        ctx.fillStyle = c.color.P;
        for (let sx = (t / 2) % (U * 12); sx < field; sx += U * 12) ctx.fillRect(Math.round(ox + (fromLeft ? sx : field - sx)), y, U * 3, bh);
        ctx.fillStyle = c.color.Q;
        ctx.fillRect(Math.round(ox), y, field, U);
        ctx.fillRect(Math.round(ox), y + bh - U, field, U);
        // The hero, big, bursting out of the band, facing into the field.
        const p = this.players.get(c.by);
        if (p) {
          const s = Math.max(2, Math.floor((bh * 1.3) / 16));
          const sw = 16 * s;
          const hx = fromLeft ? ox + 4 * U : ox + field - sw - 4 * U;
          this.drawSprite(heroSprite(p), Math.round(hx), Math.round(y + bh - sw), s, !fromLeft);
        }
        // Skill name with the hero's name above and what it does below, shrunk to fit beside the portrait
        // (a phone held upright is narrow); the description is left out if it still won't fit.
        const portrait = 16 * Math.max(2, Math.floor((bh * 1.3) / 16));
        const room = field - portrait - 16 * U;
        const legible = Math.max(8, Math.round((fp * 0.6) / 4) * 4);
        const fit = (size, chars) => Math.max(legible, Math.min(size, Math.floor(room / Math.max(1, chars) / 4) * 4));
        const big = fit(Math.max(16, Math.round((bh * 0.36) / 4) * 4), c.name.length + 1);
        const small = fit(Math.max(legible, Math.round((bh * 0.15) / 4) * 4), Math.max(c.hero.length, (c.desc || '').length));
        const desc = (c.desc || '').length * small <= room ? c.desc : '';
        const textW = Math.max((c.name.length + 1) * big, desc.length * small, c.hero.length * small);
        const tx = fromLeft ? ox + portrait + 10 * U : ox + field - textW - portrait - 10 * U;
        const line = (str, size, ly, colr) => {
          ctx.font = `${size}px "Press Start 2P", monospace`;
          const o = Math.max(2, Math.round(size / 8));
          ctx.fillStyle = '#1b1426';
          ctx.fillText(str, Math.round(tx + o), Math.round(ly + o));
          ctx.fillStyle = colr;
          ctx.fillText(str, Math.round(tx), Math.round(ly));
        };
        line(c.hero.toUpperCase(), small, y + bh * 0.1, c.color.Q);
        line(`${c.name}!`, big, y + bh * 0.1 + small * 1.5, '#ffffff');
        if (desc) line(desc, small, y + bh * 0.1 + small * 1.5 + big * 1.25, '#ffd23f');
        ctx.globalAlpha = 1;
      });
      ctx.font = `${fp}px "Press Start 2P", monospace`;
    }

    // Side-on: attacks cruise between the attack-word rows and the armies' heads.
    setLanes(g, slotRows) {
      g.laneTop = g.top + Math.max(1, slotRows) * (g.plateH + g.gap) + 4 * this.U;
      g.laneBottom = Math.max(g.laneTop + g.plateH, g.laneFloor);
    }

    // ---- team battle: where things are ----------------------------------
    // Attack words for each team, flowed into rows. Returns id -> plate layout, and the rows used.
    slotLayout() {
      const g = this.geo;
      const fp = this.fontPx;
      const out = new Map();
      let rows = 0;
      for (const team of [0, 1]) {
        if (this.mode === 'phone' && team !== g.near) continue; // you can only type your own team's
        const slots = [...this.words.values()].filter((w) => w.kind === 'attack' && w.team === team).sort((a, b) => a.id - b.id);
        let x0;
        let x1;
        if (!g.horizontal) [x0, x1] = [this.W * 0.03, this.W * 0.97];
        else if (this.mode === 'phone') [x0, x1] = [2 * this.U, this.W * 0.62];
        else [x0, x1] = team === g.near ? [2 * this.U, this.W * 0.48] : [this.W * 0.52, this.W - 2 * this.U];
        const lines = [[]];
        let used = 0;
        for (const w of slots) {
          const plateW = w.text.length * fp + fp;
          if (lines[lines.length - 1].length && used + plateW > x1 - x0) {
            lines.push([]);
            used = 0;
          }
          lines[lines.length - 1].push([w, plateW]);
          used += plateW + g.gap;
        }
        lines.forEach((line, r) => {
          const width = line.reduce((s, [, pw]) => s + pw + g.gap, -g.gap);
          let x = g.horizontal && team === g.near ? x0 : g.horizontal ? x1 - width : (x0 + x1 - width) / 2;
          const py = g.horizontal ? g.top + r * (g.plateH + g.gap) : g.slotBottom - (r + 1) * (g.plateH + g.gap);
          for (const [w, plateW] of line) {
            out.set(w.id, { cx: x + plateW / 2, py, plateW, plateH: g.plateH, p: 0 });
            x += plateW + g.gap;
          }
        });
        if (slots.length) rows = Math.max(rows, lines.length);
      }
      return { slots: out, rows };
    }

    // Attacks fly in lanes (heights side-on, columns upright) so their words don't pile on top of each other.
    laneCount() {
      const g = this.geo;
      if (!g.horizontal) return Math.max(2, Math.floor(this.W / (this.fontPx * 8)));
      return Math.max(1, Math.floor((g.laneBottom - g.laneTop) / (g.plateH + g.gap)) + 1);
    }

    pickLane(team) {
      const n = this.laneCount();
      const used = new Array(n).fill(0);
      for (const w of this.words.values()) if (w.kind === 'missile' && w.team === team && w.lane != null) used[w.lane % n] += 1;
      const least = Math.min(...used);
      const free = used.map((u, i) => (u === least ? i : -1)).filter((i) => i >= 0);
      return free[Math.floor(Math.random() * free.length)];
    }

    // Where an attack is right now: it flies from where it was launched to the middle of the other army.
    missilePos(w, now) {
      const g = this.geo;
      const p = clamp((now - w.launch) / w.dur, 0, 1);
      const n = this.laneCount();
      const r = w.lane != null ? ((w.lane % n) + 0.5) / n : (hash(w.id) % 1000) / 1000;
      const to = this.armyPoint(1 - w.team);
      let from = w.from;
      let x;
      let y;
      if (g.horizontal) {
        const lane = g.laneTop + r * Math.max(0, g.laneBottom - g.laneTop);
        if (!from) from = { x: g.front[w.team], y: lane };
        x = lerp(from.x, to.x, p);
        // Rise to the lane, cruise, then drop onto the army.
        const cruise = p < 0.2 ? lerp(from.y, lane, p / 0.2) : p > 0.8 ? lerp(lane, to.y, (p - 0.8) / 0.2) : lane;
        y = cruise - Math.sin(p * Math.PI) * 3 * this.U;
      } else {
        const lx = this.W * (0.12 + 0.76 * r);
        const incoming = w.team !== g.near;
        if (!from) from = incoming ? { x: lx, y: g.bandBottom } : { x: lx, y: g.slotBottom };
        x = lerp(from.x, incoming ? lx : to.x, p) + Math.sin(p * Math.PI * 2 + w.id) * 2 * this.U;
        y = lerp(from.y, to.y, p);
      }
      const fp = this.fontPx;
      const plateW = w.text.length * fp + fp;
      return { p, x, y, cx: x, cy: y, py: y + 3 * this.U, plateW, plateH: g.plateH, dx: to.x - from.x, dy: to.y - from.y };
    }

    // The power-up floats in the middle of the field.
    powerPos(w, now) {
      const g = this.geo;
      const s = Math.max(2, Math.round(this.U * (g.horizontal ? 1.1 : 0.9)));
      const midY = g.horizontal ? (g.laneTop + g.laneBottom) / 2 : (g.bandBottom + g.slotBottom - 2 * g.plateH) / 2;
      const y = midY + Math.sin(now / 300) * 2 * this.U;
      const fp = this.fontPx;
      const plateW = w.text.length * fp + fp;
      return { x: this.W / 2, y, s, cx: this.W / 2, cy: y, py: y + 7 * s, plateW, plateH: g.plateH, p: (now - w.spawn) / w.dur };
    }

    duelPos(w, now) {
      if (w.kind === 'missile') return this.missilePos(w, now);
      if (w.kind === 'power') return this.powerPos(w, now);
      return this.slotLayout().slots.get(w.id) || null;
    }

    // Phone: what you can type right now in a team battle - your attack words, attacks coming at you,
    // and the power-up. Free for all: the words on screen.
    typeable(now) {
      if (!this.teamMode) return [...this.words.values()].filter((w) => now >= w.spawn && now <= w.spawn + w.dur);
      return [...this.words.values()].filter((w) => this.canType(w));
    }

    canType(w) {
      if (w.kind === 'power') return true;
      if (w.kind === 'attack') return w.team === this.myTeam;
      return w.kind === 'missile' && w.team !== this.myTeam;
    }

    // ---- team battle: events -------------------------------------------
    // An attack word was typed: its plate lifts off from the attack row and heads for the other army.
    duelLaunch(slotId, missile) {
      const L = this.geo && this.slotLayout().slots.get(slotId);
      this.words.delete(slotId);
      const m = { ...missile };
      if (L) m.from = { x: L.cx, y: L.py + L.plateH / 2 };
      if (this.geo) m.lane = this.pickLane(m.team);
      this.words.set(m.id, m);
      this.heroHop.set(m.by, performance.now());
      const o = this.heroOrigin(m.by);
      this.sparkle(o.x, o.y, this.colorOf(m.by).Q, 10);
    }

    // An incoming attack was typed by a defender: their hero shoots it down mid-air.
    // skill: the block came from a class skill, whose own effect delivers the hit.
    duelBlock(id, by, skill = false) {
      const w = this.words.get(id);
      if (!w) return;
      const L = this.missilePos(w, this.now());
      this.words.delete(id);
      const color = this.colorOf(by);
      const dying = { w, L, color, t0: performance.now() };
      this.dying.push(dying);
      const player = this.players.get(by);
      const land = () => {
        this.dying = this.dying.filter((d) => d !== dying);
        this.explode(L.x, L.y, color);
        this.floatText(L.x, L.y - 2 * this.U, 'BLOCKED!', color.Q, player ? player.name : null);
        if (this.onHit) this.onHit(by);
      };
      const tg = skill && this.skillHits.get(id);
      if (tg) {
        dying.held = true;
        tg.pos = { x: L.x, y: L.y };
        tg.onImpact = land;
        return;
      }
      this.heroHop.set(by, performance.now());
      this.launch(player ? player.cls : 'knight', this.heroOrigin(by), { x: L.x, y: L.y }, color, land);
    }

    // An attack reached its target army.
    duelHit(id, team, dmg, shielded) {
      const w = this.words.get(id);
      this.words.delete(id);
      const at = this.armyPoint(team);
      const color = w ? this.colorOf(w.by) : { P: TEAMS[1 - team].color, Q: TEAMS[1 - team].color };
      if (shielded) {
        this.sparkle(at.x, at.y, POWERS.shield.color, 24);
        this.floatText(at.x, at.y - 6 * this.U, 'SHIELDED!', POWERS.shield.color, null);
      } else {
        this.explode(at.x, at.y, color);
        this.floatText(at.x, at.y - 6 * this.U, `-${dmg}`, TEAMS[team].color, null);
      }
      const t0 = performance.now();
      for (const [pid] of this.heroPos) if (this.players.get(pid)?.team === team) this.heroHop.set(pid, t0 + Math.random() * 120);
      if (this.mode === 'phone' && team === this.myTeam && !shielded) this.flash('#ff2d2d');
    }

    // A team grabbed the power-up: it bursts and the power flies to their army.
    duelPower(id, by, team, power, label) {
      const w = this.words.get(id);
      this.words.delete(id);
      const at = this.armyPoint(team);
      const info = POWERS[power] || POWERS.potion;
      if (w) {
        const L = this.powerPos(w, this.now());
        this.sparkle(L.x, L.y, info.color, 22);
      }
      this.sparkle(at.x, at.y, info.color, 26);
      this.floatText(at.x, at.y - 8 * this.U, label, info.color, this.players.get(by)?.name || null);
      this.heroHop.set(by, performance.now());
    }

    // Attacks in the air ({ launch, dur }) or falling words ({ spawn, dur }) changing speed.
    retime(list) {
      for (const { id, ...r } of list) {
        const w = this.words.get(id);
        if (w) Object.assign(w, r);
      }
    }

    // A quick tinted flash over the whole field (a phone's team taking a hit).
    flash(color) {
      this.flashAt = performance.now();
      this.flashColor = color;
    }

    escape(wordId) {
      const w = this.words.get(wordId);
      if (!w) return;
      this.words.delete(wordId);
      if (w.kind) {
        // A power-up nobody grabbed fades away.
        const L = this.duelPos(w, this.now());
        if (L) this.puff(L.cx, L.cy, ['#9c93b5', '#d0c9e6', POWERS[w.power]?.color || '#ffffff'], 14);
        return;
      }
      const L = this.layoutWord(w, Math.min(this.now(), w.spawn + w.dur));
      this.puff(L.cx, this.groundY - this.U * 2, ['#9c93b5', '#6c6485', '#d0c9e6'], 14);
      if (this.onEscape) this.onEscape();
    }

    clearWords() {
      for (const w of this.words.values()) {
        const L = w.kind ? this.geo && this.duelPos(w, this.now()) : this.layoutWord(w, this.now());
        if (L && (w.kind || L.p > 0)) this.puff(L.cx, L.cy, MONSTERS[this.monster].fx, 10);
      }
      this.words.clear();
      this.dying = [];
    }

    // ---- effects -------------------------------------------------------
    launch(cls, from, to, color, onHit) {
      const kind = ATTACK[cls] || 'slash';
      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      const pace = { arrow: 1.4, shuriken: 1.35, spear: 1.3, axe: 0.85, cannon: 0.8, soul: 0.9 };
      const speed = this.H * 0.0028 * (pace[kind] || 1);
      const dur = kind === 'beam' ? 170 : clamp(dist / speed, 160, 650);
      const t0 = performance.now();
      const base = { kind, from, to, color, t0, dur, trailAt: 0 };
      if (kind === 'dagger' || kind === 'notes') {
        // A volley: three daggers, or three notes of a chord.
        const perp = Math.atan2(to.y - from.y, to.x - from.x) + Math.PI / 2;
        [0, 1, 2].forEach((i) => {
          const off = (i - 1) * this.U * (kind === 'notes' ? 4 : 3);
          this.projectiles.push({
            ...base,
            t0: t0 + i * 60,
            from: { x: from.x + Math.cos(perp) * off, y: from.y + Math.sin(perp) * off },
            onHit: i === 0 ? onHit : null,
          });
        });
      } else {
        this.projectiles.push({ ...base, onHit });
      }
    }

    // Each kind of monster goes out its own way: slimes splat, bats burst into feathers, skulls shatter,
    // fire spirits flare up.
    explode(x, y, color) {
      const mon = MONSTERS[this.monster];
      const fx = mon.fx;
      const U = this.U;
      const t0 = performance.now();
      const style = mon.death;
      const n = style === 'feathers' ? 18 : 26;
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2);
        const v = rand(0.012, 0.045) * U;
        const p = {
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.01 * U,
          g: 0.00009 * U, life: rand(450, 850), t0,
          size: U * (Math.random() < 0.3 ? 2 : 1),
          color: i % 4 === 0 ? color.Q : i % 5 === 0 ? '#ffffff' : fx[i % fx.length],
        };
        if (style === 'splat') {
          // Gooey drops that arc up and rain down.
          p.vy = -rand(0.02, 0.05) * U;
          p.vx *= 0.8;
          p.g = 0.00016 * U;
          p.life = rand(700, 1100);
          p.size = U * (Math.random() < 0.5 ? 2 : 1);
        } else if (style === 'feathers') {
          // Slow, swaying flakes.
          p.vx *= 0.5;
          p.vy = rand(-0.02, 0.005) * U;
          p.g = 0.00002 * U;
          p.life = rand(1100, 1700);
          p.sway = rand(0, 6);
        } else if (style === 'shatter') {
          // Bone chips fly hard and drop; a few flames hang in the air.
          p.color = i % 3 === 0 ? '#efe6d0' : i % 3 === 1 ? '#c9bfa6' : fx[i % fx.length];
          p.vx *= 1.4;
          p.g = 0.00022 * U;
        } else if (style === 'burst') {
          // Flames that rise.
          p.vy = -rand(0.015, 0.05) * U;
          p.g = -0.00002 * U;
          p.color = ['#ffd23f', '#ff7b1c', '#e8371c', '#ffffff'][i % 4];
        }
        this.particles.push(p);
      }
      this.particles.push({ ring: true, x, y, t0, life: 260, color: '#ffffff' });
    }

    puff(x, y, colors, n) {
      const U = this.U;
      for (let i = 0; i < n; i++) {
        const a = rand(Math.PI, Math.PI * 2);
        const v = rand(0.006, 0.02) * U;
        this.particles.push({
          x: x + rand(-3, 3) * U, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0,
          life: rand(350, 650), t0: performance.now(), size: U, color: colors[i % colors.length],
        });
      }
    }

    sparkle(x, y, color, n = 14) {
      const U = this.U;
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2);
        const v = rand(0.008, 0.025) * U;
        this.particles.push({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.01 * U, g: 0,
          life: rand(500, 900), t0: performance.now(), size: U, color: i % 2 ? color : '#ffffff',
        });
      }
    }

    confetti(n = 160) {
      const palette = COLORS.map((c) => c.Q).concat(['#ffffff', '#ffd23f']);
      for (let i = 0; i < n; i++) {
        this.particles.push({
          x: rand(0, this.W), y: rand(-this.H * 0.6, 0), vx: rand(-0.04, 0.04) * this.U, vy: rand(0.02, 0.06) * this.U,
          g: 0, life: rand(3500, 6000), t0: performance.now(), size: this.U * (Math.random() < 0.5 ? 1 : 2),
          color: palette[i % palette.length], sway: rand(0, 6),
        });
      }
    }

    // sub: an extra line under the points ("x2 STREAK PERK").
    floatText(x, y, text, color, name, sub) {
      this.texts.push({ x, y, text, color, name, sub, t0: performance.now(), life: sub ? 1400 : 1100 });
    }

    // ---- drawing -------------------------------------------------------
    loop = () => {
      try {
        this.draw();
      } catch (e) {
        console.error(e);
      }
      requestAnimationFrame(this.loop);
    };

    draw() {
      const ctx = this.ctx;
      const U = this.U;
      const now = this.now();
      const t = performance.now();
      const dt = Math.min(50, t - this.lastFrame);
      this.lastFrame = t;
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 1;
      const shaking = t < this.shakeUntil;
      if (shaking) {
        const k = (this.shakeUntil - t) / 300;
        const pow = this.shakePow * this.U * Math.min(1, k);
        ctx.fillStyle = '#0e0a17';
        ctx.fillRect(0, 0, this.W, this.H);
        ctx.save();
        ctx.translate(Math.round(rand(-pow, pow)), Math.round(rand(-pow, pow)));
      }
      ctx.drawImage(this.bg, 0, 0, this.bg.width * U, this.bg.height * U);

      for (const s of this.stars) {
        if (Math.sin(t / 400 + s.phase) > 0.6) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(s.x * U, s.y * U, U, U);
        }
      }
      this.drawAmbient(t, dt);

      ctx.font = `${this.fontPx}px "Press Start 2P", monospace`;
      ctx.textBaseline = 'top';

      if (this.teamMode && this.geo) {
        this.drawDuel(t, now);
      } else {
        if (this.boss && this.monster === 'boss') this.drawBoss(t);
        const mon = MONSTERS[this.monster];
        const iced = this.iceUntil > now;
        for (const w of this.words.values()) {
          const L = this.layoutWord(w, now);
          if (L.p < 0) continue;
          if (L.p > 1) {
            if (L.p > 1 + 1500 / w.dur) this.words.delete(w.id); // missed escape event
            continue;
          }
          const frame = Math.floor((t + w.id * 97) / mon.frameMs) % 2;
          if (w.special) this.drawSpecial(w, L, t);
          else this.drawMonster(L, frame);
          this.drawPlate(w, L, t, null, { border: w.special ? SPECIAL_ART[w.special].color : iced && w.iced ? '#bfe9ff' : null });
        }
        for (const d of this.dying) {
          if (t - d.t0 > 1800) continue;
          if (d.held || Math.floor((t - d.t0) / 60) % 2 === 0) {
            if (d.w.special) this.drawSpecial(d.w, d.L, t);
            else this.drawMonster(d.L, 0);
          }
          this.drawPlate(d.w, d.L, t, d.color.Q);
        }
        if (iced) this.drawIce(t, now);
      }
      this.dying = this.dying.filter((d) => t - d.t0 <= 1800);

      this.drawHeroes(t, dt);
      if (this.teamMode && this.geo) this.drawEffects(t);
      this.drawSpotlight(t);
      this.drawProjectiles(t);
      this.drawSkills(t);
      this.drawParticles(t, dt);
      this.drawTexts(t);
      this.drawCallouts(t);
      this.drawCutins(t);

      const fk = (t - this.flashAt) / 320;
      if (fk < 1) {
        ctx.globalAlpha = 0.35 * (1 - fk);
        ctx.fillStyle = this.flashColor;
        ctx.fillRect(0, 0, this.W, this.H);
        ctx.globalAlpha = 1;
      }
      if (shaking) ctx.restore();
    }

    // ---- boss round, special words, callouts: drawing --------------------
    // Where the Dragon King hovers: top middle, as big as fits without crowding the words.
    bossLayout() {
      const spr = bossSprite(0);
      const field = Math.max(this.W * 0.4, this.W - this.reserveRight);
      const s = Math.max(2, Math.floor(Math.min((field * 0.42) / spr.width, (this.groundY - this.reserveTop) * 0.34 / spr.height)));
      const w = spr.width * s;
      const h = spr.height * s;
      const cx = field / 2;
      const top = this.reserveTop + (this.mode === 'phone' ? this.fontPx * 1.6 : 0); // phones: clear of the streak chip
      const y = top + this.fontPx * 2.2;
      return { s, w, h, cx, y, cy: y + h / 2, top };
    }

    drawBoss(t) {
      const ctx = this.ctx;
      const b = this.boss;
      const B = this.bossLayout();
      const downK = b.down ? (t - b.downAt) / 2200 : 0;
      if (downK >= 1) return;
      const hit = t - (b.hitAt || -1e9) < 160;
      const frame = b.down || hit || Math.floor(t / 700) % 3 === 0 ? 1 : 0;
      const bob = Math.round(Math.sin(t / 500) * B.s);
      const jx = hit || b.down ? Math.round(rand(-1, 1) * B.s) : 0;
      ctx.globalAlpha = b.down ? Math.max(0, 1 - downK) : 1;
      this.drawSprite(bossSprite(frame), Math.round(B.cx - B.w / 2) + jx, Math.round(B.y + bob + downK * B.h), B.s, false);
      ctx.globalAlpha = 1;

      // HP bar with the boss's name.
      const fp = this.fontPx;
      const small = Math.max(8, Math.round((fp * 0.67) / 8) * 8);
      const bw = Math.min(B.w * 1.6, (this.W - this.reserveRight) * 0.8);
      const bh = Math.max(8, Math.round(fp * 0.7));
      const bx = Math.round(B.cx - bw / 2);
      const by = Math.round(B.top + fp * 0.6);
      const k = b.max ? b.hp / b.max : 0;
      ctx.fillStyle = '#0e0a17';
      ctx.fillRect(bx - 3, by - 3, bw + 6, bh + 6);
      ctx.fillStyle = '#3a0c10';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = hit ? '#ffffff' : k < 0.25 ? '#ffd23f' : '#e8371c';
      ctx.fillRect(bx, by, Math.round(bw * k), bh);
      this.drawLabel({ text: b.down ? 'DEFEATED!' : `THE DRAGON KING  ${b.hp}`, x: B.cx, y: by + bh + 6, fs: small, color: b.down ? '#ffd23f' : '#ffb061' });
    }

    drawSpecial(w, L, t) {
      const spr = specialSprite(w.special);
      const s = Math.max(1, Math.round((L.mh / spr.height) * 1.0));
      const x = Math.round(L.cx - (spr.width * s) / 2);
      const y = Math.round(L.top + L.mh - spr.height * s + Math.sin(t / 220 + w.id) * this.U);
      this.drawSprite(spr, x, y, s, false);
      if (Math.random() < 0.15) {
        const c = SPECIAL_ART[w.special].color;
        this.particles.push({
          x: L.cx + rand(-0.6, 0.6) * spr.width * s, y: L.cy + rand(-0.5, 0.5) * L.mh, vx: 0, vy: -0.01 * this.U, g: 0,
          life: 500, t0: t, size: this.U, color: Math.random() < 0.5 ? c : '#ffffff',
        });
      }
    }

    // Ice: a blue chill over the field and frost creeping in from the edges.
    drawIce(t, now) {
      const ctx = this.ctx;
      const left = this.iceUntil - now;
      ctx.globalAlpha = Math.min(0.16, left / 3000);
      ctx.fillStyle = '#7fd4ff';
      ctx.fillRect(0, this.reserveTop, this.W, this.groundY - this.reserveTop);
      ctx.globalAlpha = Math.min(0.8, left / 1000);
      const U = this.U;
      for (let x = 0; x < this.W; x += U * 2) {
        const h = (hash(x) % 4) + 1;
        ctx.fillStyle = '#e8f7ff';
        ctx.fillRect(x, this.reserveTop, U * 2, h * U);
      }
      ctx.globalAlpha = 1;
    }

    drawCallouts(t) {
      const ctx = this.ctx;
      const keep = [];
      for (const c of this.callouts) {
        const k = (t - c.t0) / 1500;
        if (k >= 1) continue;
        keep.push(c);
        const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.55 : k < 0.2 ? 1.15 - ((k - 0.12) / 0.08) * 0.15 : 1;
        const fs = Math.max(16, Math.round((this.fontPx * (this.mode === 'host' ? 2.2 : 1.6) * pop) / 4) * 4);
        const field = Math.max(this.W * 0.4, this.W - this.reserveRight);
        const rowH = this.fontPx * (this.mode === 'host' ? 2.2 : 1.6) * 1.9;
        const y = Math.round(this.reserveTop + (this.groundY - this.reserveTop) * 0.26 + c.row * rowH - k * this.U * 6);
        ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
        ctx.font = `${fs}px "Press Start 2P", monospace`;
        const x = Math.round(field / 2 - (c.text.length * fs) / 2);
        const o = Math.max(2, Math.round(fs / 8));
        ctx.fillStyle = '#1b1426';
        for (const [ox, oy] of [[-o, 0], [o, 0], [0, -o], [0, o], [o, o]]) ctx.fillText(c.text, x + ox, y + oy);
        ctx.fillStyle = c.color;
        ctx.fillText(c.text, x, y);
        if (c.sub) {
          const ss = Math.max(8, Math.round(fs / 2.5 / 4) * 4);
          ctx.font = `${ss}px "Press Start 2P", monospace`;
          const sx = Math.round(field / 2 - (c.sub.length * ss) / 2);
          ctx.fillStyle = '#1b1426';
          ctx.fillText(c.sub, sx + 2, y + fs + ss * 0.8 + 2);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(c.sub, sx, y + fs + ss * 0.8);
        }
      }
      ctx.globalAlpha = 1;
      ctx.font = `${this.fontPx}px "Press Start 2P", monospace`;
      this.callouts = keep;
    }

    // ---- team battle: drawing --------------------------------------------
    drawDuel(t, now) {
      const ctx = this.ctx;
      const g = this.geo;
      const U = this.U;
      const { slots, rows } = this.slotLayout();
      if (g.horizontal) this.setLanes(g, rows);

      // Each army's ground glows in its team color; upright phones get a rampart for the enemy.
      if (g.horizontal) {
        ctx.globalAlpha = 0.14;
        for (const team of [0, 1]) {
          ctx.fillStyle = TEAMS[team].color;
          ctx.fillRect(team === g.near ? 0 : this.W - g.zoneW, 0, g.zoneW, this.groundY);
        }
        ctx.globalAlpha = 1;
        for (const team of [0, 1]) this.drawBanner(team === g.near ? 3 * U : this.W - 3 * U, g.top + 2 * U, team);
      } else {
        const color = TEAMS[g.far].color;
        ctx.fillStyle = '#120d22';
        ctx.fillRect(0, g.bandTop, this.W, g.bandBottom - g.bandTop);
        ctx.fillStyle = TEAMS[g.far].dark;
        ctx.fillRect(0, g.bandBottom - 2 * g.huF, this.W, 2 * g.huF);
        ctx.fillStyle = color;
        for (let x = 0; x < this.W; x += 8 * g.huF) ctx.fillRect(x, g.bandBottom - 3 * g.huF, 4 * g.huF, g.huF);
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = TEAMS[g.near].color;
        ctx.fillRect(0, g.slotBottom, this.W, this.groundY - g.slotBottom);
        ctx.globalAlpha = 1;
      }

      // The power-up: a glowing item with its word underneath. It blinks when it's about to fade.
      for (const w of this.words.values()) {
        if (w.kind !== 'power') continue;
        const L = this.powerPos(w, now);
        if (L.p > 0.8 && Math.floor(t / 120) % 2) continue;
        const info = POWERS[w.power] || POWERS.potion;
        const r = (6 + Math.sin(t / 150)) * L.s;
        ctx.globalAlpha = 0.25;
        this.ring(L.x, L.y, r, info.color, L.s);
        ctx.globalAlpha = 1;
        const spr = powerSprite(w.power);
        ctx.drawImage(spr, Math.round(L.x - (spr.width * L.s) / 2), Math.round(L.y - (spr.height * L.s) / 2), spr.width * L.s, spr.height * L.s);
        this.drawLabel({ text: info.name, x: L.x, y: L.y - 7 * L.s - this.fontPx, fs: Math.max(8, Math.round((this.fontPx * 0.67) / 8) * 8), color: info.color });
        this.drawPlate(w, L, t, null, { border: info.color });
      }

      // Attack words waiting to be typed. On a phone they keep the plain border, so red always means
      // "incoming - block it".
      for (const [id, L] of slots) {
        const w = this.words.get(id);
        if (w) this.drawPlate(w, L, t, null, this.mode === 'host' ? { border: TEAMS[w.team].color, noType: true } : {});
      }

      // Attacks in flight: the hero's projectile with its word. On a phone, yours are dimmed (only the
      // other team can type them); the ones coming at you are the ones to block.
      for (const w of this.words.values()) {
        if (w.kind !== 'missile') continue;
        const L = this.missilePos(w, now);
        const incoming = this.mode === 'phone' && w.team !== this.myTeam;
        const outgoing = this.mode === 'phone' && w.team === this.myTeam;
        const p = this.players.get(w.by);
        const color = this.colorOf(w.by);
        const a = Math.atan2(L.dy, L.dx);
        if (this.effectOn(1 - w.team, 'slow')) {
          ctx.globalAlpha = 0.5;
          this.ring(L.x, L.y, 4 * U, POWERS.slow.color, U);
          ctx.globalAlpha = 1;
        }
        if (t - (w.trailAt || 0) > (this.effectOn(w.team, 'haste') ? 20 : 45)) {
          w.trailAt = t;
          this.particles.push({
            x: L.x + rand(-1, 1) * U, y: L.y + rand(-1, 1) * U, vx: 0, vy: 0, g: 0, life: 260, t0: t, size: U,
            color: this.effectOn(w.team, 'haste') ? POWERS.haste.color : TEAMS[w.team].color,
          });
        }
        this.drawBolt(ATTACK[p ? p.cls : 'knight'] || 'slash', L.x, L.y, Math.cos(a), Math.sin(a), a, color, t);
        this.drawPlate(w, L, t, null, { border: incoming ? '#ff4d4d' : TEAMS[w.team].color, dim: outgoing, noType: !incoming });
      }

      for (const d of this.dying) {
        if (t - d.t0 > 1800 || (!d.held && Math.floor((t - d.t0) / 60) % 2)) continue;
        this.drawPlate(d.w, d.L, t, d.color.Q);
      }
    }

    // A team flag on a pole.
    drawBanner(x, y, team) {
      const ctx = this.ctx;
      const U = this.U;
      const left = x < this.W / 2;
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(Math.round(x - U / 2), y, U, 14 * U);
      ctx.fillStyle = TEAMS[team].color;
      const wave = Math.floor(performance.now() / 250) % 2;
      for (let r = 0; r < 5; r++) ctx.fillRect(left ? x + U / 2 : x - U / 2 - (6 + (r === 2 ? wave : 0)) * U, y + r * U, (6 + (r === 2 ? wave : 0)) * U, U);
    }

    ring(x, y, r, color, size) {
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        this.block(x + Math.cos(a) * r, y + Math.sin(a) * r, size, color);
      }
    }

    // Shield domes over protected armies and sparks rising off armies in a fury.
    drawEffects(t) {
      const ctx = this.ctx;
      const U = this.U;
      for (const team of [0, 1]) {
        const heroes = [...this.heroPos.entries()].filter(([id]) => this.players.get(id)?.team === team).map(([, p]) => p);
        if (!heroes.length) continue;
        const minX = Math.min(...heroes.map((h) => h.x - 9 * h.hu));
        const maxX = Math.max(...heroes.map((h) => h.x + 9 * h.hu));
        const feet = Math.max(...heroes.map((h) => h.feet ?? this.feetY));
        const head = Math.min(...heroes.map((h) => (h.feet ?? this.feetY) - 17 * h.hu));
        if (this.effectOn(team, 'shield')) {
          const cx = (minX + maxX) / 2;
          const rx = (maxX - minX) / 2 + 3 * U;
          const ry = feet - head + 3 * U;
          ctx.globalAlpha = 0.45 + 0.15 * Math.sin(t / 200);
          for (let i = 0; i <= 28; i++) {
            const a = Math.PI + (i / 28) * Math.PI;
            this.block(cx + Math.cos(a) * rx, feet + Math.sin(a) * ry, U * 1.2, POWERS.shield.color);
          }
          ctx.globalAlpha = 1;
        }
        if (this.effectOn(team, 'fury') && Math.random() < 0.5) {
          const h = heroes[Math.floor(Math.random() * heroes.length)];
          this.particles.push({
            x: h.x + rand(-6, 6) * h.hu, y: (h.feet ?? this.feetY) - rand(0, 14) * h.hu, vx: 0, vy: -0.03 * U, g: 0,
            life: rand(300, 600), t0: t, size: U, color: Math.random() < 0.5 ? '#ff7b1c' : '#e8371c',
          });
        }
      }
    }

    drawMonster(L, frame) {
      const spr = monsterSprite(this.monster, frame);
      const x = Math.round(L.cx - (spr.width * this.U) / 2);
      const y = Math.round(L.top + L.mh - spr.height * this.U);
      this.ctx.drawImage(spr, x, y, spr.width * this.U, spr.height * this.U);
    }

    // opts (team battle): border color, dim (not yours to type), noType (never highlight).
    drawPlate(w, L, t, killedColor, opts = {}) {
      const ctx = this.ctx;
      const fp = this.fontPx;
      const bt = Math.max(2, Math.round(this.U / 2));
      const x = Math.round(L.cx - L.plateW / 2);
      const y = Math.round(L.py);
      const typed = this.typed;
      const locked = !killedColor && !opts.noType && typed && w.text.startsWith(typed);
      const danger = !killedColor && !opts.noType && L.p > 0.72 && Math.floor(t / 180) % 2 === 0;
      if (opts.dim) ctx.globalAlpha = 0.55;
      // A typo flashes the border of the word you were going for.
      const lockedColor = this.typo && Math.floor(t / 150) % 2 ? '#ff4d4d' : '#ffd23f';
      ctx.fillStyle = killedColor || (locked ? lockedColor : danger ? '#ff4d4d' : opts.border || '#f4ead5');
      ctx.fillRect(x - bt, y - bt, L.plateW + bt * 2, L.plateH + bt * 2);
      ctx.fillStyle = '#1b1426';
      ctx.fillRect(x, y, L.plateW, L.plateH);
      const tx = Math.round(L.cx - (w.text.length * fp) / 2);
      const ty = Math.round(y + (L.plateH - fp) / 2 + fp * 0.06);
      if (killedColor) {
        ctx.fillStyle = killedColor;
        ctx.fillText(w.text, tx, ty);
      } else if (locked) {
        ctx.fillStyle = '#ffd23f';
        ctx.fillText(typed, tx, ty);
        const rest = w.text.slice(typed.length);
        if (this.typo && rest) {
          // Mark the letter where you went wrong.
          ctx.fillStyle = '#ff4d4d';
          ctx.fillRect(tx + typed.length * fp - 2, y + bt, fp + 4, L.plateH - 2 * bt);
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillText(rest, tx + typed.length * fp, ty);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fillText(w.text, tx, ty);
      }
      ctx.globalAlpha = 1;
    }

    // A hero on a streak burns: orange flames from 3 in a row, blue from 6, violet from 10.
    aura(id, pos, feet, hu, streak, t) {
      if (t - (this.auraAt.get(id) || 0) < (streak >= 10 ? 40 : streak >= 6 ? 60 : 90)) return;
      this.auraAt.set(id, t);
      const colors = streak >= 10 ? ['#bb8cff', '#ffd23f', '#ffffff'] : streak >= 6 ? ['#7fd4ff', '#ffffff', '#4da6ff'] : ['#ff7b1c', '#ffd23f', '#e8371c'];
      this.particles.push({
        x: pos.x + rand(-6, 6) * hu, y: feet - rand(1, 13) * hu, vx: rand(-0.004, 0.004) * this.U, vy: -rand(0.02, 0.04) * this.U,
        g: 0, life: rand(350, 600), t0: t, size: Math.max(1, Math.round(hu * (Math.random() < 0.4 ? 1.5 : 1))), color: colors[Math.floor(rand(0, 3))],
      });
    }

    // A skill boost waiting on the hero's next words: a glowing ring at their feet and rising sparks.
    boostGlow(id, pos, feet, hu, color, t) {
      const ctx = this.ctx;
      ctx.globalAlpha = 0.55 + Math.sin(t / 120) * 0.25;
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2 + t / 500;
        this.block(pos.x + Math.cos(ang) * 7 * hu, feet + Math.sin(ang) * 1.5 * hu, hu, color);
      }
      ctx.globalAlpha = 1;
      if (t - (this.auraAt.get(`b:${id}`) || 0) < 110) return;
      this.auraAt.set(`b:${id}`, t);
      this.particles.push({
        x: pos.x + rand(-6, 6) * hu, y: feet - rand(0, 4) * hu, vx: 0, vy: -rand(0.02, 0.04) * this.U,
        g: 0, life: 500, t0: t, size: Math.max(1, Math.round(hu)), color: Math.random() < 0.5 ? color : '#ffffff',
      });
    }

    // An emote pops up in a speech bubble over the hero's head.
    drawEmote(id, pos, feet, hu, t) {
      const em = this.emotes.get(id);
      if (!em) return;
      const k = (t - em.t0) / 2200;
      if (k >= 1) {
        this.emotes.delete(id);
        return;
      }
      const ctx = this.ctx;
      const pop = k < 0.07 ? k / 0.07 : 1;
      const es = Math.round(Math.max(14, hu * 8) * (0.6 + 0.4 * pop));
      const pad = Math.round(es * 0.25);
      const bw = es + pad * 2;
      const x = Math.round(clamp(pos.x - bw / 2, 2, this.W - bw - 2));
      const y = Math.round(feet - 17 * hu - bw - Math.max(2, hu * 2) - Math.sin(k * Math.PI) * hu * 2);
      ctx.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 1;
      ctx.fillStyle = '#1b1426';
      ctx.fillRect(x - 2, y - 2, bw + 4, bw + 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, bw, bw);
      ctx.fillRect(Math.round(pos.x - hu), y + bw, Math.max(2, hu * 2), Math.max(2, hu * 2));
      ctx.font = `${es}px sans-serif`;
      ctx.fillText(EMOTES[em.e] || '', x + pad, y + pad * 0.9);
      ctx.font = `${this.fontPx}px "Press Start 2P", monospace`;
      ctx.globalAlpha = 1;
    }

    drawHeroes(t) {
      const ctx = this.ctx;
      const labels = [];
      for (const [id, pos] of this.heroPos) {
        const p = this.players.get(id);
        if (!p) continue;
        if ((this.hiddenUntil.get(id) || 0) > t) continue;
        const spr = heroSprite(p);
        const hu = pos.hu;
        const bob = Math.sin(t / 320 + (hash(id) % 100)) > 0 ? 0 : hu;
        const hopT = (t - (this.heroHop.get(id) || -1e9)) / 260;
        const hop = hopT >= 0 && hopT < 1 ? Math.sin(hopT * Math.PI) * 4 * hu : 0;
        const feet = pos.feet ?? this.feetY;
        const x = Math.round(pos.x - 8 * hu);
        const y = Math.round(feet - 16 * hu + bob - hop);
        ctx.globalAlpha = p.connected === false ? 0.35 : 1;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(Math.round(pos.x - 5 * hu), feet - hu, 10 * hu, hu);
        // A pet trots just behind its hero, hopping a beat after them.
        const pet = petSprite(p.pet);
        if (pet) {
          const ps = Math.max(1, Math.round(hu * 0.75));
          const petHop = hopT >= 0.3 && hopT < 1.3 ? Math.sin((hopT - 0.3) * Math.PI) * 2 * ps : 0;
          const px = Math.round(pos.x + (pos.flip ? 9 : -9) * hu - (pet.width * ps) / 2);
          const py = Math.round(feet - pet.height * ps + (Math.sin(t / 260 + hash(id)) > 0 ? 0 : ps) - petHop);
          this.drawSprite(pet, px, py, ps, pos.flip);
        }
        this.drawSprite(spr, x, y, hu, pos.flip);
        ctx.globalAlpha = 1;
        if ((p.streak || 0) >= 3 && p.connected !== false) this.aura(id, pos, feet, hu, p.streak, t);
        const boosted = this.auras.get(id);
        if (boosted) this.boostGlow(id, pos, feet, hu, boosted.color, t);
        this.drawEmote(id, pos, feet, hu, t);

        if (this.mode === 'host' && !this.teamMode) {
          const fs = hu >= 4 ? 16 : 8;
          const maxChars = Math.max(3, Math.floor((pos.spacing - 4) / fs));
          const name = p.name.length > maxChars ? p.name.slice(0, maxChars - 1) + '.' : p.name;
          labels.push({ text: name, x: pos.x, y: this.feetY + hu, fs, color: this.colorOf(id).Q });
        } else if (id !== this.selfId && hopT >= 0 && hopT < 6) {
          // No room for every name (phones, armies), so a hero's name pops up while they attack.
          const fs = Math.max(8, Math.round((this.fontPx * 0.67) / 8) * 8);
          labels.push({ text: p.name, x: pos.x, y: y - fs - hu, fs, color: this.colorOf(id).Q });
        }
      }
      if (this.mode === 'phone' || this.teamMode) {
        // Neighbours attacking at once would print their names on top of each other; stack them instead.
        const placed = [];
        for (const l of labels) {
          const half = (l.text.length * l.fs) / 2 + l.fs / 2;
          while (placed.some((o) => Math.abs(o.x - l.x) < half + o.half && Math.abs(o.y - l.y) < l.fs * 1.3)) l.y -= l.fs * 1.4;
          placed.push({ x: l.x, y: l.y, half });
        }
      }
      for (const l of labels) this.drawLabel(l);
    }

    // Draw a sprite at pixel scale s; flipped sprites (the army on the right) face left.
    drawSprite(spr, x, y, s, flip) {
      const ctx = this.ctx;
      if (!flip) {
        ctx.drawImage(spr, x, y, spr.width * s, spr.height * s);
        return;
      }
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(spr, -x - spr.width * s, y, spr.width * s, spr.height * s);
      ctx.restore();
    }

    drawLabel({ text, x, y, fs, color }) {
      const ctx = this.ctx;
      ctx.font = `${fs}px "Press Start 2P", monospace`;
      const w = text.length * fs;
      const nx = Math.round(clamp(x - w / 2, 2, this.W - w - 4));
      ctx.fillStyle = '#1b1426';
      ctx.fillText(text, nx + 2, y + 2);
      ctx.fillStyle = color;
      ctx.fillText(text, nx, y);
      ctx.font = `${this.fontPx}px "Press Start 2P", monospace`;
    }

    block(x, y, size, color) {
      this.ctx.fillStyle = color;
      this.ctx.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), Math.round(size), Math.round(size));
    }

    drawProjectiles(t) {
      const U = this.U;
      const keep = [];
      for (const pr of this.projectiles) {
        const k = (t - pr.t0) / pr.dur;
        if (k < 0) {
          keep.push(pr);
          continue;
        }
        if (k >= 1 && pr.onHit) {
          pr.onHit();
          pr.onHit = null;
        }
        const a = Math.atan2(pr.to.y - pr.from.y, pr.to.x - pr.from.x);
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        const x = lerp(pr.from.x, pr.to.x, Math.min(1, k));
        const y = lerp(pr.from.y, pr.to.y, Math.min(1, k));

        if (pr.kind === 'beam') {
          if (k < 1) {
            this.block(pr.from.x, pr.from.y, U * (1 + k * 3), '#fff6b0');
          } else {
            const fade = 1 - (t - pr.t0 - pr.dur) / 280;
            if (fade <= 0) continue;
            this.ctx.globalAlpha = fade;
            const len = Math.hypot(pr.to.x - pr.from.x, pr.to.y - pr.from.y);
            for (let s = 0; s <= len; s += U) {
              const bx = pr.from.x + dx * s;
              const by = pr.from.y + dy * s;
              this.block(bx, by, U * 3, '#ffd23f');
            }
            for (let s = 0; s <= len; s += U) this.block(pr.from.x + dx * s, pr.from.y + dy * s, U, '#ffffff');
            this.ctx.globalAlpha = 1;
          }
          keep.push(pr);
          continue;
        }
        if (k >= 1) continue;

        if (t - pr.trailAt > 25) {
          pr.trailAt = t;
          const tc = pr.kind === 'fireball' ? ['#ff7b1c', '#ffd23f', '#e8371c'][Math.floor(Math.random() * 3)]
            : pr.kind === 'axe' ? '#8691a6' : pr.kind === 'notes' ? pr.color.Q : TRAIL[pr.kind] || pr.color.P;
          const rises = pr.kind === 'fireball' || pr.kind === 'cannon' || pr.kind === 'soul';
          this.particles.push({
            x: x - dx * U * 2 + rand(-1, 1) * U, y: y - dy * U * 2 + rand(-1, 1) * U,
            vx: 0, vy: rises ? -0.01 * U : 0, g: 0,
            life: pr.kind === 'fireball' || pr.kind === 'cannon' ? 320 : 180, t0: t, size: U, color: tc,
          });
        }

        this.drawBolt(pr.kind, x, y, dx, dy, a, pr.color, t);
        keep.push(pr);
      }
      this.projectiles = keep;
    }

    // One frame of a hero's attack at (x, y), heading along (dx, dy) / angle a. Also used for the slower
    // team battle attacks; a cleric's beam travels as a holy orb there.
    drawBolt(kind, x, y, dx, dy, a, color, t, scale = 1) {
      const U = this.U * scale;
      switch (kind) {
        case 'slash': {
          const r = 5 * U;
          const cx = x - dx * r * 0.6;
          const cy = y - dy * r * 0.6;
          for (let i = -5; i <= 5; i++) {
            const ang = a + i * 0.2;
            this.block(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, U * 1.2, '#ffffff');
            if (Math.abs(i) <= 4) this.block(cx + Math.cos(ang) * (r - U), cy + Math.sin(ang) * (r - U), U, color.Q);
          }
          break;
        }
        case 'fireball': {
          const flick = Math.floor(t / 50) % 2;
          for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2 + flick * 0.4;
            this.block(x + Math.cos(ang) * U * 2.2, y + Math.sin(ang) * U * 2.2, U * 1.4, '#e8371c');
          }
          for (let i = 0; i < 6; i++) {
            const ang = (i / 6) * Math.PI * 2;
            this.block(x + Math.cos(ang) * U * 1.2, y + Math.sin(ang) * U * 1.2, U * 1.4, '#ff7b1c');
          }
          this.block(x, y, U * 2, '#ffd23f');
          this.block(x - U * 0.5, y - U * 0.5, U, '#ffffff');
          break;
        }
        case 'arrow': {
          this.block(x, y, U, '#ffffff');
          this.block(x - dx * U, y - dy * U, U, '#d5dbe6');
          for (let s = 2; s <= 6; s++) this.block(x - dx * U * s, y - dy * U * s, U, '#8b5a2b');
          const px = -dy;
          const py = dx;
          for (const s of [6, 7]) {
            this.block(x - dx * U * s + px * U, y - dy * U * s + py * U, U, color.P);
            this.block(x - dx * U * s - px * U, y - dy * U * s - py * U, U, color.P);
          }
          break;
        }
        case 'dagger': {
          const b = Math.max(2, U * 0.8);
          this.block(x, y, b, '#ffffff');
          this.block(x - dx * b, y - dy * b, b, '#d5dbe6');
          this.block(x - dx * b * 2, y - dy * b * 2, b, '#d5dbe6');
          this.block(x - dx * b * 3, y - dy * b * 3, b, color.P);
          this.block(x - dx * b * 4, y - dy * b * 4, b, '#f5c542');
          break;
        }
        case 'axe': {
          const spr = axeSprite();
          const step = Math.floor(t / 70) % 4;
          this.ctx.save();
          this.ctx.translate(Math.round(x), Math.round(y));
          this.ctx.rotate((step * Math.PI) / 2);
          this.ctx.drawImage(spr, Math.round((-spr.width * U) / 2), Math.round((-spr.height * U) / 2), spr.width * U, spr.height * U);
          this.ctx.restore();
          break;
        }
        case 'beam': {
          const pulse = Math.floor(t / 90) % 2;
          for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            this.block(x + Math.cos(ang) * U * (2 + pulse * 0.5), y + Math.sin(ang) * U * (2 + pulse * 0.5), U, '#ffd23f');
          }
          this.block(x, y, U * 2.4, '#fff6b0');
          this.block(x, y, U, '#ffffff');
          break;
        }
        case 'shuriken': {
          // A four-pointed star, spinning.
          const spin = t / 45;
          for (let i = 0; i < 4; i++) {
            const ang = spin + (i * Math.PI) / 2;
            this.block(x + Math.cos(ang) * U, y + Math.sin(ang) * U, U, '#d5dbe6');
            this.block(x + Math.cos(ang) * U * 2, y + Math.sin(ang) * U * 2, U, '#ffffff');
          }
          this.block(x, y, U, '#8691a6');
          break;
        }
        case 'soul': {
          // A ghostly green skull that wobbles as it flies.
          const wy = y + Math.sin(t / 70) * U * 0.6;
          this.block(x, wy, U * 2.8, '#7dff6b');
          this.block(x, wy, U * 1.8, '#c8ffbf');
          this.block(x - U * 0.6, wy - U * 0.3, U * 0.7, '#1b1426');
          this.block(x + U * 0.6, wy - U * 0.3, U * 0.7, '#1b1426');
          this.block(x, wy + U * 0.8, U * 0.6, '#1b1426');
          break;
        }
        case 'thorn': {
          // A thorny vine whipping forward, light at the tip.
          const px = -dy;
          const py = dx;
          for (let s = 0; s < 5; s++) {
            const sway = Math.sin(t / 60 + s) * U * 0.6;
            this.block(x - dx * U * s + px * sway, y - dy * U * s + py * sway, U * (s ? 1.1 : 1.4), s % 2 ? '#2f7d4a' : '#4fa865');
            if (s % 2) this.block(x - dx * U * s + px * U * 1.2, y - dy * U * s + py * U * 1.2, U * 0.6, '#b6f59a');
          }
          break;
        }
        case 'cannon': {
          this.block(x, y, U * 2.6, '#1b1426');
          this.block(x - U * 0.5, y - U * 0.5, U * 0.9, '#8691a6');
          break;
        }
        case 'notes': {
          // A music note in the hero's color: head, stem and flag.
          const wy = y + Math.sin(t / 80 + x) * U;
          this.block(x, wy, U * 1.5, color.Q);
          this.block(x + U * 0.8, wy - U * 1.2, U * 0.6, color.Q);
          this.block(x + U * 0.8, wy - U * 2, U * 0.6, color.Q);
          this.block(x + U * 1.4, wy - U * 2, U * 0.6, color.P);
          break;
        }
        case 'spear': {
          // A thrown spear crackling with lightning.
          this.block(x, y, U, '#ffffff');
          this.block(x - dx * U, y - dy * U, U, '#d5dbe6');
          for (let s = 2; s <= 8; s++) this.block(x - dx * U * s, y - dy * U * s, U, '#8b5a2b');
          for (let i = 0; i < 2; i++) this.block(x + rand(-2, 2) * U, y + rand(-2, 2) * U, U * 0.8, i ? '#fff6b0' : '#7fd4ff');
          break;
        }
        default:
          this.block(x, y, U * 2, '#ffffff');
      }
    }

    drawParticles(t, dt) {
      const ctx = this.ctx;
      const keep = [];
      for (const p of this.particles) {
        const age = t - p.t0;
        if (age > p.life) continue;
        if (age < 0) {
          keep.push(p); // starts a moment later
          continue;
        }
        if (p.ring) {
          const k = age / p.life;
          const r = this.U * (2 + k * 9);
          ctx.globalAlpha = 1 - k;
          for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            this.block(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, this.U, p.color);
          }
          ctx.globalAlpha = 1;
          keep.push(p);
          continue;
        }
        p.vy += p.g * dt;
        p.x += p.vx * dt + (p.sway ? Math.sin(t / 300 + p.sway) * 0.4 : 0);
        p.y += p.vy * dt;
        ctx.globalAlpha = Math.min(1, (1 - age / p.life) * 1.6);
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
        keep.push(p);
      }
      ctx.globalAlpha = 1;
      this.particles = keep.length > 1500 ? keep.slice(-1500) : keep;
    }

    drawTexts(t) {
      const ctx = this.ctx;
      const fp = this.fontPx;
      const keep = [];
      for (const tx of this.texts) {
        const k = (t - tx.t0) / tx.life;
        if (k >= 1) continue;
        const y = Math.round(tx.y - k * this.U * 10);
        ctx.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
        const small = fp >= 24 ? fp / 2 : 8;
        const lines = tx.name ? [[tx.name, small, '#ffffff'], [tx.text, fp, tx.color]] : [[tx.text, fp, tx.color]];
        if (tx.sub) lines.push([tx.sub, small, '#ffd23f']);
        let ly = y;
        for (const [str, size, color] of lines) {
          ctx.font = `${size}px "Press Start 2P", monospace`;
          const x = Math.round(tx.x - (str.length * size) / 2);
          const o = Math.max(2, Math.round(size / 8));
          ctx.fillStyle = '#1b1426';
          for (const [ox, oy] of [[-o, 0], [o, 0], [0, -o], [0, o]]) ctx.fillText(str, x + ox, ly + oy);
          ctx.fillStyle = color;
          ctx.fillText(str, x, ly);
          ly += size + o * 2;
        }
        keep.push(tx);
      }
      ctx.globalAlpha = 1;
      ctx.font = `${fp}px "Press Start 2P", monospace`;
      this.texts = keep;
    }
  }

  window.Arena = Arena;
})();
