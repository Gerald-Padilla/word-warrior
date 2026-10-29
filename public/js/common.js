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

  function rankPlayers(players) {
    return [...players].sort((a, b) => b.score - a.score || b.kills - a.kills || a.name.localeCompare(b.name));
  }

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
        default: break;
      }
    },
  };

  window.WW = { $, el, syncClock, rankPlayers, Sfx };
})();
