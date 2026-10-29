// Host / big-screen controller: QR lobby, live battlefield, leaderboard and podium.
(function () {
  const { $, el, syncClock, rankPlayers, Sfx } = window.WW;
  const { heroDataURL } = window.Art;

  const socket = io();
  let offset = 0;
  const now = () => Date.now() + offset;
  const arena = new Arena($('#arena'), { mode: 'host', now });

  let code = null;
  let rounds = [];
  let players = [];
  let state = { state: 'connecting', round: -1, phaseEndsAt: 0 };
  let records = {}; // playerId -> hall-of-fame entry earned in the last game
  let lastCount = 0;
  let lastBeep = null;
  const prevScores = new Map();

  const ack = (ev, data) => new Promise((res) => socket.emit(ev, data, res));
  const show = (sel, on) => $(sel).classList.toggle('hidden', !on);
  const store = {
    get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };

  // ---- connection ----------------------------------------------------
  socket.on('connect', async () => {
    offset = await syncClock(socket);
    let res = null;
    const saved = store.get('ww_host');
    if (saved) res = await ack('host:resume', saved);
    if (!res || !res.ok) res = await ack('host:create', {});
    store.set('ww_host', { code: res.snapshot.code, hostToken: res.hostToken });
    load(res.snapshot);
  });

  socket.on('room:players', (list) => setPlayers(list));
  socket.on('room:state', (s) => applyState(s));
  socket.on('word:spawn', (w) => arena.addWord(w));
  socket.on('word:escape', ({ id }) => arena.escape(id));
  socket.on('word:clear', () => arena.clearWords());
  socket.on('word:kill', (k) => {
    const p = players.find((pl) => pl.id === k.by);
    if (p) {
      p.score = k.score;
      p.kills = k.kills;
      if (state.round >= 0) p.roundScores[state.round] = k.roundScore;
    }
    arena.kill(k.id, k.by, k.points);
    Sfx.play('shoot');
    scheduleBoard();
  });
  socket.on('room:closed', () => {
    store.set('ww_host', null);
    location.reload();
  });

  arena.onHit = () => Sfx.play('hit');
  arena.onEscape = () => Sfx.play('escape');

  function load(snap) {
    code = snap.code;
    rounds = snap.rounds;
    $('#roomCode').textContent = code;
    $('#hudCode').textContent = code;
    setPlayers(snap.players);
    arena.setWords(snap.words);
    applyState(snap);
    setupJoinUrl();
  }

  // ---- join link + QR ------------------------------------------------
  async function setupJoinUrl() {
    let net = { port: location.port, publicUrl: '', addresses: [] };
    try {
      net = await fetch('/api/network').then((r) => r.json());
    } catch (e) { /* fall back to this origin */ }
    const isLocal = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname);
    const bases = [];
    if (net.publicUrl) bases.push({ url: net.publicUrl, label: 'Public URL' });
    if (!isLocal) bases.push({ url: location.origin, label: 'This address' });
    for (const a of net.addresses) bases.push({ url: `http://${a.address}:${net.port}`, label: `${a.address} (${a.name})` });
    if (!bases.length) bases.push({ url: location.origin, label: 'This address' });
    const unique = bases.filter((b, i) => bases.findIndex((o) => o.url === b.url) === i);

    const pick = $('#netPick');
    pick.innerHTML = '';
    for (const b of unique) pick.append(el('option', { value: b.url, text: b.label }));
    let saved = null;
    try { saved = localStorage.getItem('ww_base'); } catch (e) { /* ignore */ }
    if (saved && unique.some((b) => b.url === saved)) pick.value = saved;
    show('#netPick', unique.length > 1);
    show('#netHelp', unique.length > 1);
    pick.onchange = () => {
      try { localStorage.setItem('ww_base', pick.value); } catch (e) { /* ignore */ }
      setJoinBase(pick.value);
    };
    setJoinBase(pick.value || unique[0].url);
  }

  function setJoinBase(base) {
    const url = `${base}/play?room=${code}`;
    const qr = `/api/qr?text=${encodeURIComponent(url)}`;
    $('#qr').src = qr;
    $('#hudQr').src = qr;
    $('#joinUrl').textContent = url.replace(/^https?:\/\//, '');
    $('#soloUrl').textContent = `${base}/play`.replace(/^https?:\/\//, '');
  }

  // ---- players -------------------------------------------------------
  function setPlayers(list) {
    players = list;
    arena.setPlayers(list);
    if (list.length > lastCount && state.state === 'lobby') Sfx.play('join');
    lastCount = list.length;
    renderRoster();
    scheduleBoard();
  }

  function heroImg(p, cls = 'px-sprite') {
    return el('img', { class: cls, src: heroDataURL(p), alt: '' });
  }

  function renderRoster() {
    const roster = $('#roster');
    roster.innerHTML = '';
    $('#count').textContent = players.length;
    if (!players.length) {
      roster.append(el('div', { class: 'roster-empty', text: 'No heroes yet... Scan the QR code to join the battle!' }));
    }
    for (const p of players) {
      roster.append(el('button', {
        class: `hero-tile${p.connected ? '' : ' off'}`,
        title: `Remove ${p.name}`,
        onclick: () => {
          if (confirm(`Remove ${p.name} from the battle?`)) socket.emit('host:kick', { id: p.id });
        },
      }, [heroImg(p, 'px-sprite bob'), el('div', { class: 'nm', text: p.name }), el('div', { class: 'x', text: 'X' })]));
    }
    $('#btnStart').disabled = !players.length;
    $('#startHint').textContent = players.length
      ? `${players.length} hero${players.length === 1 ? '' : 'es'} ready. Start when everyone is in!`
      : 'Waiting for heroes to join...';
  }

  let boardQueued = false;
  function scheduleBoard() {
    if (boardQueued) return;
    boardQueued = true;
    setTimeout(() => {
      boardQueued = false;
      renderBoard();
    }, 150);
  }

  function renderBoard() {
    const list = $('#boardList');
    list.innerHTML = '';
    rankPlayers(players).slice(0, 10).forEach((p, i) => {
      const bumped = prevScores.has(p.id) && prevScores.get(p.id) !== p.score;
      list.append(el('li', { class: `row r${i + 1}${bumped ? ' bump' : ''}` }, [
        el('span', { class: 'rk', text: `${i + 1}.` }),
        heroImg(p),
        el('span', { class: 'nm', text: p.name }),
        el('span', { class: 'sc', text: p.score }),
      ]));
    });
    // Drop rows that would be cut off on shorter screens.
    const board = $('#board');
    while (list.children.length > 3 && board.scrollHeight > board.clientHeight) list.lastChild.remove();
    for (const p of players) prevScores.set(p.id, p.score);
  }

  // ---- phases --------------------------------------------------------
  const DIFF_CLASS = ['d-easy', 'd-medium', 'd-hard'];
  const ROUND_OUTRO = [
    'The slime swarm has been squished!',
    'The bat storm has been grounded!',
    'The skull inferno is extinguished!',
  ];

  function applyState(s) {
    const prev = state.state;
    state = { state: s.state, round: s.round, phaseEndsAt: s.phaseEndsAt };
    if (s.records) records = s.records;
    if (s.players) setPlayers(s.players);
    const r = rounds[s.round];
    const st = s.state;
    const fighting = st === 'countdown' || st === 'playing';

    if (st !== 'lobby' && st !== 'finished') show('#hof', false);
    show('#lobby', st === 'lobby');
    show('#hud', fighting || st === 'intermission');
    show('#board', fighting);
    show('#banner', st === 'countdown');
    show('#inter', st === 'intermission');
    show('#final', st === 'finished');
    arena.setReserveRight(fighting ? 340 : 0);
    const hudH = st === 'lobby' || st === 'finished' ? 0 : $('#hud').offsetHeight;
    arena.setReserveTop(hudH);
    $('#board').style.top = `${hudH + 18}px`;
    $('#board').style.maxHeight = `calc(100vh - ${hudH + 18}px - 24vh)`;

    if (st === 'lobby') {
      arena.setTheme('slime');
      arena.clearWords();
    }
    if (r) {
      arena.setTheme(r.monster);
      $('#hudRound').textContent = `ROUND ${s.round + 1} · ${r.name}`;
      $('#hudTitle').textContent = `${r.title} · x${r.multiplier} points`;
      $('#bRound').textContent = `ROUND ${s.round + 1}`;
      $('#bDiff').textContent = r.name;
      $('#bDiff').className = `b-diff ${DIFF_CLASS[s.round] || ''}`;
      $('#bTitle').textContent = `${r.title} — words worth x${r.multiplier}`;
    }

    if (st === 'countdown' && prev !== 'countdown') {
      lastBeep = null;
      Sfx.play('round');
      prevScores.clear();
      renderBoard();
    }
    if (st === 'playing' && prev === 'countdown') {
      Sfx.play('go');
      show('#banner', true);
      $('#bCount').textContent = 'FIGHT!';
      setTimeout(() => { if (state.state === 'playing') show('#banner', false); }, 700);
    }
    if (st === 'intermission') renderInter();
    if (st === 'finished' && prev !== 'finished') {
      renderFinal();
      arena.confetti();
      Sfx.play('win');
    }
  }

  function renderInter() {
    const r = state.round;
    $('#iTitle').textContent = `ROUND ${r + 1} COMPLETE!`;
    $('#iSub').textContent = ROUND_OUTRO[r] || '';
    const table = $('#iTable');
    table.innerHTML = '';
    table.append(el('div', { class: 'row head' }, [
      el('span', { text: '#' }), el('span'), el('span', { text: 'HERO' }),
      el('span', { class: 'rs', text: 'ROUND' }), el('span', { class: 'sc', text: 'TOTAL' }),
    ]));
    rankPlayers(players).slice(0, 8).forEach((p, i) => {
      table.append(el('div', { class: `row r${i + 1}` }, [
        el('span', { class: 'rk', text: `${i + 1}.` }),
        heroImg(p),
        el('span', { class: 'nm', text: p.name }),
        el('span', { class: 'rs', text: `+${p.roundScores[r] || 0}` }),
        el('span', { class: 'sc', text: p.score }),
      ]));
    });
    tick(); // fill in the "next round" line before measuring
    const card = $('.inter-card');
    while (table.children.length > 4 && card.scrollHeight > card.clientHeight) table.lastChild.remove();
  }

  function renderFinal() {
    const ranked = rankPlayers(players);
    const podium = $('#podium');
    podium.innerHTML = '';
    const order = [[1, 'p2'], [0, 'p1'], [2, 'p3']];
    for (const [idx, cls] of order) {
      const p = ranked[idx];
      if (!p) continue;
      const rec = records[p.id];
      podium.append(el('div', { class: `pod ${cls}` }, [
        heroImg(p),
        el('div', { class: 'nm', text: p.name }),
        rec ? el('div', { class: 'rec blink', text: rec.rank === 1 ? 'NEW HIGH SCORE!' : `HALL OF FAME #${rec.rank}` }) : null,
        el('div', { class: 'sc', text: `${p.score} PTS` }),
        el('div', { class: 'ko', text: `${p.kills} MONSTERS SLAIN` }),
        el('div', { class: 'block', text: idx + 1 }),
      ]));
    }
    const rest = $('#finalRest');
    rest.innerHTML = '';
    ranked.slice(3, 15).forEach((p, i) => {
      rest.append(el('div', { class: 'row' }, [
        el('span', { class: 'rk', text: `${i + 4}.` }),
        heroImg(p),
        el('span', { class: 'nm', text: p.name }),
        el('span', { class: 'sc', text: p.score }),
      ]));
    });
  }

  function tick() {
    const left = Math.max(0, state.phaseEndsAt - now());
    if (state.state === 'countdown') {
      const n = Math.ceil(left / 1000);
      const label = n > 3 ? 'READY?' : String(Math.max(1, n));
      if (label !== lastBeep) {
        lastBeep = label;
        if (n <= 3) Sfx.play('beep');
      }
      $('#bCount').textContent = label;
    }
    const r = rounds[state.round];
    if (r && (state.state === 'playing' || state.state === 'countdown')) {
      const frac = state.state === 'countdown' ? 1 : left / r.duration;
      $('#timeFill').style.width = `${frac * 100}%`;
      $('#timeFill').classList.toggle('low', state.state === 'playing' && left < 10000);
      const secs = state.state === 'countdown' ? Math.round(r.duration / 1000) : Math.ceil(left / 1000);
      $('#timeText').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    }
    if (state.state === 'intermission') {
      $('#timeFill').style.width = '0%';
      $('#timeText').textContent = 'BREAK';
      const next = rounds[state.round + 1];
      if (next) {
        $('#iNext').innerHTML = '';
        $('#iNext').append(
          'NEXT: ', el('b', { text: `ROUND ${state.round + 2} · ${next.name}` }),
          ` — ${next.title} (x${next.multiplier}) in ${Math.ceil(left / 1000)}s`,
        );
      }
    }
  }
  setInterval(tick, 100);

  // ---- hall of fame --------------------------------------------------
  const fmtDate = (t) => new Date(t).toLocaleDateString('en', { day: 'numeric', month: 'short' }).toUpperCase();

  function renderHofList(box, list, emptyText) {
    box.innerHTML = '';
    if (!list) return box.append(el('div', { class: 'hof-empty', text: 'Loading...' }));
    if (!list.length) return box.append(el('div', { class: 'hof-empty', text: emptyText }));
    list.forEach((e, i) => {
      const sub = e.place ? `#${e.place} of ${e.of} · ${fmtDate(e.at)}` : `${e.kills} slain · ${fmtDate(e.at)}`;
      box.append(el('div', { class: `row r${i + 1}` }, [
        el('span', { class: 'rk', text: `${i + 1}.` }),
        heroImg(e),
        el('span', { class: 'nm' }, [e.name, el('small', { text: sub })]),
        el('span', { class: 'sc', text: e.score }),
      ]));
    });
  }

  async function openHof() {
    show('#hof', true);
    renderHofList($('#hofBattle'), null);
    renderHofList($('#hofSolo'), null);
    let hof = { battle: [], solo: [] };
    try {
      hof = await fetch('/api/highscores', { cache: 'no-store' }).then((r) => r.json());
    } catch (e) { /* show empty boards */ }
    renderHofList($('#hofBattle'), hof.battle, 'No battles recorded yet. Win one to get your name up here!');
    renderHofList($('#hofSolo'), hof.solo, 'No solo quests yet.');
  }

  // ---- controls ------------------------------------------------------
  document.addEventListener('pointerdown', () => Sfx.unlock(), { once: false });
  $('#btnStart').onclick = () => {
    Sfx.unlock();
    socket.emit('host:start');
  };
  $('#btnAgain').onclick = () => socket.emit('host:start');
  $('#btnLobby').onclick = () => socket.emit('host:lobby');
  $('#btnSkip').onclick = () => socket.emit('host:skip');
  $('#btnHof').onclick = openHof;
  $('#btnHof2').onclick = openHof;
  $('#btnHofClose').onclick = () => show('#hof', false);
  $('#btnMute').onclick = () => {
    Sfx.muted = !Sfx.muted;
    $('#btnMute').textContent = Sfx.muted ? 'SOUND OFF' : 'SOUND ON';
  };
})();
