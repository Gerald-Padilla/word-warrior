// Artillery on screen: the battlefield side-on (ground, heroes, the aim of whoever's turn it is), shots
// playing out as the server worked them out, and the phone's controls. The big screen shows the whole
// field; a phone follows the action, with a minimap, and can be dragged to look around.
(function () {
  const A = window.Arty;
  const { heroSprite, petSprite, COLORS } = window.Art;
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
  const BLAST = { slash: '#fff6b0', axe: '#d5dbe6', fireball: '#ff7b1c', meteor: '#ff5a1f', arrow: '#ffd23f', dagger: '#d5dbe6', beam: '#fff6b0',
    shuriken: '#d5dbe6', soul: '#7dff6b', thorn: '#4fa865', cannon: '#ffd23f', notes: '#ff9ad0', spear: '#7fd4ff' };

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
        this.replay = null;
        this.held = null;
        this.heroes.clear();
      }
      const prev = this.state;
      this.state = s;
      if (this.replay) {
        this.held = s;
        return;
      }
      this.takeHeroes(s);
      if (s.phase === 'aim' && (!prev || prev.turn !== s.turn)) this.newTurn(s);
    }

    takeHeroes(s) {
      const seen = new Set();
      for (const [id, team, x, y, hp, alive, face, angle, special, heal, double, stamina, lastPower] of s.heroes) {
        seen.add(id);
        const h = this.heroes.get(id) || { shownY: y };
        Object.assign(h, { id, team, x, y, hp, alive: Boolean(alive), face, angle, special, heal, double, stamina, lastPower, power: 0 });
        if (Math.abs(h.shownY - y) > 300) h.shownY = y;
        this.heroes.set(id, h);
      }
      for (const id of [...this.heroes.keys()]) if (!seen.has(id)) this.heroes.delete(id);
    }

    newTurn(s) {
      const h = this.heroes.get(s.active);
      if (!h) return;
      const look = this.looks.get(s.active) || {};
      const mine = this.phone && s.active === this.selfId;
      this.callout(mine ? 'YOUR TURN!' : `${(look.name || 'HERO').toUpperCase()}'S TURN`, TEAMS[h.team].color);
      this.pan = null;
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
            data[o + 3] = 0;
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
      }
      if (this.onEvent) this.onEvent(e);
    }

    // A hero walked off the edge (not during a shot).
    fell(id) {
      const h = this.heroes.get(id);
      if (!h) return;
      h.alive = false;
      h.y = MAP.H + 80;
      const look = this.looks.get(id) || {};
      this.callout(`${(look.name || 'HERO').toUpperCase()} FELL!`, '#ff5a4d', 'Walked off the edge');
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
        const k = 1 - Math.exp(-dt / 160);
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
      const focus = shells.length ? { x: shells[0].x, y: shells[0].y } : act ? { x: act.x, y: act.y - 120 } : { x: MAP.W / 2, y: MAP.H / 2 };
      this.camera(focus, dt);
      this.drawSky(pt);
      if (pt < this.shake.until) {
        const p = this.shake.pow * this.dpr;
        ctx.translate(Math.round(rand(-p, p)), Math.round(rand(-p, p)));
      } else this.shake.pow = 0;
      if (this.ground) ctx.drawImage(this.ground, Math.round(this.X(0)), Math.round(this.Y(0)), Math.round(MAP.W * this.s), Math.round(MAP.H * this.s));
      this.drawAbyss(pt);
      this.drawBolts(pt);
      for (const h of this.heroes.values()) this.drawHero(h, pt, dt, s);
      for (const sh of shells) this.drawShell(sh, pt);
      this.drawRings(pt);
      this.drawParticles(pt, dt);
      this.drawTexts(pt);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.drawWind();
      this.drawCallouts(pt);
      if (this.follow) this.drawMinimap(shells);
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
      if (!look) return;
      const ctx = this.ctx;
      // Falling heroes drop smoothly to where they land.
      h.shownY = h.shownY === undefined ? h.y : h.shownY < h.y ? Math.min(h.y, h.shownY + dt * 0.9) : h.y;
      if (!h.alive && h.shownY > MAP.H + 40) return;
      const X = this.X(h.x);
      const Y = this.Y(h.shownY);
      const u = PX * this.s;
      const team = TEAMS[h.team];
      const up = s && s.active === h.id && s.phase === 'aim';
      if (!h.alive) {
        // A gravestone where they fell.
        ctx.fillStyle = '#1b1426';
        ctx.fillRect(Math.round(X - 6 * u), Math.round(Y - 14 * u), Math.round(12 * u), Math.round(14 * u));
        ctx.fillStyle = '#8a8aa0';
        ctx.fillRect(Math.round(X - 5 * u), Math.round(Y - 13 * u), Math.round(10 * u), Math.round(13 * u));
        ctx.fillStyle = '#4a4a60';
        ctx.fillRect(Math.round(X - u), Math.round(Y - 11 * u), Math.round(2 * u), Math.round(7 * u));
        ctx.fillRect(Math.round(X - 3 * u), Math.round(Y - 9 * u), Math.round(6 * u), Math.round(2 * u));
        return;
      }
      // Pet, a step behind.
      const pspr = petSprite(look.pet);
      if (pspr) {
        let pet = this.pets.get(h.id);
        const want = h.x - h.face * 26;
        if (!pet || Math.abs(pet.x - want) > 200) pet = { x: want };
        pet.x = lerp(pet.x, want, 0.1);
        this.pets.set(h.id, pet);
        const py = this.terrain ? this.terrain.groundBelow(pet.x, h.y - 30) ?? h.y : h.y;
        ctx.drawImage(pspr, Math.round(this.X(pet.x) - (pspr.width * u * 0.8) / 2), Math.round(this.Y(Math.min(py, h.shownY + 20)) - pspr.height * u * 0.8),
          Math.round(pspr.width * u * 0.8), Math.round(pspr.height * u * 0.8));
      }
      // Team mark under the feet.
      ctx.fillStyle = team.color;
      ctx.fillRect(Math.round(X - 9 * u), Math.round(Y - u * 0.5), Math.round(18 * u), Math.max(2, Math.round(u)));
      const spr = heroSprite(look);
      const w = spr.width * u;
      const hh = spr.height * u;
      const hurt = pt - (h.hurtAt || 0) < 120;
      if (hurt) ctx.globalAlpha = 0.5;
      ctx.save();
      ctx.translate(Math.round(X), 0);
      if (h.face < 0) ctx.scale(-1, 1);
      ctx.drawImage(spr, Math.round(-w / 2), Math.round(Y - hh), Math.round(w), Math.round(hh));
      ctx.restore();
      ctx.globalAlpha = 1;
      // HP bar and name.
      const bw = 40 * this.s;
      const by = Y - hh - 10 * this.s;
      const frac = clamp(h.hp / A.HP, 0, 1);
      ctx.fillStyle = '#1b1426';
      ctx.fillRect(Math.round(X - bw / 2 - 1), Math.round(by - 1), Math.round(bw + 2), Math.max(3, Math.round(5 * this.s)) + 2);
      ctx.fillStyle = frac > 0.5 ? '#5bd46a' : frac > 0.25 ? '#ffd23f' : '#ff5a4d';
      ctx.fillRect(Math.round(X - bw / 2), Math.round(by), Math.round(bw * frac), Math.max(3, Math.round(5 * this.s)));
      const fs = this.phone ? 7 : clamp((10 * this.s) / this.dpr, 7, 12);
      this.text(look.name, X, by - 5 * this.dpr, fs, h.id === this.selfId && this.phone ? '#ffffff' : team.color);
      if (up) this.drawAim(h, X, Y, pt);
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

    // The wind: an arrow along the top, longer the stronger it blows.
    drawWind() {
      const s = this.state;
      if (!s) return;
      const d = this.dpr;
      // Phone: top left, out of the minimap's way. Big screen: over the middle of the field.
      const half = this.follow ? 62 : 110;
      const cx = this.follow ? (8 + half) * d : this.ox + (MAP.W * this.s) / 2;
      const y = ((this.phone ? 0 : this.reserveTop) + (this.follow ? 18 : 22)) * d;
      const max = 16;
      const w = Math.round((Math.abs(s.wind) / max) * (half - 20) * d);
      const ctx = this.ctx;
      ctx.fillStyle = 'rgba(27,20,38,0.75)';
      ctx.fillRect(cx - half * d, y - 12 * d, half * 2 * d, 24 * d);
      if (s.wind) {
        const dir = Math.sign(s.wind);
        ctx.fillStyle = '#7fd4ff';
        ctx.fillRect(dir > 0 ? cx : cx - w, y - 3 * d, w, 6 * d);
        for (let i = 0; i < 4; i++) this.block(cx + dir * (w - i * 2 * d), y, (8 - i * 2) * d, '#7fd4ff');
      }
      this.text(`WIND ${Math.abs(s.wind)}`, cx, y + 26 * d, this.follow ? 7 : 10, '#ffffff');
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
      for (const sh of shells) {
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(x + sh.x * k - 1.5 * d, y + sh.y * k - 1.5 * d, 3 * d, 3 * d);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---- the phone's controls -----------------------------------------------------------
  // On your turn: ◀ ▶ walk (held), ▲ ▼ angle (held), FIRE: hold to charge, let go to shoot. Pick your shot or
  // your special, and use HEAL or DOUBLE. On a keyboard: arrows walk and aim, Space charges and fires,
  // 1 and 2 pick the shot, H heals, D doubles.
  class ArtyPad {
    constructor(root, { send, view }) {
      this.root = root;
      this.send = send; // (event, data, cb)
      this.view = view;
      this.mine = false; // it's your turn
      this.hero = null;
      this.angle = 45;
      this.face = 1;
      this.special = false;
      this.power = 0;
      this.charging = null;
      this.walking = 0;
      this.tilting = 0;
      this.sentAim = '';
      const q = (sel) => root.querySelector(sel);
      this.el = {
        left: q('[data-a="left"]'), right: q('[data-a="right"]'), up: q('[data-a="up"]'), down: q('[data-a="down"]'), fire: q('[data-a="fire"]'),
        shot: q('[data-a="shot"]'), special: q('[data-a="special"]'), heal: q('[data-a="heal"]'), double: q('[data-a="double"]'),
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
      this.el.shot.onclick = () => this.pick(false);
      this.el.special.onclick = () => this.pick(true);
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
        else if (k === '1') this.pick(false);
        else if (k === '2') this.pick(true);
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
        this.special = false;
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

    charge() {
      if (!this.mine || this.charging) return;
      this.walk(0);
      this.aim(true);
      this.charging = { t0: performance.now(), sentAt: 0 };
      this.power = 0;
    }

    release() {
      if (!this.mine || !this.charging) return;
      const power = Math.round(this.power);
      this.charging = null;
      this.send('arty:fire', { angle: Math.round(this.angle), face: this.face, power, special: this.special });
      this.mine = false;
      this.render();
    }

    pick(special) {
      if (!this.mine) return;
      if (special && !this.specialReady()) return;
      this.special = special;
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
      for (const b of [E.left, E.right, E.up, E.down, E.fire, E.shot, E.special, E.heal, E.double]) b.disabled = !this.mine;
      E.power.style.width = `${this.mine ? this.power : 0}%`;
      E.last.style.left = `${h ? h.lastPower || 0 : 0}%`;
      E.last.classList.toggle('hidden', !h || !h.lastPower);
      E.angle.textContent = `${Math.round(this.mine ? this.angle : h ? h.angle : 45)}°`;
      E.move.style.width = `${h ? (100 * (h.stamina ?? A.STAMINA)) / A.STAMINA : 0}%`;
      E.shot.classList.toggle('on', !this.special);
      E.special.classList.toggle('on', this.special);
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
