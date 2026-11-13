// Fill a room with bot heroes for testing.
// Usage: npm run bots -- ROOMCODE [count] [serverUrl]
const { io } = require('socket.io-client');
const DRAW_WORDS = require('../draw-words');
const DRAW_CHARACTERS = require('../draw-characters');

// Draw battle: bots can't see the drawing, so they guess words (or characters, by the name before any
// "|") from the lists that fit the blanks and any letters filled in so far. Their own drawings are scribbles.
const ALL_DRAW_WORDS = [DRAW_WORDS, DRAW_CHARACTERS].flatMap((set) => [...set.easy, ...set.medium, ...set.hard]).map((w) => w.split('|')[0]);
const fits = (word, hint) => word.length === hint.length && [...hint].every((ch, i) => (ch === '_' ? /[a-z]/.test(word[i]) : ch === word[i]));

const code = String(process.argv[2] || '').toUpperCase();
const count = Number(process.argv[3]) || 4;
const url = process.argv[4] || 'http://localhost:3000';
if (!code) {
  console.log('Usage: npm run bots -- ROOMCODE [count] [serverUrl]');
  process.exit(1);
}

const NAMES = ['Aria', 'Borin', 'Cyra', 'Dax', 'Elora', 'Fenn', 'Gwyn', 'Hale', 'Iris', 'Jarek', 'Kael', 'Lyra'];
const LINES = ['hi everyone!', 'ready to type!', 'gl hf', 'who picked the wizard?', "let's go!", 'my fingers are warmed up', 'good luck all', 'first to 10k wins'];
const CLASSES = ['knight', 'wizard', 'archer', 'rogue', 'cleric', 'barbarian', 'ninja', 'necromancer', 'druid', 'pirate', 'bard', 'valkyrie'];

for (let i = 0; i < count; i++) {
  const socket = io(url, { transports: ['websocket'] });
  const cps = 2.5 + Math.random() * 3; // typing speed, characters per second
  const alive = new Map(); // falling words on screen
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
        // Say hello in the lobby chat now and then.
        if (res.snapshot.state === 'lobby' && Math.random() < 0.6) {
          setTimeout(() => socket.emit('chat:send', { text: LINES[Math.floor(Math.random() * LINES.length)] }, () => {}), 800 + Math.random() * 5000);
        }
      }
    });
  });
  socket.on('room:players', trackTeam);
  // Use the class skill a moment after it's charged.
  socket.on('skill:charge', ({ on, charge, max }) => {
    if (on && charge >= max) setTimeout(() => socket.emit('player:skill', {}, () => {}), 500 + Math.random() * 2500);
  });
  // Draw battle: pick a word and scribble on your turn; otherwise guess now and then from the words that fit.
  let drawState = null;
  let tried = new Set();
  let scribble = null;
  let guessAt = 0;
  socket.on('draw:secret', (sec) => {
    if (sec && sec.choices) setTimeout(() => socket.emit('draw:pick', { i: Math.floor(Math.random() * 3) }), 1000 + Math.random() * 3000);
  });
  socket.on('draw:hint', ({ hint }) => { if (drawState) drawState.hint = hint; });
  socket.on('draw:guessed', (g) => { if (drawState) drawState.guessed = drawState.guessed.concat(g); });
  socket.on('room:state', (s) => {
    const D = s.mode === 'draw' && s.state === 'playing' ? s.draw : null;
    if (D && (!drawState || drawState.turn !== D.turn)) tried = new Set();
    drawState = D;
    clearInterval(scribble);
    scribble = null;
    if (D && D.phase === 'draw' && D.drawer === me) {
      let id = Math.floor(Math.random() * 1e6) * 10;
      let at = [500, 375];
      scribble = setInterval(() => {
        if (Math.random() < 0.3) at = [100 + Math.random() * 800, 80 + Math.random() * 590];
        id += 1;
        const p = [];
        for (let k = 0; k < 6; k++) {
          at = [Math.min(1000, Math.max(0, at[0] + (Math.random() - 0.5) * 120)), Math.min(750, Math.max(0, at[1] + (Math.random() - 0.5) * 120))];
          p.push(Math.round(at[0]), Math.round(at[1]));
        }
        socket.emit('draw:line', { s: id, c: Math.floor(Math.random() * 12), w: Math.floor(Math.random() * 3), p });
      }, 400);
    }
  });
  setInterval(() => {
    const D = drawState;
    if (!D || D.phase !== 'draw' || D.drawer === me || D.guessed.some((g) => g.id === me) || Date.now() < guessAt) return;
    guessAt = Date.now() + 3000 + Math.random() * 6000 - cps * 400;
    const fitting = ALL_DRAW_WORDS.filter((w) => fits(w, D.hint) && !tried.has(w));
    const text = fitting.length ? fitting[Math.floor(Math.random() * fitting.length)] : NAMES[Math.floor(Math.random() * NAMES.length)].toLowerCase();
    tried.add(text);
    socket.emit('draw:guess', { text }, (res) => {
      if (res && res.correct) console.log(`${name} guessed "${res.word}" (+${res.points})`);
    });
  }, 500);

  socket.on('room:state', (s) => {
    trackTeam(s.players);
    // Now and then a bot sends an emote between rounds.
    if (['intermission', 'finished'].includes(s.state) && Math.random() < 0.4) {
      setTimeout(() => socket.emit('player:emote', { e: Math.floor(Math.random() * 6) }), 500 + Math.random() * 4000);
    }
  });

  const duel = new Map(); // team battle words: attack slots, attacks in the air, power-ups
  let busyUntil = 0;

  // Falling words: one at a time, like a person (see the loop at the bottom). A slow bot falls behind
  // when words come faster than it types; in a battle royale, that hurts.
  socket.on('word:spawn', (w) => {
    if (w.kind) {
      duel.set(w.id, w);
      return;
    }
    alive.set(w.id, w);
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
  socket.on('royale:out', ({ id, place }) => {
    if (id === me) console.log(`${name} was knocked out (#${place})`);
  });

  // Falling words: when free, "read" a word on screen (usually the one closest to the ground) and type it.
  // If someone else gets it first, that time was wasted, as it would be for a person.
  setInterval(() => {
    const now = Date.now();
    if (!alive.size || now < busyUntil) return;
    const shown = [...alive.values()].filter((w) => now >= w.spawn).sort((a, b) => (now - b.spawn) / b.dur - (now - a.spawn) / a.dur);
    if (!shown.length) return;
    const target = Math.random() < 0.7 ? shown[0] : shown[Math.floor(Math.random() * shown.length)];
    const ms = 400 + Math.random() * 900 + (target.text.length / cps) * 1000;
    busyUntil = now + ms;
    setTimeout(() => {
      if (alive.has(target.id) && Math.random() < 0.9) claim(target);
    }, ms);
  }, 150);

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
