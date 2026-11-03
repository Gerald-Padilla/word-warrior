// The battlefield: pixel background, falling monsters with words, heroes, attacks and effects.
// Used by both the host screen and phones. A team battle is a different scene: two armies face off and
// fling word-carrying attacks at each other (see the "team battle" sections).
(function () {
  const { heroSprite, petSprite, monsterSprite, axeSprite, powerSprite, COLORS, MONSTERS, POWERS } = window.Art;
  const { TEAMS } = window.WW;

  const THEMES = {
    slime: {
      sky: ['#140f2b', '#1f1840', '#2e2152', '#46306a', '#6a3f7a', '#8f5585'],
      moon: '#fff2c4', crater: '#e6d39a', mountain: '#2a1f45', hill: '#1c2238', castle: '#120d22',
      window: '#ffd23f', grass: '#3f9b3d', grassLight: '#68c74f', dirt: '#5c3a1e', dirtDark: '#40280f',
    },
    bat: {
      sky: ['#05081a', '#0b1230', '#132048', '#1c2f5e', '#264070', '#33547e'],
      moon: '#e4ecff', crater: '#b8c4e6', mountain: '#141c38', hill: '#0f1a2a', castle: '#080c18',
      window: '#9fd7ff', grass: '#2f7d4a', grassLight: '#4fa865', dirt: '#3e2c22', dirtDark: '#2a1c14',
    },
    skull: {
      sky: ['#1a0505', '#2e0909', '#4a0f0c', '#6e1a10', '#9a2c12', '#c4481a'],
      moon: '#ff9a3c', crater: '#d4671f', mountain: '#2a0c0c', hill: '#1e0808', castle: '#120404',
      window: '#ff5a1f', grass: '#5a3a2a', grassLight: '#7d4f30', dirt: '#3a1a10', dirtDark: '#24100a',
    },
  };

  const ATTACK = { knight: 'slash', wizard: 'fireball', archer: 'arrow', rogue: 'dagger', cleric: 'beam', barbarian: 'axe' };

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
      const th = THEMES[this.monster];
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

      // Stars; a few twinkle at runtime.
      this.stars = [];
      const starCount = Math.round((bw * gr) / 70);
      for (let i = 0; i < starCount; i++) {
        const x = Math.floor(rnd() * bw);
        const y = Math.floor(rnd() * gr * 0.65);
        g.fillStyle = rnd() < 0.8 ? 'rgba(255,255,255,0.55)' : '#ffe9a8';
        g.fillRect(x, y, 1, 1);
        if (rnd() < 0.12) this.stars.push({ x, y, phase: rnd() * 6 });
      }

      // Moon.
      const r = Math.max(4, Math.round(Math.min(bw, gr) * 0.07));
      const mx = Math.floor(bw * (this.mode === 'host' ? 0.72 : 0.8));
      const my = Math.floor(gr * 0.2);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          g.fillStyle = dx * dx + dy * dy > (r - 1) * (r - 1) && dx > 0 ? th.crater : th.moon;
          g.fillRect(mx + dx, my + dy, 1, 1);
        }
      }
      g.fillStyle = th.crater;
      g.fillRect(mx - Math.round(r / 3), my - Math.round(r / 4), 2, 2);
      g.fillRect(mx + Math.round(r / 4), my + Math.round(r / 3), 2, 1);
      g.fillRect(mx - Math.round(r / 6), my + Math.round(r / 2), 1, 1);

      // Mountains.
      const p1 = rnd() * 6;
      const p2 = rnd() * 6;
      g.fillStyle = th.mountain;
      for (let x = 0; x < bw; x++) {
        const h = Math.round(gr * 0.32 + Math.sin(x * 0.045 + p1) * gr * 0.09 + Math.sin(x * 0.13 + p2) * gr * 0.035);
        g.fillRect(x, gr - h, 1, h);
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
      return { p, cx, top, mw, mh, plateW, plateH, cy: top + mh / 2, py: top + mh + U };
    }

    kill(wordId, playerId, points) {
      const w = this.words.get(wordId);
      if (!w) return;
      this.words.delete(wordId);
      const L = this.layoutWord(w, this.now());
      const color = this.colorOf(playerId);
      const dying = { w, L, color, t0: performance.now() };
      this.dying.push(dying);
      const player = this.players.get(playerId);
      const from = this.heroOrigin(playerId);
      this.heroHop.set(playerId, performance.now());
      this.launch(player ? player.cls : 'knight', from, { x: L.cx, y: L.cy }, color, () => {
        this.dying = this.dying.filter((d) => d !== dying);
        this.explode(L.cx, L.cy, color);
        const showName = this.mode === 'host' || playerId !== this.selfId;
        this.floatText(L.cx, L.top, `+${points}`, color.Q, showName && player ? player.name : null);
        if (this.onHit) this.onHit(playerId);
      });
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
    duelBlock(id, by) {
      const w = this.words.get(id);
      if (!w) return;
      const L = this.missilePos(w, this.now());
      this.words.delete(id);
      const color = this.colorOf(by);
      const dying = { w, L, color, t0: performance.now() };
      this.dying.push(dying);
      const player = this.players.get(by);
      this.heroHop.set(by, performance.now());
      this.launch(player ? player.cls : 'knight', this.heroOrigin(by), { x: L.x, y: L.y }, color, () => {
        this.dying = this.dying.filter((d) => d !== dying);
        this.explode(L.x, L.y, color);
        this.floatText(L.x, L.y - 2 * this.U, 'BLOCKED!', color.Q, player ? player.name : null);
        if (this.onHit) this.onHit(by);
      });
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

    retime(list) {
      for (const r of list) {
        const w = this.words.get(r.id);
        if (w) Object.assign(w, { launch: r.launch, dur: r.dur });
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
      const speed = this.H * 0.0028 * (kind === 'arrow' ? 1.4 : kind === 'axe' ? 0.85 : 1);
      const dur = kind === 'beam' ? 170 : clamp(dist / speed, 160, 650);
      const t0 = performance.now();
      const base = { kind, from, to, color, t0, dur, trailAt: 0 };
      if (kind === 'dagger') {
        const perp = Math.atan2(to.y - from.y, to.x - from.x) + Math.PI / 2;
        [0, 1, 2].forEach((i) => {
          const off = (i - 1) * this.U * 3;
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

    explode(x, y, color) {
      const fx = MONSTERS[this.monster].fx;
      const U = this.U;
      for (let i = 0; i < 26; i++) {
        const a = rand(0, Math.PI * 2);
        const v = rand(0.012, 0.045) * U;
        this.particles.push({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.01 * U,
          g: 0.00009 * U, life: rand(450, 850), t0: performance.now(),
          size: U * (Math.random() < 0.3 ? 2 : 1),
          color: i % 4 === 0 ? color.Q : i % 5 === 0 ? '#ffffff' : fx[i % fx.length],
        });
      }
      this.particles.push({ ring: true, x, y, t0: performance.now(), life: 260, color: '#ffffff' });
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

    floatText(x, y, text, color, name) {
      this.texts.push({ x, y, text, color, name, t0: performance.now(), life: 1100 });
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
      ctx.drawImage(this.bg, 0, 0, this.bg.width * U, this.bg.height * U);

      for (const s of this.stars) {
        if (Math.sin(t / 400 + s.phase) > 0.6) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(s.x * U, s.y * U, U, U);
        }
      }

      ctx.font = `${this.fontPx}px "Press Start 2P", monospace`;
      ctx.textBaseline = 'top';

      if (this.teamMode && this.geo) {
        this.drawDuel(t, now);
      } else {
        const mon = MONSTERS[this.monster];
        for (const w of this.words.values()) {
          const L = this.layoutWord(w, now);
          if (L.p < 0) continue;
          if (L.p > 1) {
            if (L.p > 1 + 1500 / w.dur) this.words.delete(w.id); // missed escape event
            continue;
          }
          const frame = Math.floor((t + w.id * 97) / mon.frameMs) % 2;
          this.drawMonster(L, frame);
          this.drawPlate(w, L, t);
        }
        for (const d of this.dying) {
          if (t - d.t0 > 1500) continue;
          if (Math.floor((t - d.t0) / 60) % 2 === 0) this.drawMonster(d.L, 0);
          this.drawPlate(d.w, d.L, t, d.color.Q);
        }
      }
      this.dying = this.dying.filter((d) => t - d.t0 <= 1500);

      this.drawHeroes(t);
      if (this.teamMode && this.geo) this.drawEffects(t);
      this.drawProjectiles(t);
      this.drawParticles(t, dt);
      this.drawTexts(t);

      const fk = (t - this.flashAt) / 320;
      if (fk < 1) {
        ctx.globalAlpha = 0.35 * (1 - fk);
        ctx.fillStyle = this.flashColor;
        ctx.fillRect(0, 0, this.W, this.H);
        ctx.globalAlpha = 1;
      }
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
        if (t - d.t0 > 1500 || Math.floor((t - d.t0) / 60) % 2) continue;
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

    drawHeroes(t) {
      const ctx = this.ctx;
      const labels = [];
      for (const [id, pos] of this.heroPos) {
        const p = this.players.get(id);
        if (!p) continue;
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
            : pr.kind === 'axe' ? '#8691a6' : pr.color.P;
          this.particles.push({
            x: x - dx * U * 2 + rand(-1, 1) * U, y: y - dy * U * 2 + rand(-1, 1) * U,
            vx: 0, vy: pr.kind === 'fireball' ? -0.01 * U : 0, g: 0,
            life: pr.kind === 'fireball' ? 320 : 180, t0: t, size: U, color: tc,
          });
        }

        this.drawBolt(pr.kind, x, y, dx, dy, a, pr.color, t);
        keep.push(pr);
      }
      this.projectiles = keep;
    }

    // One frame of a hero's attack at (x, y), heading along (dx, dy) / angle a. Also used for the slower
    // team battle attacks; a cleric's beam travels as a holy orb there.
    drawBolt(kind, x, y, dx, dy, a, color, t) {
      const U = this.U;
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
        const lines = tx.name ? [[tx.name, fp >= 24 ? fp / 2 : 8, '#ffffff'], [tx.text, fp, tx.color]] : [[tx.text, fp, tx.color]];
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
