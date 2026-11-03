// Shared helpers: clock sync, DOM shortcuts and tiny 8-bit sound effects.
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'style') node.style.cssText = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of [].concat(children)) if (c != null) node.append(c);
    return node;
  }

  // Estimate server clock offset using the lowest-latency of a few pings.
  async function syncClock(socket) {
    let best = null;
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      const serverNow = await new Promise((res) => socket.emit('time', res));
      const t1 = Date.now();
      const rtt = t1 - t0;
      if (!best || rtt < best.rtt) best = { rtt, offset: serverNow + rtt / 2 - t1 };
    }
    return best.offset;
  }

  // A page left open while the server was updated reloads itself rather than run old code against it.
  // It rejoins from saved tokens. One try per new version, so a stale cache can't make it loop.
  function watchBuild(socket) {
    socket.on('build', (build) => {
      if (!window.WW_BUILD || build === window.WW_BUILD) return;
      let tried = null;
      try { tried = sessionStorage.getItem('ww_reload'); } catch (e) { /* private mode */ }
      if (tried === build) return;
      try { sessionStorage.setItem('ww_reload', build); } catch (e) { /* private mode */ }
      location.reload();
    });
  }

  function rankPlayers(players) {
    return [...players].sort((a, b) => b.score - a.score || b.kills - a.kills || a.name.localeCompare(b.name));
  }

  // Team battle sides, by the team index the server uses.
  const TEAMS = [
    { name: 'RED DRAGONS', short: 'RED', color: '#ff5a4d', dark: '#8a2118' },
    { name: 'BLUE GRIFFINS', short: 'BLUE', color: '#4da6ff', dark: '#1d4a8a' },
  ];

  const Sfx = {
    ctx: null,
    muted: false,
    last: {},
    unlock() {
      try {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) { /* audio is optional */ }
    },
    tone(freq, dur, { type = 'square', vol = 0.06, to = null, delay = 0 } = {}) {
      const ctx = this.ctx;
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    },
    noise(dur, { vol = 0.08, delay = 0, freq = 1200 } = {}) {
      const ctx = this.ctx;
      const t = ctx.currentTime + delay;
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      src.buffer = buf;
      filter.type = 'lowpass';
      filter.frequency.value = freq;
      gain.gain.value = vol;
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start(t);
    },
    play(name) {
      if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
      const now = performance.now();
      if (now - (this.last[name] || 0) < 45) return; // avoid stacking the same sound
      this.last[name] = now;
      switch (name) {
        case 'join': this.tone(660, 0.08); this.tone(990, 0.12, { delay: 0.08 }); break;
        case 'shoot': this.tone(900, 0.12, { to: 220, vol: 0.04 }); break;
        case 'hit': this.noise(0.18, { vol: 0.1 }); this.tone(160, 0.15, { to: 50, type: 'triangle', vol: 0.12 }); break;
        case 'escape': this.tone(220, 0.2, { to: 90, type: 'sawtooth', vol: 0.03 }); break;
        case 'miss': this.tone(140, 0.12, { type: 'sawtooth', vol: 0.05 }); break;
        case 'beep': this.tone(440, 0.12, { vol: 0.07 }); break;
        case 'go': this.tone(880, 0.3, { vol: 0.08 }); this.tone(1320, 0.3, { vol: 0.04, delay: 0.05 }); break;
        case 'round': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.14, { delay: i * 0.1 })); break;
        case 'win':
          [523, 523, 523, 698, 880, 784, 1046].forEach((f, i) =>
            this.tone(f, i === 6 ? 0.6 : 0.14, { delay: [0, 0.14, 0.28, 0.42, 0.7, 0.84, 0.98][i], vol: 0.07 }));
          break;
        case 'tick': this.tone(1760, 0.03, { vol: 0.05 }); break;
        case 'streak': [660, 880, 1320].forEach((f, i) => this.tone(f, 0.08, { delay: i * 0.06, vol: 0.05 })); break;
        case 'freeze': [1568, 1319, 1047, 880].forEach((f, i) => this.tone(f, 0.18, { delay: i * 0.07, type: 'triangle', vol: 0.06 })); break;
        case 'boom': this.noise(0.5, { vol: 0.22, freq: 700 }); this.tone(110, 0.4, { to: 35, type: 'triangle', vol: 0.18 }); break;
        case 'roar':
          this.tone(180, 0.7, { to: 60, type: 'sawtooth', vol: 0.06 });
          this.noise(0.6, { vol: 0.08, freq: 500 });
          break;
        case 'bosshit': this.noise(0.12, { vol: 0.12, freq: 900 }); this.tone(90, 0.12, { to: 50, type: 'triangle', vol: 0.12 }); break;
        case 'reveal': this.tone(523, 0.1, { vol: 0.07 }); this.tone(784, 0.16, { delay: 0.08, vol: 0.06 }); break;
        case 'award': [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.12, { delay: i * 0.08, type: 'triangle', vol: 0.06 })); break;
        case 'emote': this.tone(1046, 0.06, { type: 'triangle', vol: 0.04 }); break;
        // Class skills, one sound each.
        case 'skill:knight': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.16, { delay: i * 0.07, vol: 0.07 })); break;
        case 'skill:barbarian': this.tone(130, 0.5, { to: 70, type: 'sawtooth', vol: 0.09 }); this.noise(0.4, { vol: 0.08, freq: 600 }); break;
        case 'skill:cleric': [1046, 1318, 1568].forEach((f) => this.tone(f, 0.8, { type: 'triangle', vol: 0.05 })); break;
        case 'skill:druid': this.tone(300, 0.6, { to: 900, type: 'triangle', vol: 0.07 }); this.tone(450, 0.6, { to: 1200, type: 'triangle', vol: 0.04, delay: 0.1 }); break;
        case 'skill:wizard':
          this.tone(1200, 0.6, { to: 150, type: 'sawtooth', vol: 0.05 });
          this.noise(0.5, { vol: 0.18, freq: 700, delay: 0.65 });
          break;
        case 'skill:archer': for (let i = 0; i < 6; i++) this.tone(1400 - i * 60, 0.05, { delay: 0.3 + i * 0.06, vol: 0.05 }); break;
        case 'skill:rogue': [0.35, 0.58, 0.81].forEach((d) => this.noise(0.08, { vol: 0.12, freq: 4000, delay: d })); break;
        case 'skill:ninja': for (let i = 0; i < 8; i++) this.tone(900 + (i % 2) * 300, 0.04, { delay: i * 0.05, vol: 0.04 }); break;
        case 'skill:pirate': [0.14, 0.32, 0.5, 0.68].forEach((d) => { this.noise(0.25, { vol: 0.16, freq: 500, delay: d }); this.tone(90, 0.2, { to: 40, type: 'triangle', vol: 0.1, delay: d }); }); break;
        case 'skill:valkyrie': this.noise(0.15, { vol: 0.2, freq: 6000, delay: 0.36 }); this.noise(0.9, { vol: 0.12, freq: 300, delay: 0.4 }); break;
        case 'skill:necromancer': [220, 208, 196, 185].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.08, delay: i * 0.18 })); break;
        case 'skill:bard': [523, 659, 784, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.12, { type: 'triangle', delay: i * 0.08, vol: 0.06 })); break;
        case 'drumroll':
          // Faster and faster snare hits for about two seconds, then a crash.
          for (let i = 0, t = 0; t < 1.9; i++, t += Math.max(0.035, 0.12 - i * 0.004)) this.noise(0.06, { vol: 0.05 + t * 0.03, delay: t, freq: 2500 });
          this.noise(0.6, { vol: 0.14, delay: 1.95, freq: 5000 });
          break;
        default: break;
      }
    },
  };

  // Chiptune background music, made on the fly: each track loops a chord progression with a bass line,
  // an arpeggio on top and drums. `fast` (the last seconds of a round) speeds it up.
  const TONES = { maj: [0, 4, 7, 12], min: [0, 3, 7, 12] };
  const TRACKS = {
    lobby: {
      bpm: 92, vol: 0.5, lead: 'triangle', chords: [[60, 'maj'], [57, 'min'], [53, 'maj'], [55, 'maj']],
      arp: [[0, -1, 2, -1, 1, -1, 2, -1, 3, -1, 2, -1, 1, -1, 2, -1]], bass: [0, -1, -1, -1, -1, -1, -1, -1, 1, -1, -1, -1, -1, -1, -1, -1],
      kick: [], snare: [], hat: [4, 12],
    },
    easy: {
      bpm: 124, vol: 0.55, lead: 'square', chords: [[60, 'maj'], [55, 'maj'], [57, 'min'], [53, 'maj']],
      arp: [[0, 1, 2, 1, 3, 2, 1, 2, 0, 1, 2, 1, 3, 2, 3, -1], [2, -1, 2, 1, 0, -1, 1, 2, 3, -1, 3, 2, 1, -1, 0, -1]],
      bass: [0, -1, 0, -1, 1, -1, 0, -1, 0, -1, 0, -1, 1, -1, 2, -1], kick: [0, 8], snare: [4, 12], hat: [2, 6, 10, 14],
    },
    medium: {
      bpm: 132, vol: 0.55, lead: 'square', chords: [[57, 'min'], [53, 'maj'], [60, 'maj'], [52, 'maj']],
      arp: [[0, 2, 1, 2, 0, 2, 1, 2, 3, 2, 1, 2, 3, 2, 1, 2], [3, -1, 2, -1, 1, -1, 0, -1, 1, 2, 3, 2, 1, 0, 1, -1]],
      bass: [0, -1, -1, 0, -1, -1, 1, -1, 0, -1, -1, 0, -1, -1, 1, -1], kick: [0, 6, 8], snare: [4, 12], hat: [2, 6, 10, 14, 15],
    },
    hard: {
      bpm: 148, vol: 0.55, lead: 'sawtooth', chords: [[62, 'min'], [58, 'maj'], [60, 'maj'], [57, 'maj']],
      arp: [[0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 3, 2, 1, 0]],
      bass: [0, 0, -1, 0, 0, -1, 1, -1, 0, 0, -1, 0, 1, -1, 2, -1], kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14],
    },
    boss: {
      bpm: 162, vol: 0.6, lead: 'sawtooth', chords: [[64, 'min'], [60, 'maj'], [62, 'maj'], [59, 'maj']],
      arp: [[0, 0, 2, 0, 3, 0, 2, 1, 0, 0, 2, 0, 3, 2, 1, 2], [3, 2, 3, 1, 3, 0, 3, 1, 2, 1, 2, 0, 1, 0, 1, -1]],
      bass: [0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 2, 2, 1, 1], kick: [0, 3, 6, 8, 11, 14], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14],
    },
  };
  const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

  const Music = {
    on: true,
    want: null, // the track that should be playing
    track: null, // the track that is playing
    step: 0,
    nextAt: 0,
    fast: false,
    gain: null,
    play(name) {
      this.want = TRACKS[name] ? name : null;
    },
    stop() {
      this.want = null;
    },
    setFast(on) {
      this.fast = on;
    },
    voice(type, f, t, dur, vol) {
      const ctx = Sfx.ctx;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(this.gain);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    },
    drum(kind, t) {
      const ctx = Sfx.ctx;
      if (kind === 'kick') {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
        osc.connect(g).connect(this.gain);
        osc.start(t);
        osc.stop(t + 0.16);
        return;
      }
      const dur = kind === 'snare' ? 0.11 : 0.03;
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const g = ctx.createGain();
      src.buffer = buf;
      filter.type = 'highpass';
      filter.frequency.value = kind === 'snare' ? 1200 : 6000;
      g.gain.value = kind === 'snare' ? 0.3 : 0.14;
      src.connect(filter).connect(g).connect(this.gain);
      src.start(t);
    },
    // One sixteenth note of the current track.
    schedule(tr, step, t, len) {
      const bar = Math.floor(step / 16) % tr.chords.length;
      const s = step % 16;
      const [root, kind] = tr.chords[bar];
      const tones = TONES[kind];
      const arp = tr.arp[Math.floor(step / 16) % tr.arp.length][s];
      if (arp >= 0) this.voice(tr.lead, freq(root + 12 + tones[arp]), t, len * 0.9, 0.05 * tr.vol);
      const b = tr.bass[s];
      if (b >= 0) this.voice('triangle', freq(root - 12 + [0, 7, 12][b]), t, len * 1.6, 0.16 * tr.vol);
      if (tr.kick.includes(s)) this.drum('kick', t);
      if (tr.snare.includes(s)) this.drum('snare', t);
      if (tr.hat.includes(s)) this.drum('hat', t);
    },
    pump() {
      const ctx = Sfx.ctx;
      if (!ctx || ctx.state !== 'running') return;
      if (!this.gain) {
        this.gain = ctx.createGain();
        this.gain.connect(ctx.destination);
      }
      this.gain.gain.value = this.on && !Sfx.muted ? 0.5 : 0;
      if (this.want !== this.track) {
        this.track = this.want;
        this.step = 0;
        this.nextAt = ctx.currentTime + 0.05;
      }
      const tr = TRACKS[this.track];
      if (!tr) return;
      const len = (60 / tr.bpm / 4) * (this.fast ? 0.85 : 1);
      while (this.nextAt < ctx.currentTime + 0.15) {
        this.schedule(tr, this.step, this.nextAt, len);
        this.nextAt += len;
        this.step += 1;
      }
    },
  };
  setInterval(() => Music.pump(), 50);

  // Emotes players can send from their phones.
  const EMOTES = ['👍', '😂', '😮', '🔥', '👏', '😭'];

  window.WW = { $, el, syncClock, watchBuild, rankPlayers, TEAMS, Sfx, Music, EMOTES };
})();
