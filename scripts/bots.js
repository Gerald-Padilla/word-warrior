// Fill a room with bot heroes for testing.
// Usage: npm run bots -- ROOMCODE [count] [serverUrl]
const { io } = require('socket.io-client');

const code = String(process.argv[2] || '').toUpperCase();
const count = Number(process.argv[3]) || 4;
const url = process.argv[4] || 'http://localhost:3000';
if (!code) {
  console.log('Usage: npm run bots -- ROOMCODE [count] [serverUrl]');
  process.exit(1);
}

const NAMES = ['Aria', 'Borin', 'Cyra', 'Dax', 'Elora', 'Fenn', 'Gwyn', 'Hale', 'Iris', 'Jarek', 'Kael', 'Lyra'];
const CLASSES = ['knight', 'wizard', 'archer', 'rogue', 'cleric', 'barbarian'];

for (let i = 0; i < count; i++) {
  const socket = io(url, { transports: ['websocket'] });
  const cps = 2.5 + Math.random() * 3; // typing speed, characters per second
  const alive = new Set();
  const name = NAMES[i % NAMES.length] + (i >= NAMES.length ? i : '');
  let me = null;
  let team = 0;
  const trackTeam = (players) => {
    const p = players && players.find((pl) => pl.id === me);
    if (p) team = p.team;
  };
  // Claims carry the gaps between keystrokes, uneven like a person's, adding up to the time spent typing.
  const claim = (w) => {
    const weights = Array.from({ length: w.text.length - 1 }, () => 0.25 + Math.random() * 1.5);
    const mean = weights.reduce((a, b) => a + b, 0) / weights.length;
    const keys = weights.map((x) => Math.round(((x / mean) * 1000) / cps));
    socket.emit('player:claim', { id: w.id, text: w.text, keys }, (res) => {
      if (res && res.reason === 'auto') console.log(`${name} was blocked as an auto-typer (${res.why})`);
    });
  };

  socket.on('connect', () => {
    const hero = { code, name, cls: CLASSES[i % CLASSES.length], color: i % 8, skin: i % 4, bot: true }; // bots stay out of the hall of fame
    socket.emit('player:join', hero, (res) => {
      console.log(res.ok ? `${name} joined (${cps.toFixed(1)} cps)` : `${name} failed: ${res.error}`);
      if (res.ok) {
        me = res.you;
        trackTeam(res.snapshot.players);
      }
    });
  });
  socket.on('room:players', trackTeam);
  socket.on('room:state', (s) => {
    trackTeam(s.players);
    // Now and then a bot sends an emote between rounds.
    if (['intermission', 'finished'].includes(s.state) && Math.random() < 0.4) {
      setTimeout(() => socket.emit('player:emote', { e: Math.floor(Math.random() * 6) }), 500 + Math.random() * 4000);
    }
  });

  const duel = new Map(); // team battle words: attack slots, attacks in the air, power-ups
  let busyUntil = 0;

  socket.on('word:spawn', (w) => {
    if (w.kind) {
      duel.set(w.id, w);
      return;
    }
    alive.add(w.id);
    // Wait until the word is visible, "read" it, then type it.
    const delay = Math.max(0, w.spawn - Date.now()) + 500 + Math.random() * 1500 + (w.text.length / cps) * 1000;
    setTimeout(() => {
      if (alive.has(w.id) && Math.random() < 0.85) claim(w);
    }, delay);
  });
  socket.on('duel:launch', ({ slot, missile }) => {
    duel.delete(slot);
    duel.set(missile.id, missile);
  });
  socket.on('duel:retime', (list) => list.forEach((r) => duel.has(r.id) && Object.assign(duel.get(r.id), r)));
  for (const ev of ['word:kill', 'word:escape', 'duel:block', 'duel:hit', 'duel:power']) {
    socket.on(ev, ({ id }) => {
      alive.delete(id);
      duel.delete(id);
    });
  }
  socket.on('word:clear', () => {
    alive.clear();
    duel.clear();
  });

  // Team battle: when free, block the most urgent incoming attack, go for a power-up, or launch an attack.
  setInterval(() => {
    const now = Date.now();
    if (!duel.size || now < busyUntil) return;
    const typeMs = (w) => 400 + Math.random() * 900 + (w.text.length / cps) * 1000;
    const words = [...duel.values()];
    const power = words.find((w) => w.kind === 'power');
    const incoming = words
      .filter((w) => w.kind === 'missile' && w.team !== team && w.launch + w.dur - now > 1500)
      .sort((a, b) => a.launch + a.dur - (b.launch + b.dur));
    const slots = words.filter((w) => w.kind === 'attack' && w.team === team);
    const r = Math.random();
    let target = slots[Math.floor(Math.random() * slots.length)];
    if (power && r < 0.3) target = power;
    else if (incoming.length && r < 0.7) target = incoming[0];
    if (!target) return;
    const ms = typeMs(target);
    busyUntil = now + ms;
    setTimeout(() => {
      if (duel.has(target.id) && Math.random() < 0.9) claim(target);
    }, ms);
  }, 150);
}
