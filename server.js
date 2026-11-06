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
// flight: team battle, how long an attack takes to cross the field.
const ROUNDS = [
  { key: 'easy', name: 'EASY', title: 'Slime Swarm', monster: 'slime', duration: 45000,
    spawnEvery: [1500, 2200], fall: [9500, 11500], maxActive: 5, multiplier: 1, flight: 7000 },
  { key: 'medium', name: 'MEDIUM', title: 'Bat Storm', monster: 'bat', duration: 50000,
    spawnEvery: [1350, 1900], fall: [9000, 10500], maxActive: 6, multiplier: 2, flight: 6500 },
  { key: 'hard', name: 'HARD', title: 'Skull Inferno', monster: 'skull', duration: 55000,
    spawnEvery: [1250, 1750], fall: [8500, 10000], maxActive: 7, multiplier: 3, flight: 6000 },
];
// Game length and difficulty (host options). A full game climbs through all three rounds (then the boss
// finale, if it's on); one round plays just the round that matches the difficulty. Difficulty also sets
// the pace of every round: how long words take to fall (or attacks to fly), how often new ones come and
// how many can be on screen at once.
const LENGTHS = ['full', 'one'];
const LEVELS = {
  easy: { round: 0, fall: 1.3, spawn: 1.25, active: -1 },
  normal: { round: 1, fall: 1, spawn: 1, active: 0 },
  hard: { round: 2, fall: 0.8, spawn: 0.8, active: 1 },
};
const LEVEL_KEYS = Object.keys(LEVELS);
const COUNTDOWN_MS = 4000;
const INTERMISSION_MS = 9000;
const SOLO_INTERMISSION_MS = 5000;
const SPAWN_LEAD_MS = 150; // words start slightly in the future so every client sees them enter
const STOP_SPAWN_BEFORE_END_MS = 3000;
const TEAM_HP = 6000; // each team's HP in a team battle, scaled up for bigger teams
const KO_DELAY_MS = 1500; // let the knockout blow land before the results
const POWERS = ['potion', 'slow', 'haste', 'shield', 'fury'];
const POWER_FIRST_MS = [6000, 10000]; // first power-up of a round appears this long after it starts
const POWER_EVERY_MS = [9000, 15000]; // then this long after the last one is taken or fades
const POWER_LIFE_MS = 9000; // a power-up floats this long before it fades
const EFFECT_MS = { slow: 10000, haste: 10000, shield: 6000, fury: 10000 };
const SLOW_FACTOR = 1.6; // Slow Time: attacks coming at your team take this much longer
const HASTE_FACTOR = 0.6; // Haste: your team's attacks fly this much faster
const POTION_HEAL = 0.15; // Health Potion: share of max HP restored
const MAX_PLAYERS = 60;
const CLASSES = ['knight', 'wizard', 'archer', 'rogue', 'cleric', 'barbarian', 'ninja', 'necromancer', 'druid', 'pirate', 'bard', 'valkyrie'];
const COLOR_COUNT = 8;
const SKIN_COUNT = 4;
const HAIR_COUNT = 8; // 0 = the class's own hair color
const TRIM_COUNT = 6;
const PET_COUNT = 6; // 0 = no pet

// Auto-type guard: every claim carries the gaps between the player's keystrokes for that word.
const KEY_MIN_MS = 25; // a word typed faster than this per letter on average (~400+ WPM) is a machine
const KEY_EVEN_CV = 0.2; // recent gaps this even (spread / average) are a machine; people sit around 0.4+
const KEY_SAMPLE = 30; // recent gaps kept per player for that check
const KEY_SAMPLE_MIN = 12; // ...and how many it needs before judging
const KEY_CLOCK_SLACK_MS = 500; // typing can't take longer than the word has been on screen, give or take this
const FLAG_AFTER = 3; // blocked words before a player is marked as a suspected auto-typer

// Boss finale (a host option): a fourth round against the Dragon King. Every word typed hurts it.
const BOSS_ROUND = { key: 'boss', name: 'BOSS', title: 'The Dragon King', monster: 'boss', pool: 'hard', duration: 60000,
  spawnEvery: [1150, 1650], fall: [8000, 9500], maxActive: 6, multiplier: 3 };
const BOSS_HP = 5000; // for one hero; it grows with the crowd
const BOSS_FINISH_BONUS = 1000; // for the hero who lands the final blow
const BOSS_CLEAR_BONUS = 500; // for everyone who hurt the boss, when it goes down
const BOSS_DOWN_MS = 3000; // the boss's fall plays out before the results

// Streaks (option): words in a row without a typo multiply their points.
const STREAK_STEPS = [[10, 3], [6, 2], [3, 1.5]];
const TEAM_STREAK_MAX = 2; // team battle damage multiplier tops out here

// Special words (option, free for all and solo): now and then a falling word is gold, ice or a bomb.
const SPECIALS = ['gold', 'ice', 'bomb'];
const SPECIAL_CHANCE = 0.12; // share of new words that are special, one on screen at a time
const GOLD_FACTOR = 3; // gold words are worth this many times their points
const ICE_MS = 6000; // ice slows every word on screen for this long
const ICE_FACTOR = 1.8; // ...by this much
const BOMB_SHARE = 0.5; // a bomb blasts every word on screen and pays this share of their points

// Class perks (option): each class scores more on one kind of word. The bonuses are sized so that every
// perk adds about 10% to an average game: they were measured over simulated games with the real word
// lists, and a perk that fires on less of your points gets a bigger bonus. Only things about the word
// (and your own typing) count, never when you hit it, so a perk is worth the same in solo, in a crowd
// and in a team battle. test(word, player, room) runs before the claim updates the player.
const vowels = (t) => (t.match(/[aeiou]/g) || []).length;
const specialsOn = (room) => room.options.specials && room.mode !== 'teams';
const PERKS = {
  knight: { bonus: 0.45, test: (w) => w.text.length <= 7 }, // 22% of a game's points
  barbarian: { bonus: 0.18, test: (w) => w.text.length >= 8 && w.text.length <= 10 }, // 52%
  wizard: { bonus: 0.4, test: (w) => w.text.length >= 11 }, // 25%
  archer: { bonus: 0.25, test: (w) => /[jkqvwxyz]/.test(w.text) }, // 42%
  rogue: { bonus: 0.25, test: (w) => w.text.includes('s') }, // 39%
  necromancer: { bonus: 0.6, test: (w) => /(.)\1/.test(w.text) }, // 18%
  druid: { bonus: 0.25, test: (w) => vowels(w.text) >= 4 }, // 40%
  valkyrie: { bonus: 0.65, test: (w) => /^[aeiou]/.test(w.text) }, // 16%
  bard: { bonus: 0.35, test: (w, pl) => pl.lastLen === w.text.length }, // 26%
  pirate: { bonus: 0.5, test: (w, pl) => (pl.typed + 1) % 5 === 0 }, // 20%
  ninja: { bonus: 0.12, test: (w, pl) => !pl.typoSince }, // ~80% for most typists
  // Special words fall only in free for all and solo; without them the cleric gets a little on everything.
  cleric: { bonus: (room) => (specialsOn(room) ? 0.6 : 0.1), test: (w, pl, room) => !specialsOn(room) || Boolean(w.special) }, // ~16%
};
const CLERIC_POWER_BOOST = 1.5; // team battle: a cleric's power-ups last (or heal) this much more

// Skills (option): every SKILL_WORDS words you type charge your class's skill; then you can use it once.
// Each is worth about three words' points: boosts add to your next words' base points (not on top of
// your streak), strikes hit words on screen for their base points, so no class pulls ahead by its skill.
const SKILL_WORDS = 8;
const SKILLS = {
  knight: { name: 'RALLY', kind: 'empower', count: 3, mult: 2 },
  barbarian: { name: 'BERSERK', kind: 'empower', count: 2, mult: 2.5 },
  cleric: { name: 'DIVINE FAVOR', kind: 'empower', count: 4, mult: 1.75 },
  druid: { name: 'OVERGROWTH', kind: 'empower', count: 6, mult: 1.5 },
  wizard: { name: 'METEOR', kind: 'strike', pick: 'rich', count: 2, share: 1.2 },
  rogue: { name: 'BACKSTAB', kind: 'strike', pick: 'low', count: 3, share: 1 },
  archer: { name: 'ARROW RAIN', kind: 'strike', pick: 'high', count: 3, share: 1 },
  ninja: { name: 'SHURIKEN STORM', kind: 'strike', pick: 'random', count: 3, share: 1 },
  pirate: { name: 'CANNON BARRAGE', kind: 'strike', pick: 'random', count: 4, share: 0.75 },
  valkyrie: { name: 'THUNDERCLAP', kind: 'strike', pick: 'low', count: 6, share: 0.5 },
  necromancer: { name: 'RAISE DEAD', kind: 'raise', count: 3 },
  bard: { name: 'ENCORE', kind: 'encore', count: 3 },
};
const SKILL_LAUNCHES = 3; // team battle: a strike with nothing to block fires up to this many attacks
const CLUTCH_PROGRESS = 0.85; // a word typed past this far down counts as a clutch save

// Host options. Solo quests always play with the defaults.
const OPTION_KEYS = ['streaks', 'specials', 'boss', 'perks', 'skills', 'awards', 'emotes', 'chat'];
const DEFAULT_OPTIONS = {
  streaks: true, specials: true, boss: true, perks: true, skills: true, awards: true, emotes: true, chat: true, onlyMine: false,
  length: 'full', level: 'normal',
};
const MY_WORDS_MAX = 300; // custom words the host can add
const MY_WORDS_MIN = 6; // "only my words" needs at least this many for a round, or the built-in words fill in
const EMOTE_COUNT = 6;
const EMOTE_GAP_MS = 1200; // per player

// Lobby chat (option): short messages from phones, shown on the big screen and every phone in the lobby.
const CHAT_MAX = 80; // characters per message
const CHAT_LOG = 30; // messages kept per room, so newcomers see the conversation so far
const CHAT_GAP_MS = 1500; // per player
// A basic filter for an office crowd: these words (English and Tagalog) are masked with asterisks. Short
// ones only match as whole words ("bobo", not "boboto"); the rest also catch longer forms ("putangina").
const CHAT_WHOLE = ['puta', 'bobo', 'tanga', 'gago', 'gaga', 'ulol', 'puki', 'tite', 'cunt', 'dick', 'slut', 'whore', 'fag', 'nigga'];
const CHAT_STEMS = ['fuck', 'shit', 'bitch', 'asshole', 'bastard', 'motherf', 'nigger', 'pussy', 'putang', 'tangina',
  'tangna', 'pakyu', 'punyeta', 'tarantado', 'kupal', 'hayop ka', 'leche ka'];
const CHAT_FILTER = new RegExp(`\\b(?:(?:${CHAT_WHOLE.join('|')})\\b|(?:${CHAT_STEMS.join('|')})[a-z]*)`, 'gi');
function cleanChat(text) {
  const t = String(text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
  return t.replace(CHAT_FILTER, (m) => m[0] + '*'.repeat(m.length - 1));
}

// Daily quest: one seeded run a day, the same words for everyone. The day turns over at midnight here.
const DAILY_TZ = process.env.DAILY_TZ || 'Asia/Manila';
const dayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: DAILY_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
  .format(new Date());

// ---- Hall of fame ----------------------------------------------------------
// Best scores survive restarts. Solo and battle are ranked separately because in a
// battle the words are split between everyone on the field. The daily board starts over each day.
const HALL_FILE = path.join(__dirname, 'data', 'highscores.json');
const HALL_SIZE = 100; // entries kept per board
const hall = loadHall();

function loadHall() {
  try {
    const data = JSON.parse(fs.readFileSync(HALL_FILE, 'utf8'));
    const daily = data.daily && data.daily.date ? { date: data.daily.date, list: [].concat(data.daily.list || []) } : { date: '', list: [] };
    return { solo: [].concat(data.solo || []), battle: [].concat(data.battle || []), daily };
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`Could not read ${HALL_FILE}: ${err.message}`);
    return { solo: [], battle: [], daily: { date: '', list: [] } };
  }
}

function boardList(board) {
  if (board !== 'daily') return hall[board];
  const today = dayKey();
  if (hall.daily.date !== today) hall.daily = { date: today, list: [] };
  return hall.daily.list;
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
  const list = boardList(board);
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

// A fingerprint of the code phones and the big screen run. Pages compare it with the server's on every
// (re)connect, so a page left open across an update reloads itself instead of running old code against
// the new server (which, for one, refuses claims without keystroke timings).
const BUILD = (() => {
  const hash = crypto.createHash('sha1');
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else hash.update(fs.readFileSync(p));
    }
  };
  walk(path.join(__dirname, 'public'));
  hash.update(fs.readFileSync(__filename));
  return hash.digest('hex').slice(0, 12);
})();
app.get('/build.js', (req, res) => {
  res.type('js').set('Cache-Control', 'no-store').send(`window.WW_BUILD = ${JSON.stringify(BUILD)};`);
});

const fontDir = path.dirname(require.resolve('@fontsource/press-start-2p/package.json'));
app.use('/vendor/press-start-2p', express.static(fontDir));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'host.html')));
app.get('/play', (req, res) => res.sendFile(path.join(__dirname, 'public', 'play.html')));

app.get('/api/network', (req, res) => {
  res.json({ port: PORT, publicUrl: PUBLIC_URL, addresses: ON_RENDER ? [] : lanAddresses() });
});

app.get('/api/highscores', (req, res) => {
  res.set('Cache-Control', 'no-store').json({
    solo: hall.solo.slice(0, 10), battle: hall.battle.slice(0, 10), daily: boardList('daily').slice(0, 10), day: dayKey(),
  });
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
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const hashStr = (s) => [...String(s)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
// Repeatable random numbers for the daily quest (mulberry32).
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const roll = (room, lo, hi) => lo + room.rng() * (hi - lo); // spawn randomness; seeded in a daily quest

// The host's own words: letters only, 3 to 13 long, no repeats.
function cleanWords(text) {
  const words = String(text || '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3 && w.length <= 13);
  return [...new Set(words)].slice(0, MY_WORDS_MAX);
}

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
    hair: clampInt(data.hair, HAIR_COUNT),
    trim: clampInt(data.trim, TRIM_COUNT),
    pet: clampInt(data.pet, PET_COUNT),
  };
}

// Per-game typing stats, for the end-of-game awards.
const newStats = () => ({ words: 0, chars: 0, gapChars: 0, typeMs: 0, typos: 0, bestStreak: 0, clutch: 0, specials: 0, bossDmg: 0, bossKill: false });
// Per-game state for perks and skills: words typed, the last word's length, a typo since the last word,
// skill charge, an active boost ({ left, extra }) and the base points of the last few words.
const newKit = () => ({ typed: 0, lastLen: 0, typoSince: false, charge: 0, empower: null, recent: [] });

function newPlayer(data) {
  return {
    id: shortId(), token: token(), name: cleanName(data.name) || 'Hero', ...cleanLook(data),
    score: 0, kills: 0, roundScores: ROUNDS.map(() => 0), team: 0, streak: 0, stats: newStats(), ...newKit(),
    socketId: null, connected: true, joinedAt: Date.now(), bot: Boolean(data.bot),
    keyGaps: [], strikes: 0, flagged: false, // auto-type guard
  };
}

// The spawn clock for falling words, plus the words used recently so they don't repeat too soon.
const newStream = (nextSpawnAt = 0) => ({ nextSpawnAt, lastSpawnAt: 0, used: new Set() });
const crowdFactor = (heroes) => Math.min(2.2, 1 + 0.12 * (heroes - 1));

// Solo rooms run the same rounds with one player and no host screen. A daily quest is a solo room with
// seeded spawns.
function createRoom(solo = false, daily = false) {
  const room = {
    code: makeCode(),
    solo,
    daily: daily ? dayKey() : null,
    rng: Math.random,
    options: { ...DEFAULT_OPTIONS, words: [] },
    rounds: ROUNDS,
    boss: null, // boss round: { hp, max, down }
    iceUntil: 0, // special words: everything falls slower until then
    summary: null, // finished: { stats, awards }
    chat: [], // lobby chat: { id, by, name, color, text, at }, oldest first
    mode: 'ffa', // or 'teams'
    hostToken: token(),
    hostSocketId: null,
    players: new Map(),
    records: {}, // playerId -> { board, rank, entryId } for hall-of-fame entries from the last game
    teams: null, // team battle: [{ hp, max }, { hp, max }]
    winner: null, // team battle: 0, 1, or -1 for a draw
    ko: false,
    effects: [{}, {}], // team battle: per team, power-up name -> active until (ms)
    nextPowerAt: 0,
    state: 'lobby',
    round: -1,
    phaseEndsAt: 0,
    words: new Map(),
    stream: newStream(),
    recentKills: new Map(),
    nextWordId: 1,
    timer: null,
    ticker: null,
    lastActive: Date.now(),
  };
  room.rounds = roundsFor(room);
  rooms.set(room.code, room);
  return room;
}

// The rounds a game will play, paced for its difficulty. The boss finale ends a full game in free for all
// and solo; a team battle is its own fight.
function roundsFor(room) {
  const o = room.options;
  const lv = LEVELS[o.level] || LEVELS.normal;
  let list = ROUNDS;
  if (o.length === 'one') list = [ROUNDS[lv.round]];
  else if (o.boss && room.mode !== 'teams') list = ROUNDS.concat(BOSS_ROUND);
  return list.map((r) => ({
    ...r,
    pace: lv.fall, // falling words and flying attacks take this much longer
    spawnEvery: r.spawnEvery.map((ms) => Math.round(ms * lv.spawn)),
    maxActive: r.maxActive + lv.active,
    flight: r.flight && Math.round(r.flight * lv.fall),
  }));
}

const channel = (room) => `room:${room.code}`;

function publicPlayer(p) {
  return { id: p.id, name: p.name, cls: p.cls, color: p.color, skin: p.skin, hair: p.hair, trim: p.trim, pet: p.pet, team: p.team,
    score: p.score, kills: p.kills, roundScores: p.roundScores, connected: p.connected, flagged: p.flagged, streak: p.streak };
}

function publicOptions(room) {
  const o = room.options;
  return { ...Object.fromEntries(OPTION_KEYS.map((k) => [k, o[k]])), onlyMine: o.onlyMine, wordCount: o.words.length,
    length: o.length, level: o.level };
}

// Everything about the room's phase that clients redraw from; the snapshot adds what a newcomer needs.
function stateOf(room) {
  return {
    state: room.state, round: room.round, phaseEndsAt: room.phaseEndsAt,
    rounds: room.rounds.map(({ key, name, title, monster, duration, multiplier }) => ({ key, name, title, monster, duration, multiplier })),
    players: [...room.players.values()].map(publicPlayer), records: room.records,
    mode: room.mode, teams: room.teams, winner: room.winner, ko: room.ko, effects: room.effects,
    options: publicOptions(room), boss: room.boss, iceUntil: room.iceUntil, summary: room.summary, daily: room.daily,
  };
}

function snapshot(room) {
  return { ...stateOf(room), code: room.code, solo: room.solo, words: [...room.words.values()], chat: room.chat };
}

function broadcastPlayers(room) {
  io.to(channel(room)).emit('room:players', [...room.players.values()].map(publicPlayer));
}

function broadcastState(room) {
  io.to(channel(room)).emit('room:state', stateOf(room));
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
    finishGame(room);
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

function resetPlayers(room) {
  for (const p of room.players.values()) {
    p.score = 0;
    p.kills = 0;
    p.roundScores = room.rounds.map(() => 0);
    p.streak = 0;
    p.stats = newStats();
    Object.assign(p, newKit());
    sendCharge(room, p);
  }
}

function startGame(room) {
  stopTimers(room);
  room.records = {};
  room.summary = null;
  room.rounds = roundsFor(room);
  resetPlayers(room);
  room.winner = null;
  room.ko = false;
  room.teams = null;
  if (room.mode === 'teams') {
    balanceTeams(room, false);
    // A one-round battle starts with that round's share of the damage a full game deals, so it can
    // still end in a knockout.
    const weight = (list) => list.reduce((sum, r) => sum + r.duration * r.multiplier, 0);
    const share = weight(room.rounds) / weight(ROUNDS);
    const max = Math.max(500, Math.round((TEAM_HP * share * crowdFactor(Math.max(1, ...teamCounts(room)))) / 100) * 100);
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
  const cfg = room.rounds[room.round];
  room.words.clear();
  room.recentKills.clear();
  room.iceUntil = 0;
  room.escaped = []; // base points of words that got away this round (Raise Dead brings them back)
  room.hits = [[], []]; // team battle: damage each team took this round, latest last
  room.stream = newStream(Date.now() + 200);
  room.stream.pool = poolFor(room, cfg);
  if (room.daily) {
    // Same words, places and timings for everyone today: a fixed word order and a fresh seed each round.
    const seed = hashStr(`${room.daily}:${room.round}`);
    const shuffle = seeded(seed);
    room.stream.order = room.stream.pool.slice();
    for (let i = room.stream.order.length - 1; i > 0; i--) {
      const j = Math.floor(shuffle() * (i + 1));
      [room.stream.order[i], room.stream.order[j]] = [room.stream.order[j], room.stream.order[i]];
    }
    room.rng = seeded(seed ^ 0x9e3779b9);
  }
  room.boss = null;
  if (cfg.key === 'boss') {
    const heroes = Math.max(1, [...room.players.values()].filter((p) => p.connected).length);
    const max = Math.round((BOSS_HP * crowdFactor(heroes) ** 1.5) / 100) * 100;
    room.boss = { hp: max, max, down: false };
  }
  if (room.mode === 'teams') startDuel(room, Date.now());
  setPhase(room, 'playing', cfg.duration, () => endRound(room));
  clearInterval(room.ticker);
  room.ticker = setInterval(() => tick(room), 100);
}

function endRound(room) {
  clearInterval(room.ticker);
  room.ticker = null;
  room.words.clear();
  io.to(channel(room)).emit('word:clear');
  if (room.round >= room.rounds.length - 1) {
    if (room.teams) {
      const [a, b] = room.teams.map((t) => t.hp);
      room.winner = a === b ? -1 : a > b ? 0 : 1;
    }
    finishGame(room);
  } else {
    setPhase(room, 'intermission', room.solo ? SOLO_INTERMISSION_MS : INTERMISSION_MS, () => nextRound(room));
  }
}

function finishGame(room) {
  room.summary = summarize(room);
  recordScores(room);
  setPhase(room, 'finished', 0, null);
}

// Each hero's typing stats, plus (when the host has them on) the awards: one hero per award.
function summarize(room) {
  const list = [...room.players.values()];
  const stats = {};
  for (const p of list) {
    const s = p.stats;
    stats[p.id] = {
      wpm: s.typeMs > 0 && s.gapChars >= 5 ? Math.round(s.gapChars / 5 / (s.typeMs / 60000)) : 0,
      acc: s.chars ? Math.round((100 * s.chars) / (s.chars + s.typos)) : 0,
      best: s.bestStreak,
      words: s.words,
    };
  }
  const awards = [];
  if (room.options.awards && !room.solo) {
    const give = (key, title, desc, value, show, min = 1, minWords = 1) => {
      let best = null;
      for (const p of list) {
        const v = value(p);
        if (stats[p.id].words < minWords || v < min) continue;
        if (!best || v > best.v || (v === best.v && p.score > best.p.score)) best = { p, v };
      }
      if (best) awards.push({ key, title, desc, id: best.p.id, value: show(best.v) });
    };
    give('speed', 'SPEED DEMON', 'Fastest typing', (p) => stats[p.id].wpm, (v) => `${v} WPM`, 1, 3);
    give('sharp', 'SHARPSHOOTER', 'Fewest typos', (p) => stats[p.id].acc, (v) => `${v}% accuracy`, 1, 5);
    if (room.options.streaks) give('streak', 'STREAK MASTER', 'Longest streak', (p) => p.stats.bestStreak, (v) => `${v} in a row`, 3);
    give('clutch', 'CLUTCH SAVER', 'Saved words at the last second', (p) => p.stats.clutch, (v) => `${v} close call${v === 1 ? '' : 's'}`);
    give('slayer', room.mode === 'teams' ? 'WORDSMITH' : 'MONSTER SLAYER', room.mode === 'teams' ? 'Most words typed' : 'Most monsters slain',
      (p) => p.kills, (v) => `${v} word${v === 1 ? '' : 's'}`);
    if (room.options.specials && room.mode !== 'teams') {
      give('treasure', 'TREASURE HUNTER', 'Most special words', (p) => p.stats.specials, (v) => `${v} special${v === 1 ? '' : 's'}`);
    }
    const slayer = list.find((p) => p.stats.bossKill);
    if (slayer) awards.push({ key: 'dragon', title: 'DRAGON SLAYER', desc: 'Landed the final blow', id: slayer.id, value: 'K.O.!' });
  }
  return { stats, awards };
}

function recordScores(room) {
  if (room.mode === 'teams') return; // team damage isn't comparable with free-for-all scores
  // A daily run counts only on the day it was for.
  if (room.daily && room.daily !== dayKey()) return;
  const board = room.daily ? 'daily' : room.solo ? 'solo' : 'battle';
  const ranked = [...room.players.values()]
    .sort((a, b) => b.score - a.score || b.kills - a.kills || a.name.localeCompare(b.name));
  room.records = {};
  ranked.forEach((p, i) => {
    if (p.bot || p.flagged || p.score <= 0) return;
    const entry = { id: shortId(), name: p.name, cls: p.cls, color: p.color, skin: p.skin, hair: p.hair, trim: p.trim,
      pet: p.pet, score: p.score, kills: p.kills, at: Date.now() };
    if (!room.solo) Object.assign(entry, { place: i + 1, of: ranked.length });
    const rank = addToHall(board, entry);
    if (rank) room.records[p.id] = { board, rank, entryId: entry.id };
  });
  saveHall();
}

function backToLobby(room) {
  stopTimers(room);
  room.records = {};
  room.summary = null;
  room.boss = null;
  room.teams = null;
  room.winner = null;
  room.ko = false;
  room.effects = [{}, {}];
  room.round = -1;
  room.words.clear();
  room.rounds = roundsFor(room);
  resetPlayers(room);
  io.to(channel(room)).emit('word:clear');
  setPhase(room, 'lobby', 0, null);
}

function tick(room) {
  const now = Date.now();
  for (const [id, k] of room.recentKills) if (now - k.at > 5000) room.recentKills.delete(id);
  if (room.mode === 'teams') {
    duelTick(room, now);
    return;
  }
  const cfg = room.rounds[room.round];

  for (const w of room.words.values()) {
    if (now >= w.spawn + w.dur) {
      room.words.delete(w.id);
      room.escaped.push(w.points);
      io.to(channel(room)).emit('word:escape', { id: w.id });
    }
  }
  if (room.iceUntil && now >= room.iceUntil) {
    room.iceUntil = 0;
    retimeFalling(room, (w) => w.iced, 1 / ICE_FACTOR, now, false);
  }

  if (now >= room.phaseEndsAt - STOP_SPAWN_BEFORE_END_MS) return;

  // More heroes on the field means words disappear faster, so spawn faster too.
  const heroes = Math.max(1, [...room.players.values()].filter((p) => p.connected).length);
  const crowd = crowdFactor(heroes);
  const maxActive = Math.min(12, cfg.maxActive + Math.floor((heroes - 1) / 3));
  const stream = room.stream;
  const fieldEmpty = room.words.size === 0 && now - stream.lastSpawnAt > 500;

  if (now >= stream.nextSpawnAt || fieldEmpty) {
    if (room.words.size < maxActive) {
      spawnWord(room, cfg, now);
      stream.nextSpawnAt = now + roll(room, cfg.spawnEvery[0], cfg.spawnEvery[1]) / crowd;
    } else {
      stream.nextSpawnAt = now + 300;
    }
  }
}

// A round's words: the built-in list for its difficulty plus the host's own words that fit it (twice, so
// they come up often). "Only my words" drops the built-ins when there are enough of the host's.
const FITS = { easy: (n) => n <= 5, medium: (n) => n >= 6 && n <= 8, hard: (n) => n >= 8 };
function poolFor(room, cfg) {
  const key = cfg.pool || cfg.key;
  const mine = room.options.words.filter((w) => FITS[key](w.length));
  if (room.options.onlyMine && mine.length >= MY_WORDS_MIN) return mine;
  return mine.length ? WORDS[key].concat(mine, mine) : WORDS[key];
}

function pickWord(room, cfg) {
  const pool = room.stream.pool || poolFor(room, cfg);
  const { used, order } = room.stream;
  const active = [...room.words.values()].map((w) => w.text);
  // Never let one active word be a prefix of another - typing would auto-hit the shorter one.
  const ok = (t) => !used.has(t) && !active.some((a) => a.startsWith(t) || t.startsWith(a));
  // A daily quest takes the next word in its fixed order; otherwise any word that fits.
  const take = (list) => {
    if (order) return list.find(ok);
    const choices = list.filter(ok);
    return choices[Math.floor(Math.random() * choices.length)];
  };
  let text = take(order || pool);
  if (!text) {
    used.clear();
    text = take(order || pool);
  }
  if (!text) return null;
  used.add(text);
  return text;
}

function pickX(room, now) {
  // Keep new words away from words that are still near the top of the field.
  const near = [...room.words.values()]
    .filter((w) => (now - w.spawn) / w.dur < 0.4)
    .map((w) => w.x);
  let best = 0.5;
  let bestScore = -1;
  for (let i = 0; i < 10; i++) {
    const x = roll(room, 0.12, 0.88);
    const score = near.length ? Math.min(...near.map((n) => Math.abs(n - x))) : room.rng();
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
  const iced = room.iceUntil > now;
  const word = {
    id: room.nextWordId++,
    text,
    x: pickX(room, now),
    spawn: now + SPAWN_LEAD_MS,
    at: now + SPAWN_LEAD_MS, // when it appeared; `spawn` moves when ice retimes it
    dur: Math.round((roll(room, cfg.fall[0], cfg.fall[1]) + Math.max(0, text.length - 5) * 220) * (cfg.pace || 1) * (iced ? ICE_FACTOR : 1)),
    points: text.length * 10 * cfg.multiplier,
  };
  if (iced) word.iced = true;
  const specialRoll = room.rng();
  const kindRoll = room.rng();
  if (room.options.specials && specialRoll < SPECIAL_CHANCE && ![...room.words.values()].some((w) => w.special)) {
    word.special = SPECIALS[Math.floor(kindRoll * SPECIALS.length)];
  }
  room.words.set(word.id, word);
  room.stream.lastSpawnAt = now;
  io.to(channel(room)).emit('word:spawn', word);
}

// Stretch or squeeze the falling words that match, keeping them where they are on screen.
function retimeFalling(room, match, factor, now, iced) {
  const changed = [];
  for (const w of room.words.values()) {
    if (!match(w)) continue;
    const p = clamp01((now - w.spawn) / w.dur);
    w.dur = Math.round(w.dur * factor);
    w.spawn = Math.round(now - p * w.dur);
    w.iced = iced;
    changed.push({ id: w.id, spawn: w.spawn, dur: w.dur });
  }
  if (changed.length) io.to(channel(room)).emit('word:retime', changed);
}

// Ice: every word on screen (and every new one) falls slower for a while.
function freeze(room, now) {
  if (room.iceUntil <= now) retimeFalling(room, (w) => !w.iced, ICE_FACTOR, now, true);
  room.iceUntil = now + ICE_MS;
  io.to(channel(room)).emit('fx:ice', { until: room.iceUntil });
}

// Bomb: blasts every other word on screen; the hero who typed it gets a share of their points.
function blast(room, player, now) {
  let total = 0;
  for (const w of [...room.words.values()]) {
    if (now < w.spawn) continue; // not on screen yet
    const points = Math.round(w.points * BOMB_SHARE);
    room.words.delete(w.id);
    room.recentKills.set(w.id, { by: player.id, at: now });
    total += points;
    player.score += points;
    player.kills += 1;
    player.roundScores[room.round] += points;
    io.to(channel(room)).emit('word:kill', {
      id: w.id, by: player.id, points, score: player.score, kills: player.kills,
      roundScore: player.roundScores[room.round], bomb: true,
    });
  }
  return total;
}

// What a typed word is worth on top of its own points: `factor` (the hero's streak, which this word
// extends, their class perk and a gold word's bonus) multiplies them; `extra` (a skill boost) adds a share
// of the base points on top, so a boost isn't multiplied by a streak. Also moves the hero's perk and skill
// bookkeeping on by one word.
function boost(room, player, w) {
  const o = room.options;
  let factor = 1;
  let mult = 1;
  if (o.streaks) {
    player.streak += 1;
    const step = STREAK_STEPS.find(([n]) => player.streak >= n);
    mult = step ? step[1] : 1;
    if (room.mode === 'teams') mult = Math.min(TEAM_STREAK_MAX, mult);
    factor *= mult;
  }
  const perkDef = o.perks && PERKS[player.cls];
  const perk = Boolean(perkDef && perkDef.test(w, player, room));
  if (perk) factor *= 1 + (typeof perkDef.bonus === 'function' ? perkDef.bonus(room) : perkDef.bonus);
  if (w.special === 'gold') factor *= GOLD_FACTOR;
  let extra = 0;
  if (player.empower) {
    extra = player.empower.extra;
    player.empower.left -= 1;
    if (player.empower.left <= 0) player.empower = null;
  }
  player.typed += 1;
  player.lastLen = w.text.length;
  player.typoSince = false;
  const base = w.points ?? w.dmg ?? 0;
  if (base) player.recent = player.recent.concat(base).slice(-3);
  if (o.skills && player.charge < SKILL_WORDS) player.charge += 1;
  sendCharge(room, player);
  return { factor, mult, perk, extra, streak: o.streaks ? player.streak : 0 };
}

// ---- Skills ----------------------------------------------------------------
// Only the hero's own phone needs to know how charged their skill is.
function sendCharge(room, player) {
  if (!player.socketId) return;
  io.to(player.socketId).emit('skill:charge', {
    on: room.options.skills, charge: player.charge, max: SKILL_WORDS, boost: player.empower ? player.empower.left : 0,
  });
}

function addScore(room, player, points) {
  player.score += points;
  player.roundScores[room.round] += points;
}

// Order words (or attacks in the air) for a strike: closest to the ground, newest, most valuable or random.
function pickTargets(list, pick, progress, value) {
  if (pick === 'low') return list.sort((a, b) => progress(b) - progress(a));
  if (pick === 'high') return list.sort((a, b) => progress(a) - progress(b));
  if (pick === 'rich') return list.sort((a, b) => value(b) - value(a));
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// What a strike will hit, worked out before anything happens so every screen can play the effect from
// the hero to each target. Free for all and solo: words on screen; hits that would find nothing (a
// nearly empty field) are `missed` and carry over as a boost on the hero's next words, so a strike is
// worth the same however busy the field is. Team battle: attacks flying at the hero's team, then, if
// there are fewer, the team's own attack words to fire (up to SKILL_LAUNCHES).
function planStrike(room, player, pick, count, now) {
  if (room.mode === 'teams') {
    const incoming = [...room.words.values()].filter((w) => w.kind === 'missile' && w.team !== player.team);
    const words = pickTargets(incoming, pick, (x) => (now - x.launch) / x.dur, (x) => x.dmg).slice(0, count);
    const launches = Math.min(SKILL_LAUNCHES, Math.max(0, count - words.length));
    const slots = [...room.words.values()].filter((w) => w.kind === 'attack' && w.team === player.team)
      .sort((a, b) => a.id - b.id).slice(0, launches);
    return { words, slots, missed: 0 };
  }
  const list = [...room.words.values()].filter((w) => now >= w.spawn);
  const words = pickTargets(list, pick, (x) => (now - x.spawn) / x.dur, (x) => x.points).slice(0, count);
  return { words, slots: [], missed: count - words.length };
}

// Lands a planned strike for (a share of) each target's points. Returns the points scored.
function applyStrike(room, player, plan, share, now) {
  let total = 0;
  if (plan.missed > 0) {
    const had = player.empower;
    player.empower = { left: (had ? had.left : 0) + plan.missed, extra: Math.max(share, had ? had.extra : 0) };
  }
  for (const w of plan.words) {
    const points = Math.round((w.kind ? w.dmg : w.points * (w.special === 'gold' ? GOLD_FACTOR : 1)) * share);
    room.words.delete(w.id);
    room.recentKills.set(w.id, { by: player.id, at: now });
    addScore(room, player, points);
    player.kills += 1;
    total += points;
    const common = { id: w.id, by: player.id, score: player.score, kills: player.kills, roundScore: player.roundScores[room.round], skill: true };
    if (w.kind) io.to(channel(room)).emit('duel:block', { ...common, gained: points });
    else io.to(channel(room)).emit('word:kill', { ...common, points });
  }
  const cfg = room.rounds[room.round];
  for (const slot of plan.slots) {
    room.words.delete(slot.id);
    const m = {
      id: room.nextWordId++, kind: 'missile', team: slot.team, by: player.id, text: slot.text, at: now,
      launch: now, dur: flightMs(room, slot.team, now), dmg: Math.round(slot.points * share),
    };
    room.words.set(m.id, m);
    io.to(channel(room)).emit('duel:launch', { slot: slot.id, missile: m, skill: true });
    addSlot(room, slot.team, cfg);
  }
  return total;
}

function useSkill(room, player, now) {
  const s = SKILLS[player.cls] || SKILLS.knight;
  const teams = room.mode === 'teams';
  let plan = { words: [], slots: [], missed: 0 };
  let back = [];
  if (s.kind === 'strike') plan = planStrike(room, player, s.pick, s.count, now);
  if (s.kind === 'raise') {
    // Words that got away this round come back as points; in a team battle, the last hits your team took
    // are healed. If there aren't enough, the rest strike like a Rogue's Backstab.
    const pool = teams ? room.hits[player.team] : room.escaped;
    back = pool.splice(Math.max(0, pool.length - s.count));
    if (back.length < s.count) plan = planStrike(room, player, 'low', s.count - back.length, now);
  }
  // Everyone hears about it first, so the effect plays from this hero to these targets as the hits land.
  io.to(channel(room)).emit('skill:cast', {
    id: player.id, skill: player.cls, name: s.name, kind: s.kind,
    targets: plan.words.map((w) => w.id), launches: plan.slots.map((w) => w.id), souls: back.length,
    boost: s.kind === 'empower' ? s.count : plan.missed,
  });
  let total = 0;
  if (s.kind === 'empower') {
    player.empower = { left: s.count, extra: s.mult - 1 };
  } else if (s.kind === 'strike') {
    total = applyStrike(room, player, plan, s.share, now);
  } else if (s.kind === 'raise') {
    total = back.reduce((a, b) => a + b, 0);
    if (teams) {
      const t = room.teams[player.team];
      t.hp = Math.min(t.max, t.hp + total);
    } else {
      addScore(room, player, total);
    }
    total += applyStrike(room, player, plan, 1, now);
  } else if (s.kind === 'encore') {
    // Your last few words score again; in a team battle they hit the other team directly.
    total = player.recent.reduce((a, b) => a + b, 0);
    addScore(room, player, total);
    if (teams) {
      const t = room.teams[1 - player.team];
      t.hp = Math.max(0, t.hp - total);
    }
  }
  if (!teams) hurtBoss(room, player, total);
  io.to(channel(room)).emit('skill:use', {
    id: player.id, cls: player.cls, name: s.name, kind: s.kind, total,
    score: player.score, roundScore: player.roundScores[room.round], kills: player.kills,
    hp: room.teams ? room.teams.map((t) => t.hp) : null,
  });
  if (teams && s.kind === 'encore' && room.teams[1 - player.team].hp === 0) knockOut(room, player.team);
}

function trackStats(player, w, keys, p) {
  const s = player.stats;
  s.words += 1;
  s.chars += w.text.length;
  s.gapChars += w.text.length - 1;
  s.typeMs += keys.reduce((a, b) => a + Number(b), 0);
  s.bestStreak = Math.max(s.bestStreak, player.streak);
  if (p !== null && p > CLUTCH_PROGRESS) s.clutch += 1;
  if (w.special) s.specials += 1;
}

// Boss round: every point scored is damage. When it falls, everyone who hurt it gets a bonus and the
// round ends after the fall plays out.
function hurtBoss(room, player, dmg) {
  const b = room.boss;
  if (!b || b.down || dmg <= 0) return;
  b.hp = Math.max(0, b.hp - dmg);
  player.stats.bossDmg += dmg;
  if (b.hp > 0) {
    io.to(channel(room)).emit('boss:hit', { hp: b.hp, by: player.id, dmg });
    return;
  }
  b.down = true;
  player.stats.bossKill = true;
  player.score += BOSS_FINISH_BONUS;
  player.roundScores[room.round] += BOSS_FINISH_BONUS;
  for (const p of room.players.values()) {
    if (p.stats.bossDmg <= 0) continue;
    p.score += BOSS_CLEAR_BONUS;
    p.roundScores[room.round] += BOSS_CLEAR_BONUS;
  }
  clearInterval(room.ticker);
  room.ticker = null;
  room.words.clear();
  io.to(channel(room)).emit('boss:down', { by: player.id, finish: BOSS_FINISH_BONUS, clear: BOSS_CLEAR_BONUS });
  broadcastPlayers(room);
  setPhase(room, 'playing', BOSS_DOWN_MS, () => endRound(room));
}

// ---- Team battle (duel) ----------------------------------------------------
// Two armies face off. Each team has a few attack words; typing one launches it across the field at the
// other team, carrying its word. The other team can type an incoming word to block it before it lands.
// Now and then a power-up word floats in the middle; whichever team types it first gets the power.
// Everything typeable lives in room.words with a kind: 'attack' (a team's slot), 'missile' (in flight)
// or 'power'.

function slotCount(room, team) {
  return Math.min(6, Math.max(3, teamCounts(room)[team] + 1));
}

function addSlot(room, team, cfg) {
  const text = pickWord(room, cfg);
  if (!text) return;
  const slot = { id: room.nextWordId++, kind: 'attack', team, text, points: text.length * 10 * cfg.multiplier, at: Date.now() };
  room.words.set(slot.id, slot);
  io.to(channel(room)).emit('word:spawn', slot);
}

function startDuel(room, now) {
  const cfg = room.rounds[room.round];
  room.effects = [{}, {}];
  room.nextPowerAt = now + rand(POWER_FIRST_MS[0], POWER_FIRST_MS[1]);
  for (const team of [0, 1]) for (let i = 0; i < slotCount(room, team); i++) addSlot(room, team, cfg);
}

const effectOn = (room, team, name, now) => (room.effects[team][name] || 0) > now;

// Flight time for a new attack from `team`: Haste on the attacker speeds it up, Slow Time on the target slows it.
function flightMs(room, team, now) {
  let ms = room.rounds[room.round].flight;
  if (effectOn(room, team, 'haste', now)) ms *= HASTE_FACTOR;
  if (effectOn(room, 1 - team, 'slow', now)) ms *= SLOW_FACTOR;
  return Math.round(ms);
}

// Stretch or squeeze attacks already in the air, keeping them where they are on screen.
function retime(room, match, factor, now) {
  const changed = [];
  for (const w of room.words.values()) {
    if (w.kind !== 'missile' || !match(w)) continue;
    const p = Math.min(1, Math.max(0, (now - w.launch) / w.dur));
    w.dur = Math.round(w.dur * factor);
    w.launch = Math.round(now - p * w.dur);
    changed.push({ id: w.id, launch: w.launch, dur: w.dur });
  }
  if (changed.length) io.to(channel(room)).emit('duel:retime', changed);
}

function spawnPower(room, cfg, now) {
  const text = pickWord(room, cfg);
  if (!text) return;
  const power = POWERS[Math.floor(Math.random() * POWERS.length)];
  const w = { id: room.nextWordId++, kind: 'power', power, text, spawn: now, dur: POWER_LIFE_MS };
  room.words.set(w.id, w);
  io.to(channel(room)).emit('word:spawn', w);
}

// strength > 1: a cleric's perk makes the potion heal more and the effect last longer.
function applyPower(room, team, power, now, strength = 1) {
  if (power === 'potion') {
    const t = room.teams[team];
    t.hp = Math.min(t.max, t.hp + Math.round((t.max * POTION_HEAL * strength) / 10) * 10);
    return;
  }
  room.effects[team][power] = now + Math.round(EFFECT_MS[power] * strength);
  if (power === 'slow') retime(room, (w) => w.team !== team, SLOW_FACTOR, now);
  if (power === 'haste') retime(room, (w) => w.team === team, HASTE_FACTOR, now);
}

function land(room, m, now) {
  room.words.delete(m.id);
  const target = 1 - m.team;
  const shielded = effectOn(room, target, 'shield', now);
  const dmg = shielded ? 0 : m.dmg;
  const t = room.teams[target];
  t.hp = Math.max(0, t.hp - dmg);
  if (dmg) room.hits[target].push(dmg);
  const p = room.players.get(m.by);
  if (p) {
    p.score += dmg;
    p.roundScores[room.round] += dmg;
  }
  io.to(channel(room)).emit('duel:hit', {
    id: m.id, team: target, dmg, shielded, by: m.by, score: p ? p.score : 0,
    roundScore: p ? p.roundScores[room.round] : 0, hp: room.teams.map((x) => x.hp),
  });
  if (t.hp === 0) knockOut(room, m.team);
}

function duelTick(room, now) {
  for (const w of [...room.words.values()]) {
    if (room.ko) return;
    if (w.kind === 'missile' && now >= w.launch + w.dur) land(room, w, now);
    if (w.kind === 'power' && now >= w.spawn + w.dur) {
      room.words.delete(w.id);
      room.nextPowerAt = now + rand(POWER_EVERY_MS[0], POWER_EVERY_MS[1]);
      io.to(channel(room)).emit('word:escape', { id: w.id });
    }
  }
  const hasPower = [...room.words.values()].some((w) => w.kind === 'power');
  if (!hasPower && now >= room.nextPowerAt && now < room.phaseEndsAt - POWER_LIFE_MS / 2) {
    spawnPower(room, room.rounds[room.round], now);
  }
}

// Returns the reply for a team battle claim; `p` (how far an attack had flown) feeds the stats.
function duelClaim(room, player, w, now) {
  const cfg = room.rounds[room.round];
  if (w.kind === 'attack') {
    if (w.team !== player.team) return { ok: false, reason: 'other-team' };
    const g = boost(room, player, w);
    room.words.delete(w.id);
    const fury = effectOn(room, w.team, 'fury', now) ? 2 : 1;
    const m = {
      id: room.nextWordId++, kind: 'missile', team: w.team, by: player.id, text: w.text, at: now,
      launch: now, dur: flightMs(room, w.team, now), dmg: Math.round(w.points * fury * g.factor) + Math.round(w.points * g.extra),
    };
    room.words.set(m.id, m);
    player.kills += 1;
    io.to(channel(room)).emit('duel:launch', { slot: w.id, missile: m, streak: g.streak, mult: g.mult, perk: g.perk, boosted: g.extra > 0 });
    addSlot(room, w.team, cfg);
    return { ok: true, p: null };
  }
  if (w.kind === 'missile') {
    if (w.team === player.team) return { ok: false, reason: 'own-attack' };
    const p = clamp01((now - w.launch) / w.dur);
    const g = boost(room, player, w);
    const gained = Math.round(w.dmg * g.factor) + Math.round(w.dmg * g.extra);
    room.words.delete(w.id);
    player.score += gained; // blocked damage counts toward your score
    player.kills += 1;
    player.roundScores[room.round] += gained;
    io.to(channel(room)).emit('duel:block', {
      id: w.id, by: player.id, score: player.score, kills: player.kills, roundScore: player.roundScores[room.round],
      gained, streak: g.streak, mult: g.mult, perk: g.perk, boosted: g.extra > 0,
    });
    return { ok: true, p };
  }
  // Power-up: first team to type it gets it.
  const g = boost(room, player, w);
  room.words.delete(w.id);
  applyPower(room, player.team, w.power, now, g.perk ? CLERIC_POWER_BOOST : 1);
  player.kills += 1;
  room.nextPowerAt = now + rand(POWER_EVERY_MS[0], POWER_EVERY_MS[1]);
  io.to(channel(room)).emit('duel:power', {
    id: w.id, by: player.id, team: player.team, power: w.power, effects: room.effects, hp: room.teams.map((x) => x.hp),
    streak: g.streak, perk: g.perk,
  });
  return { ok: true, p: null };
}

// ---- Auto-type guard -------------------------------------------------------
// Auto-typer programs press real keys, so the phone can't tell them apart from a person. What gives them
// away is timing: they type faster than anyone can, or with gaps that are far too even. Returns why a
// claim looks machine-typed, or null if it looks human.
function autoTyped(player, word, keys, now) {
  const n = word.text.length;
  if (!Array.isArray(keys) || keys.length !== n - 1) return 'no-keys';
  const gaps = keys.map(Number);
  if (gaps.some((g) => !Number.isFinite(g) || g < 0 || g > 60000)) return 'no-keys';
  player.keyGaps = player.keyGaps.concat(gaps).slice(-KEY_SAMPLE);
  const total = gaps.reduce((a, b) => a + b, 0);
  if (total < KEY_MIN_MS * (n - 1)) return 'too-fast';
  // Attack slots and attacks in the air carry `at`; falling words and power-ups `spawn`.
  const shownAt = word.at ?? word.spawn;
  if (total > now - shownAt + KEY_CLOCK_SLACK_MS) return 'clock';
  const recent = player.keyGaps;
  if (recent.length >= KEY_SAMPLE_MIN) {
    const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
    const spread = Math.sqrt(recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length);
    if (spread / mean < KEY_EVEN_CV) return 'too-even';
  }
  return null;
}

// A blocked word stays on the field for everyone else. Enough of them and the host sees a warning and the
// player's scores stay out of the hall of fame.
function blockClaim(room, player, why) {
  player.strikes += 1;
  if (player.strikes >= FLAG_AFTER && !player.flagged) {
    player.flagged = true;
    console.log(`Room ${room.code}: ${player.name} flagged as a suspected auto-typer (${why})`);
    broadcastPlayers(room);
  }
  return { ok: false, reason: 'auto', why };
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

  socket.emit('build', BUILD);
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
    room.rounds = roundsFor(room);
    broadcastState(room);
  });

  // Game options: on/off switches plus the host's own word list (sent as the text they typed).
  socket.on('host:options', (data) => {
    const { room, isHost } = ctx();
    if (!isHost || !['lobby', 'finished'].includes(room.state)) return;
    for (const k of OPTION_KEYS) if (typeof data?.[k] === 'boolean') room.options[k] = data[k];
    if (typeof data?.onlyMine === 'boolean') room.options.onlyMine = data.onlyMine;
    if (LENGTHS.includes(data?.length)) room.options.length = data.length;
    if (LEVEL_KEYS.includes(data?.level)) room.options.level = data.level;
    if (typeof data?.words === 'string') room.options.words = cleanWords(data.words);
    room.rounds = roundsFor(room);
    broadcastState(room);
  });

  socket.on('host:shuffle', () => {
    const { room, isHost } = ctx();
    if (!isHost || room.state !== 'lobby') return;
    balanceTeams(room, true);
    broadcastPlayers(room);
  });

  socket.on('host:move', (data) => {
    const { room, isHost } = ctx();
    const p = isHost && room.state === 'lobby' && room.players.get(data?.id);
    if (!p) return;
    p.team = 1 - p.team;
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
    p.roundScores = room.rounds.map(() => 0); // may include the boss round
    p.team = smallerTeam(room);
    room.players.set(p.id, p);
    attachPlayer(room, p);
    broadcastPlayers(room);
    reply(cb, { ok: true, token: p.token, you: p.id, snapshot: snapshot(room) });
    sendCharge(room, p);
  });

  socket.on('player:team', () => {
    const { room, player } = ctx();
    if (!player || room.solo || room.state !== 'lobby') return;
    player.team = 1 - player.team;
    broadcastPlayers(room);
  });

  socket.on('solo:start', (data, cb) => {
    leaveRoom();
    const room = createRoom(true, Boolean(data?.daily));
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
    sendCharge(room, p);
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
    const now = Date.now();
    const why = autoTyped(player, word, data?.keys, now);
    if (why) return reply(cb, blockClaim(room, player, why));
    if (room.mode === 'teams') {
      const res = duelClaim(room, player, word, now);
      if (res.ok) {
        room.recentKills.set(id, { by: player.id, at: now });
        trackStats(player, word, data.keys, res.p);
      }
      return reply(cb, res);
    }

    const p = clamp01((now - word.spawn) / word.dur);
    const g = boost(room, player, word);
    const points = Math.round(word.points * g.factor) + Math.round(word.points * g.extra);
    room.words.delete(id);
    room.recentKills.set(id, { by: player.id, at: now });
    player.score += points;
    player.kills += 1;
    player.roundScores[room.round] += points;
    trackStats(player, word, data.keys, p);
    io.to(channel(room)).emit('word:kill', {
      id, by: player.id, points, score: player.score, kills: player.kills, roundScore: player.roundScores[room.round],
      streak: g.streak, mult: g.mult, perk: g.perk, boosted: g.extra > 0, special: word.special || null,
    });
    let dealt = points;
    if (word.special === 'ice') freeze(room, now);
    if (word.special === 'bomb') dealt += blast(room, player, now);
    hurtBoss(room, player, dealt);
    reply(cb, { ok: true, points });
  });

  // A wrong key: counts against accuracy and ends the hero's streak.
  socket.on('player:typo', () => {
    const { room, player } = ctx();
    if (!player || room.state !== 'playing') return;
    player.stats.typos += 1;
    player.typoSince = true; // the ninja's perk is for words typed clean
    if (!player.streak) return;
    const lost = player.streak;
    player.streak = 0;
    if (room.options.streaks) io.to(channel(room)).emit('player:streak', { id: player.id, streak: 0, lost });
  });

  socket.on('player:skill', (_data, cb) => {
    const { room, player } = ctx();
    const live = player && room.options.skills && room.state === 'playing' && !room.ko && !(room.boss && room.boss.down);
    if (!live) return reply(cb, { ok: false, reason: 'not-now' });
    if (player.charge < SKILL_WORDS) return reply(cb, { ok: false, reason: 'charging' });
    player.charge = 0;
    useSkill(room, player, Date.now());
    sendCharge(room, player);
    reply(cb, { ok: true });
  });

  // Lobby chat. Replies { ok } or { ok: false, reason } so the phone can say why a message didn't go.
  socket.on('chat:send', (data, cb) => {
    const { room, player } = ctx();
    if (!player || room.solo) return reply(cb, { ok: false, reason: 'not-here' });
    if (!room.options.chat) return reply(cb, { ok: false, reason: 'off' });
    if (room.state !== 'lobby') return reply(cb, { ok: false, reason: 'not-lobby' });
    const text = cleanChat(data?.text);
    if (!text) return reply(cb, { ok: false, reason: 'empty' });
    const t = Date.now();
    if (t - (player.lastChat || 0) < CHAT_GAP_MS || text === player.lastChatText) return reply(cb, { ok: false, reason: 'slow' });
    player.lastChat = t;
    player.lastChatText = text;
    const msg = { id: shortId(), by: player.id, name: player.name, color: player.color, text, at: t };
    room.chat = room.chat.concat(msg).slice(-CHAT_LOG);
    io.to(channel(room)).emit('chat:msg', msg);
    reply(cb, { ok: true });
  });

  socket.on('host:chatClear', () => {
    const { room, isHost } = ctx();
    if (!isHost) return;
    room.chat = [];
    io.to(channel(room)).emit('chat:clear');
  });

  socket.on('player:emote', (data) => {
    const { room, player } = ctx();
    if (!player || room.solo || !room.options.emotes) return;
    const t = Date.now();
    if (t - (player.lastEmote || 0) < EMOTE_GAP_MS) return;
    player.lastEmote = t;
    io.to(channel(room)).emit('player:emote', { id: player.id, e: clampInt(data?.e, EMOTE_COUNT) });
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
