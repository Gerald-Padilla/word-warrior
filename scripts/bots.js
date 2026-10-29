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

  socket.on('connect', () => {
    const hero = { code, name, cls: CLASSES[i % CLASSES.length], color: i % 8, skin: i % 4, bot: true }; // bots stay out of the hall of fame
    socket.emit('player:join', hero, (res) => {
      console.log(res.ok ? `${name} joined (${cps.toFixed(1)} cps)` : `${name} failed: ${res.error}`);
    });
  });

  socket.on('word:spawn', (w) => {
    alive.add(w.id);
    // Wait until the word is visible, "read" it, then type it.
    const delay = Math.max(0, w.spawn - Date.now()) + 500 + Math.random() * 1500 + (w.text.length / cps) * 1000;
    setTimeout(() => {
      if (alive.has(w.id) && Math.random() < 0.85) socket.emit('player:claim', { id: w.id, text: w.text }, () => {});
    }, delay);
  });
  socket.on('word:kill', ({ id }) => alive.delete(id));
  socket.on('word:escape', ({ id }) => alive.delete(id));
  socket.on('word:clear', () => alive.clear());
}
