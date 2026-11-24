// Artillery on screen: the battlefield side-on (ground, heroes, the aim of whoever's turn it is), shots
// playing out as the server worked them out, and the phone's controls. The big screen shows the whole
// field; a phone follows the action, with a minimap, and can be dragged to look around.
(function () {
  const A = window.Arty;
  const { heroSprite, petSprite, powerSprite, COLORS, POWERS } = window.Art;
  const { TEAMS, Sfx } = window.WW;
  const { MAP, COLS, ROWS } = A;
  const PX = 3; // map units per sprite pixel
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const hash = (x, y) => {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  // Where something moving along a path ([[t, x, y], ...]) is at time t.
  const pathAt = (path, t) => {
    let i = 1;
    while (i < path.length && path[i][0] < t) i++;
    if (i >= path.length) return [path[path.length - 1][1], path[path.length - 1][2]];
    const [ta, xa, ya] = path[i - 1];
    const [tb, xb, yb] = path[i];
    const k = tb > ta ? clamp((t - ta) / (tb - ta), 0, 1) : 1;
    return [lerp(xa, xb, k), lerp(ya, yb, k)];
  };
  // Power-ups a hero has waiting (the bits in their state), and the art for each.
  const BUFFS = [[1, 'fury'], [2, 'shield'], [4, 'haste'], [8, 'triple']];
  const SAY_MS = 5000; // a chat message stays over the hero this long
  const FEED_MS = 12000; // and in the list at the bottom this long
  // Breaks text into lines no wider than maxW (at most `most` lines, the last cut short with "…").
  const wrap = (ctx, text, maxW, most) => {
    const lines = [];
    let line = '';
    for (const word of text.split(' ')) {
      let w = word;
      while (ctx.measureText(w).width > maxW) {
        // A word too long for a line: break it.
        let n = w.length - 1;
        while (n > 1 && ctx.measureText(w.slice(0, n)).width > maxW) n--;
        if (line) lines.push(line);
        lines.push(w.slice(0, n));
        line = '';
        w = w.slice(n);
      }
      const next = line ? `${line} ${w}` : w;
      if (ctx.measureText(next).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = next;
    }
    if (line) lines.push(line);
    if (lines.length > most) {
      lines.length = most;
      lines[most - 1] = `${lines[most - 1].slice(0, -1)}…`;
    }
    return lines;
  };
  const BLAST = { slash: '#fff6b0', axe: '#d5dbe6', fireball: '#ff7b1c', meteor: '#ff5a1f', arrow: '#ffd23f', dagger: '#d5dbe6', beam: '#fff6b0',
    shuriken: '#d5dbe6', soul: '#7dff6b', thorn: '#4fa865', cannon: '#ffd23f', notes: '#ff9ad0', spear: '#7fd4ff', boulder: '#a99cc7',
    frost: '#9fd7ff', seed: '#6fe08b', grape: '#ffd23f', drum: '#ff5a4d', shard: '#ff7b1c' };
  // Shells only artillery has (the rest are the heroes' usual attacks): blocks of [dx, dy, size, color] in
  // sprite pixels, turned to face the way they fly (boulders and drums just tumble).
  const SHELLS = {
    boulder: [[0, 0, 5, '#1b1426'], [0, 0, 4, '#8a8aa0'], [-1, -1, 2, '#c9cfdc'], [1, 1, 1.5, '#5a5a70']],
    frost: [[0, 0, 3.5, '#5fb8ff'], [1, 0, 2, '#bfe9ff'], [-1.5, 0, 1.5, '#ffffff']],
    seed: [[0, 0, 3.5, '#2f7d4a'], [0, 0, 2.4, '#6fe08b'], [-0.6, -0.6, 1, '#e9ffd9']],
    grape: [[0, 0, 2.2, '#1b1426'], [-0.4, -0.4, 0.8, '#8691a6']],
    drum: [[0, 0, 4.6, '#1b1426'], [0, 0, 3.8, '#e8374a'], [0, 0, 2.4, '#efe6d0'], [0, -1.6, 3.8, '#f5c542']],
    shard: [[0, 0, 2.2, '#ff7b1c'], [0, 0, 1.2, '#ffd23f']],
  };

  class ArtyView {
    constructor(canvas, { now = () => Date.now(), phone = false } = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.now = now;
      this.phone = phone;
      this.selfId = null;
      this.looks = new Map();
      this.active = false;
      this.reserveTop = 0;
      this.terrain = null;
      this.key = '';
      this.heroes = new Map(); // id -> { id, team, x, y, hp, alive, face, angle, special, heal, double, stamina, lastPower, shownY }
      this.state = null; // the room's artillery state
      this.held = null; // a state that came in while a shot was still playing out
      this.replay = null;
      this.particles = [];
      this.texts = [];
      this.rings = [];
      this.bolts = [];
      this.callouts = [];
      this.pets = new Map();
      this.orbs = new Map(); // power-ups floating over the field: id -> { id, kind, x, y, t0 }
      this.chat = []; // the latest chat messages, for the list at the bottom
      this.chatLift = 0; // css px kept clear at the bottom (the phone's chat box)
      this.hold = null; // where the last shot landed: the view stays there until the next turn
      this.easeUntil = 0; // a slower, smoother pan to the next hero until then
      this.shake = { until: 0, pow: 0 };
      this.cam = null; // phone: { x, y } the middle of the view
      this.pan = null; // phone: dragged away to look around, until this time
      this.onEvent = null; // the page hears about hits and KOs
      new ResizeObserver(() => this.resize()).observe(canvas);
      this.resize();
      this.last = performance.now();
      if (phone) this.dragToLook();
      requestAnimationFrame(this.loop);
    }

    setPlayers(list) {
      this.looks = new Map(list.map((p) => [p.id, p]));
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const shown = this.canvas.clientWidth ? this.canvas.getBoundingClientRect().width / this.canvas.clientWidth : 1;
      this.dpr = dpr * (shown > 1.01 ? Math.min(shown, 2.5) : 1);
      this.W = Math.max(1, Math.round(this.canvas.clientWidth * this.dpr));
      this.H = Math.max(1, Math.round(this.canvas.clientHeight * this.dpr));
      if (this.canvas.width !== this.W) this.canvas.width = this.W;
      if (this.canvas.height !== this.H) this.canvas.height = this.H;
      // A tall screen (a phone, or the big screen opened on one) follows the action instead of showing the
      // whole field, which would be a thin strip.
      this.follow = this.phone || this.W < this.H * 1.1;
    }

    // ---- the battlefield --------------------------------------------------------
    // The room's artillery state. A new battlefield (seed) builds the ground, with `craters` (from a
    // snapshot) dug in. While a shot is playing out, heroes keep their places until it's done.
    setState(s, craters = null) {
      if (!s) {
        this.state = null;
        return;
      }
      const key = `${s.seed}:${s.style}`;
      if (key !== this.key || craters) {
        this.key = key;
        this.terrain = new A.Terrain(s.seed, s.style);
        for (const [x, y, r, grow] of craters || []) {
          if (grow) this.terrain.grow(x, y, r);
          else this.terrain.carve(x, y, r);
        }
        this.paintGround();
        this.backdrop = null;
        this.suddenShown = false;
        this.replay = null;
        this.held = null;
        this.hold = null;
        this.heroes.clear();
        this.orbs.clear();
        this.orbsSeen = false;
      }
      const prev = this.state;
      this.state = s;
      if (this.replay) {
        this.held = s;
        return;
      }
      this.takeHeroes(s);
      this.takeOrbs(s);
      if (s.phase === 'aim' && (!prev || prev.turn !== s.turn)) this.newTurn(s);
    }

    // The power-ups in the room's state: new ones pop in with a sparkle.
    takeOrbs(s) {
      const seen = new Set();
      for (const [id, kind, x, y] of s.orbs || []) {
        seen.add(id);
        if (this.orbs.has(id)) continue;
        this.orbs.set(id, { id, kind, x, y, t0: performance.now() });
        if (this.orbsSeen) this.burst(x, y, ['#ffffff', '#ffd23f', (POWERS[kind] || {}).color || '#ffffff'], 16, 0.16);
      }
      for (const id of [...this.orbs.keys()]) if (!seen.has(id)) this.orbs.delete(id);
      this.orbsSeen = true;
    }

    takeHeroes(s) {
      const seen = new Set();
      for (const [id, team, x, y, hp, alive, face, angle, special, heal, double, stamina, lastPower, buffs, maxStamina] of s.heroes) {
        seen.add(id);
        const h = this.heroes.get(id) || { shownY: y };
        Object.assign(h, { id, team, x, y, hp, alive: Boolean(alive) && y <= MAP.H, face, angle, special, heal, double, stamina, lastPower, buffs: buffs || 0,
          maxStamina: maxStamina || A.STAMINA, power: 0 });
        if (Math.abs(h.shownY - y) > 300) h.shownY = y;
        this.heroes.set(id, h);
      }
      for (const id of [...this.heroes.keys()]) if (!seen.has(id)) this.heroes.delete(id);
    }

    newTurn(s) {
      const h = this.heroes.get(s.active);
      if (!h) return;
      if (s.boost > 1 && !this.suddenShown) {
        this.suddenShown = true;
        this.callout('SUDDEN DEATH!', '#ff5a4d', 'Every turn from now on, shots hit harder');
        Sfx.play('roar');
      }
      const look = this.looks.get(s.active) || {};
      const mine = this.phone && s.active === this.selfId;
      this.callout(mine ? 'YOUR TURN!' : `${(look.name || 'HERO').toUpperCase()}'S TURN`, TEAMS[h.team].color);
      this.pan = null;
      // Off the last shot's landing spot, over to whoever's up: smoothly, not in a snap.
      if (this.hold) this.easeUntil = performance.now() + 1400;
      this.hold = null;
    }

    // A jump, as the server worked it out: the hero follows its path (and falls off the bottom, if it ends
    // there).
    onJump(j) {
      const h = this.heroes.get(j.id);
      if (!h) return;
      h.jump = { path: j.path, t0: performance.now(), end: j.t, fell: j.fell };
      Object.assign(h, { x: j.x, y: j.y, stamina: j.stamina });
      Sfx.play('jump');
    }

    // Chat: a speech bubble over the hero who said it, and the list at the bottom.
    say(m) {
      this.chat = this.chat.concat({ ...m, t0: performance.now() }).slice(-5);
      const h = this.heroes.get(m.by);
      if (h) h.say = { text: m.text, t0: performance.now() };
    }

    // The active hero's aim, walk and power, as it happens.
    onPos(p) {
      const h = this.heroes.get(p.id);
      if (!h || this.replay) return;
      Object.assign(h, { x: p.x, y: p.y, face: p.face, angle: p.angle, stamina: p.stamina, power: p.power });
    }

    // ---- the ground, as an image: a pixel per cell ----------------------------------
    paintGround() {
      const st = A.STYLES[this.terrain.style];
      if (!this.ground) {
        this.ground = document.createElement('canvas');
        this.ground.width = COLS;
        this.ground.height = ROWS;
        this.gctx = this.ground.getContext('2d');
      }
      this.pal = { grass: rgb(st.grass), dirt: st.dirt.map(rgb), rock: rgb(st.rock), vine: [rgb('#3f8f4a'), rgb('#4fa865')], stone: [rgb('#8a8aa0'), rgb('#6e6e88'), rgb('#4a4a60')] };
      this.pal.hollow = this.pal.dirt[1].map((c) => c * 0.32);
      this.img = this.gctx.createImageData(COLS, ROWS);
      this.redraw(0, 0, COLS - 1, ROWS - 1);
    }

    cellColor(cx, cy) {
      const i = cy * COLS + cx;
      const kind = this.terrain.cells[i];
      if (!kind) return null;
      const d = this.terrain.depth[i];
      const n = hash(cx, cy);
      const P = this.pal;
      let c;
      if (kind === 2) {
        // Stone blocks with mortar.
        const mortar = cy % 6 === 0 || (cx + (Math.floor(cy / 6) % 2) * 4) % 8 === 0;
        c = mortar ? P.stone[2] : n < 0.5 ? P.stone[0] : P.stone[1];
      } else if (kind === 3) c = P.vine[n < 0.5 ? 0 : 1];
      else if (d <= 2) c = P.grass;
      else if (d < 40) c = P.dirt[n < 0.5 ? 0 : 1];
      else c = P.rock;
      const shade = 0.9 + n * 0.2 - (kind === 1 && d > 2 ? Math.min(0.25, d / 400) : 0);
      return [c[0] * shade, c[1] * shade, c[2] * shade];
    }

    redraw(x0, y0, x1, y1, scorch = null) {
      const data = this.img.data;
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const o = (cy * COLS + cx) * 4;
          const c = this.cellColor(cx, cy);
          if (!c) {
            // Dug out of deep earth: a dark hollow, not the sky.
            const under = this.terrain.under[cy * COLS + cx];
            if (under) {
              const n = 0.85 + hash(cx, cy) * 0.15;
              [data[o], data[o + 1], data[o + 2], data[o + 3]] = [this.pal.hollow[0] * n, this.pal.hollow[1] * n, this.pal.hollow[2] * n, 255];
            } else data[o + 3] = 0;
            continue;
          }
          let k = 1;
          if (scorch) {
            // Burnt ground round the rim of a fresh crater.
            const d = Math.hypot(cx + 0.5 - scorch.x, cy + 0.5 - scorch.y);
            if (d < scorch.r + 3) k = 0.55 + 0.45 * Math.min(1, Math.max(0, (d - scorch.r) / 3));
          }
          data[o] = c[0] * k;
          data[o + 1] = c[1] * k;
          data[o + 2] = c[2] * k;
          data[o + 3] = 255;
        }
      }
      this.gctx.putImageData(this.img, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    }

    // ---- a shot playing out ---------------------------------------------------------
    onShot(shot) {
      if (!this.terrain) return;
      this.replay = { shot, t0: performance.now(), booms: new Set(), events: new Set(), end: shot.total + 250 };
      const h = this.heroes.get(shot.id);
      if (h) Object.assign(h, { angle: shot.angle, face: shot.face, power: 0, lastPower: shot.power });
      Sfx.play(shot.special ? 'boom' : 'shoot');
    }

    playReplay(pt) {
      const R = this.replay;
      if (!R) return null;
      const t = pt - R.t0;
      const shells = [];
      R.shot.shells.forEach((s, si) => {
        s.booms.forEach((b, bi) => {
          const key = `${si}:${bi}`;
          if (t >= b.t && !R.booms.has(key)) {
            R.booms.add(key);
            this.blowUp(s, b);
          }
        });
        if (t < s.t0 || t > s.end || !s.path.length) return;
        // Where the shell is now, between two points of its path.
        let i = 1;
        while (i < s.path.length && s.path[i][0] < t) i++;
        if (i >= s.path.length) return;
        const [ta, xa, ya] = s.path[i - 1];
        const [tb, xb, yb] = s.path[i];
        const k = tb > ta ? (t - ta) / (tb - ta) : 1;
        shells.push({ kind: s.kind, big: s.big, x: lerp(xa, xb, k), y: lerp(ya, yb, k), a: Math.atan2(yb - ya, xb - xa) });
      });
      R.shot.events.forEach((e, ei) => {
        if (t < e.t || R.events.has(ei)) return;
        R.events.add(ei);
        this.happen(e);
      });
      if (t >= R.end) {
        this.replay = null;
        if (this.held) {
          const s = this.held;
          this.held = null;
          this.takeHeroes(s);
          this.takeOrbs(s);
          if (s.phase === 'aim') this.newTurn(s);
        }
      }
      return shells;
    }

    blowUp(s, b) {
      if (b.grow) {
        const box = this.terrain.grow(b.x, b.y, b.grow);
        this.redraw(box.x0, box.y0, box.x1, box.y1);
        this.burst(b.x, b.y, ['#4fa865', '#3f8f4a', '#b6f59a'], 30, 0.25);
      } else if (b.crater) {
        const box = this.terrain.carve(b.x, b.y, b.crater);
        const pad = 4;
        this.redraw(Math.max(0, box.x0 - pad), Math.max(0, box.y0 - pad), Math.min(COLS - 1, box.x1 + pad), Math.min(ROWS - 1, box.y1 + pad),
          { x: b.x / MAP.CELL, y: b.y / MAP.CELL, r: b.crater / MAP.CELL });
      }
      const color = BLAST[s.kind] || '#ffd23f';
      this.hold = { x: b.x, y: b.y };
      this.rings.push({ x: b.x, y: b.y, r: b.r, color, t0: performance.now(), life: 450 });
      this.burst(b.x, b.y, [color, '#ffffff', '#ff7b1c', '#8b5a2b'], Math.min(60, 14 + b.r / 3), 0.25 + b.r / 600);
      this.shakeBy(b.r > 80 ? 7 : 4, 350);
      Sfx.play(b.r > 80 ? 'boom' : 'hit');
    }

    happen(e) {
      const h = this.heroes.get(e.id);
      const look = this.looks.get(e.id) || {};
      if (e.type === 'dmg' && h) {
        h.hp = Math.max(0, h.hp - e.d);
        this.texts.push({ x: h.x, y: h.y - 70, text: `-${e.d}`, color: '#ff5a4d', t0: performance.now(), life: 1100, size: e.d >= 40 ? 20 : 15 });
        h.hurtAt = performance.now();
        if (this.phone && e.id === this.selfId && navigator.vibrate) navigator.vibrate(60);
      } else if (e.type === 'heal' && h) {
        h.hp = Math.min(A.HP, h.hp + e.d);
        this.texts.push({ x: h.x, y: h.y - 70, text: `+${e.d}`, color: '#8be36b', t0: performance.now(), life: 1100, size: 15 });
      } else if (e.type === 'fall' && h) {
        h.y = e.y;
      } else if (e.type === 'tele' && h) {
        this.burst(h.x, h.y - 20, ['#2a2238', '#5a4f73', '#a99cc7'], 20, 0.18);
        Object.assign(h, { x: e.x, y: e.y, shownY: e.y });
        this.burst(h.x, h.y - 20, ['#2a2238', '#5a4f73', '#a99cc7'], 20, 0.18);
      } else if (e.type === 'ko' && h) {
        h.alive = false;
        h.hp = 0;
        if (e.why !== 'fell') this.burst(h.x, h.y - 20, ['#ffffff', '#ff5a4d', '#ffd23f'], 30, 0.3);
        const by = e.by && this.looks.get(e.by);
        this.callout(`${(look.name || 'HERO').toUpperCase()} IS OUT!`, '#ff5a4d', by ? `KO by ${by.name}` : e.why === 'fell' ? 'Fell off the map' : '');
        Sfx.play('boom');
      } else if (e.type === 'bolt') {
        this.bolts.push({ x: e.x, r: e.r, t0: performance.now(), life: 450 });
        Sfx.play('skill:valkyrie');
      } else if (e.type === 'orb') {
        // A power-up, hit: it pops, and the shooter has it.
        this.orbs.delete(e.orb);
        const color = (POWERS[e.kind] || {}).color || '#ffffff';
        const def = A.ORBS[e.kind] || { name: 'POWER-UP', text: '' };
        this.burst(e.x, e.y, [color, '#ffffff', '#ffd23f'], 28, 0.3);
        this.rings.push({ x: e.x, y: e.y, r: A.ORB.r * 1.8, color, t0: performance.now(), life: 420 });
        this.texts.push({ x: e.x, y: e.y - 20, text: def.name, color, t0: performance.now(), life: 1500, size: 15 });
        this.callout(`${def.name}!`, color, `${look.name || 'Hero'}: ${def.text}`);
        const bit = BUFFS.find(([, k]) => k === e.kind);
        if (h && bit) h.buffs = (h.buffs || 0) | bit[0];
        Sfx.play('award');
      }
      if (this.onEvent) this.onEvent(e);
    }

    // A hero walked (or jumped) off the edge (not during a shot).
    fell(id, jumped = false) {
      const h = this.heroes.get(id);
      if (!h) return;
      h.alive = false;
      h.y = MAP.H + 80;
      const look = this.looks.get(id) || {};
      this.callout(`${(look.name || 'HERO').toUpperCase()} FELL!`, '#ff5a4d', jumped ? 'Jumped off the edge' : 'Walked off the edge');
    }

    callout(text, color, sub = '') {
      this.callouts.push({ text, color, sub, t0: performance.now() });
      if (this.callouts.length > 2) this.callouts.shift();
    }

    shakeBy(pow, ms) {
      this.shake.pow = Math.max(this.shake.pow, pow);
      this.shake.until = Math.max(this.shake.until, performance.now() + ms);
    }

    burst(x, y, colors, n, speed) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2);
        const v = rand(0.3, 1) * speed;
        this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.12, g: 0.0009, life: rand(400, 900), t0: performance.now(),
          size: rand(4, 8), color: colors[i % colors.length] });
      }
    }

    // ---- the view ---------------------------------------------------------------------
    // Phone: drag the field to look around; it goes back to following the action after a few seconds.
    dragToLook() {
      let drag = null;
      this.canvas.addEventListener('pointerdown', (e) => {
        drag = { x: e.clientX, y: e.clientY, cam: this.cam ? { ...this.cam } : null };
      });
      window.addEventListener('pointermove', (e) => {
        if (!drag || !drag.cam || !this.s) return;
        const k = this.dpr / this.s;
        const dx = (e.clientX - drag.x) * k;
        const dy = (e.clientY - drag.y) * k;
        if (Math.hypot(dx, dy) < 8 && !this.pan) return;
        this.cam = { x: drag.cam.x - dx, y: drag.cam.y - dy };
        this.pan = performance.now() + 4000;
      });
      window.addEventListener('pointerup', () => { drag = null; });
    }

    camera(focus, dt) {
      const W = this.W;
      const top = this.phone ? 0 : this.reserveTop * this.dpr;
      const H = this.H - top;
      if (!this.follow) {
        const s = Math.min(W / MAP.W, H / MAP.H);
        this.s = s;
        this.ox = (W - MAP.W * s) / 2;
        this.oy = top + (H - MAP.H * s) / 2;
        return;
      }
      const s = Math.min(W / (this.phone ? 900 : 1100), H / 520);
      this.s = s;
      const vw = W / s;
      const vh = H / s;
      if (!this.cam) this.cam = { ...focus };
      if (!this.pan || performance.now() > this.pan) {
        this.pan = null;
        const k = 1 - Math.exp(-dt / (performance.now() < this.easeUntil ? 420 : 160));
        this.cam.x = lerp(this.cam.x, focus.x, k);
        this.cam.y = lerp(this.cam.y, focus.y, k);
      }
      this.cam.x = vw >= MAP.W ? MAP.W / 2 : clamp(this.cam.x, vw / 2, MAP.W - vw / 2);
      this.cam.y = vh >= MAP.H ? MAP.H / 2 : clamp(this.cam.y, vh / 2 - 200, MAP.H - vh / 2 + 60);
      this.ox = W / 2 - this.cam.x * s;
      this.oy = top + H / 2 - this.cam.y * s;
    }

    X(x) { return x * this.s + this.ox; }
    Y(y) { return y * this.s + this.oy; }

    block(x, y, size, color) {
      this.ctx.fillStyle = color;
      this.ctx.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), Math.ceil(size), Math.ceil(size));
    }

    text(str, x, y, size, color, align = 'center') {
      const ctx = this.ctx;
      const fs = Math.max(6, Math.round(size * this.dpr));
      ctx.font = `${fs}px "Press Start 2P", monospace`;
      ctx.textAlign = align;
      const o = Math.max(1, Math.round(fs / 8));
      ctx.fillStyle = '#1b1426';
      for (const [ox, oy] of [[-o, 0], [o, 0], [0, -o], [0, o], [o, o]]) ctx.fillText(str, Math.round(x + ox), Math.round(y + oy));
      ctx.fillStyle = color;
      ctx.fillText(str, Math.round(x), Math.round(y));
      return ctx.measureText(str).width;
    }

    loop = () => {
      requestAnimationFrame(this.loop);
      const t = performance.now();
      const dt = Math.min(50, t - this.last);
      this.last = t;
      if (!this.active || !this.canvas.clientWidth) return;
      try {
        this.draw(t, dt);
      } catch (e) {
        console.error(e);
      }
    };

    draw(pt, dt) {
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      const shells = this.playReplay(pt) || [];
      const s = this.state;
      const act = s && this.heroes.get(s.active);
      // The view follows the shot; once it lands it stays there (this.hold) until the next turn starts.
      let focus;
      if (shells.length) {
        focus = { x: shells[0].x, y: shells[0].y };
        this.hold = { ...focus };
      } else if (act && act.jump) {
        const [x, y] = pathAt(act.jump.path, pt - act.jump.t0);
        focus = { x, y: y - 120 };
      } else if (this.hold) focus = this.hold;
      else focus = act ? { x: act.x, y: act.y - 120 } : { x: MAP.W / 2, y: MAP.H / 2 };
      this.camera(focus, dt);
      this.drawSky(pt);
      if (pt < this.shake.until) {
        const p = this.shake.pow * this.dpr;
        ctx.translate(Math.round(rand(-p, p)), Math.round(rand(-p, p)));
      } else this.shake.pow = 0;
      if (this.ground) ctx.drawImage(this.ground, Math.round(this.X(0)), Math.round(this.Y(0)), Math.round(MAP.W * this.s), Math.round(MAP.H * this.s));
      this.drawAbyss(pt);
      this.drawBolts(pt);
      this.drawOrbs(pt);
      for (const h of this.heroes.values()) this.drawHero(h, pt, dt, s);
      for (const sh of shells) this.drawShell(sh, pt);
      this.drawRings(pt);
      this.drawParticles(pt, dt);
      this.drawTexts(pt);
      for (const h of this.heroes.values()) if (h.say && h.bubbleAt) this.drawBubble(h, pt);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.drawWind(pt, dt);
      this.drawCallouts(pt);
      this.drawFeed(pt);
      if (this.follow) this.drawMinimap(shells);
    }

    // Power-ups: a bubble with the power-up inside, bobbing in the air.
    drawOrbs(pt) {
      const ctx = this.ctx;
      for (const o of this.orbs.values()) {
        const grow = Math.min(1, (pt - o.t0) / 400);
        const X = this.X(o.x);
        const Y = this.Y(o.y + Math.sin(pt / 380 + o.id * 1.7) * 6);
        const R = (A.ORB.r + 6) * this.s * grow; // as big as a shot has to come to take it
        if (R < 1) continue;
        const color = (POWERS[o.kind] || {}).color || '#ffffff';
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(X, Y, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.9;
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * Math.PI * 2 + pt / 1500;
          this.block(X + Math.cos(a) * R, Y + Math.sin(a) * R, Math.max(2, 3.5 * this.s), i % 5 === 0 ? '#ffffff' : color);
        }
        ctx.globalAlpha = 1;
        const spr = powerSprite(o.kind);
        const k = (R * 1.2) / spr.height;
        ctx.drawImage(spr, Math.round(X - (spr.width * k) / 2), Math.round(Y - (spr.height * k) / 2), Math.round(spr.width * k), Math.round(spr.height * k));
        this.block(X - R * 0.5, Y - R * 0.5, Math.max(2, 5 * this.s), '#ffffff');
      }
    }

    // What a hero said, in a speech bubble over their head (where drawHero put it this frame).
    drawBubble(h, pt) {
      const age = pt - h.say.t0;
      if (age > SAY_MS) {
        h.say = null;
        return;
      }
      const ctx = this.ctx;
      const d = this.dpr;
      const fs = Math.round((this.phone ? 7 : clamp((10 * this.s) / d, 7, 11)) * d);
      ctx.font = `${fs}px "Press Start 2P", monospace`;
      ctx.textAlign = 'left';
      const lines = wrap(ctx, h.say.text, fs * 14, 3);
      const lh = Math.round(fs * 1.6);
      const pad = Math.round(fs * 0.6);
      const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + pad * 2;
      const hgt = pad * 2 + fs + (lines.length - 1) * lh;
      const [x, bottom] = h.bubbleAt;
      const bx = Math.round(clamp(x - w / 2, 4 * d, this.W - w - 4 * d));
      const by = Math.round(bottom - hgt - 6 * d);
      ctx.globalAlpha = age > SAY_MS - 400 ? (SAY_MS - age) / 400 : 1;
      const tx = Math.round(clamp(x, bx + 8 * d, bx + w - 8 * d));
      ctx.fillStyle = '#1b1426';
      ctx.fillRect(bx - 2 * d, by - 2 * d, w + 4 * d, hgt + 4 * d);
      ctx.fillRect(tx - 4 * d, by + hgt, 8 * d, 6 * d);
      ctx.fillStyle = '#fff8e7';
      ctx.fillRect(bx, by, w, hgt);
      ctx.fillRect(tx - 2 * d, by + hgt, 4 * d, 4 * d);
      ctx.fillStyle = '#1b1426';
      lines.forEach((l, i) => ctx.fillText(l, bx + pad, by + pad + fs + i * lh));
      ctx.globalAlpha = 1;
    }

    // The latest chat, at the bottom left: who said it and what.
    drawFeed(pt) {
      const list = this.chat.filter((m) => pt - m.t0 < FEED_MS).slice(-4);
      if (!list.length) return;
      const d = this.dpr;
      const fs = this.follow ? 7 : 10;
      const lh = (fs + 9) * d;
      const most = Math.max(8, Math.floor((this.W * 0.62) / (fs * d)));
      let y = this.H - (10 + this.chatLift) * d;
      for (let i = list.length - 1; i >= 0; i--) {
        const m = list[i];
        const age = pt - m.t0;
        this.ctx.globalAlpha = age > FEED_MS - 1000 ? (FEED_MS - age) / 1000 : 1;
        const name = `${m.name}:`;
        const room = Math.max(4, most - name.length - 1);
        const text = m.text.length > room ? `${m.text.slice(0, room - 1)}…` : m.text;
        this.ctx.fillStyle = 'rgba(27,20,38,0.6)';
        this.ctx.fillRect(4 * d, y - (fs + 5) * d, (name.length + text.length + 2) * fs * d, lh - 2 * d);
        const nw = this.text(name, 8 * d, y, fs, (COLORS[m.color] || COLORS[0]).Q, 'left');
        this.text(text, 8 * d + nw + fs * d, y, fs, '#ffffff', 'left');
        y -= lh;
      }
      this.ctx.globalAlpha = 1;
    }

    // The sky, with far-off hills, from the battlefield's colors.
    drawSky(pt) {
      const ctx = this.ctx;
      const st = A.STYLES[this.terrain ? this.terrain.style : 0];
      const g = ctx.createLinearGradient(0, 0, 0, this.H);
      st.sky.forEach((c, i) => g.addColorStop(i / (st.sky.length - 1), c));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.W, this.H);
      // Far hills, sliding a little with the view.
      const base = this.Y(MAP.H * 0.55);
      ctx.fillStyle = 'rgba(27,20,38,0.18)';
      ctx.beginPath();
      ctx.moveTo(0, this.H);
      for (let x = 0; x <= this.W; x += 8) {
        const wx = (x - this.ox * 0.4) / Math.max(0.05, this.s);
        ctx.lineTo(x, base + Math.sin(wx / 260) * 60 * this.s + Math.sin(wx / 97) * 20 * this.s);
      }
      ctx.lineTo(this.W, this.H);
      ctx.fill();
      // Clouds drifting.
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < 6; i++) {
        const cx = ((i * 431 + pt / 60) % (MAP.W + 400)) - 200;
        const cy = 80 + ((i * 173) % 260);
        const w = (120 + (i % 3) * 60) * this.s;
        ctx.fillRect(Math.round(this.X(cx)), Math.round(this.Y(cy)), Math.round(w), Math.round(18 * this.s));
        ctx.fillRect(Math.round(this.X(cx) + w * 0.2), Math.round(this.Y(cy) - 12 * this.s), Math.round(w * 0.5), Math.round(14 * this.s));
      }
    }

    // The bottom of the map: a misty drop.
    drawAbyss(pt) {
      const ctx = this.ctx;
      ctx.fillStyle = '#120c1c';
      ctx.fillRect(0, Math.round(this.Y(MAP.H)), this.W, this.H);
      const y = this.Y(MAP.H - 24);
      const g = ctx.createLinearGradient(0, y, 0, y + 80 * this.s);
      g.addColorStop(0, 'rgba(18,12,28,0)');
      g.addColorStop(1, 'rgba(18,12,28,0.9)');
      ctx.fillStyle = g;
      ctx.fillRect(this.X(0), y, MAP.W * this.s, 80 * this.s);
      ctx.fillStyle = 'rgba(122,85,176,0.35)';
      for (let x = 0; x < MAP.W; x += 60) {
        const wy = MAP.H - 6 + Math.sin(pt / 400 + x / 50) * 4;
        ctx.fillRect(Math.round(this.X(x)), Math.round(this.Y(wy)), Math.round(34 * this.s), Math.max(1, Math.round(3 * this.s)));
      }
    }

    drawHero(h, pt, dt, s) {
      const look = this.looks.get(h.id);
      h.bubbleAt = null;
      if (!look) return;
      const ctx = this.ctx;
      // A jump plays out along its path. Otherwise falling heroes drop smoothly to where they land, and
      // climbing ones step up.
      let at = null;
      if (h.jump) {
        const J = h.jump;
        if (pt - J.t0 >= J.end) {
          h.jump = null;
          if (J.fell) this.fell(h.id, true);
          h.shownY = h.y;
        } else at = pathAt(J.path, pt - J.t0);
      }
      if (!at) h.shownY = h.shownY === undefined ? h.y : h.shownY < h.y ? Math.min(h.y, h.shownY + dt * 0.9) : Math.max(h.y, h.shownY - dt * 0.4);
      const alive = h.alive || Boolean(at);
      const hx = at ? at[0] : h.x;
      const hy = at ? at[1] : h.shownY;
      if (!alive && hy > MAP.H + 40) return;
      const X = this.X(hx);
      const Y = this.Y(hy);
      const u = PX * this.s;
      const team = TEAMS[h.team];
      const up = s && s.active === h.id && s.phase === 'aim';
      if (!alive) {
        // A gravestone where they fell.
        ctx.fillStyle = '#1b1426';
        ctx.fillRect(Math.round(X - 6 * u), Math.round(Y - 14 * u), Math.round(12 * u), Math.round(14 * u));
        ctx.fillStyle = '#8a8aa0';
        ctx.fillRect(Math.round(X - 5 * u), Math.round(Y - 13 * u), Math.round(10 * u), Math.round(13 * u));
        ctx.fillStyle = '#4a4a60';
        ctx.fillRect(Math.round(X - u), Math.round(Y - 11 * u), Math.round(2 * u), Math.round(7 * u));
        ctx.fillRect(Math.round(X - 3 * u), Math.round(Y - 9 * u), Math.round(6 * u), Math.round(2 * u));
        h.bubbleAt = [X, Y - 18 * u]; // out of the fight, still in the chat
        return;
      }
      // Team mark under the feet (on the ground: not in mid-jump).
      if (!at) {
        ctx.fillStyle = team.color;
        ctx.fillRect(Math.round(X - 9 * u), Math.round(Y - u * 0.5), Math.round(18 * u), Math.max(2, Math.round(u)));
      }
      const hurt = pt - (h.hurtAt || 0) < 120;
      if (hurt) ctx.globalAlpha = 0.5;
      // Their pet, as a mount, and the hero on its back. Walking, the pet steps along (a slime squashes)
      // and the rider bobs; in a jump its legs stretch out.
      const flipDraw = (spr, scale, feet, sx = 1, sy = 1) => {
        const w = spr.width * scale * sx;
        const hh = spr.height * scale * sy;
        ctx.save();
        ctx.translate(Math.round(X), 0);
        if (h.face < 0) ctx.scale(-1, 1);
        ctx.drawImage(spr, Math.round(-w / 2), Math.round(feet - hh), Math.round(w), Math.round(hh));
        ctx.restore();
        return hh;
      };
      if (!at && Math.abs(hx - (h.drawnX ?? hx)) > 0.3) h.walkUntil = pt + 180;
      h.drawnX = hx;
      const walking = !at && pt < (h.walkUntil || 0);
      const step = at ? 1 : walking ? 1 + (Math.floor(pt / 120) % 2) : 0;
      const slime = look.pet === 3 && step ? (at ? [0.88, 1.14] : step === 1 ? [1.14, 0.86] : [0.94, 1.08]) : [1, 1];
      const mount = petSprite(look.pet, step);
      let feet = Y;
      if (mount) feet = Y - flipDraw(mount, u * 2, Y, slime[0], slime[1]) * 0.55 + (step === 2 ? -u : 0);
      else if (step === 2) feet -= u;
      const hh = flipDraw(heroSprite(look), u, feet);
      ctx.globalAlpha = 1;
      // Power-ups waiting: a shield around them, sparks of fury.
      if (h.buffs & 2) {
        ctx.globalAlpha = 0.45 + Math.sin(pt / 200) * 0.15;
        const R = 40 * this.s;
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          this.block(X + Math.cos(a) * R, Y - A.HERO_MID * this.s + Math.sin(a) * R, Math.max(2, 3 * this.s), '#7aa7ff');
        }
        ctx.globalAlpha = 1;
      }
      if ((h.buffs & 1) && Math.random() < 0.2) {
        this.particles.push({ x: hx + rand(-16, 16), y: hy - rand(10, 60), vx: 0, vy: -0.05, g: 0, life: 500, t0: pt, size: 4, color: Math.random() < 0.5 ? '#ff7b1c' : '#ffd23f' });
      }
      // HP bar and name, with the power-ups waiting beside the bar.
      const bw = 40 * this.s;
      const by = feet - hh - 10 * this.s;
      const frac = clamp(h.hp / A.HP, 0, 1);
      ctx.fillStyle = '#1b1426';
      ctx.fillRect(Math.round(X - bw / 2 - 1), Math.round(by - 1), Math.round(bw + 2), Math.max(3, Math.round(5 * this.s)) + 2);
      ctx.fillStyle = frac > 0.5 ? '#5bd46a' : frac > 0.25 ? '#ffd23f' : '#ff5a4d';
      ctx.fillRect(Math.round(X - bw / 2), Math.round(by), Math.round(bw * frac), Math.max(3, Math.round(5 * this.s)));
      let ix = X + bw / 2 + 4 * this.s;
      for (const [bit, key] of BUFFS) {
        if (!(h.buffs & bit)) continue;
        const spr = powerSprite(key);
        const k = Math.max(1, (20 * this.s) / spr.height);
        ctx.drawImage(spr, Math.round(ix), Math.round(by + 3 * this.s - spr.height * k * 0.6), Math.round(spr.width * k), Math.round(spr.height * k));
        ix += spr.width * k + 2;
      }
      const fs = this.phone ? 7 : clamp((10 * this.s) / this.dpr, 7, 12);
      this.text(look.name, X, by - 5 * this.dpr, fs, h.id === this.selfId && this.phone ? '#ffffff' : team.color);
      h.bubbleAt = [X, by - (fs + 8) * this.dpr];
      if (up && !at) this.drawAim(h, X, Y, pt);
    }

    // Whose turn: a bouncing arrow, the aim line through the angle's arc, and their power filling up.
    drawAim(h, X, Y, pt) {
      const s = this.s;
      const cy = Y - A.HERO_MID * s;
      const ctx = this.ctx;
      const bob = Math.sin(pt / 180) * 4 * s;
      const top = Y - 75 * s + bob;
      const team = TEAMS[h.team];
      for (let i = 0; i < 4; i++) this.block(X, top + i * 3 * s, (8 - i * 2) * s, team.color);
      // The arc of angles you can pick, and where you're aiming.
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = Math.max(1, 1.5 * this.dpr);
      ctx.beginPath();
      const r = 62 * s;
      const a0 = (-A.ANGLE_MAX * Math.PI) / 180;
      const a1 = (-A.ANGLE_MIN * Math.PI) / 180;
      if (h.face > 0) ctx.arc(X, cy, r, a0, a1);
      else ctx.arc(X, cy, r, Math.PI - a1, Math.PI - a0);
      ctx.stroke();
      const a = (h.angle * Math.PI) / 180;
      const dx = Math.cos(a) * h.face;
      const dy = -Math.sin(a);
      for (let k = 18; k <= 62; k += 6) this.block(X + dx * k * s, cy + dy * k * s, (k > 56 ? 5 : 3) * s, k > 56 ? '#ffd23f' : '#ffffff');
      if (!this.phone) this.text(`${h.angle}°`, X + dx * 96 * s, cy + dy * 96 * s + 4 * this.dpr, clamp((9 * s) / this.dpr, 7, 11), '#ffffff');
      if (h.power > 0) {
        const bw = 60 * s;
        const by = Y + 10 * s;
        ctx.fillStyle = '#1b1426';
        ctx.fillRect(Math.round(X - bw / 2 - 1), Math.round(by - 1), Math.round(bw + 2), Math.round(7 * s) + 2);
        ctx.fillStyle = '#ff7b1c';
        ctx.fillRect(Math.round(X - bw / 2), Math.round(by), Math.round((bw * h.power) / 100), Math.round(7 * s));
      }
    }

    drawShell(sh, pt) {
      const X = this.X(sh.x);
      const Y = this.Y(sh.y);
      const own = SHELLS[sh.kind];
      if (own) {
        const u = 2.6 * this.s * (sh.big || 1);
        const spin = sh.kind === 'boulder' || sh.kind === 'drum' ? pt / 120 : sh.a;
        for (const [dx, dy, size, color] of own) {
          const rx = dx * Math.cos(spin) - dy * Math.sin(spin);
          const ry = dx * Math.sin(spin) + dy * Math.cos(spin);
          this.block(X + rx * u, Y + ry * u, size * u, color);
        }
        if (Math.random() < 0.5) this.particles.push({ x: sh.x, y: sh.y, vx: 0, vy: 0, g: 0, life: 260, t0: pt, size: 3, color: BLAST[sh.kind] });
        return;
      }
      const fake = { U: 2.6 * this.s * (sh.big || 1), ctx: this.ctx, block: (x, y, size, color) => this.block(x, y, size, color) };
      const kind = sh.kind === 'meteor' ? 'fireball' : sh.kind;
      const look = this.looks.get(this.replay ? this.replay.shot.id : null) || {};
      const color = COLORS[look.color || 0] || COLORS[0];
      window.Arena.prototype.drawBolt.call(fake, kind, X, Y, Math.cos(sh.a), Math.sin(sh.a), sh.a, color, pt, sh.kind === 'meteor' ? 1.8 : 1);
      if (Math.random() < 0.6) {
        this.particles.push({ x: sh.x, y: sh.y, vx: 0, vy: 0, g: 0, life: 300, t0: pt, size: 4, color: BLAST[sh.kind] || '#ffffff' });
      }
    }

    drawBolts(pt) {
      const keep = [];
      for (const b of this.bolts) {
        const k = (pt - b.t0) / b.life;
        if (k >= 1) continue;
        keep.push(b);
        this.ctx.globalAlpha = (1 - k) * 0.35;
        this.ctx.fillStyle = '#7fd4ff';
        this.ctx.fillRect(this.X(b.x - b.r), this.Y(-200), b.r * 2 * this.s, (MAP.H + 200) * this.s);
        this.ctx.globalAlpha = 1 - k;
        let x = this.X(b.x);
        for (let y = this.Y(-100); y < this.Y(MAP.H); y += 6 * this.s) {
          this.block(x, y, 6 * this.s, '#ffffff');
          x += rand(-4, 4) * this.s;
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
        this.ctx.globalAlpha = 1 - k;
        const rad = r.r * this.s * (0.3 + k * 0.8);
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          this.block(this.X(r.x) + Math.cos(a) * rad, this.Y(r.y) + Math.sin(a) * rad, 5 * this.s, r.color);
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
        p.x += p.vx * dt * 1.5;
        p.y += p.vy * dt * 1.5;
        ctx.globalAlpha = Math.min(1, (1 - age / p.life) * 1.6);
        ctx.fillStyle = p.color;
        const size = Math.max(1, p.size * this.s);
        ctx.fillRect(Math.round(this.X(p.x) - size / 2), Math.round(this.Y(p.y) - size / 2), Math.ceil(size), Math.ceil(size));
        keep.push(p);
      }
      ctx.globalAlpha = 1;
      this.particles = keep.length > 800 ? keep.slice(-800) : keep;
    }

    drawTexts(pt) {
      const keep = [];
      for (const t of this.texts) {
        const k = (pt - t.t0) / t.life;
        if (k >= 1) continue;
        keep.push(t);
        this.ctx.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
        this.text(t.text, this.X(t.x), this.Y(t.y) - k * 40 * this.s, this.phone ? t.size * 0.7 : t.size * clamp(this.s / this.dpr / 0.6, 0.7, 1.3), t.color);
        this.ctx.globalAlpha = 1;
      }
      this.texts = keep;
    }

    // The wind: a gauge along the top (on a phone, as wide as the room beside the minimap; on the big screen,
    // over the middle of the field). An arrow grows from the middle the way it blows, longer and hotter in
    // color the stronger it is, with streaks drifting along; ticks mark every 4 points, up to 16. Under it,
    // the number, which way, and how strong in a word.
    drawWind(pt, dt) {
      const s = this.state;
      if (!s) return;
      const d = this.dpr;
      const ctx = this.ctx;
      const MAX = 16;
      const mini = this.follow ? Math.min(this.W * 0.42, 170 * d) / d : 0;
      const half = this.follow ? clamp((this.W / d - mini - 32) / 2, 60, 130) : 180;
      const cx = this.follow ? (8 + half) * d : this.ox + (MAP.W * this.s) / 2;
      const top = ((this.phone ? 0 : this.reserveTop) + 8) * d;
      const h = (this.follow ? 26 : 34) * d;
      const y = top + h / 2;
      const w = half * d;
      const span = w - 14 * d; // the longest the arrow gets
      // The arrow grows (or shrinks, or swings round) to a new wind, rather than jumping.
      this.windShown = this.windShown === undefined ? s.wind : this.windShown + (s.wind - this.windShown) * (1 - Math.exp(-dt / 180));
      const n = Math.abs(s.wind);
      const dir = Math.sign(this.windShown) || Math.sign(s.wind);
      const len = span * Math.min(1, Math.abs(this.windShown) / MAX);
      const color = n === 0 ? '#c9cfdc' : n <= 4 ? '#7fd4ff' : n <= 9 ? '#ffd23f' : n <= 13 ? '#ff9a3c' : '#ff5a4d';
      ctx.fillStyle = '#1b1426';
      ctx.fillRect(Math.round(cx - w - 2 * d), Math.round(top - 2 * d), Math.round(w * 2 + 4 * d), Math.round(h + 4 * d));
      ctx.fillStyle = 'rgba(45,35,66,0.92)';
      ctx.fillRect(Math.round(cx - w), Math.round(top), Math.round(w * 2), Math.round(h));
      // Streaks drifting the way it blows, faster the stronger.
      if (n) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx - w, top, w * 2, h);
        ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        const lanes = [0.25, 0.5, 0.75];
        for (let i = 0; i < 7; i++) {
          const run = half * 2 + 40;
          const pos = ((pt * (0.02 + n * 0.01) + i * 61) % run) - 20;
          const x = Math.sign(s.wind) > 0 ? cx - w + pos * d : cx + w - pos * d;
          ctx.fillRect(Math.round(x), Math.round(top + h * lanes[i % 3]), Math.round((8 + n) * d), Math.max(1, Math.round(d)));
        }
        ctx.restore();
      }
      // Ticks every 4 points either way, and the middle.
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      for (let k = 4; k <= MAX; k += 4) {
        for (const side of [-1, 1]) ctx.fillRect(Math.round(cx + side * (span * k) / MAX - d / 2), Math.round(top + h - 6 * d), Math.max(1, Math.round(d)), Math.round(4 * d));
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(cx - d), Math.round(top + 3 * d), Math.round(2 * d), Math.round(h - 6 * d));
      // The arrow: a bar from the middle and a stepped head, outlined.
      if (len > 2 * d) {
        const bar = 6 * d;
        const x0 = dir > 0 ? cx : cx - len;
        ctx.fillStyle = '#1b1426';
        ctx.fillRect(Math.round(x0), Math.round(y - bar / 2 - d), Math.round(len), Math.round(bar + 2 * d));
        ctx.fillStyle = color;
        ctx.fillRect(Math.round(x0), Math.round(y - bar / 2), Math.round(len), Math.round(bar));
        const tip = cx + dir * len;
        for (let i = 0; i < 5; i++) {
          const hh = (2 * (5 - i) - 1) * 2 * d;
          const x = dir > 0 ? tip + i * 2 * d : tip - (i + 1) * 2 * d;
          ctx.fillStyle = '#1b1426';
          ctx.fillRect(Math.round(x - d), Math.round(y - hh / 2 - d), Math.round(4 * d), Math.round(hh + 2 * d));
        }
        for (let i = 0; i < 5; i++) {
          const hh = (2 * (5 - i) - 1) * 2 * d;
          const x = dir > 0 ? tip + i * 2 * d : tip - (i + 1) * 2 * d;
          ctx.fillStyle = color;
          ctx.fillRect(Math.round(x), Math.round(y - hh / 2), Math.round(2 * d), Math.round(hh));
        }
      }
      const word = n === 0 ? 'CALM' : n <= 4 ? 'LIGHT' : n <= 9 ? 'BREEZY' : n <= 13 ? 'STRONG' : 'GALE';
      const way = s.wind < 0 ? '◀ ' : '';
      const back = s.wind > 0 ? ' ▶' : '';
      const fs = this.follow ? 8 : 12;
      this.text(n ? `${way}WIND ${n} ${word}${back}` : 'NO WIND', cx, top + h + (fs + 8) * d, fs, color);
      if (s.boost > 1) this.text(`SUDDEN DEATH x${s.boost}`, cx, top + h + (fs * 2 + 16) * d, this.follow ? 7 : 10, '#ff5a4d');
    }

    drawCallouts(pt) {
      const d = this.dpr;
      const cx = this.follow ? this.W / 2 : this.ox + (MAP.W * this.s) / 2;
      let y = this.follow ? this.H * 0.35 : (this.reserveTop + 110) * d;
      this.callouts = this.callouts.filter((c) => pt - c.t0 < 1800);
      for (const c of this.callouts) {
        const k = (pt - c.t0) / 1800;
        this.ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
        this.text(c.text, cx, y, this.follow ? 14 : 30, c.color);
        if (c.sub) this.text(c.sub, cx, y + (this.follow ? 16 : 28) * d, this.follow ? 7 : 12, '#ffffff');
        this.ctx.globalAlpha = 1;
        y += (this.follow ? 40 : 70) * d;
      }
    }

    // Phone: the whole field in a strip at the top, with every hero and the shot in flight.
    drawMinimap(shells) {
      if (!this.ground) return;
      const d = this.dpr;
      const w = Math.min(this.W * 0.42, 170 * d);
      const h = (w * MAP.H) / MAP.W;
      const x = this.W - w - 8 * d;
      const y = ((this.phone ? 0 : this.reserveTop) + 8) * d;
      const ctx = this.ctx;
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = '#1b1426';
      ctx.fillRect(x - 2 * d, y - 2 * d, w + 4 * d, h + 4 * d);
      ctx.fillStyle = 'rgba(61,127,214,0.6)';
      ctx.fillRect(x, y, w, h);
      ctx.drawImage(this.ground, x, y, w, h);
      const k = w / MAP.W;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = d;
      // The part of the field on screen, kept inside the minimap.
      const top = this.phone ? 0 : this.reserveTop * d;
      const vx0 = clamp(-this.ox / this.s, 0, MAP.W);
      const vy0 = clamp((top - this.oy) / this.s, 0, MAP.H);
      const vx1 = clamp((this.W - this.ox) / this.s, 0, MAP.W);
      const vy1 = clamp((this.H - this.oy) / this.s, 0, MAP.H);
      ctx.strokeRect(x + vx0 * k, y + vy0 * k, (vx1 - vx0) * k, (vy1 - vy0) * k);
      for (const hh of this.heroes.values()) {
        if (!hh.alive) continue;
        ctx.fillStyle = hh.id === this.selfId ? '#ffffff' : TEAMS[hh.team].color;
        ctx.fillRect(x + hh.x * k - 2 * d, y + (hh.y - 20) * k - 2 * d, 4 * d, 4 * d);
      }
      for (const o of this.orbs.values()) {
        ctx.fillStyle = (POWERS[o.kind] || {}).color || '#ffffff';
        ctx.fillRect(x + o.x * k - 2 * d, y + o.y * k - 2 * d, 4 * d, 4 * d);
      }
      for (const sh of shells) {
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(x + sh.x * k - 1.5 * d, y + sh.y * k - 1.5 * d, 3 * d, 3 * d);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---- the phone's controls -----------------------------------------------------------
  // On your turn: ◀ ▶ walk (held), JUMP, ▲ ▼ angle (held), FIRE: hold to charge, let go to shoot. Pick
  // SHOT 1, SHOT 2 or your special, and use HEAL or DOUBLE. On a keyboard: arrows walk and aim, J jumps,
  // Space charges and fires, 1, 2 and 3 pick the shot, H heals, X doubles.
  class ArtyPad {
    constructor(root, { send, view }) {
      this.root = root;
      this.send = send; // (event, data, cb)
      this.view = view;
      this.mine = false; // it's your turn
      this.hero = null;
      this.angle = 45;
      this.face = 1;
      this.shot = 'one'; // 'one', 'two' or 'special'
      this.power = 0;
      this.charging = null;
      this.walking = 0;
      this.tilting = 0;
      this.sentAim = '';
      this.airUntil = 0; // in the middle of a jump until then: no firing
      const q = (sel) => root.querySelector(sel);
      this.el = {
        left: q('[data-a="left"]'), right: q('[data-a="right"]'), up: q('[data-a="up"]'), down: q('[data-a="down"]'), fire: q('[data-a="fire"]'),
        jump: q('[data-a="jump"]'),
        shot: q('[data-a="shot"]'), shot2: q('[data-a="shot2"]'), special: q('[data-a="special"]'), heal: q('[data-a="heal"]'), double: q('[data-a="double"]'),
        power: q('.ap-power i'), last: q('.ap-power b'), angle: q('.ap-angle'), move: q('.ap-move i'), wait: q('.ap-wait'),
      };
      const hold = (btn, on, off) => {
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          Sfx.unlock();
          try { btn.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
          on();
        });
        for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, () => off());
      };
      hold(this.el.left, () => this.walk(-1), () => this.walk(0));
      hold(this.el.right, () => this.walk(1), () => this.walk(0));
      hold(this.el.up, () => { this.tilting = 1; }, () => { this.tilting = 0; this.aim(true); });
      hold(this.el.down, () => { this.tilting = -1; }, () => { this.tilting = 0; this.aim(true); });
      hold(this.el.fire, () => this.charge(), () => this.release());
      hold(this.el.jump, () => this.jump(), () => {});
      this.el.shot.onclick = () => this.pick('one');
      this.el.shot2.onclick = () => this.pick('two');
      this.el.special.onclick = () => this.pick('special');
      this.el.heal.onclick = () => this.item('heal');
      this.el.double.onclick = () => this.item('double');
      const keys = new Set();
      window.addEventListener('keydown', (e) => {
        if (!this.mine || e.repeat || /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) return;
        const k = e.key.toLowerCase();
        keys.add(k);
        if (k === 'arrowleft' || k === 'a') this.walk(-1);
        else if (k === 'arrowright' || k === 'd') this.walk(1);
        else if (k === 'arrowup' || k === 'w') this.tilting = 1;
        else if (k === 'arrowdown' || k === 's') this.tilting = -1;
        else if (k === ' ') this.charge();
        else if (k === 'j') this.jump();
        else if (k === '1') this.pick('one');
        else if (k === '2') this.pick('two');
        else if (k === '3') this.pick('special');
        else if (k === 'h') this.item('heal');
        else if (k === 'x') this.item('double');
        else return;
        e.preventDefault();
      });
      window.addEventListener('keyup', (e) => {
        const k = e.key.toLowerCase();
        keys.delete(k);
        if (['arrowleft', 'a', 'arrowright', 'd'].includes(k)) this.walk(0);
        if (['arrowup', 'w', 'arrowdown', 's'].includes(k)) {
          this.tilting = 0;
          this.aim(true);
        }
        if (k === ' ' && this.charging) this.release();
      });
      this.last = performance.now();
      const tick = () => {
        requestAnimationFrame(tick);
        const t = performance.now();
        const dt = t - this.last;
        this.last = t;
        this.update(dt);
      };
      requestAnimationFrame(tick);
    }

    // The room's state (whose turn) and your hero in it.
    sync(state, you) {
      const was = this.mine;
      const h = state && this.view.heroes.get(you);
      this.mine = Boolean(state && state.phase === 'aim' && state.active === you && h && h.alive);
      this.hero = h || null;
      this.state = state;
      if (this.mine && !was) {
        this.angle = h.angle;
        this.face = h.face;
        if (this.shot === 'special') this.shot = 'one'; // keep your last pick, but the special charges up again
        this.power = 0;
        this.charging = null;
        if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
        Sfx.play('round');
      }
      if (!this.mine) {
        this.walking = 0;
        this.tilting = 0;
        this.charging = null;
      }
      this.render();
    }

    walk(dir) {
      if (!this.mine) return;
      if (dir) this.face = dir;
      if (this.walking === dir) return;
      this.walking = dir;
      this.send('arty:walk', { dir });
    }

    aim(force = false) {
      if (!this.mine) return;
      const key = `${Math.round(this.angle)}:${this.face}`;
      const t = performance.now();
      if (!force && (key === this.sentAim || t - (this.aimAt || 0) < 80)) return;
      this.aimAt = t;
      this.sentAim = key;
      this.send('arty:aim', { angle: Math.round(this.angle), face: this.face });
    }

    // Your mount: what a jump costs, and whether it can flap (a bat) in mid-air.
    mount() {
      const look = this.hero && this.view.looks.get(this.hero.id);
      return A.MOUNTS[look ? look.pet : 0] || A.MOUNTS[0];
    }

    canJump() {
      const h = this.hero;
      if (!this.mine || this.charging || !h || this.jumping) return false;
      const air = performance.now() < this.airUntil;
      if (air && (!this.mount().flap || this.flapped)) return false;
      return (h.stamina ?? 0) >= Math.round(A.JUMP.cost * (this.mount().jumpCost || 1) * (air ? 0.5 : 1));
    }

    // Jump the way you face (it uses up some of your walk); on a bat, JUMP again in mid-air to flap.
    jump() {
      if (!this.canJump()) return;
      const air = performance.now() < this.airUntil;
      this.flapped = air;
      this.jumping = true;
      if (!air) this.airUntil = performance.now() + 400; // until the server says how long
      this.send('arty:jump', { face: this.face }, (res) => {
        this.jumping = false;
        if (res && res.ok) this.airUntil = performance.now() + res.t;
        else if (!air) this.airUntil = 0;
        this.render();
      });
      this.render();
    }

    charge() {
      if (!this.mine || this.charging || performance.now() < this.airUntil) return;
      this.walk(0);
      this.aim(true);
      this.charging = { t0: performance.now(), sentAt: 0 };
      this.power = 0;
    }

    release() {
      if (!this.mine || !this.charging) return;
      const power = Math.round(this.power);
      this.charging = null;
      this.send('arty:fire', { angle: Math.round(this.angle), face: this.face, power, shot: this.shot }, (res) => {
        if (res && res.ok) return;
        // Not fired (still landing from a jump, say): your turn goes on.
        const s = this.state;
        this.mine = Boolean(s && s.phase === 'aim' && this.hero && s.active === this.hero.id && this.hero.alive);
        this.render();
      });
      this.mine = false;
      this.render();
    }

    pick(shot) {
      if (!this.mine) return;
      if (shot === 'special' && !this.specialReady()) return;
      this.shot = shot;
      this.render();
    }

    specialReady() {
      return Boolean(this.state && this.state.specials && this.hero && this.hero.special >= A.SPECIAL_MAX);
    }

    item(item) {
      if (!this.mine || !this.hero || !this.hero[item]) return;
      this.send('arty:item', { item }, (res) => {
        if (res && res.ok) Sfx.play(item === 'heal' ? 'award' : 'streak');
      });
    }

    update(dt) {
      if (!this.mine) return;
      if (this.tilting) {
        this.angle = clamp(this.angle + this.tilting * dt * 0.04, A.ANGLE_MIN, A.ANGLE_MAX);
        this.aim();
      }
      const h = this.view.heroes.get(this.hero && this.hero.id);
      if (h) Object.assign(h, { angle: Math.round(this.angle), face: this.face });
      if (this.charging) {
        this.power = Math.min(100, ((performance.now() - this.charging.t0) / A.CHARGE_MS) * 100);
        if (h) h.power = this.power;
        if (performance.now() - this.charging.sentAt > 100) {
          this.charging.sentAt = performance.now();
          this.send('arty:charge', { power: Math.round(this.power) });
        }
      }
      this.render();
    }

    render() {
      const E = this.el;
      const h = this.hero;
      this.root.classList.toggle('mine', this.mine);
      const air = performance.now() < this.airUntil;
      for (const b of [E.left, E.right, E.up, E.down, E.fire, E.shot, E.shot2, E.special, E.heal, E.double, E.jump]) b.disabled = !this.mine;
      E.fire.disabled = !this.mine || air;
      E.jump.disabled = !this.canJump();
      const jumpLabel = air && this.mount().flap && !this.flapped ? 'FLAP' : 'JUMP';
      if (E.jump.textContent !== jumpLabel) E.jump.textContent = jumpLabel;
      E.power.style.width = `${this.mine ? this.power : 0}%`;
      E.last.style.left = `${h ? h.lastPower || 0 : 0}%`;
      E.last.classList.toggle('hidden', !h || !h.lastPower);
      E.angle.textContent = `${Math.round(this.mine ? this.angle : h ? h.angle : 45)}°`;
      E.move.style.width = `${h ? Math.min(100, (100 * (h.stamina ?? A.STAMINA)) / (h.maxStamina || A.STAMINA)) : 0}%`;
      E.shot.classList.toggle('on', this.shot === 'one');
      E.shot2.classList.toggle('on', this.shot === 'two');
      E.special.classList.toggle('on', this.shot === 'special');
      const ready = this.specialReady();
      E.special.disabled = !this.mine || !ready;
      E.special.querySelector('small').textContent = !this.state || !this.state.specials ? 'OFF' : ready ? 'READY!' : `${h ? h.special : 0}%`;
      E.heal.disabled = !this.mine || !h || !h.heal;
      E.double.disabled = !this.mine || !h || !h.double || (this.state && this.state.double);
      E.double.classList.toggle('on', Boolean(this.mine && this.state && this.state.double));
      E.fire.classList.toggle('charging', Boolean(this.charging));
    }
  }

  window.ArtyView = ArtyView;
  window.ArtyPad = ArtyPad;
})();
