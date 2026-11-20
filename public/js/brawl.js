// Duel: the arena on screen, and the phone's controls. The big screen shows the whole courtyard; a phone
// follows its own hero, with a minimap. The server sends snapshots (see snapshot() in brawl.js); everyone
// else is drawn a moment in the past, between two snapshots, so they move smoothly. Your own hero is drawn
// where your controls are taking it, so moving feels instant.
(function () {
  const R = window.BrawlRules;
  const { heroSprite, petSprite, monsterSprite, bossSprite, powerSprite, classByKey, COLORS, MONSTERS: MON_ART, POWERS } = window.Art;
  const { ARENA, HERO_R, F, KITS, ITEMS, ITEM_KEYS, MONSTER_TYPES } = R;
  const { Sfx } = window.WW;

  const PX = 3.6; // arena units per sprite pixel
  const FLOOR_UNIT = 2.5; // arena units per floor pixel
  const EXTRA_DELAY = 75; // others are drawn this long behind the newest snapshot (plus the trip here)
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const angLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

  function paint(rows, pal) {
    const c = document.createElement('canvas');
    c.width = rows[0].length;
    c.height = rows.length;
    const g = c.getContext('2d');
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const col = pal[row[x]];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    });
    return c;
  }
  const KEG_SPRITE = (() => {
    const rows = ['..KKKKKK..', '.KbBBBBbK.', 'KBBBBBBBBK', 'KmmmmmmmmK', 'KBBBRRBBBK', 'KBBRYYRBBK', 'KBBRYYRBBK',
      'KBBBRRBBBK', 'KmmmmmmmmK', 'KBBBBBBBBK', '.KbBBBBbK.', '..KKKKKK..'];
    return () => paint(rows, { ...window.Art.BASE, R: '#e8371c', Y: '#ffd23f' });
  })();
  let kegSprite = null;
  const GRAVE = ['..KKKK..', '.KwWWwK.', 'KwWKKWwK', 'KWKKKKWK', 'KwWKKWwK', 'KwWKKWwK', 'KwWWWWwK', 'KKKKKKKK'];
  let graveSprite = null;

  // How each kind of hit looks when it lands.
  const BLAST = {
    boom: ['#ff7b1c', '#ffd23f', '#e8371c'], splash: ['#ff7b1c', '#ffd23f'], keg: ['#ff7b1c', '#ffd23f', '#e8371c', '#8691a6'],
    bomb: ['#ff7b1c', '#ffd23f', '#1b1426'], meteor: ['#ff5a1f', '#ffd23f', '#e8371c', '#ffffff'], cannon: ['#8691a6', '#ffd23f', '#1b1426'],
    holy: ['#fff6b0', '#ffd23f', '#ffffff'], hymn: ['#bb8cff', '#ff9ad0', '#7aa7ff'],
  };
  const MOB_FX = { slime: ['#6fd34f', '#3c8f2a', '#b6f59a'], bat: ['#7a55b0', '#45306b', '#ff3b3b'], skull: ['#ff7b1c', '#ffd23f', '#efe6d0'],
    boss: ['#c0262e', '#ff9a3c', '#ffd23f'], ghost: ['#7dff6b', '#c8ffbf'] };
  const MOB_NAME = { slime: 'A SLIME', bat: 'A BAT', skull: 'A SKULL', boss: 'THE DRAGON KING', ghost: 'A GHOST', keg: 'A KEG' };

  class BrawlView {
    // phone: follow selfId's hero, with a minimap and your own controls predicted.
    constructor(canvas, { now = () => Date.now(), phone = false } = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.now = now;
      this.phone = phone;
      this.selfId = null;
      this.looks = new Map(); // playerId -> look and name
      this.layout = -1;
      this.map = null;
      this.floor = null;
      this.reserveTop = 0;
      this.reserveRight = 0;
      this.active = false;
      this.input = { mx: 0, my: 0, ax: 0, ay: 0, fire: false };
      this.onNews = null; // the page hears about KOs, skills and power-ups too
      this.reset();
      new ResizeObserver(() => this.resize()).observe(canvas);
      this.resize();
      this.last = performance.now();
      requestAnimationFrame(this.loop);
    }

    reset() {
      this.snaps = [];
      this.latest = null;
      this.lag = null;
      this.shots = new Map();
      this.queue = []; // things to show once the drawn moment reaches them
      this.items = [];
      this.kegs = '';
      this.zones = [];
      this.slow = null;
      this.particles = [];
      this.texts = [];
      this.rings = [];
      this.bolts = [];
      this.callouts = [];
      this.banners = [];
      this.feed = [];
      this.graves = new Map(); // playerId -> { x, y, until }
      this.pets = new Map();
      this.hurtAt = new Map(); // monster or hero id -> when it was last hit (flash)
      this.self = null; // phone: { x, y } where your hero is drawn
      this.lead = null; // phone: how far ahead of the server your hero is drawn
      this.shakeUntil = 0;
      this.shakePow = 0;
      this.flashUntil = 0;
      this.roarAt = 0;
      this.bossShown = false;
    }

    setPlayers(list) {
      this.looks = new Map(list.map((p) => [p.id, p]));
    }

    setLayout(index) {
      if (index === this.layout) return;
      this.layout = index;
      this.map = R.buildLayout(index);
      this.floor = this.buildFloor();
    }

    setReserve(top, right) {
      this.reserveTop = top;
      this.reserveRight = right;
      this.resize();
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const shown = this.canvas.clientWidth ? this.canvas.getBoundingClientRect().width / this.canvas.clientWidth : 1;
      this.dpr = dpr * (shown > 1.01 ? Math.min(shown, 2.5) : 1);
      this.W = Math.max(1, Math.round(this.canvas.clientWidth * this.dpr));
      this.H = Math.max(1, Math.round(this.canvas.clientHeight * this.dpr));
      if (this.canvas.width !== this.W) this.canvas.width = this.W;
      if (this.canvas.height !== this.H) this.canvas.height = this.H;
    }

    // ---- the arena floor, drawn once ---------------------------------------
    buildFloor() {
      const c = document.createElement('canvas');
      const U = FLOOR_UNIT;
      c.width = ARENA.W / U;
      c.height = ARENA.H / U;
      const g = c.getContext('2d');
      const T = ARENA.TILE / U; // 20 floor pixels a tile
      let seed = 1234 + this.layout * 77;
      const rnd = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      const flag = ['#4f4870', '#4a4368', '#534c76', '#47405f'];
      for (let ty = 0; ty < R.ROWS; ty++) {
        for (let tx = 0; tx < R.COLS; tx++) {
          g.fillStyle = flag[Math.floor(rnd() * flag.length)];
          g.fillRect(tx * T, ty * T, T, T);
          g.fillStyle = '#3a3452';
          g.fillRect(tx * T, ty * T, T, 1);
          g.fillRect(tx * T, ty * T, 1, T);
          g.fillStyle = 'rgba(255,255,255,0.05)';
          g.fillRect(tx * T + 1, ty * T + 1, T - 2, 1);
          if (rnd() < 0.18) {
            // a crack
            g.fillStyle = '#3a3452';
            let x = tx * T + 4 + rnd() * 10;
            let y = ty * T + 4 + rnd() * 10;
            for (let i = 0; i < 5; i++) {
              g.fillRect(Math.round(x), Math.round(y), 1, 1);
              x += rnd() < 0.5 ? 1 : 0;
              y += 1;
            }
          }
          if (rnd() < 0.08) {
            // moss
            g.fillStyle = '#3f6b45';
            for (let i = 0; i < 9; i++) g.fillRect(tx * T + Math.floor(rnd() * T), ty * T + Math.floor(rnd() * T), 2, 1);
          }
        }
      }
      // The rim of the courtyard, and the four gates monsters come through.
      g.fillStyle = '#2a2238';
      g.fillRect(0, 0, c.width, 6);
      g.fillRect(0, c.height - 6, c.width, 6);
      g.fillRect(0, 0, 6, c.height);
      g.fillRect(c.width - 6, 0, 6, c.height);
      g.fillStyle = '#5a4f73';
      for (let x = 0; x < c.width; x += 16) g.fillRect(x, 0, 10, 3);
      for (const gate of R.GATES) {
        const gx = gate.x / U;
        const gy = gate.y / U;
        const across = gate.y === ARENA.H / 2;
        const w = across ? 10 : 44;
        const h = across ? 44 : 10;
        const x = across ? (gx < c.width / 2 ? 0 : c.width - w) : gx - w / 2;
        const y = across ? gy - h / 2 : gy < c.height / 2 ? 0 : c.height - h;
        g.fillStyle = '#120c1c';
        g.fillRect(x, y, w, h);
        g.fillStyle = '#6e4a24';
        if (across) {
          for (let i = 0; i < h; i += 6) g.fillRect(gx < c.width / 2 ? w - 2 : x, y + i, 2, 3);
        } else {
          for (let i = 0; i < w; i += 6) g.fillRect(x + i, gy < c.height / 2 ? h - 2 : y, 3, 2);
        }
      }
      // Walls and crates.
      for (const b of this.map.blocks) {
        const x = b.x / U;
        const y = b.y / U;
        const w = b.w / U;
        const h = b.h / U;
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(x + 3, y + 4, w, h); // shadow
        if (b.kind === 'wall') {
          g.fillStyle = '#1b1426';
          g.fillRect(x, y, w, h);
          g.fillStyle = '#6e6488';
          g.fillRect(x + 1, y + 1, w - 2, h - 8);
          g.fillStyle = '#4a3f63';
          g.fillRect(x + 1, y + h - 7, w - 2, 6);
          g.fillStyle = '#857aa3';
          g.fillRect(x + 1, y + 1, w - 2, 1);
          g.fillStyle = '#5a5073';
          for (let by = y + 5; by < y + h - 8; by += 5) {
            g.fillRect(x + 1, by, w - 2, 1);
            const off = ((by - y) / 5) % 2 ? 4 : 9;
            for (let bx = x + off; bx < x + w - 1; bx += 10) g.fillRect(bx, by - 4, 1, 4);
          }
          g.fillStyle = '#3a3150';
          for (let bx = x + 3; bx < x + w - 2; bx += 6) g.fillRect(bx, y + h - 6, 1, 4);
        } else {
          g.fillStyle = '#1b1426';
          g.fillRect(x, y, w, h);
          for (let ty = 0; ty < h; ty += T) {
            for (let tx = 0; tx < w; tx += T) {
              const cx = x + tx;
              const cy = y + ty;
              g.fillStyle = '#a0703c';
              g.fillRect(cx + 1, cy + 1, T - 2, T - 2);
              g.fillStyle = '#6e4a24';
              g.fillRect(cx + 1, cy + T - 4, T - 2, 3);
              g.fillStyle = '#c08a4c';
              g.fillRect(cx + 1, cy + 1, T - 2, 1);
              g.fillStyle = '#6e4a24';
              for (let i = 3; i < T - 3; i++) {
                g.fillRect(cx + i, cy + i - 1, 2, 1);
                g.fillRect(cx + T - 1 - i, cy + i - 1, 2, 1);
              }
              g.fillStyle = '#1b1426';
              g.fillRect(cx, cy, 1, T);
              g.fillRect(cx, cy, T, 1);
            }
          }
        }
      }
      // A little darkness in the corners.
      const v = g.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.35, c.width / 2, c.height / 2, c.width * 0.62);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(10,4,20,0.45)');
      g.fillStyle = v;
      g.fillRect(0, 0, c.width, c.height);
      return c;
    }

    // ---- snapshots --------------------------------------------------------
    onSnap(s) {
      const lag = this.now() - s.t;
      this.lag = this.lag === null ? lag : lerp(this.lag, lag, lag > this.lag ? 0.25 : 0.06);
      const heroes = new Map();
      for (const r of s.h) {
        heroes.set(r[0], { id: r[0], x: r[1], y: r[2], hp: r[3], face: r[4] / 100, f: r[5], charge: r[6], score: r[7], kos: r[8], respawn: r[9] });
      }
      const mons = new Map();
      for (const r of s.m) mons.set(r[0], { id: r[0], type: MONSTER_TYPES[r[1]], x: r[2], y: r[3], hp: r[4], owner: r[5], stun: r[6] });
      this.snaps.push({ t: s.t, heroes, mons });
      if (this.snaps.length > 40) this.snaps.splice(0, this.snaps.length - 40);
      this.latest = this.snaps[this.snaps.length - 1];
      this.items = s.i.map((r) => ({ id: r[0], kind: ITEM_KEYS[r[1]], x: r[2], y: r[3], until: r[4] }));
      this.kegs = s.k;
      this.zones = s.z.map((r) => ({ id: r[0], kind: r[1], x: r[2], y: r[3], r: r[4], at: r[5], until: r[6], owner: r[7] }));
      this.slow = s.slow;
      this.addShots(s.s);
      for (const g of s.g) {
        const S = this.shots.get(g[0]);
        if (S) Object.assign(S, { endT: g[1], ex: g[2], ey: g[3], impact: g[4] });
      }
      for (const h of s.hm) {
        const S = this.shots.get(h[0]);
        if (S && !S.endT) {
          const k = (s.t - S.t0) / 1000;
          S.travel += Math.hypot(S.vx, S.vy) * Math.max(0, k);
          Object.assign(S, { x0: h[1], y0: h[2], vx: h[3], vy: h[4], t0: s.t });
        }
      }
      for (const e of s.fx) this.queue.push({ fx: e, t: e.t });
      for (const e of s.n || []) this.queue.push({ news: e, t: e.t });
    }

    addShots(rows) {
      for (const r of rows) {
        this.shots.set(r[0], { id: r[0], kind: r[1], x0: r[2], y0: r[3], vx: r[4], vy: r[5], range: r[6], owner: r[7], t0: r[8], homing: r[9], travel: 0 });
      }
    }

    // The moment being drawn, on the server's clock.
    renderTime() {
      return this.now() - (this.lag === null ? 0 : this.lag) - EXTRA_DELAY;
    }

    // Everyone's position at time t, between the snapshots either side.
    frameAt(t) {
      const S = this.snaps;
      if (!S.length) return null;
      let a = S[0];
      let b = S[0];
      if (t <= S[0].t) a = b = S[0];
      else if (t >= S[S.length - 1].t) a = b = S[S.length - 1];
      else {
        for (let i = S.length - 1; i > 0; i--) {
          if (S[i - 1].t <= t) {
            a = S[i - 1];
            b = S[i];
            break;
          }
        }
      }
      const k = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 1;
      const heroes = [];
      for (const hb of b.heroes.values()) {
        const ha = a.heroes.get(hb.id) || hb;
        const jump = Math.hypot(hb.x - ha.x, hb.y - ha.y) > 150; // a respawn or a Shadow Step: no sliding
        heroes.push({ ...hb, x: jump ? hb.x : lerp(ha.x, hb.x, k), y: jump ? hb.y : lerp(ha.y, hb.y, k), face: angLerp(ha.face, hb.face, k),
          f: k < 0.5 ? ha.f : hb.f, moving: Math.hypot(hb.x - ha.x, hb.y - ha.y) > 0.5 });
      }
      const mons = [];
      for (const mb of b.mons.values()) {
        const ma = a.mons.get(mb.id) || mb;
        mons.push({ ...mb, x: lerp(ma.x, mb.x, k), y: lerp(ma.y, mb.y, k), dx: mb.x - ma.x });
      }
      return { heroes, mons };
    }

    hero(id) {
      return this.latest ? this.latest.heroes.get(id) || null : null;
    }

    // The standings, from the newest snapshot: score, KOs, HP.
    standings() {
      if (!this.latest) return [];
      return [...this.latest.heroes.values()];
    }

    // ---- what happened ----------------------------------------------------
    runQueue(t) {
      if (!this.queue.length) return;
      const later = [];
      for (const q of this.queue) {
        if (q.t > t + 5) later.push(q);
        else if (q.fx) this.showFx(q.fx);
        else this.showNews(q.news);
      }
      this.queue = later;
    }

    showFx(e) {
      const mine = this.phone && (e.id === this.selfId);
      switch (e.k) {
        case 'hit': {
          // Numbers for hits on heroes, and big hits on monsters; on a phone, every hit you land.
          const dealt = this.phone && e.by === this.selfId;
          if (!e.m || e.d >= 20 || dealt) {
            const big = e.d >= 30;
            const color = dealt ? '#ffd23f' : e.m ? '#ffffff' : mine ? '#ff5a4d' : '#ff9a8a';
            this.texts.push({ x: e.x + rand(-6, 6), y: e.y, text: String(e.d), color, t0: performance.now(), life: 700, size: big ? 18 : 13 });
          }
          this.hurtAt.set(e.m || e.id, performance.now());
          this.burst(e.x, e.y + 20, ['#ffffff', '#ffd23f'], 4, 0.12);
          if (mine) {
            this.flashUntil = performance.now() + 160;
            if (this.every('buzz', 250) && navigator.vibrate) navigator.vibrate(30);
            if (this.every('hit', 120)) Sfx.play('hit');
          } else if (!this.phone && !e.m && this.every('hit', 160)) Sfx.play('hit');
          break;
        }
        case 'block':
        case 'dodge':
          this.texts.push({ x: e.x, y: e.y, text: e.k === 'block' ? 'BLOCK' : 'DODGE!', color: '#7fd4ff', t0: performance.now(), life: 600, size: 11 });
          break;
        case 'mdie': {
          const type = MONSTER_TYPES[e.m];
          this.burst(e.x, e.y, MOB_FX[type] || MOB_FX.slime, type === 'boss' ? 80 : 16, type === 'boss' ? 0.4 : 0.22);
          if (e.pts) this.texts.push({ x: e.x, y: e.y - 20, text: `+${e.pts}`, color: '#ffd23f', t0: performance.now(), life: 900, size: 12 });
          break;
        }
        case 'spawn':
          for (let i = 0; i < 14; i++) {
            this.particles.push({ x: e.x + rand(-16, 16), y: e.y + rand(-4, 20), vx: 0, vy: rand(-0.12, -0.05), g: 0, life: rand(400, 800),
              t0: performance.now(), size: 4, color: i % 2 ? '#fff6b0' : '#ffffff' });
          }
          break;
        case 'roar':
          this.roarAt = performance.now();
          this.shake(3, 400);
          Sfx.play('roar');
          break;
        case 'thunder':
          this.rings.push({ x: e.x, y: e.y, r: e.r, color: '#7fd4ff', t0: performance.now(), life: 500 });
          for (const [x, y] of e.to) this.bolts.push({ x, y, t0: performance.now(), life: 350 });
          this.shake(4, 350);
          break;
        default:
          if (BLAST[e.k]) {
            const r = e.r || 80;
            this.rings.push({ x: e.x, y: e.y, r, color: BLAST[e.k][0], t0: performance.now(), life: 420 });
            this.burst(e.x, e.y, BLAST[e.k], Math.min(50, 10 + r / 5), 0.25 + r / 900);
            if (r >= 100) {
              this.shake(r >= 140 ? 6 : 4, 400);
              Sfx.play('boom');
            } else if (!this.phone && this.every('hit', 160)) Sfx.play('hit');
          }
      }
    }

    showNews(n) {
      const name = (id) => (this.looks.get(id) || {}).name || 'Someone';
      const color = (id) => (COLORS[(this.looks.get(id) || {}).color] || COLORS[0]).Q;
      if (n.type === 'ko') {
        this.burst(n.x, n.y, ['#ffffff', '#ff5a4d', '#ffd23f'], 26, 0.3);
        this.rings.push({ x: n.x, y: n.y, r: 60, color: '#ffffff', t0: performance.now(), life: 400 });
        this.graves.set(n.id, { x: n.x, y: n.y, until: n.t + R.RESPAWN_MS });
        this.feed.unshift({ by: n.by, id: n.id, mob: n.mob, why: n.why, t0: performance.now() });
        this.feed.length = Math.min(this.feed.length, this.phone ? 3 : 6);
        const meIn = this.phone && (n.by === this.selfId || n.id === this.selfId);
        if (!this.phone || meIn) Sfx.play(n.id === this.selfId ? 'miss' : 'boom');
        if (n.by) {
          if (n.shutdown) this.callout('SHUTDOWN!', '#7fd4ff', `${name(n.by)} ended ${name(n.id)}'s run`);
          else if (n.streak === 3) this.callout('RAMPAGE!', '#ff7b1c', `${name(n.by)}: 3 KOs in a row`);
          else if (n.streak === 5) this.callout('UNSTOPPABLE!', '#ff4d4d', `${name(n.by)}: 5 KOs in a row`);
          else if (n.streak >= 7 && n.streak % 2 === 1) this.callout('LEGENDARY!', '#ffd23f', `${name(n.by)}: ${n.streak} KOs in a row`);
          if (this.phone && n.by === this.selfId) {
            this.texts.push({ x: n.x, y: n.y - 40, text: `KO! +${n.pts}`, color: '#ffd23f', t0: performance.now(), life: 1200, size: 18 });
            Sfx.play('streak');
          }
        }
      } else if (n.type === 'skill') {
        const kit = KITS[n.cls];
        this.banners.unshift({ name: name(n.id), skill: kit ? kit.skill.name : '', color: color(n.id), t0: performance.now(), mine: n.id === this.selfId });
        this.banners.length = Math.min(this.banners.length, 3);
        if (!this.phone || n.id === this.selfId) Sfx.play(`skill:${n.cls}`);
        this.rings.push({ x: n.x, y: n.y, r: 70, color: color(n.id), t0: performance.now(), life: 500 });
        if (n.cls === 'rogue' && n.at) {
          this.burst(n.at.x, n.at.y, ['#2a2238', '#5a4f73', '#a99cc7'], 24, 0.18);
          this.burst(n.x, n.y, ['#2a2238', '#5a4f73'], 14, 0.15);
        }
        if (n.cls === 'necromancer') this.burst(n.x, n.y, ['#7dff6b', '#c8ffbf'], 24, 0.2);
      } else if (n.type === 'pick') {
        const def = ITEMS[n.item];
        const art = POWERS[n.item];
        this.texts.push({ x: n.x, y: n.y - 30, text: def ? def.short : '', color: art ? art.color : '#ffffff', t0: performance.now(), life: 900, size: 12 });
        this.burst(n.x, n.y, [art ? art.color : '#ffffff', '#ffffff'], 12, 0.18);
        if (!this.phone || n.id === this.selfId) Sfx.play(n.item === 'bomb' ? 'boom' : 'award');
      } else if (n.type === 'boss') {
        this.callout('THE DRAGON KING!', '#ff5a1f', 'He storms the arena. Every hit on him scores!');
        this.shake(6, 900);
        Sfx.play('roar');
      } else if (n.type === 'bossdown') {
        this.callout('DRAGON KING DOWN!', '#ffd23f', n.by ? `${name(n.by)} landed the final blow` : '');
        this.shake(8, 900);
        Sfx.play('win');
      }
      if (this.onNews) this.onNews(n);
    }

    // True at most once every `ms` for each name (sounds and buzzes that would pile up in a crowd).
    every(name, ms) {
      const t = performance.now();
      if (!this.lastAt) this.lastAt = {};
      if (t - (this.lastAt[name] || 0) < ms) return false;
      this.lastAt[name] = t;
      return true;
    }

    callout(text, color, sub) {
      this.callouts.push({ text, color, sub, t0: performance.now() });
      if (this.callouts.length > 2) this.callouts.shift();
    }

    shake(pow, ms) {
      this.shakePow = Math.max(this.shakePow, pow);
      this.shakeUntil = Math.max(this.shakeUntil, performance.now() + ms);
    }

    burst(x, y, colors, n, speed) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2);
        const v = rand(0.3, 1) * speed;
        this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.05, g: 0.0004, life: rand(300, 650), t0: performance.now(),
          size: rand(3, 6), color: colors[i % colors.length] });
      }
    }

    // ---- view -------------------------------------------------------------
    // The big screen fits the whole arena beside the leaderboard; a phone zooms in on your hero.
    camera(focus) {
      const W = this.W;
      const H = this.H;
      if (!this.phone) {
        const top = this.reserveTop * this.dpr;
        const right = this.reserveRight * this.dpr;
        const pad = 10 * this.dpr;
        const s = Math.min((W - right - pad * 2) / ARENA.W, (H - top - pad * 2) / ARENA.H);
        this.s = s;
        this.ox = Math.max(pad, (W - right - ARENA.W * s) / 2);
        this.oy = top + Math.max(pad, (H - top - ARENA.H * s) / 2);
        this.camX = 0;
        this.camY = 0;
        return;
      }
      const s = Math.max(W / ARENA.W, H / ARENA.H, Math.min(W, H) / 560);
      this.s = s;
      const vw = W / s;
      const vh = H / s;
      const fx = focus ? focus.x : ARENA.W / 2;
      const fy = focus ? focus.y : ARENA.H / 2;
      this.camX = vw >= ARENA.W ? (ARENA.W - vw) / 2 : clamp(fx - vw / 2, 0, ARENA.W - vw);
      this.camY = vh >= ARENA.H ? (ARENA.H - vh) / 2 : clamp(fy - vh / 2, 0, ARENA.H - vh);
      this.ox = 0;
      this.oy = 0;
    }

    X(x) { return (x - this.camX) * this.s + this.ox; }
    Y(y) { return (y - this.camY) * this.s + this.oy; }
    // Where your hero is on the screen, in CSS pixels (for aiming with a mouse).
    selfOnScreen() {
      if (!this.self) return null;
      return { x: this.X(this.self.x) / this.dpr, y: this.Y(this.self.y) / this.dpr };
    }

    block(x, y, size, color) {
      this.ctx.fillStyle = color;
      this.ctx.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), Math.ceil(size), Math.ceil(size));
    }

    sprite(spr, x, y, scale, flip = false, alpha = 1) {
      const ctx = this.ctx;
      const w = spr.width * scale;
      const h = spr.height * scale;
      if (alpha < 1) ctx.globalAlpha = alpha;
      if (flip) {
        ctx.save();
        ctx.translate(Math.round(x), 0);
        ctx.scale(-1, 1);
        ctx.drawImage(spr, Math.round(-w / 2), Math.round(y - h), Math.round(w), Math.round(h));
        ctx.restore();
      } else {
        ctx.drawImage(spr, Math.round(x - w / 2), Math.round(y - h), Math.round(w), Math.round(h));
      }
      if (alpha < 1) ctx.globalAlpha = 1;
    }

    text(str, x, y, size, color, align = 'center') {
      const ctx = this.ctx;
      const fs = Math.max(6, Math.round(size * this.dpr));
      ctx.font = `${fs}px "Press Start 2P", monospace`;
      ctx.textAlign = align;
      ctx.textBaseline = 'alphabetic';
      const o = Math.max(1, Math.round(fs / 8));
      ctx.fillStyle = '#1b1426';
      for (const [ox, oy] of [[-o, 0], [o, 0], [0, -o], [0, o], [o, o]]) ctx.fillText(str, Math.round(x + ox), Math.round(y + oy));
      ctx.fillStyle = color;
      ctx.fillText(str, Math.round(x), Math.round(y));
      return ctx.measureText(str).width;
    }

    // ---- drawing --------------------------------------------------------------
    loop = () => {
      requestAnimationFrame(this.loop);
      const t = performance.now();
      const dt = Math.min(50, t - this.last);
      this.last = t;
      if (!this.active || !this.canvas.clientWidth) return;
      try {
        this.draw(dt);
      } catch (e) {
        console.error(e);
      }
    };

    draw(dt) {
      const ctx = this.ctx;
      ctx.imageSmoothingEnabled = false;
      const rt = this.renderTime();
      this.runQueue(rt);
      const frame = this.frameAt(rt);
      const pt = performance.now();
      const meNow = this.phone && this.selfId ? this.predictSelf(frame, dt) : null;
      const focus = meNow || (this.phone && this.selfId && this.graves.get(this.selfId)) || null;
      this.camera(focus);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#120c1c';
      ctx.fillRect(0, 0, this.W, this.H);
      if (pt < this.shakeUntil) {
        const p = this.shakePow * this.dpr;
        ctx.translate(Math.round(rand(-p, p)), Math.round(rand(-p, p)));
      } else this.shakePow = 0;
      const s = this.s;
      if (this.floor) ctx.drawImage(this.floor, Math.round(this.X(0)), Math.round(this.Y(0)), Math.round(ARENA.W * s), Math.round(ARENA.H * s));
      this.drawTorches(pt);
      if (this.slow && rt < this.slow[1]) {
        ctx.fillStyle = 'rgba(127,212,255,0.08)';
        ctx.fillRect(this.X(0), this.Y(0), ARENA.W * s, ARENA.H * s);
      }
      this.drawZones(rt, pt);
      this.drawItems(rt, pt);
      this.drawKegs();
      this.drawGraves(rt);
      if (frame) {
        // Back to front, so whoever is lower on the screen is drawn over whoever is behind them.
        const list = [];
        for (const m of frame.mons) list.push({ y: m.y + (m.type === 'boss' ? 40 : 0), m });
        for (const h of frame.heroes) {
          if (!(h.f & F.alive) || (h.f & F.away)) continue;
          const own = meNow && h.id === this.selfId;
          list.push({ y: own ? meNow.y : h.y, h: own ? { ...h, x: meNow.x, y: meNow.y, face: meNow.face, moving: meNow.moving } : h });
        }
        list.sort((a, b) => a.y - b.y);
        for (const e of list) {
          if (e.m) this.drawMonster(e.m, pt);
          else this.drawHero(e.h, pt, rt);
        }
      }
      this.drawShots(rt, pt);
      this.drawBolts(pt);
      this.drawRings(pt);
      this.drawParticles(pt, dt);
      this.drawTexts(pt);
      if (frame) this.drawHeroTags(frame, meNow, pt);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (pt < this.flashUntil) {
        ctx.fillStyle = 'rgba(255,60,60,0.22)';
        ctx.fillRect(0, 0, this.W, this.H);
      }
      this.drawBossBar(frame);
      this.drawFeed(pt);
      this.drawCallouts(pt);
      if (this.phone) this.drawMinimap(frame, meNow);
    }

    // Phone: where your hero is drawn. The newest snapshot, plus where your sticks are taking you since.
    predictSelf(frame, dt) {
      const h = this.hero(this.selfId);
      if (!h || !(h.f & F.alive) || (h.f & F.away)) {
        this.self = null;
        this.lead = null;
        return null;
      }
      const kit = KITS[(this.looks.get(this.selfId) || {}).cls] || KITS.knight;
      let speed = kit.speed;
      if (h.f & F.haste) speed *= ITEMS.haste.speed;
      if (h.f & F.slow) speed *= 0.6;
      if (h.f & F.wall) speed *= R.SKILL.wallSpeed;
      if (h.f & F.whirl) speed *= R.SKILL.whirlSpeed;
      if (h.f & F.hymn) speed *= R.SKILL.hymnSpeed;
      if (h.f & F.stun) speed = 0;
      // How far ahead of the server your hero is: where your sticks will have taken it by the time the server
      // hears about them. It eases in and out over that same time, so stopping doesn't snap you back.
      const ms = clamp(2 * (this.lag || 0) + 40, 40, 260);
      const { mx, my, ax, ay } = this.input;
      if (!this.lead) this.lead = { x: 0, y: 0 };
      const ease = 1 - Math.exp(-dt / (ms * 0.7));
      this.lead.x = lerp(this.lead.x, (mx * speed * ms) / 1000, ease);
      this.lead.y = lerp(this.lead.y, (my * speed * ms) / 1000, ease);
      const p = this.map ? R.moveCircle(h.x, h.y, HERO_R, this.lead.x, this.lead.y, this.map.blocks, this.liveKegs()) : h;
      if (!this.self || Math.hypot(this.self.x - p.x, this.self.y - p.y) > 140) this.self = { x: p.x, y: p.y };
      const k = 1 - Math.exp(-dt / 55);
      this.self.x = lerp(this.self.x, p.x, k);
      this.self.y = lerp(this.self.y, p.y, k);
      const face = ax || ay ? Math.atan2(ay, ax) : mx || my ? Math.atan2(my, mx) : h.face;
      return { x: this.self.x, y: this.self.y, face, moving: Boolean(mx || my) && speed > 0 };
    }

    liveKegs() {
      if (!this.map) return [];
      return this.map.kegs.filter((k, i) => this.kegs[i] !== '0').map((k) => ({ x: k.x, y: k.y, r: R.KEG.r }));
    }

    drawTorches(pt) {
      for (const g of R.GATES) {
        const across = g.y === ARENA.H / 2;
        for (const side of [-1, 1]) {
          const x = across ? g.x : g.x + side * 70;
          const y = across ? g.y + side * 70 : g.y;
          const X = this.X(x);
          const Y = this.Y(y);
          const u = 3 * this.s;
          this.block(X, Y + u * 2, u * 2, '#5c3a1e');
          const f = Math.floor(pt / 120 + x) % 3;
          this.block(X, Y - u * (1 + f * 0.3), u * 2.2, '#ff7b1c');
          this.block(X, Y - u * 1.2, u * 1.2, '#ffd23f');
          this.ctx.globalAlpha = 0.12;
          this.ctx.fillStyle = '#ff9a3c';
          this.ctx.beginPath();
          this.ctx.arc(X, Y, 50 * this.s, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.globalAlpha = 1;
        }
      }
    }

    // Kegs, unless they've just blown up.
    drawKegs() {
      if (!this.map) return;
      if (!kegSprite) kegSprite = KEG_SPRITE();
      this.map.kegs.forEach((k, i) => {
        if (this.kegs[i] === '0') return;
        const u = PX * this.s;
        this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
        this.ctx.fillRect(this.X(k.x - 16), this.Y(k.y + 12), 32 * this.s, 8 * this.s);
        this.sprite(kegSprite, this.X(k.x), this.Y(k.y + 20), u);
      });
    }

    drawGraves(rt) {
      if (!graveSprite) graveSprite = paint(GRAVE, window.Art.BASE);
      for (const [id, g] of this.graves) {
        if (rt > g.until) {
          this.graves.delete(id);
          continue;
        }
        this.sprite(graveSprite, this.X(g.x), this.Y(g.y + 16), PX * this.s, false, 0.85);
      }
    }

    drawZones(rt, pt) {
      const ctx = this.ctx;
      for (const z of this.zones) {
        const X = this.X(z.x);
        const Y = this.Y(z.y);
        const r = z.r * this.s;
        if (z.kind === 'grow') {
          // Thorny vines, swaying.
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = '#2f7d4a';
          ctx.beginPath();
          ctx.arc(X, Y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          const u = 3 * this.s;
          for (let i = 0; i < 26; i++) {
            const a = (i / 26) * Math.PI * 2 + Math.sin(pt / 600 + i) * 0.1;
            const d = r * (0.35 + ((i * 37) % 60) / 100);
            this.block(X + Math.cos(a) * d, Y + Math.sin(a) * d, u * 1.4, i % 3 ? '#4fa865' : '#2f7d4a');
            if (i % 2) this.block(X + Math.cos(a) * d + u, Y + Math.sin(a) * d - u, u * 0.8, '#b6f59a');
          }
        } else if (rt < z.at) {
          // A meteor or a cannonball on its way: a target on the ground, and the thing falling onto it.
          const k = clamp(1 - (z.at - rt) / (z.kind === 'meteor' ? R.SKILL.meteorDelay : 450 + R.SKILL.barrageGap * 6), 0, 1);
          ctx.strokeStyle = z.kind === 'meteor' ? '#ff5a1f' : '#ffd23f';
          ctx.lineWidth = Math.max(2, 2 * this.dpr);
          ctx.globalAlpha = 0.5 + 0.4 * Math.sin(pt / 80);
          ctx.beginPath();
          ctx.arc(X, Y, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
          const fall = (1 - k) * 260 * this.s;
          const u = PX * this.s;
          if (z.kind === 'meteor') {
            for (let i = 0; i < 5; i++) this.block(X - fall * 0.5 - i * u * 2, Y - fall - i * u * 2, u * (5 - i), ['#ffd23f', '#ff7b1c', '#e8371c', '#ff7b1c', '#5a1a0a'][i]);
            this.block(X - fall * 0.5, Y - fall, u * 6, '#ff7b1c');
            this.block(X - fall * 0.5, Y - fall, u * 3.5, '#ffd23f');
          } else {
            this.block(X, Y - fall, u * 2.6, '#1b1426');
            this.block(X - u * 0.5, Y - fall - u * 0.5, u, '#8691a6');
          }
        }
      }
    }

    drawItems(rt, pt) {
      for (const it of this.items) {
        if (it.until - rt < 4000 && Math.floor(pt / 150) % 2) continue; // about to fade: blink
        const art = POWERS[it.kind];
        const X = this.X(it.x);
        const Y = this.Y(it.y);
        const bob = Math.sin(pt / 260 + it.id) * 4 * this.s;
        const ctx = this.ctx;
        ctx.globalAlpha = 0.25 + 0.1 * Math.sin(pt / 200 + it.id);
        ctx.fillStyle = art ? art.color : '#ffffff';
        ctx.beginPath();
        ctx.ellipse(X, Y + 12 * this.s, 24 * this.s, 9 * this.s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        this.sprite(powerSprite(it.kind), X, Y + 10 * this.s + bob, PX * 0.95 * this.s);
      }
    }

    drawMonster(m, pt) {
      const s = this.s;
      const X = this.X(m.x);
      const Y = this.Y(m.y);
      const u = PX * s;
      const def = R.MONSTERS[m.type];
      const ctx = this.ctx;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(X, Y + def.r * s * 0.85, def.r * s, def.r * s * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      const flip = m.dx < -0.2;
      const hurt = pt - (this.hurtAt.get(m.id) || 0) < 90;
      if (m.type === 'boss') {
        const roar = pt - this.roarAt < 500 ? 1 : 0;
        this.sprite(bossSprite(roar), X, Y + def.r * s * 0.9, u * 1.4, false, hurt ? 0.6 : 1);
      } else {
        const artType = m.type === 'ghost' ? 'skull' : m.type;
        const art = MON_ART[artType];
        const frame = Math.floor(pt / art.frameMs + m.id) % art.frames.length;
        const fly = def.fly ? Math.sin(pt / 180 + m.id) * 4 * s : 0;
        if (m.type === 'ghost') {
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = '#7dff6b';
          ctx.beginPath();
          ctx.arc(X, Y - 4 * s + fly, def.r * s * 1.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        this.sprite(monsterSprite(artType, frame), X, Y + def.r * s + fly, u * (m.type === 'ghost' ? 0.85 : 1), flip, m.type === 'ghost' ? 0.75 : hurt ? 0.55 : 1);
      }
      if (m.stun) this.drawStars(X, Y - def.r * s - 8 * s, pt);
      if (m.hp < 100 && m.type !== 'boss') {
        const w = def.r * 2 * s;
        ctx.fillStyle = '#1b1426';
        ctx.fillRect(Math.round(X - w / 2 - 1), Math.round(Y - def.r * s - 12 * s), Math.round(w + 2), Math.round(5 * s + 2));
        ctx.fillStyle = m.owner ? '#7dff6b' : '#ff5a4d';
        ctx.fillRect(Math.round(X - w / 2), Math.round(Y - def.r * s - 12 * s + 1), Math.round((w * m.hp) / 100), Math.round(5 * s));
      }
    }

    drawStars(X, Y, pt) {
      const u = 3 * this.s;
      for (let i = 0; i < 3; i++) {
        const a = pt / 200 + (i * Math.PI * 2) / 3;
        this.block(X + Math.cos(a) * 12 * this.s, Y + Math.sin(a) * 4 * this.s, u * 1.2, '#ffd23f');
      }
    }

    drawHero(h, pt, rt) {
      const look = this.looks.get(h.id);
      if (!look) return;
      const s = this.s;
      const X = this.X(h.x);
      const Y = this.Y(h.y);
      const u = PX * s;
      const ctx = this.ctx;
      const mine = this.phone && h.id === this.selfId;
      let alpha = 1;
      if (h.f & F.stealth) alpha = mine ? 0.45 : 0.12;
      if ((h.f & F.safe) && Math.floor(pt / 110) % 2) alpha *= 0.4;
      // Pet, trailing behind.
      let pet = this.pets.get(h.id);
      const want = { x: h.x - Math.cos(h.face) * 34, y: h.y + 10 };
      if (!pet || Math.hypot(pet.x - want.x, pet.y - want.y) > 220) pet = { ...want };
      pet.x = lerp(pet.x, want.x, 0.08);
      pet.y = lerp(pet.y, want.y, 0.08);
      this.pets.set(h.id, pet);
      const pspr = petSprite(look.pet);
      if (pspr && alpha > 0.3) this.sprite(pspr, this.X(pet.x), this.Y(pet.y) + 10 * s + Math.abs(Math.sin(pt / 160)) * -3 * s, u * 0.9, pet.x > h.x, alpha);
      // Shadow and the hero.
      ctx.globalAlpha = 0.3 * alpha;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(X, Y + 16 * s, 17 * s, 6 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (mine) {
        // A ring at your feet, so you can find yourself in a crowd.
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, 2 * this.dpr);
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.ellipse(X, Y + 16 * s, 24 * s, 9 * s, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (h.f & F.whirl) {
        // Whirlwind: axes spinning round.
        const spr = window.Art.axeSprite();
        for (let i = 0; i < 3; i++) {
          const a = pt / 70 + (i * Math.PI * 2) / 3;
          ctx.save();
          ctx.translate(X + Math.cos(a) * R.SKILL.whirlR * 0.7 * s, Y + Math.sin(a) * R.SKILL.whirlR * 0.4 * s);
          ctx.rotate(a * 2);
          ctx.drawImage(spr, (-spr.width * u) / 2, (-spr.height * u) / 2, spr.width * u, spr.height * u);
          ctx.restore();
        }
      }
      if (h.f & F.fury && Math.random() < 0.4) {
        this.particles.push({ x: h.x + rand(-14, 14), y: h.y + rand(-20, 14), vx: 0, vy: -0.08, g: 0, life: 350, t0: pt, size: 4, color: Math.random() < 0.5 ? '#ff7b1c' : '#e8371c' });
      }
      if (h.f & F.haste && h.moving && Math.random() < 0.5) {
        this.particles.push({ x: h.x - Math.cos(h.face) * 16, y: h.y + 10 + rand(-6, 6), vx: 0, vy: 0, g: 0, life: 250, t0: pt, size: 4, color: '#ffe14d' });
      }
      const hop = h.moving ? Math.abs(Math.sin(pt / 90)) * 3 * s : 0;
      const spr = heroSprite(look);
      const hurt = pt - (this.hurtAt.get(h.id) || 0) < 90;
      this.sprite(spr, X, Y + 18 * s - hop, u, Math.cos(h.face) < -0.1, hurt ? alpha * 0.5 : alpha);
      if (h.f & F.hymn) {
        for (let i = 0; i < 3; i++) {
          const a = pt / 300 + (i * Math.PI * 2) / 3;
          const nx = X + Math.cos(a) * 30 * s;
          const ny = Y - 10 * s + Math.sin(a) * 12 * s;
          this.block(nx, ny, 3 * s * 1.4, (COLORS[look.color] || COLORS[0]).Q);
          this.block(nx + 2 * s, ny - 4 * s, 3 * s * 0.6, (COLORS[look.color] || COLORS[0]).Q);
        }
      }
      if (h.f & (F.shield | F.wall)) {
        ctx.strokeStyle = h.f & F.wall ? '#ffd23f' : '#7aa7ff';
        ctx.lineWidth = Math.max(2, 3 * this.dpr);
        ctx.globalAlpha = 0.55 + 0.25 * Math.sin(pt / 120);
        ctx.beginPath();
        ctx.arc(X, Y - 4 * s, 34 * s, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (h.f & F.stun) this.drawStars(X, Y - 40 * s, pt);
      if (h.f & F.slow && Math.random() < 0.2) {
        this.particles.push({ x: h.x + rand(-14, 14), y: h.y + rand(-16, 10), vx: 0, vy: 0.03, g: 0, life: 400, t0: pt, size: 3, color: '#9fd7ff' });
      }
    }

    // Names and HP bars on top of everything.
    drawHeroTags(frame, meNow, pt) {
      const s = this.s;
      for (const h0 of frame.heroes) {
        if (!(h0.f & F.alive) || (h0.f & F.away)) continue;
        const own = meNow && h0.id === this.selfId;
        if ((h0.f & F.stealth) && !own) continue;
        const h = own ? { ...h0, x: meNow.x, y: meNow.y } : h0;
        const look = this.looks.get(h.id);
        if (!look) continue;
        const kit = KITS[look.cls] || KITS.knight;
        const X = this.X(h.x);
        const Y = this.Y(h.y) - 40 * s;
        const w = 46 * s;
        const bh = Math.max(3, 5 * s);
        const frac = clamp(h.hp / kit.hp, 0, 1);
        this.ctx.fillStyle = '#1b1426';
        this.ctx.fillRect(Math.round(X - w / 2 - 1), Math.round(Y - 1), Math.round(w + 2), Math.round(bh + 2));
        this.ctx.fillStyle = frac > 0.5 ? '#5bd46a' : frac > 0.25 ? '#ffd23f' : '#ff5a4d';
        this.ctx.fillRect(Math.round(X - w / 2), Math.round(Y), Math.round(w * frac), Math.round(bh));
        const fs = this.phone ? 7 : clamp((9 * s) / this.dpr, 7, 13);
        this.text(look.name, X, Y - 4 * s, fs, own ? '#ffffff' : (COLORS[look.color] || COLORS[0]).Q);
      }
    }

    drawShots(rt, pt) {
      const fake = { U: 0, ctx: this.ctx, block: (x, y, size, color) => this.block(x, y, size, color) };
      for (const [id, S] of this.shots) {
        if (rt < S.t0 - 5) continue;
        if (S.endT && rt >= S.endT) {
          this.shots.delete(id);
          if (S.impact) this.burst(S.ex, S.ey, S.kind === 'mfire' || S.kind === 'bfire' ? ['#ff7b1c', '#ffd23f'] : ['#ffffff', '#ffd23f'], 5, 0.12);
          continue;
        }
        const k = Math.max(0, (rt - S.t0) / 1000);
        const speed = Math.hypot(S.vx, S.vy) || 1;
        if (!S.endT && S.travel + speed * k > S.range + 30) {
          if (rt - S.t0 > 4000) this.shots.delete(id);
          continue;
        }
        const x = S.x0 + S.vx * k;
        const y = S.y0 + S.vy * k;
        const X = this.X(x);
        const Y = this.Y(y);
        const a = Math.atan2(S.vy, S.vx);
        if (S.kind === 'mfire' || S.kind === 'bfire') {
          const u = (S.kind === 'bfire' ? 3.4 : 2.6) * this.s;
          const flick = Math.floor(pt / 60) % 2;
          this.block(X, Y, u * 3.2, '#e8371c');
          this.block(X, Y, u * (2.2 + flick * 0.3), '#ff7b1c');
          this.block(X, Y, u * 1.2, '#ffd23f');
          if (Math.random() < 0.5) {
            this.particles.push({ x: x - Math.cos(a) * 10, y: y - Math.sin(a) * 10, vx: 0, vy: -0.02, g: 0, life: 250, t0: pt, size: 4, color: '#ff7b1c' });
          }
          continue;
        }
        const look = this.looks.get(S.owner);
        const color = COLORS[look ? look.color : 0] || COLORS[0];
        fake.U = 2.6 * this.s;
        window.Arena.prototype.drawBolt.call(fake, S.kind, X, Y, Math.cos(a), Math.sin(a), a, color, pt);
      }
    }

    drawBolts(pt) {
      const keep = [];
      for (const b of this.bolts) {
        const k = (pt - b.t0) / b.life;
        if (k >= 1) continue;
        keep.push(b);
        const X = this.X(b.x);
        const Y = this.Y(b.y);
        let x = X + rand(-10, 10) * this.s;
        let y = Y - 300 * this.s;
        const u = 3 * this.s;
        this.ctx.globalAlpha = 1 - k;
        while (y < Y) {
          this.block(x, y, u * 1.6, '#ffffff');
          this.block(x + u, y, u, '#7fd4ff');
          y += u * 2;
          x += rand(-1.2, 1.2) * u;
        }
        this.ctx.globalAlpha = 1;
      }
      this.bolts = keep;
    }

    drawRings(pt) {
      const keep = [];
      for (const r of this.rings) {
        const k = (pt - r.t0) / r.life;
        if (k >= 1) continue;
        keep.push(r);
        const X = this.X(r.x);
        const Y = this.Y(r.y);
        const rad = r.r * this.s * (0.3 + k * 0.7);
        this.ctx.globalAlpha = 1 - k;
        const n = 22;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          this.block(X + Math.cos(a) * rad, Y + Math.sin(a) * rad * 0.8, 4 * this.s, r.color);
        }
        this.ctx.globalAlpha = 1;
      }
      this.rings = keep;
    }

    drawParticles(pt, dt) {
      const keep = [];
      const ctx = this.ctx;
      for (const p of this.particles) {
        const age = pt - p.t0;
        if (age > p.life) continue;
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        ctx.globalAlpha = Math.min(1, (1 - age / p.life) * 1.6);
        ctx.fillStyle = p.color;
        const size = Math.max(1, p.size * this.s);
        ctx.fillRect(Math.round(this.X(p.x) - size / 2), Math.round(this.Y(p.y) - size / 2), Math.ceil(size), Math.ceil(size));
        keep.push(p);
      }
      ctx.globalAlpha = 1;
      this.particles = keep.length > 900 ? keep.slice(-900) : keep;
    }

    drawTexts(pt) {
      const keep = [];
      for (const t of this.texts) {
        const k = (pt - t.t0) / t.life;
        if (k >= 1) continue;
        keep.push(t);
        this.ctx.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
        const size = this.phone ? t.size * 0.75 : t.size * clamp(this.s / this.dpr, 0.7, 1.3);
        this.text(t.text, this.X(t.x), this.Y(t.y) - k * 30 * this.s, size, t.color);
        this.ctx.globalAlpha = 1;
      }
      this.texts = keep.length > 80 ? keep.slice(-80) : keep;
    }

    // The Dragon King's HP across the top of the arena.
    drawBossBar(frame) {
      const boss = frame && frame.mons.find((m) => m.type === 'boss');
      if (!boss) return;
      const ctx = this.ctx;
      const d = this.dpr;
      const w = Math.min(this.W * 0.5, 520 * d);
      const x = (this.phone ? this.W / 2 : this.ox + (ARENA.W * this.s) / 2) - w / 2;
      const y = (this.phone ? 30 : this.reserveTop + 28) * d;
      ctx.fillStyle = '#1b1426';
      ctx.fillRect(x - 3 * d, y - 3 * d, w + 6 * d, 14 * d);
      ctx.fillStyle = '#5a1a0a';
      ctx.fillRect(x, y, w, 8 * d);
      ctx.fillStyle = '#ff5a1f';
      ctx.fillRect(x, y, (w * boss.hp) / 100, 8 * d);
      this.text('THE DRAGON KING', x + w / 2, y - 6 * d, this.phone ? 7 : 10, '#ffd23f');
    }

    // Who knocked out whom, latest first.
    drawFeed(pt) {
      const d = this.dpr;
      const size = this.phone ? 7 : 11;
      let y = this.phone ? 70 * d : this.H - 24 * d - (this.feed.length - 1) * (size + 9) * d;
      const x = this.phone ? 8 * d : this.ox + 14 * d;
      const name = (id) => (this.looks.get(id) || {}).name || '?';
      const color = (id) => (COLORS[(this.looks.get(id) || {}).color] || COLORS[0]).Q;
      const life = this.phone ? 5000 : 8000;
      this.feed = this.feed.filter((f) => pt - f.t0 < life);
      const list = this.phone ? this.feed : this.feed.slice().reverse();
      for (const f of list) {
        this.ctx.globalAlpha = Math.min(1, (life - (pt - f.t0)) / 600);
        let cx = x;
        if (f.by) {
          cx += this.text(name(f.by), cx, y, size, color(f.by), 'left');
          cx += this.text(' KO ', cx, y, size, '#ffffff', 'left');
          this.text(name(f.id), cx, y, size, color(f.id), 'left');
        } else {
          cx += this.text(name(f.id), cx, y, size, color(f.id), 'left');
          this.text(f.mob ? ` · ${MOB_NAME[f.mob] || 'A MONSTER'}` : f.why === 'keg' ? ' · A KEG' : ' · OUT', cx, y, size, '#a99cc7', 'left');
        }
        this.ctx.globalAlpha = 1;
        y += (size + 9) * d;
      }
    }

    drawCallouts(pt) {
      const d = this.dpr;
      const cx = this.phone ? this.W / 2 : this.ox + (ARENA.W * this.s) / 2;
      let y = (this.phone ? 120 : this.reserveTop + 90) * d;
      this.callouts = this.callouts.filter((c) => pt - c.t0 < 1800);
      for (const c of this.callouts) {
        const k = (pt - c.t0) / 1800;
        const pop = k < 0.1 ? 0.6 + k * 4 : 1;
        this.ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
        this.text(c.text, cx, y, (this.phone ? 16 : 34) * pop, c.color);
        if (c.sub) this.text(c.sub, cx, y + (this.phone ? 16 : 30) * d, this.phone ? 7 : 12, '#ffffff');
        this.ctx.globalAlpha = 1;
        y += (this.phone ? 40 : 76) * d;
      }
      // Skill banners: "NAME · METEOR".
      this.banners = this.banners.filter((b) => pt - b.t0 < 1500);
      let by = this.H - (this.phone ? 150 : 70) * d;
      for (const b of this.banners) {
        const k = (pt - b.t0) / 1500;
        this.ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        const size = this.phone ? (b.mine ? 11 : 7) : 18;
        const w = this.text(`${b.name} · ${b.skill}!`, cx, by, size, b.mine ? '#ffd23f' : b.color);
        if (!this.phone) {
          this.text('★', cx - w / 2 - 22 * d, by, size, '#ffd23f');
          this.text('★', cx + w / 2 + 22 * d, by, size, '#ffd23f');
        }
        this.ctx.globalAlpha = 1;
        by -= (size + 12) * d;
      }
    }

    // Phone: the whole arena in a corner, with every hero on it.
    drawMinimap(frame, meNow) {
      if (!this.map) return;
      const d = this.dpr;
      const w = 104 * d;
      const h = (w * ARENA.H) / ARENA.W;
      const x = this.W - w - 8 * d;
      const y = 8 * d;
      const ctx = this.ctx;
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = '#1b1426';
      ctx.fillRect(x - 2 * d, y - 2 * d, w + 4 * d, h + 4 * d);
      ctx.fillStyle = '#3a3452';
      ctx.fillRect(x, y, w, h);
      const k = w / ARENA.W;
      ctx.fillStyle = '#6e6488';
      for (const b of this.map.blocks) ctx.fillRect(x + b.x * k, y + b.y * k, b.w * k, b.h * k);
      // What the screen shows.
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = d;
      ctx.strokeRect(x + this.camX * k, y + this.camY * k, Math.min(w, (this.W / this.s) * k), Math.min(h, (this.H / this.s) * k));
      if (frame) {
        for (const m of frame.mons) {
          if (m.type !== 'boss' && m.type !== 'skull') continue;
          ctx.fillStyle = m.type === 'boss' ? '#ff5a1f' : '#efe6d0';
          const r = m.type === 'boss' ? 4 * d : 1.5 * d;
          ctx.fillRect(x + m.x * k - r, y + m.y * k - r, r * 2, r * 2);
        }
        for (const it of this.items) {
          ctx.fillStyle = (POWERS[it.kind] || {}).color || '#ffffff';
          ctx.fillRect(x + it.x * k - d, y + it.y * k - d, 2 * d, 2 * d);
        }
        for (const hh of frame.heroes) {
          if (!(hh.f & F.alive) || (hh.f & (F.away | F.stealth)) || hh.id === this.selfId) continue;
          const look = this.looks.get(hh.id);
          ctx.fillStyle = (COLORS[look ? look.color : 0] || COLORS[0]).Q;
          ctx.fillRect(x + hh.x * k - 2 * d, y + hh.y * k - 2 * d, 4 * d, 4 * d);
        }
      }
      if (meNow) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + meNow.x * k - 2.5 * d, y + meNow.y * k - 2.5 * d, 5 * d, 5 * d);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---- the phone's controls --------------------------------------------------
  // Left half of the screen: a stick appears wherever your thumb lands, and moves your hero. Right half:
  // hold to attack whatever's nearest; drag to aim. A keyboard works too: WASD or the arrows move, Space
  // attacks, E (or Shift) uses your skill; with a mouse, hold the button to attack toward the pointer.
  class BrawlPad {
    constructor(field, { onInput, onSkill, view }) {
      this.field = field;
      this.onInput = onInput;
      this.onSkill = onSkill;
      this.view = view;
      this.move = null; // { id, x0, y0, x, y }
      this.aim = null;
      this.mouse = null; // { x, y } pointer held
      this.keys = new Set();
      this.state = { mx: 0, my: 0, ax: 0, ay: 0, fire: false };
      this.sentAt = 0;
      this.sentKey = '';
      this.enabled = false;
      this.stickL = this.makeStick('move');
      this.stickR = this.makeStick('aim');
      field.addEventListener('pointerdown', (e) => this.down(e));
      window.addEventListener('pointermove', (e) => this.moveTo(e));
      window.addEventListener('pointerup', (e) => this.up(e));
      window.addEventListener('pointercancel', (e) => this.up(e));
      window.addEventListener('keydown', (e) => this.key(e, true));
      window.addEventListener('keyup', (e) => this.key(e, false));
      window.addEventListener('blur', () => this.release());
      setInterval(() => this.send(true), 300);
    }

    makeStick(kind) {
      const s = document.createElement('div');
      s.className = `b-stick ${kind} hidden`;
      s.append(document.createElement('i'));
      this.field.append(s);
      return s;
    }

    setEnabled(on) {
      this.enabled = on;
      if (!on) this.release();
    }

    release() {
      this.move = null;
      this.aim = null;
      this.mouse = null;
      this.keys.clear();
      this.stickL.classList.add('hidden');
      this.stickR.classList.add('hidden');
      this.update();
    }

    radius() {
      return Math.min(60, this.field.clientWidth / 7);
    }

    // A pointer's spot in the field, in the field's own CSS pixels (the page may be scaled up on a PC).
    point(e) {
      const rect = this.field.getBoundingClientRect();
      const z = this.field.clientWidth ? rect.width / this.field.clientWidth : 1;
      return { x: (e.clientX - rect.left) / z, y: (e.clientY - rect.top) / z, w: rect.width / z };
    }

    down(e) {
      if (!this.enabled || e.target.closest('button')) return;
      const { x, y, w } = this.point(e);
      if (e.pointerType === 'mouse') {
        this.mouse = { id: e.pointerId, x, y };
        this.update();
        e.preventDefault();
        return;
      }
      const left = x < w / 2;
      if (left && !this.move) this.move = { id: e.pointerId, x0: x, y0: y, x, y };
      else if (!left && !this.aim) this.aim = { id: e.pointerId, x0: x, y0: y, x, y };
      else return;
      try { this.field.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
      e.preventDefault();
      this.update();
    }

    moveTo(e) {
      const { x, y } = this.point(e);
      if (this.mouse && this.mouse.id === e.pointerId) Object.assign(this.mouse, { x, y });
      else if (this.move && this.move.id === e.pointerId) Object.assign(this.move, { x, y });
      else if (this.aim && this.aim.id === e.pointerId) Object.assign(this.aim, { x, y });
      else return;
      this.update();
    }

    up(e) {
      if (this.mouse && this.mouse.id === e.pointerId) this.mouse = null;
      else if (this.move && this.move.id === e.pointerId) this.move = null;
      else if (this.aim && this.aim.id === e.pointerId) this.aim = null;
      else return;
      this.update();
    }

    key(e, down) {
      if (!this.enabled || /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) return;
      const k = e.key.toLowerCase();
      if (down && ['e', 'q', 'shift', 'k'].includes(k)) {
        if (!e.repeat) this.onSkill();
        e.preventDefault();
        return;
      }
      if (!['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'j'].includes(k)) return;
      e.preventDefault();
      if (down) this.keys.add(k);
      else this.keys.delete(k);
      this.update();
    }

    stickVec(st) {
      const r = this.radius();
      const dx = st.x - st.x0;
      const dy = st.y - st.y0;
      const d = Math.hypot(dx, dy);
      // A thumb that runs past the edge drags the stick along with it.
      if (d > r) {
        st.x0 = st.x - (dx / d) * r;
        st.y0 = st.y - (dy / d) * r;
      }
      return { x: dx / Math.max(r, d), y: dy / Math.max(r, d), d };
    }

    update() {
      const st = { mx: 0, my: 0, ax: 0, ay: 0, fire: false };
      const showStick = (el, s, v) => {
        el.classList.toggle('hidden', !s);
        if (!s) return;
        const r = this.radius();
        el.style.left = `${s.x0}px`;
        el.style.top = `${s.y0}px`;
        el.style.width = el.style.height = `${r * 2}px`;
        el.firstChild.style.transform = `translate(${v.x * r}px, ${v.y * r}px)`;
      };
      let mv = null;
      if (this.move) {
        mv = this.stickVec(this.move);
        st.mx = mv.x;
        st.my = mv.y;
      }
      showStick(this.stickL, this.move, mv || { x: 0, y: 0 });
      let av = null;
      if (this.aim) {
        av = this.stickVec(this.aim);
        st.fire = true;
        if (av.d > 14) {
          st.ax = av.x;
          st.ay = av.y;
        }
      }
      showStick(this.stickR, this.aim, av || { x: 0, y: 0 });
      // Keyboard.
      const kx = (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0);
      const ky = (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0) - (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0);
      if (kx || ky) {
        const d = Math.hypot(kx, ky);
        st.mx = kx / d;
        st.my = ky / d;
      }
      if (this.keys.has(' ') || this.keys.has('j')) st.fire = true;
      // Mouse: attack toward the pointer while the button is held.
      if (this.mouse) {
        st.fire = true;
        const me = this.view.selfOnScreen();
        if (me) {
          const dx = this.mouse.x - me.x;
          const dy = this.mouse.y - me.y;
          const d = Math.hypot(dx, dy) || 1;
          st.ax = dx / d;
          st.ay = dy / d;
        }
      }
      this.state = st;
      this.view.input = st;
      this.send(false);
    }

    send(force) {
      if (!this.enabled) return;
      const st = this.state;
      const r2 = (v) => Math.round(v * 100) / 100;
      const msg = { mx: r2(st.mx), my: r2(st.my), ax: r2(st.ax), ay: r2(st.ay), fire: st.fire };
      const key = JSON.stringify(msg);
      const t = performance.now();
      if (!force && key === this.sentKey) return;
      if (!force && t - this.sentAt < 40) {
        clearTimeout(this.later);
        this.later = setTimeout(() => this.send(true), 40 - (t - this.sentAt));
        return;
      }
      this.sentAt = t;
      this.sentKey = key;
      this.onInput(msg);
    }
  }

  window.BrawlView = BrawlView;
  window.BrawlPad = BrawlPad;
})();
