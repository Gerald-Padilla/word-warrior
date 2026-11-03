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
const TEAM_HP = 10000; // each team's HP in a team battle, scaled up for bigger teams
const KO_DELAY_MS = 1500; // let the knockout blow land before the results
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
    score: 0, kills: 0, roundScores: ROUNDS.map(() => 0), team: 0,
    socketId: null, connected: true, joinedAt: Date.now(), bot: Boolean(data.bot),
  };
}

// Each stream of falling words keeps its own spawn clock: one for free-for-all, one per team in a team battle.
const newStream = (nextSpawnAt = 0) => ({ nextSpawnAt, lastSpawnAt: 0, used: new Set() });
const crowdFactor = (heroes) => Math.min(2.2, 1 + 0.12 * (heroes - 1));

// Solo rooms run the same rounds with one player and no host screen.
function createRoom(solo = false) {
  const room = {
    code: makeCode(),
    solo,
    mode: 'ffa', // or 'teams'
    hostToken: token(),
    hostSocketId: null,
    players: new Map(),
    records: {}, // playerId -> { board, rank, entryId } for hall-of-fame entries from the last game
    teams: null, // team battle: [{ hp, max }, { hp, max }]
    winner: null, // team battle: 0, 1, or -1 for a draw
    ko: false,
    state: 'lobby',
    round: -1,
    phaseEndsAt: 0,
    words: new Map(),
    streams: [newStream()],
    recentKills: new Map(),
    nextWordId: 1,
    timer: null,
    ticker: null,
    lastActive: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

const channel = (room) => `room:${room.code}`;

function publicPlayer(p) {
  return { id: p.id, name: p.name, cls: p.cls, color: p.color, skin: p.skin, team: p.team,
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
    mode: room.mode, teams: room.teams, winner: room.winner, ko: room.ko,
  };
}

function broadcastPlayers(room) {
  io.to(channel(room)).emit('room:players', [...room.players.values()].map(publicPlayer));
}

function broadcastState(room) {
  io.to(channel(room)).emit('room:state', {
    state: room.state, round: room.round, phaseEndsAt: room.phaseEndsAt,
    players: [...room.players.values()].map(publicPlayer), records: room.records,
    mode: room.mode, teams: room.teams, winner: room.winner, ko: room.ko,
  });
}

// ---- Teams -----------------------------------------------------------------
function teamCounts(room, connectedOnly = false) {
  const counts = [0, 0];
  for (const p of room.players.values()) if (!connectedOnly || p.connected) counts[p.team] += 1;
  return counts;
}

const smallerTeam = (room) => {
  const [a, b] = teamCounts(room);
  return a === b ? Math.floor(Math.random() * 2) : a < b ? 0 : 1;
};

// shuffle deals everyone out again at random; otherwise this only steps in when one side is empty.
function balanceTeams(room, shuffle) {
  const list = [...room.players.values()];
  const [a, b] = teamCounts(room);
  if (!shuffle && ((a && b) || list.length < 2)) return;
  if (shuffle) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }
  const first = Math.floor(Math.random() * 2);
  list.forEach((p, i) => { p.team = (i + first) % 2; });
}

// A team at 0 HP loses on the spot.
function knockOut(room, winner) {
  clearTimeout(room.timer);
  clearInterval(room.ticker);
  room.ticker = null;
  room.ko = true;
  room.winner = winner;
  room.timer = setTimeout(() => {
    room.words.clear();
    io.to(channel(room)).emit('word:clear');
    setPhase(room, 'finished', 0, null);
  }, KO_DELAY_MS);
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
  room.winner = null;
  room.ko = false;
  room.teams = null;
  if (room.mode === 'teams') {
    balanceTeams(room, false);
    const max = Math.round((TEAM_HP * crowdFactor(Math.max(1, ...teamCounts(room)))) / 100) * 100;
    room.teams = [{ hp: max, max }, { hp: max, max }];
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
  room.words.clear();
  room.recentKills.clear();
  room.streams = (room.mode === 'teams' ? [0, 1] : [0]).map(() => newStream(Date.now() + 200));
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
    if (room.teams) {
      const [a, b] = room.teams.map((t) => t.hp);
      room.winner = a === b ? -1 : a > b ? 0 : 1;
    }
    recordScores(room);
    setPhase(room, 'finished', 0, null);
  } else {
    setPhase(room, 'intermission', room.solo ? SOLO_INTERMISSION_MS : INTERMISSION_MS, () => nextRound(room));
  }
}

function recordScores(room) {
  if (room.mode === 'teams') return; // team damage isn't comparable with free-for-all scores
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
  room.teams = null;
  room.winner = null;
  room.ko = false;
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

  // More heroes on the field means words disappear faster, so spawn faster too. In a team battle each
  // team has its own stream, both paced for the bigger team so neither side gets more words to hit with.
  const teams = room.mode === 'teams';
  const counts = teams ? teamCounts(room, true) : [[...room.players.values()].filter((p) => p.connected).length];
  const heroes = Math.max(1, ...counts);
  const crowd = crowdFactor(heroes);
  const maxActive = Math.min(teams ? 8 : 12, cfg.maxActive + Math.floor((heroes - 1) / 3));

  room.streams.forEach((stream, i) => {
    const team = teams ? i : null;
    const active = streamWords(room, team).length;
    const fieldEmpty = active === 0 && now - stream.lastSpawnAt > 500;
    if (now < stream.nextSpawnAt && !fieldEmpty) return;
    if (active < maxActive) {
      spawnWord(room, cfg, now, stream, team);
      stream.nextSpawnAt = now + rand(cfg.spawnEvery[0], cfg.spawnEvery[1]) / crowd;
    } else {
      stream.nextSpawnAt = now + 300;
    }
  });
}

// Words on one team's side (team null = the free-for-all field).
const streamWords = (room, team) => [...room.words.values()].filter((w) => (w.team ?? null) === team);

function pickWord(room, cfg, stream, team) {
  const pool = WORDS[cfg.key];
  const active = streamWords(room, team).map((w) => w.text);
  // Never let one active word be a prefix of another - typing would auto-hit the shorter one.
  const ok = (t) => !stream.used.has(t) && !active.some((a) => a.startsWith(t) || t.startsWith(a));
  let choices = pool.filter(ok);
  if (!choices.length) {
    stream.used.clear();
    choices = pool.filter(ok);
  }
  if (!choices.length) return null;
  return choices[Math.floor(Math.random() * choices.length)];
}

function pickX(room, now, team) {
  // Keep new words away from words that are still near the top of the field.
  const near = streamWords(room, team)
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

function spawnWord(room, cfg, now, stream, team) {
  const text = pickWord(room, cfg, stream, team);
  if (!text) return;
  stream.used.add(text);
  const word = {
    id: room.nextWordId++,
    text,
    x: pickX(room, now, team),
    spawn: now + SPAWN_LEAD_MS,
    dur: Math.round(rand(cfg.fall[0], cfg.fall[1]) + Math.max(0, text.length - 5) * 220),
    points: text.length * 10 * cfg.multiplier,
  };
  if (team !== null) word.team = team;
  room.words.set(word.id, word);
  stream.lastSpawnAt = now;
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
    if (room.mode === 'teams' && room.players.size < 2) return;
    startGame(room);
  });

  socket.on('host:mode', (data) => {
    const { room, isHost } = ctx();
    if (!isHost || room.state !== 'lobby') return;
    room.mode = data?.mode === 'teams' ? 'teams' : 'ffa';
    broadcastState(room);
  });

  socket.on('host:shuffle', () => {
    const { room, isHost } = ctx();
    if (!isHost || room.state !== 'lobby') return;
    balanceTeams(room, true);
    broadcastPlayers(room);
  });

  socket.on('host:skip', () => {
    const { room, isHost } = ctx();
    if (!isHost || room.ko) return;
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
    p.team = smallerTeam(room);
    room.players.set(p.id, p);
    attachPlayer(room, p);
    broadcastPlayers(room);
    reply(cb, { ok: true, token: p.token, you: p.id, snapshot: snapshot(room) });
  });

  socket.on('player:team', () => {
    const { room, player } = ctx();
    if (!player || room.solo || room.state !== 'lobby') return;
    player.team = 1 - player.team;
    broadcastPlayers(room);
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
    if (!player || room.state !== 'playing' || room.ko) return reply(cb, { ok: false, reason: 'not-playing' });
    const id = Number(data?.id);
    const word = room.words.get(id);
    if (!word) {
      const k = room.recentKills.get(id);
      const by = k && room.players.get(k.by);
      return reply(cb, { ok: false, reason: 'taken', by: by ? by.name : null });
    }
    if (String(data?.text || '').toLowerCase().trim() !== word.text) return reply(cb, { ok: false, reason: 'mismatch' });
    if (word.team !== undefined && word.team !== player.team) return reply(cb, { ok: false, reason: 'other-team' });

    room.words.delete(id);
    room.recentKills.set(id, { by: player.id, at: Date.now() });
    player.score += word.points;
    player.kills += 1;
    player.roundScores[room.round] += word.points;
    const kill = {
      id, by: player.id, points: word.points, score: player.score, kills: player.kills,
      roundScore: player.roundScores[room.round],
    };
    // Team battle: the word's points come off the other team's HP.
    const foe = room.teams && word.team !== undefined ? room.teams[1 - word.team] : null;
    if (foe) {
      foe.hp = Math.max(0, foe.hp - word.points);
      Object.assign(kill, { team: word.team, hp: room.teams.map((t) => t.hp) });
    }
    io.to(channel(room)).emit('word:kill', kill);
    reply(cb, { ok: true, points: word.points });
    if (foe && foe.hp === 0) knockOut(room, word.team);
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
