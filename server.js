// Word Warriors - multiplayer pixel fantasy typing battle.
// One host screen shows the QR code + battlefield, players join from their phones.
const express = require('express');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const WORDS = require('./words');

const PORT = Number(process.env.PORT) || 3000;
// Render sets RENDER and RENDER_EXTERNAL_URL; there the only address phones can reach is the public one.
const ON_RENDER = Boolean(process.env.RENDER);
const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');

// ---- Game tuning -----------------------------------------------------------
const ROUNDS = [
  { key: 'easy', name: 'EASY', title: 'Slime Swarm', monster: 'slime', duration: 45000,
    spawnEvery: [1500, 2200], fall: [9500, 11500], maxActive: 5, multiplier: 1 },
  { key: 'medium', name: 'MEDIUM', title: 'Bat Storm', monster: 'bat', duration: 50000,
    spawnEvery: [1350, 1900], fall: [9000, 10500], maxActive: 6, multiplier: 2 },
  { key: 'hard', name: 'HARD', title: 'Skull Inferno', monster: 'skull', duration: 55000,
    spawnEvery: [1250, 1750], fall: [8500, 10000], maxActive: 7, multiplier: 3 },
];
const COUNTDOWN_MS = 4000;
const INTERMISSION_MS = 9000;
const SOLO_INTERMISSION_MS = 5000;
const SPAWN_LEAD_MS = 150; // words start slightly in the future so every client sees them enter
const STOP_SPAWN_BEFORE_END_MS = 3000;
const MAX_PLAYERS = 60;
const CLASSES = ['knight', 'wizard', 'archer', 'rogue', 'cleric', 'barbarian'];
const COLOR_COUNT = 8;
const SKIN_COUNT = 4;

const ROUNDS_PUBLIC = ROUNDS.map(({ key, name, title, monster, duration, multiplier }) =>
  ({ key, name, title, monster, duration, multiplier }));

// ---- Hall of fame ----------------------------------------------------------
// Best scores survive restarts. Solo and battle are ranked separately because in a
// battle the words are split between everyone on the field.
const HALL_FILE = path.join(__dirname, 'data', 'highscores.json');
const HALL_SIZE = 100; // entries kept per board
const hall = loadHall();

function loadHall() {
  try {
    const data = JSON.parse(fs.readFileSync(HALL_FILE, 'utf8'));
    return { solo: [].concat(data.solo || []), battle: [].concat(data.battle || []) };
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`Could not read ${HALL_FILE}: ${err.message}`);
    return { solo: [], battle: [] };
  }
}

function saveHall() {
  try {
    fs.mkdirSync(path.dirname(HALL_FILE), { recursive: true });
    fs.writeFileSync(HALL_FILE, JSON.stringify(hall, null, 2));
  } catch (err) {
    console.warn(`Could not save high scores: ${err.message}`);
  }
}

// Returns the entry's 1-based rank, or null if it didn't make the board. Ties go to whoever got there first.
function addToHall(board, entry) {
  const list = hall[board];
  let i = list.findIndex((e) => entry.score > e.score || (entry.score === e.score && entry.kills > e.kills));
  if (i < 0) i = list.length;
  if (i >= HALL_SIZE) return null;
  list.splice(i, 0, entry);
  if (list.length > HALL_SIZE) list.length = HALL_SIZE;
  return i + 1;
}

// ---- HTTP ------------------------------------------------------------------
const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 20000 });

const fontDir = path.dirname(require.resolve('@fontsource/press-start-2p/package.json'));
app.use('/vendor/press-start-2p', express.static(fontDir));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'host.html')));
app.get('/play', (req, res) => res.sendFile(path.join(__dirname, 'public', 'play.html')));

app.get('/api/network', (req, res) => {
  res.json({ port: PORT, publicUrl: PUBLIC_URL, addresses: ON_RENDER ? [] : lanAddresses() });
});

app.get('/api/highscores', (req, res) => {
  res.set('Cache-Control', 'no-store').json({ solo: hall.solo.slice(0, 10), battle: hall.battle.slice(0, 10) });
});

app.get('/api/qr', async (req, res) => {
  const text = String(req.query.text || '');
  if (!text || text.length > 300) return res.status(400).send('bad text');
  try {
    const svg = await QRCode.toString(text, {
      type: 'svg', margin: 1, errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    });
    res.type('image/svg+xml').set('Cache-Control', 'no-store').send(svg);
  } catch (err) {
    res.status(500).send('qr failed');
  }
});

// Best guess at the address phones on the same Wi-Fi can reach; virtual adapters sink to the bottom.
function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      if (a.internal || a.address.startsWith('169.254.')) continue;
      let score = 0;
      if (a.address.startsWith('192.168.')) score += 3;
      else if (a.address.startsWith('10.')) score += 2;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(a.address)) score += 1;
      if (/wi-?fi|wlan|wireless|ethernet|en\d/i.test(name)) score += 2;
      if (/vethernet|virtual|vmware|vbox|wsl|docker|hyper-v|loopback|tailscale|zerotier/i.test(name)) score -= 6;
      out.push({ name, address: a.address, score });
    }
  }
  return out.sort((a, b) => b.score - a.score).map(({ name, address }) => ({ name, address }));
}

// ---- Rooms -----------------------------------------------------------------
const rooms = new Map();
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const token = () => crypto.randomBytes(12).toString('hex');
const shortId = () => crypto.randomBytes(4).toString('hex');
const clampInt = (v, max) => Math.min(max - 1, Math.max(0, Math.floor(Number(v) || 0)));

function makeCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function cleanName(name) {
  return String(name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
}

function cleanLook(data) {
  return {
    cls: CLASSES.includes(data.cls) ? data.cls : CLASSES[0],
    color: clampInt(data.color, COLOR_COUNT),
    skin: clampInt(data.skin, SKIN_COUNT),
  };
}

function newPlayer(data) {
  return {
    id: shortId(), token: token(), name: cleanName(data.name) || 'Hero', ...cleanLook(data),
    score: 0, kills: 0, roundScores: ROUNDS.map(() => 0),
    socketId: null, connected: true, joinedAt: Date.now(), bot: Boolean(data.bot),
  };
}

// Solo rooms run the same rounds with one player and no host screen.
function createRoom(solo = false) {
  const room = {
    code: makeCode(),
    solo,
    hostToken: token(),
    hostSocketId: null,
    players: new Map(),
    records: {}, // playerId -> { board, rank, entryId } for hall-of-fame entries from the last game
    state: 'lobby',
    round: -1,
    phaseEndsAt: 0,
    words: new Map(),
    used: new Set(),
    recentKills: new Map(),
    nextWordId: 1,
    nextSpawnAt: 0,
    lastSpawnAt: 0,
    timer: null,
    ticker: null,
    lastActive: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

const channel = (room) => `room:${room.code}`;

function publicPlayer(p) {
  return { id: p.id, name: p.name, cls: p.cls, color: p.color, skin: p.skin,
    score: p.score, kills: p.kills, roundScores: p.roundScores, connected: p.connected };
}

function snapshot(room) {
  return {
    code: room.code,
    solo: room.solo,
    state: room.state,
    round: room.round,
    rounds: ROUNDS_PUBLIC,
    phaseEndsAt: room.phaseEndsAt,
    players: [...room.players.values()].map(publicPlayer),
    words: [...room.words.values()],
    records: room.records,
  };
}

function broadcastPlayers(room) {
  io.to(channel(room)).emit('room:players', [...room.players.values()].map(publicPlayer));
}

function broadcastState(room) {
  io.to(channel(room)).emit('room:state', {
    state: room.state, round: room.round, phaseEndsAt: room.phaseEndsAt,
    players: [...room.players.values()].map(publicPlayer), records: room.records,
  });
}

function closeRoom(room) {
  stopTimers(room);
  io.to(channel(room)).emit('room:closed');
  io.socketsLeave(channel(room));
  rooms.delete(room.code);
}

function stopTimers(room) {
  clearTimeout(room.timer);
  clearInterval(room.ticker);
  room.timer = null;
  room.ticker = null;
}

function setPhase(room, state, ms, next) {
  clearTimeout(room.timer);
  room.state = state;
  room.phaseEndsAt = ms ? Date.now() + ms : 0;
  broadcastState(room);
  if (next) room.timer = setTimeout(next, ms);
}

function startGame(room) {
  stopTimers(room);
  room.records = {};
  for (const p of room.players.values()) {
    p.score = 0;
    p.kills = 0;
    p.roundScores = ROUNDS.map(() => 0);
  }
  room.round = -1;
  room.words.clear();
  nextRound(room);
}

function nextRound(room) {
  room.round += 1;
  setPhase(room, 'countdown', COUNTDOWN_MS, () => beginPlaying(room));
}

function beginPlaying(room) {
  room.used.clear();
  room.words.clear();
  room.recentKills.clear();
  room.nextSpawnAt = Date.now() + 200;
  setPhase(room, 'playing', ROUNDS[room.round].duration, () => endRound(room));
  clearInterval(room.ticker);
  room.ticker = setInterval(() => tick(room), 100);
}

function endRound(room) {
  clearInterval(room.ticker);
  room.ticker = null;
  room.words.clear();
  io.to(channel(room)).emit('word:clear');
  if (room.round >= ROUNDS.length - 1) {
    recordScores(room);
    setPhase(room, 'finished', 0, null);
  } else {
    setPhase(room, 'intermission', room.solo ? SOLO_INTERMISSION_MS : INTERMISSION_MS, () => nextRound(room));
  }
}

function recordScores(room) {
  const board = room.solo ? 'solo' : 'battle';
  const ranked = [...room.players.values()]
    .sort((a, b) => b.score - a.score || b.kills - a.kills || a.name.localeCompare(b.name));
  room.records = {};
  ranked.forEach((p, i) => {
    if (p.bot || p.score <= 0) return;
    const entry = { id: shortId(), name: p.name, cls: p.cls, color: p.color, skin: p.skin,
      score: p.score, kills: p.kills, at: Date.now() };
    if (!room.solo) Object.assign(entry, { place: i + 1, of: ranked.length });
    const rank = addToHall(board, entry);
    if (rank) room.records[p.id] = { board, rank, entryId: entry.id };
  });
  saveHall();
}

function backToLobby(room) {
  stopTimers(room);
  room.records = {};
  room.round = -1;
  room.words.clear();
  for (const p of room.players.values()) {
    p.score = 0;
    p.kills = 0;
    p.roundScores = ROUNDS.map(() => 0);
  }
  io.to(channel(room)).emit('word:clear');
  setPhase(room, 'lobby', 0, null);
}

function tick(room) {
  const now = Date.now();
  const cfg = ROUNDS[room.round];

  for (const w of room.words.values()) {
    if (now >= w.spawn + w.dur) {
      room.words.delete(w.id);
      io.to(channel(room)).emit('word:escape', { id: w.id });
    }
  }
  for (const [id, k] of room.recentKills) if (now - k.at > 5000) room.recentKills.delete(id);

  if (now >= room.phaseEndsAt - STOP_SPAWN_BEFORE_END_MS) return;

  // More heroes on the field means words disappear faster, so spawn faster too.
  const heroes = Math.max(1, [...room.players.values()].filter((p) => p.connected).length);
  const crowd = Math.min(2.2, 1 + 0.12 * (heroes - 1));
  const maxActive = Math.min(12, cfg.maxActive + Math.floor((heroes - 1) / 3));
  const fieldEmpty = room.words.size === 0 && now - room.lastSpawnAt > 500;

  if (now >= room.nextSpawnAt || fieldEmpty) {
    if (room.words.size < maxActive) {
      spawnWord(room, cfg, now);
      room.nextSpawnAt = now + rand(cfg.spawnEvery[0], cfg.spawnEvery[1]) / crowd;
    } else {
      room.nextSpawnAt = now + 300;
    }
  }
}

function pickWord(room, cfg) {
  const pool = WORDS[cfg.key];
  const active = [...room.words.values()].map((w) => w.text);
  // Never let one active word be a prefix of another - typing would auto-hit the shorter one.
  const ok = (t) => !room.used.has(t) && !active.some((a) => a.startsWith(t) || t.startsWith(a));
  let choices = pool.filter(ok);
  if (!choices.length) {
    room.used.clear();
    choices = pool.filter(ok);
  }
  if (!choices.length) return null;
  return choices[Math.floor(Math.random() * choices.length)];
}

function pickX(room, now) {
  // Keep new words away from words that are still near the top of the field.
  const near = [...room.words.values()]
    .filter((w) => (now - w.spawn) / w.dur < 0.4)
    .map((w) => w.x);
  let best = 0.5;
  let bestScore = -1;
  for (let i = 0; i < 10; i++) {
    const x = rand(0.12, 0.88);
    const score = near.length ? Math.min(...near.map((n) => Math.abs(n - x))) : Math.random();
    if (score > bestScore) {
      best = x;
      bestScore = score;
    }
  }
  return Math.round(best * 1000) / 1000;
}

function spawnWord(room, cfg, now) {
  const text = pickWord(room, cfg);
  if (!text) return;
  room.used.add(text);
  const word = {
    id: room.nextWordId++,
    text,
    x: pickX(room, now),
    spawn: now + SPAWN_LEAD_MS,
    dur: Math.round(rand(cfg.fall[0], cfg.fall[1]) + Math.max(0, text.length - 5) * 220),
    points: text.length * 10 * cfg.multiplier,
  };
  room.words.set(word.id, word);
  room.lastSpawnAt = now;
  io.to(channel(room)).emit('word:spawn', word);
}

// ---- Sockets ---------------------------------------------------------------
io.on('connection', (socket) => {
  const reply = (cb, data) => typeof cb === 'function' && cb(data);
  const ctx = () => {
    const room = rooms.get(socket.data.code);
    if (!room) return {};
    room.lastActive = Date.now();
    const player = socket.data.playerId ? room.players.get(socket.data.playerId) : null;
    const isHost = socket.data.role === 'host' && room.hostSocketId === socket.id;
    return { room, player, isHost };
  };

  socket.on('time', (cb) => reply(cb, Date.now()));

  // Host ---------------------------------------------------------------
  socket.on('host:create', (_data, cb) => {
    const room = createRoom();
    room.hostSocketId = socket.id;
    socket.data = { role: 'host', code: room.code };
    socket.join(channel(room));
    reply(cb, { ok: true, hostToken: room.hostToken, snapshot: snapshot(room) });
  });

  socket.on('host:resume', (data, cb) => {
    const room = rooms.get(String(data?.code || '').toUpperCase());
    if (!room || room.hostToken !== data?.hostToken) return reply(cb, { ok: false });
    room.hostSocketId = socket.id;
    socket.data = { role: 'host', code: room.code };
    socket.join(channel(room));
    reply(cb, { ok: true, hostToken: room.hostToken, snapshot: snapshot(room) });
  });

  socket.on('host:start', () => {
    const { room, isHost } = ctx();
    if (!isHost || !['lobby', 'finished'].includes(room.state) || room.players.size === 0) return;
    startGame(room);
  });

  socket.on('host:skip', () => {
    const { room, isHost } = ctx();
    if (!isHost) return;
    if (room.state === 'countdown') beginPlaying(room);
    else if (room.state === 'intermission') nextRound(room);
    else if (room.state === 'playing') endRound(room);
  });

  socket.on('host:lobby', () => {
    const { room, isHost } = ctx();
    if (isHost) backToLobby(room);
  });

  socket.on('host:kick', (data) => {
    const { room, isHost } = ctx();
    if (!isHost) return;
    const p = room.players.get(data?.id);
    if (!p) return;
    room.players.delete(p.id);
    if (p.socketId) {
      io.to(p.socketId).emit('player:kicked');
      const s = io.sockets.sockets.get(p.socketId);
      if (s) {
        s.leave(channel(room));
        s.data = {};
      }
    }
    broadcastPlayers(room);
  });

  // Players ------------------------------------------------------------
  const attachPlayer = (room, p) => {
    if (p.socketId && p.socketId !== socket.id) {
      const old = io.sockets.sockets.get(p.socketId);
      if (old) {
        old.leave(channel(room));
        old.data = {};
      }
    }
    p.socketId = socket.id;
    p.connected = true;
    socket.data = { role: 'player', code: room.code, playerId: p.id };
    socket.join(channel(room));
  };

  // Leaving a solo quest throws its room away; leaving a battle just marks the hero offline.
  const leaveRoom = () => {
    const { room, player } = ctx();
    if (!room || socket.data.role !== 'player') return;
    if (room.solo) {
      stopTimers(room);
      rooms.delete(room.code);
    } else if (player && player.socketId === socket.id) {
      player.connected = false;
      broadcastPlayers(room);
    }
    socket.leave(channel(room));
    socket.data = {};
  };

  socket.on('player:join', (data, cb) => {
    const room = rooms.get(String(data?.code || '').toUpperCase().trim());
    if (!room || room.solo) return reply(cb, { ok: false, error: 'Room not found. Check the code on the big screen.' });
    if (room.players.size >= MAX_PLAYERS) return reply(cb, { ok: false, error: 'This battle is full!' });

    let name = cleanName(data.name) || 'Hero';
    const taken = new Set([...room.players.values()].map((p) => p.name.toLowerCase()));
    if (taken.has(name.toLowerCase())) {
      let n = 2;
      while (taken.has(`${name.slice(0, 10)}${n}`.toLowerCase())) n++;
      name = `${name.slice(0, 10)}${n}`;
    }
    const p = newPlayer({ ...data, name });
    room.players.set(p.id, p);
    attachPlayer(room, p);
    broadcastPlayers(room);
    reply(cb, { ok: true, token: p.token, you: p.id, snapshot: snapshot(room) });
  });

  socket.on('solo:start', (data, cb) => {
    leaveRoom();
    const room = createRoom(true);
    const p = newPlayer(data || {});
    room.players.set(p.id, p);
    attachPlayer(room, p);
    startGame(room);
    reply(cb, { ok: true, token: p.token, you: p.id, snapshot: snapshot(room) });
  });

  socket.on('solo:again', () => {
    const { room, player } = ctx();
    if (player && room.solo && room.state === 'finished') startGame(room);
  });

  socket.on('solo:quit', (_data, cb) => {
    leaveRoom();
    reply(cb, { ok: true });
  });

  socket.on('player:resume', (data, cb) => {
    const room = rooms.get(String(data?.code || '').toUpperCase());
    const p = room && [...room.players.values()].find((pl) => pl.token === data?.token);
    if (!p) return reply(cb, { ok: false });
    attachPlayer(room, p);
    broadcastPlayers(room);
    reply(cb, { ok: true, token: p.token, you: p.id, snapshot: snapshot(room) });
  });

  socket.on('player:update', (data) => {
    const { room, player } = ctx();
    if (!player) return;
    Object.assign(player, cleanLook(data));
    const name = cleanName(data?.name);
    if (name) player.name = name;
    broadcastPlayers(room);
  });

  socket.on('player:claim', (data, cb) => {
    const { room, player } = ctx();
    if (!player || room.state !== 'playing') return reply(cb, { ok: false, reason: 'not-playing' });
    const id = Number(data?.id);
    const word = room.words.get(id);
    if (!word) {
      const k = room.recentKills.get(id);
      const by = k && room.players.get(k.by);
      return reply(cb, { ok: false, reason: 'taken', by: by ? by.name : null });
    }
    if (String(data?.text || '').toLowerCase().trim() !== word.text) return reply(cb, { ok: false, reason: 'mismatch' });

    room.words.delete(id);
    room.recentKills.set(id, { by: player.id, at: Date.now() });
    player.score += word.points;
    player.kills += 1;
    player.roundScores[room.round] += word.points;
    io.to(channel(room)).emit('word:kill', {
      id, by: player.id, points: word.points, score: player.score, kills: player.kills,
      roundScore: player.roundScores[room.round],
    });
    reply(cb, { ok: true, points: word.points });
  });

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data?.code);
    if (!room) return;
    if (socket.data.role === 'host' && room.hostSocketId === socket.id) room.hostSocketId = null;
    const p = socket.data.playerId && room.players.get(socket.data.playerId);
    if (p && p.socketId === socket.id) {
      p.connected = false;
      broadcastPlayers(room);
    }
  });
});

// Drop rooms nobody has touched in a while. Abandoned solo quests go sooner.
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const anyoneHere = room.hostSocketId || [...room.players.values()].some((p) => p.connected);
    const idleLimit = room.solo ? 5 * 60000 : 20 * 60000;
    if ((!anyoneHere && now - room.lastActive > idleLimit) || now - room.lastActive > 6 * 3600000) closeRoom(room);
  }
}, 60000);

server.listen(PORT, '0.0.0.0', () => {
  const addrs = ON_RENDER ? [] : lanAddresses();
  console.log('\n  ⚔  WORD WARRIORS is running!\n');
  console.log(`  Host screen (open on the big screen):  ${ON_RENDER ? PUBLIC_URL : `http://localhost:${PORT}`}`);
  if (PUBLIC_URL) console.log(`  Players join via:                     ${PUBLIC_URL}/play`);
  for (const a of addrs) console.log(`  Phones on the same Wi-Fi:             http://${a.address}:${PORT}/play   (${a.name})`);
  console.log('');
});
