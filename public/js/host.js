// Host / big-screen controller: QR lobby, live battlefield, leaderboard and podium.
(function () {
  const { $, el, syncClock, watchBuild, rankPlayers, drawStandings, TEAMS, Sfx, Music, EMOTES } = window.WW;
  const { heroDataURL, powerDataURL, crownDataURL, POWERS, COLORS } = window.Art;

  const socket = io();
  watchBuild(socket);
  let offset = 0;
  const now = () => Date.now() + offset;
  const arena = new Arena($('#arena'), { mode: 'host', now });

  let code = null;
  let rounds = [];
  let players = [];
  let state = { state: 'connecting', round: -1, phaseEndsAt: 0 };
  let records = {}; // playerId -> hall-of-fame entry earned in the last game
  let mode = 'ffa'; // or 'teams'
  let teams = null; // team battle: [{ hp, max }, { hp, max }]
  let winner = null; // team battle: 0, 1, or -1 for a draw
  let ko = false;
  let effects = [{}, {}]; // team battle power-ups: per team, name -> active until (server ms)
  let options = {}; // the room's game options (on/off switches, plus how many of your own words)
  let summary = null; // finished: { stats, awards }
  let boss = null; // boss round: { hp, max, down }
  let royale = null; // battle royale: { start, nextAt, ramp, total, left, hp, damage }
  let draw = null; // draw battle: the turn (see drawOf on the server)
  let pushedOptions = false;
  let lastCount = 0;
  let lastBeep = null;
  let lastTick = null;
  const prevScores = new Map();

  const ack = (ev, data) => new Promise((res) => socket.emit(ev, data, res));
  const show = (sel, on) => $(sel).classList.toggle('hidden', !on);
  const store = {
    get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  // The host's choices (options, own words, music) carry over to the next room on this computer.
  const prefs = {
    get() { try { return JSON.parse(localStorage.getItem('ww_host_opts')) || {}; } catch (e) { return {}; } },
    merge(v) { try { localStorage.setItem('ww_host_opts', JSON.stringify({ ...this.get(), ...v })); } catch (e) { /* private mode */ } },
  };
  Music.on = prefs.get().music !== false;

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
    arena.kill(k.id, k.by, k.points, k);
    if (!k.bomb) Sfx.play('shoot');
    announce(k.by, k);
    scheduleBoard();
  });
  socket.on('word:retime', (list) => arena.retime(list));
  socket.on('fx:ice', ({ until }) => arena.setIce(until));
  socket.on('player:streak', ({ id, streak }) => {
    const p = players.find((pl) => pl.id === id);
    if (p) p.streak = streak;
  });
  socket.on('player:emote', ({ id, e }) => {
    arena.emote(id, e);
    Sfx.play('emote');
    const tile = document.querySelector(`.hero-tile[data-id="${id}"]`);
    if (tile) {
      const bubble = el('span', { class: 'emo', text: EMOTES[e] || '' });
      tile.append(bubble);
      setTimeout(() => bubble.remove(), 1800);
    }
  });
  socket.on('boss:hit', ({ hp, dmg }) => {
    if (boss) boss.hp = hp;
    arena.bossHit(hp, dmg);
    Sfx.play('bosshit');
  });
  socket.on('boss:down', ({ by }) => {
    if (boss) Object.assign(boss, { hp: 0, down: true });
    arena.bossDown();
    const name = players.find((pl) => pl.id === by)?.name || 'Someone';
    arena.callout('VICTORY!', '#ffd23f', `${name} slew the Dragon King!`);
    Sfx.play('roar');
    Sfx.play('boom');
    setTimeout(() => Sfx.play('win'), 700);
  });

  // A hero used their class skill: the banner and effect come first (skill:cast), then the result.
  // Battle royale: their targets are on their own phone, so the big screen just shows the banner and hero.
  socket.on('skill:cast', (c) => {
    arena.castSkill(mode === 'royale' ? { ...c, targets: [] } : c, window.Art.classByKey(c.skill).skill.split(': ')[1] || '');
    Sfx.play(`skill:${c.skill}`);
  });
  socket.on('skill:use', (u) => {
    setScore(u.id, u.score, u.roundScore, u.kills);
    if (u.hp) setHp(u.hp);
    if (u.heal) {
      const o = arena.heroOrigin(u.id);
      setTimeout(() => arena.floatText(o.x, o.y - 10 * arena.U, `+${u.heal} HP`, '#7dff6b', null, 'SKILL'), 650);
    }
    arena.skillTotal(u.id, u.total);
    scheduleBoard();
  });

  // Battle royale ---------------------------------------------------------
  // Everyone's HP and score, a few times a second. Rising scores are attacks, falling HP is a monster
  // getting through; the big screen plays both over that hero.
  let hurtSfxAt = 0;
  const hurtRows = new Set();
  socket.on('royale:board', (list) => {
    for (const u of list) {
      const p = players.find((pl) => pl.id === u.id);
      if (!p) continue;
      if (u.score > p.score) arena.royaleScore(p.id, u.score - p.score);
      if (u.hp < p.hp && !u.out) {
        arena.royaleHurt(p.id, p.hp - u.hp);
        hurtRows.add(p.id);
        if (performance.now() - hurtSfxAt > 350) {
          hurtSfxAt = performance.now();
          Sfx.play('escape');
        }
      }
      Object.assign(p, u);
    }
    scheduleBoard();
  });
  socket.on('royale:stage', ({ round, ramp }) => {
    const r = rounds[round];
    if (!r) return;
    if (ramp) arena.callout('FASTER!', '#ff7b4a', `The monsters speed up · hits do ${r.damage}`);
    else arena.callout(`${r.name}!`, { easy: '#8be36b', medium: '#b99cff', hard: '#ff7b4a' }[r.key] || '#ffd23f', `${r.title} · hits do ${r.damage}`);
    arena.shake(2, 400);
    Sfx.play('round');
  });
  socket.on('royale:out', ({ id, place, left }) => {
    const p = players.find((pl) => pl.id === id);
    if (p) Object.assign(p, { out: true, place, hp: 0 });
    if (royale) royale.left = left;
    arena.royaleOut(id);
    arena.callout(`${p ? p.name : 'A hero'} IS OUT!`, '#ff5a4d', left > 1 ? `#${place} · ${left} heroes left` : left === 1 ? 'One hero left standing!' : '');
    Sfx.play('boom');
    scheduleBoard();
  });

  // Draw battle -----------------------------------------------------------
  // The drawing comes in stroke by stroke from the drawer's phone. Wrong guesses scroll by on the right;
  // right ones show as "got it" (never the word itself) and tick that hero's row on the left.
  const sketch = new Sketch($('#dsCanvas'));
  let drawFeed = []; // guesses: { id, by, name, color, text }, or { id, got: true, by, points, order }
  let drawTurn = 0; // the turn the board and the guesses are from
  let freshFeed = null;
  const gotRows = new Set();
  socket.on('draw:line', (l) => sketch.add(l));
  socket.on('draw:undo', () => sketch.undo());
  socket.on('draw:clear', () => sketch.clear());
  socket.on('draw:hint', ({ hint }) => {
    if (!draw) return;
    draw.hint = hint;
    renderDraw();
    Sfx.play('reveal');
  });
  socket.on('draw:say', (m) => addFeed(m));
  socket.on('draw:guessed', (g) => {
    setScore(g.id, g.score, g.roundScore, g.kills);
    setScore(g.drawer, g.drawerScore, g.drawerRoundScore);
    if (draw && !draw.guessed.some((x) => x.id === g.id)) draw.guessed = draw.guessed.concat({ id: g.id, points: g.points, order: g.order });
    addFeed({ id: `got-${g.id}`, got: true, by: g.id, points: g.points, order: g.order });
    gotRows.add(g.id);
    Sfx.play(g.order === 0 ? 'award' : 'join');
    renderDraw();
  });
  socket.on('draw:round', ({ round }) => {
    arena.callout(`ROUND ${round + 1}`, '#ffd23f', 'Everyone draws again!');
    Sfx.play('round');
  });

  function addFeed(m) {
    drawFeed = drawFeed.concat(m).slice(-40);
    freshFeed = m.id;
    renderFeed();
  }

  function renderFeed() {
    const box = $('#dsFeed');
    box.innerHTML = '';
    if (!drawFeed.length) box.append(el('div', { class: 'ds-empty', text: 'Guesses from the phones show up here.' }));
    for (const m of drawFeed) {
      const p = players.find((pl) => pl.id === m.by);
      const color = (COLORS[(p || m).color] || COLORS[0]).Q;
      if (m.got) {
        const nth = ['FIRST', '2ND', '3RD'][m.order];
        box.append(el('div', { class: `m got${m.id === freshFeed ? ' new' : ''}` }, [
          `${p ? p.name : 'Someone'} GOT IT! +${m.points}${nth ? ` · ${nth}` : ''}`,
        ]));
      } else {
        // ✓: they already got it, chatting while the others guess.
        box.append(el('div', { class: `m${m.id === freshFeed ? ' new' : ''}` }, [el('b', { text: `${m.done ? '✓ ' : ''}${m.name}`, style: `color:${color}` }), m.text]));
      }
    }
    box.scrollTop = box.scrollHeight;
  }

  const LEVEL_NAMES = { easy: 'EASY', medium: 'MEDIUM', hard: 'HARD' };
  const nameOf = (id) => players.find((p) => p.id === id)?.name || 'Someone';

  // The word's blanks (or the word, once it's over), the picking and reveal cards over the board, and the
  // scores down the left with who's drawing and who got it.
  function renderDraw() {
    if (mode !== 'draw' || !draw) return;
    const D = draw;
    const hint = $('#dsHint');
    const drawer = players.find((p) => p.id === D.drawer);
    hint.classList.toggle('word', D.phase === 'reveal');
    hint.classList.toggle('note', D.phase === 'choose');
    if (D.phase === 'draw') hint.textContent = D.hint;
    else if (D.phase === 'reveal') hint.textContent = (D.word || '').toUpperCase();
    else hint.textContent = `${drawer ? drawer.name : 'Someone'} IS PICKING...`;
    const lvl = $('#dsLevel');
    lvl.className = `ds-tag ${D.level || ''}${D.level ? '' : ' hidden'}`;
    lvl.textContent = D.level ? `${LEVEL_NAMES[D.level]} · ${D.points} PTS` : '';
    const letters = D.phase === 'draw' ? D.hint.replace(/[^a-z_]/gi, '').length : 0;
    $('#dsLen').classList.toggle('hidden', !letters);
    $('#dsLen').textContent = `${letters} LETTERS${D.hint && D.hint.includes(' ') ? ` · ${D.hint.split(' ').length} WORDS` : ''}`;

    const over = $('#dsOver');
    over.innerHTML = '';
    over.className = 'ds-over hidden';
    if (D.phase === 'choose' && drawer) {
      over.className = 'ds-over';
      over.append(
        el('div', { class: 'o1', text: `${roundLabelDraw()} · TURN ${D.turn} OF ${D.turns}` }),
        heroImg(drawer, 'px-sprite'),
        el('div', { class: 'o2', text: `${drawer.name} IS PICKING A ${characters() ? 'CHARACTER' : 'WORD'}` }),
        el('div', { class: 'o3', text: 'Get ready to guess on your phone!' }),
      );
    } else if (D.phase === 'reveal' && D.standings) {
      // Between turns: everyone's scores, what they just scored and how far they moved.
      over.className = 'ds-over standings';
      const list = el('div', { class: 'ds-stand' });
      for (const s of drawStandings(players, D)) {
        list.append(el('div', { class: `row r${s.rank}${s.gain ? ' up' : ''}`, style: `--i:${s.rank - 1}` }, [
          el('span', { class: 'rk', text: `${s.rank}.` }),
          heroImg(s.p),
          el('span', { class: 'nm', text: s.p.name }),
          el('span', { class: `mv${s.move > 0 ? ' climb' : s.move < 0 ? ' drop' : ''}`, text: s.move > 0 ? `▲${s.move}` : s.move < 0 ? `▼${-s.move}` : '' }),
          el('span', { class: 'gn', text: s.gain ? `+${s.gain}` : '' }),
          el('span', { class: 'sc', text: s.p.score }),
        ]));
      }
      over.append(el('div', { class: 'o1', text: `STANDINGS · TURN ${D.turn} OF ${D.turns}` }), list);
      while (list.children.length > 3 && over.scrollHeight > over.clientHeight) list.lastChild.remove();
    } else if (D.phase === 'reveal') {
      over.className = 'ds-over reveal';
      const got = D.guessed.length;
      const by = drawer ? drawer.name : 'The drawer';
      const line = D.why === 'left' ? `${by} left the battle`
        : got === 0 ? 'Nobody got it!'
          : `${got === D.guessers && got > 0 ? 'Everyone' : `${got} of ${Math.max(got, D.guessers)}`} got it · ${by} +${D.drawerPts} for the drawing`;
      over.append(el('div', { class: 'o1', text: characters() ? 'IT WAS' : 'THE WORD WAS' }), el('div', { class: 'o2', text: (D.word || '?').toUpperCase() }), el('div', { class: 'o3', text: line }));
    }
    renderDrawPlayers();
  }
  const roundLabelDraw = () => (rounds.length === 1 ? 'ONE ROUND' : `ROUND ${state.round + 1} OF ${rounds.length}`);
  const characters = () => options.drawSet === 'characters';

  function renderDrawPlayers() {
    if (mode !== 'draw') return;
    const box = $('#dsPlayers');
    box.innerHTML = '';
    const got = new Map((draw ? draw.guessed : []).map((g) => [g.id, g]));
    rankPlayers(players).forEach((p, i) => {
      const drawing = draw && draw.drawer === p.id && draw.phase !== 'reveal';
      const g = got.get(p.id);
      const note = drawing ? 'DRAWING' : g ? `GOT IT +${g.points}` : draw && draw.drawer === p.id ? `DREW · +${draw.drawerPts}` : p.connected ? '' : 'AWAY';
      box.append(el('div', { class: `row r${i + 1}${drawing ? ' drawer' : ''}${g ? ' got' : ''}${gotRows.has(p.id) ? ' bump' : ''}` }, [
        el('span', { class: 'rk', text: `${i + 1}.` }),
        heroImg(p),
        el('span', { class: 'nm' }, [p.name, note ? el('small', { text: note }) : null]),
        el('span', { class: 'sc', text: p.score }),
      ]));
    });
    gotRows.clear();
    const side = box.parentElement;
    while (box.children.length > 4 && side.scrollHeight > side.clientHeight) box.lastChild.remove();
  }

  // Streak milestones, ice and bombs get a callout across the field.
  const STREAK_CALLS = { 3: ['ON FIRE!', '#ff7b1c'], 6: ['UNSTOPPABLE!', '#7fd4ff'], 10: ['LEGENDARY!', '#bb8cff'] };
  function announce(by, k) {
    if (k.skill) return; // the skill's own callout covers it
    const p = players.find((pl) => pl.id === by);
    if (p && k.streak !== undefined) p.streak = k.streak;
    const name = p ? p.name : 'Someone';
    const call = STREAK_CALLS[k.streak] || (k.streak > 10 && k.streak % 5 === 0 ? STREAK_CALLS[10] : null);
    if (call) {
      arena.callout(call[0], call[1], `${name} · ${k.streak} in a row${k.mult > 1 ? ` · x${k.mult}` : ''}`);
      Sfx.play('streak');
    }
    if (k.special === 'ice') {
      arena.callout('FREEZE!', '#7fd4ff', `${name} slowed everything down`);
      Sfx.play('freeze');
    } else if (k.special === 'bomb') {
      arena.callout('BOOM!', '#ff7b1c', `${name} blasted the field`);
      Sfx.play('boom');
    } else if (k.special === 'gold') {
      Sfx.play('award');
    }
  }

  // Team battle ---------------------------------------------------------
  const setScore = (id, score, roundScore, kills) => {
    const p = players.find((pl) => pl.id === id);
    if (!p) return;
    p.score = score;
    if (kills !== undefined) p.kills = kills;
    if (state.round >= 0 && roundScore !== undefined) p.roundScores[state.round] = roundScore;
  };
  const setHp = (hp) => {
    if (!teams || !hp) return;
    hp.forEach((v, i) => { teams[i].hp = v; });
    renderTeamBar();
  };
  const shakeBar = (team) => {
    const bar = $(`#tbBar${team}`);
    bar.classList.remove('hit');
    void bar.offsetWidth;
    bar.classList.add('hit');
  };
  socket.on('duel:launch', (d) => {
    arena.duelLaunch(d.slot, d.missile);
    if (d.boosted) arena.useBoost(d.missile.by);
    Sfx.play('shoot');
    announce(d.missile.by, d);
  });
  socket.on('duel:block', (b) => {
    setScore(b.by, b.score, b.roundScore, b.kills);
    arena.duelBlock(b.id, b.by, b.skill);
    if (b.boosted) arena.useBoost(b.by);
    announce(b.by, b);
  });
  socket.on('duel:hit', (h) => {
    setScore(h.by, h.score, h.roundScore);
    arena.duelHit(h.id, h.team, h.dmg, h.shielded);
    setHp(h.hp);
    if (!h.shielded) shakeBar(h.team);
    Sfx.play(h.shielded ? 'beep' : 'escape');
  });
  socket.on('duel:power', (pw) => {
    const before = teams ? teams[pw.team].hp : 0;
    effects = pw.effects;
    arena.setEffects(effects);
    setHp(pw.hp);
    const info = POWERS[pw.power];
    const label = pw.power === 'potion' ? `+${(teams ? teams[pw.team].hp : 0) - before} HP` : `${info.name}!`;
    arena.duelPower(pw.id, pw.by, pw.team, pw.power, label);
    renderFx();
    Sfx.play('join');
    announce(pw.by, pw);
  });
  socket.on('duel:retime', (list) => arena.retime(list));
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
    chat = snap.chat || [];
    setPlayers(snap.players);
    arena.setWords(snap.words);
    applyState(snap);
    // Draw battle under way: the drawing and the guesses so far.
    if (snap.strokes) sketch.set(snap.strokes);
    if (snap.feed) {
      const got = (snap.draw ? snap.draw.guessed : []).map((g) => ({ id: `got-${g.id}`, got: true, by: g.id, points: g.points, order: g.order }));
      drawFeed = snap.feed.concat(got);
      renderFeed();
    }
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
    if (mode === 'draw' && state.state === 'lobby') renderRoundChips(); // how long the game runs depends on the crowd
    scheduleBoard();
  }

  function heroImg(p, cls = 'px-sprite') {
    return el('img', { class: cls, src: heroDataURL(p), alt: '' });
  }

  // A name, with a red tag in front when the server thinks an auto-typer is doing the typing.
  const nameParts = (p) => [
    p.flagged ? el('span', { class: 'flag', text: 'AUTO? ', title: 'Typing looks machine-made: those words were blocked and this score stays out of the Hall of Fame' }) : null,
    p.name,
  ];

  // Lobby tile. Team battle: click moves the hero to the other team. Free for all: click removes them.
  // The X always removes.
  function heroTile(p) {
    const teamsOn = mode === 'teams';
    const remove = (e) => {
      e.stopPropagation();
      if (confirm(`Remove ${p.name} from the battle?`)) socket.emit('host:kick', { id: p.id });
    };
    return el('div', {
      class: `hero-tile${p.connected ? '' : ' off'}`,
      'data-id': p.id,
      title: teamsOn ? `Move ${p.name} to ${TEAMS[1 - p.team].name}` : `Remove ${p.name}`,
      onclick: teamsOn ? () => socket.emit('host:move', { id: p.id }) : remove,
    }, [
      heroImg(p, 'px-sprite bob'),
      el('div', { class: 'nm' }, nameParts(p)),
      teamsOn ? el('div', { class: 'mv', text: p.team === 0 ? 'MOVE >' : '< MOVE' }) : null,
      saying.has(p.id) ? el('div', { class: 'say', text: saying.get(p.id) }) : null,
      el('button', { class: 'x', type: 'button', title: `Remove ${p.name}`, text: 'X', onclick: remove }),
    ]);
  }

  function renderRoster() {
    const roster = $('#roster');
    const teamsOn = mode === 'teams';
    roster.innerHTML = '';
    roster.classList.toggle('split', teamsOn && players.length > 0);
    $('#count').textContent = players.length;
    if (!players.length) {
      roster.append(el('div', { class: 'roster-empty', text: 'No heroes yet... Scan the QR code to join the battle!' }));
    } else if (teamsOn) {
      TEAMS.forEach((t, i) => {
        const side = players.filter((p) => p.team === i);
        roster.append(el('div', { class: 'team-col' }, [
          el('h4', { text: `${t.name} · ${side.length}`, style: `background:${t.color}` }),
          el('div', { class: 'team-tiles' }, side.map(heroTile)),
        ]));
      });
    } else {
      for (const p of players) roster.append(heroTile(p));
    }
    const enough = players.length >= (teamsOn || mode === 'draw' ? 2 : 1);
    $('#btnStart').disabled = !enough;
    show('#btnShuffle', teamsOn && players.length > 1);
    if (teamsOn && players.length && !enough) $('#startHint').textContent = 'A team battle needs at least 2 heroes.';
    else if (mode === 'draw' && players.length && !enough) $('#startHint').textContent = 'A draw battle needs at least 2 heroes: one draws, the rest guess.';
    else if (mode === 'draw' && enough) {
      $('#startHint').textContent = `${players.length} heroes ready. Each one draws ${rounds.length === 1 ? 'once' : `${rounds.length} times`}; the rest guess on their phones.`;
    }
    else if (teamsOn && enough) {
      const red = players.filter((p) => p.team === 0).length;
      $('#startHint').textContent = `${red} red vs ${players.length - red} blue. Click a hero to move them to the other team.`;
    } else if (mode === 'royale' && players.length) {
      $('#startHint').textContent = `${players.length} hero${players.length === 1 ? '' : 'es'} ready. Each fights their own monsters; the last one standing wins!`;
    } else {
      $('#startHint').textContent = players.length
        ? `${players.length} hero${players.length === 1 ? '' : 'es'} ready. Start when everyone is in!`
        : 'Waiting for heroes to join...';
    }
  }

  function renderTeamBar() {
    if (!teams) return;
    teams.forEach((t, i) => {
      const fill = $(`#tbFill${i}`);
      fill.style.width = `${(t.hp / t.max) * 100}%`;
      fill.style.background = TEAMS[i].color;
      $(`#tbHp${i}`).textContent = `${t.hp} HP`;
      $(`#tbName${i}`).style.color = TEAMS[i].color;
    });
  }

  // Active power-ups under each team's HP bar, with seconds left.
  let fxShown = '';
  function renderFx() {
    const t = now();
    const chips = [0, 1].map((team) => Object.entries(effects[team] || {})
      .filter(([, until]) => until > t)
      .map(([name, until]) => [name, Math.ceil((until - t) / 1000)]));
    const key = JSON.stringify(chips);
    if (key === fxShown) return;
    fxShown = key;
    chips.forEach((list, team) => {
      const box = $(`#tbFx${team}`);
      box.innerHTML = '';
      for (const [name, secs] of list) {
        box.append(el('span', { class: 'fx-chip', style: `color:${POWERS[name].color}` }, [
          el('img', { src: powerDataURL(name), alt: '' }), `${POWERS[name].short} ${secs}s`,
        ]));
      }
    });
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

  const hpColor = (frac) => (frac > 0.5 ? '#5bd46a' : frac > 0.25 ? '#ffd23f' : '#ff5a4d');

  function renderBoard() {
    if (mode === 'draw') return renderDrawPlayers();
    const list = $('#boardList');
    const ry = mode === 'royale' && royale;
    $('#board').classList.toggle('royale', Boolean(ry));
    $('#boardTitle').textContent = ry ? 'STANDINGS' : 'LEADERBOARD';
    show('#boardLeft', Boolean(ry));
    if (ry) $('#boardLeft').textContent = `${royale.left} OF ${royale.total} HEROES LEFT`;
    list.innerHTML = '';
    rankPlayers(players).slice(0, 10).forEach((p, i) => {
      const bumped = prevScores.has(p.id) && prevScores.get(p.id) !== p.score;
      // Battle royale: HP under the name, or how they went out.
      let nm = nameParts(p);
      if (ry) {
        nm = nm.concat(p.out
          ? el('small', { text: p.late ? 'JOINED LATE' : `OUT · #${p.place}` })
          : el('span', { class: 'hpm' }, [el('i', { style: `width:${(100 * (p.hp ?? royale.hp)) / royale.hp}%;background:${hpColor((p.hp ?? royale.hp) / royale.hp)}` })]));
      }
      const cls = `row r${i + 1}${bumped ? ' bump' : ''}${ry && p.out ? ' out' : ''}${hurtRows.has(p.id) ? ' hurt' : ''}`;
      list.append(el('li', { class: cls }, [
        el('span', { class: 'rk', text: `${i + 1}.` }),
        heroImg(p),
        el('span', { class: 'nm' }, nm),
        el('span', { class: 'sc', text: p.score }),
      ]));
    });
    hurtRows.clear();
    // Drop rows that would be cut off on shorter screens.
    const board = $('#board');
    while (list.children.length > 3 && board.scrollHeight > board.clientHeight) list.lastChild.remove();
    for (const p of players) prevScores.set(p.id, p.score);
  }

  // ---- phases --------------------------------------------------------
  const ROUND_OUTRO = {
    easy: 'The slime swarm has been squished!',
    medium: 'The bat storm has been grounded!',
    hard: 'The skull inferno is extinguished!',
    boss: 'The Dragon King has fallen!',
  };

  // The soundtrack follows the game: calm in the lobby and breaks, a track per round, quiet during the
  // podium's drumroll.
  let revealing = false;
  function musicFor(st, r) {
    if (st === 'countdown' || st === 'playing') return r ? r.key : 'lobby'; // a draw battle's rounds play 'draw'
    if (st === 'finished' && revealing) return null;
    return 'lobby';
  }

  function applyState(s) {
    const prev = state.state;
    state = { state: s.state, round: s.round, phaseEndsAt: s.phaseEndsAt };
    if (s.records) records = s.records;
    if (s.rounds) rounds = s.rounds;
    if (s.options) options = s.options;
    summary = s.summary || null;
    boss = s.boss || null;
    arena.setBoss(s.state === 'finished' ? null : boss); // the results screen has the boss's fate in words
    arena.setIce(s.iceUntil);
    mode = s.mode || 'ffa';
    royale = s.royale || null;
    arena.setRoyale(mode === 'royale', royale ? royale.hp : 100);
    // Draw battle: a new turn starts with a blank board and no guesses.
    const prevDraw = draw;
    draw = s.draw || null;
    if (draw && draw.turn !== drawTurn) {
      drawTurn = draw.turn;
      sketch.clear();
      drawFeed = [];
      renderFeed();
    }
    if (draw && prevDraw && prevDraw.turn === draw.turn && prevDraw.phase !== draw.phase) {
      if (draw.phase === 'draw') Sfx.play('go');
      if (draw.phase === 'reveal') Sfx.play(draw.guessed.length ? 'reveal' : 'miss');
    }
    if (draw && prevDraw && prevDraw.turn === draw.turn && draw.standings && !prevDraw.standings) Sfx.play('join');
    if (draw && draw.phase === 'choose' && (!prevDraw || prevDraw.turn !== draw.turn)) Sfx.play('beep');
    teams = s.teams || null;
    winner = s.winner ?? null;
    ko = Boolean(s.ko);
    effects = s.effects || [{}, {}];
    arena.setEffects(effects);
    if (s.players) setPlayers(s.players);
    else renderRoster();
    renderOptions();
    renderChat();
    renderRoundChips();
    if (!pushedOptions && s.state === 'lobby') pushSavedOptions();
    const r = rounds[s.round];
    const st = s.state;
    const fighting = st === 'countdown' || st === 'playing';
    const teamsOn = mode === 'teams';
    const drawOn = mode === 'draw';

    for (const b of document.querySelectorAll('.mode-btn')) b.classList.toggle('on', b.dataset.mode === mode);
    arena.setTeamMode(teamsOn);
    if (st !== 'lobby' && st !== 'finished') show('#hof', false);
    show('#lobby', st === 'lobby');
    show('#hud', fighting || st === 'intermission');
    show('#teamBar', Boolean(teams) && (fighting || st === 'intermission'));
    show('#board', fighting && !teamsOn && !drawOn);
    show('#drawStage', drawOn && st === 'playing' && Boolean(draw));
    show('#banner', st === 'countdown');
    show('#inter', st === 'intermission');
    show('#final', st === 'finished');
    relayout();
    renderTeamBar();

    if (st === 'lobby') {
      arena.setTheme('slime');
      arena.clearWords();
    }
    if (r && drawOn) {
      // Turns, not monsters: the HUD names the round and whose turn it is (tick() keeps the line fresh).
      arena.setTheme('slime');
      $('#hudRound').textContent = `${characters() ? 'CHARACTER EDITION' : 'DRAW BATTLE'} · ${roundLabelDraw()}`;
      $('#bRound').textContent = 'DRAW BATTLE';
      $('#bDiff').textContent = characters() ? 'CHARACTER EDITION' : 'DRAW!';
      $('#bDiff').className = 'b-diff d-medium';
      $('#bTitle').textContent = characters()
        ? `Draw famous characters from cartoons, anime, Disney, Pixar and DreamWorks. Everyone else guesses! ${Math.round((r.time || 80000) / 1000)} seconds a drawing.`
        : `Take turns drawing on your phone. Everyone else guesses! ${Math.round((r.time || 80000) / 1000)} seconds a drawing.`;
      renderDraw();
    } else if (r && mode === 'royale') {
      // No rounds: the stage changes as the battle goes on (the line under it counts down in tick()).
      arena.setTheme(r.monster);
      $('#hudRound').textContent = `BATTLE ROYALE · ${r.name}`;
      $('#bRound').textContent = 'BATTLE ROYALE';
      $('#bDiff').textContent = `${royale ? royale.hp : 100} HP`;
      $('#bDiff').className = 'b-diff d-boss';
      $('#bTitle').textContent = 'Everyone fights their own monsters. Words that reach you hurt. Last hero standing wins!';
    } else if (r) {
      arena.setTheme(r.monster);
      $('#hudRound').textContent = `${roundLabel(s.round)} · ${r.name}`;
      $('#hudTitle').textContent = `${r.title} · x${r.multiplier} ${teamsOn ? 'damage' : 'points'}${paceNote(' · ', ' DIFFICULTY')}`;
      $('#bRound').textContent = r.key === 'boss' ? 'FINAL ROUND' : roundLabel(s.round);
      $('#bDiff').textContent = r.name;
      $('#bDiff').className = `b-diff d-${r.key}`;
      $('#bTitle').textContent = r.key === 'boss'
        ? `${r.title} — every word you type hurts it!`
        : `${r.title} — words worth x${r.multiplier}`;
    }

    if (st === 'countdown' && prev !== 'countdown') {
      lastBeep = null;
      Sfx.play('round');
      prevScores.clear();
      renderBoard();
    }
    if (st === 'playing' && prev === 'countdown' && !drawOn) {
      Sfx.play('go');
      show('#banner', true);
      $('#bCount').textContent = 'FIGHT!';
      setTimeout(() => { if (state.state === 'playing') show('#banner', false); }, 700);
      if (r && r.key === 'boss') {
        Sfx.play('roar');
        arena.shake(3, 700);
      }
    }
    if (st === 'intermission') renderInter();
    if (st === 'finished' && prev !== 'finished') renderFinal();
    Music.play(musicFor(st, r));
  }

  // Everything placed under the top bar (and the team HP bar) follows its height, which changes with the
  // screen size; the falling words stay clear of the bars and the leaderboard. Runs again on resize.
  function relayout() {
    const st = state.state;
    const fighting = st === 'countdown' || st === 'playing';
    const hudH = st === 'lobby' || st === 'finished' ? 0 : $('#hud').offsetHeight;
    const gap = window.innerHeight <= 560 || window.innerWidth <= 900 ? 8 : 16;
    $('#drawStage').style.paddingTop = `${hudH + gap}px`;
    $('#drawStage').style.setProperty('--ds-top', `${hudH + gap}px`);
    $('#teamBar').style.top = `${hudH}px`;
    const barH = teams && hudH ? $('#teamBar').offsetHeight : 0;
    arena.setReserveTop(hudH + barH);
    arena.setReserveRight(fighting && mode !== 'teams' && mode !== 'draw' ? $('#board').offsetWidth + 40 : 0);
    $('#inter').style.paddingTop = `${hudH + barH + 20}px`;
    $('#board').style.top = `${hudH + gap + 2}px`;
    $('#board').style.maxHeight = `calc(100vh - ${hudH + gap + 2}px - 24vh)`;
  }
  window.addEventListener('resize', () => {
    relayout();
    scheduleBoard();
  });

  // A one-round game has no round numbers; easy and hard difficulty say so wherever the round is named.
  const roundLabel = (i) => (rounds.length === 1 ? 'ONE ROUND' : `ROUND ${i + 1}`);
  const paceNote = (before, after = '') => (options.level && options.level !== 'normal' ? `${before}${options.level.toUpperCase()}${after}` : '');

  function renderRoundChips() {
    const box = $('#roundChips');
    box.innerHTML = '';
    const pace = { easy: ' · slower', hard: ' · faster' }[options.level] || '';
    if (mode === 'draw') {
      // Every hero draws once a round: about how long the game runs with this many heroes.
      const secs = Math.round((rounds[0]?.time || 80000) / 1000);
      const turns = rounds.length * Math.max(2, players.length);
      const mins = Math.max(1, Math.round((turns * (secs * 0.8 + 20)) / 60));
      box.append(el('div', { class: 'round-chip medium' }, [
        rounds.length === 1 ? 'ONE ROUND · EVERYONE DRAWS ONCE' : `${rounds.length} ROUNDS · EVERYONE DRAWS ${rounds.length} TIMES`,
        el('small', { text: `${secs} seconds a drawing · ${turns} turns${players.length >= 2 ? '' : ' with 2 heroes'} · about ${mins} min` }),
      ]));
      box.append(el('div', { class: 'round-chip easy' }, characters()
        ? ['CHARACTER EDITION', el('small', { text: 'Cartoons, anime, Disney, Pixar, DreamWorks · 100 · 150 · 200 points' })]
        : ['PICK A WORD: EASY · MEDIUM · HARD', el('small', { text: '100 · 150 · 200 points: faster guesses score more' })]));
      return;
    }
    if (mode === 'royale') {
      // One battle, no breaks: when each stage takes over and how hard its hits are.
      rounds.forEach((r, i) => box.append(el('div', { class: `round-chip ${r.key}` }, [
        `${clock(r.at || 0)} · ${r.name}`,
        el('small', { text: `${r.title} · hits do ${r.damage}${i === rounds.length - 1 ? ' · then faster' : ''}${pace}` }),
      ])));
      return;
    }
    rounds.forEach((r, i) => box.append(el('div', { class: `round-chip ${r.key}` }, [
      rounds.length === 1 ? `ONE ROUND · ${r.name}` : `${i + 1} · ${r.name}`, el('small', { text: `${r.title} · x${r.multiplier}${pace}` }),
    ])));
  }
  const clock = (ms) => {
    const secs = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  };

  // ---- lobby chat ----------------------------------------------------
  let chat = []; // { id, by, name, color, text, at }, oldest first
  const saying = new Map(); // playerId -> what they just said, shown on their tile for a few seconds
  const sayTimers = new Map();

  function renderChat(fresh) {
    const on = Boolean(options.chat);
    $('#lobbyMid').classList.toggle('no-chat', !on);
    show('#chatPanel', on);
    if (!on) return;
    const list = $('#chatList');
    list.innerHTML = '';
    if (!chat.length) list.append(el('div', { class: 'chat-empty', text: 'Players can chat from their phones. Messages show up here.' }));
    for (const m of chat) {
      list.append(el('div', { class: `chat-msg${m.id === fresh ? ' new' : ''}` }, [
        el('b', { text: m.name, style: `color:${(COLORS[m.color] || COLORS[0]).Q}` }), m.text,
      ]));
    }
    list.scrollTop = list.scrollHeight;
  }

  socket.on('chat:msg', (m) => {
    chat = chat.concat(m).slice(-30);
    renderChat(m.id);
    if (state.state !== 'lobby') return;
    Sfx.play('emote');
    saying.set(m.by, m.text.length > 40 ? `${m.text.slice(0, 39)}…` : m.text);
    clearTimeout(sayTimers.get(m.by));
    sayTimers.set(m.by, setTimeout(() => {
      saying.delete(m.by);
      renderRoster();
    }, 5000));
    renderRoster();
  });
  socket.on('chat:clear', () => {
    chat = [];
    saying.clear();
    renderChat();
    renderRoster();
  });
  $('#btnChatClear').onclick = () => {
    if (confirm('Clear the chat for everyone?')) socket.emit('host:chatClear');
  };

  // ---- game options --------------------------------------------------
  function renderOptions() {
    for (const b of document.querySelectorAll('.opt[data-opt]')) b.classList.toggle('on', Boolean(options[b.dataset.opt]));
    for (const b of document.querySelectorAll('[data-length]')) b.classList.toggle('on', b.dataset.length === (options.length || 'full'));
    for (const b of document.querySelectorAll('[data-level]')) b.classList.toggle('on', b.dataset.level === (options.level || 'normal'));
    for (const b of document.querySelectorAll('[data-set]')) b.classList.toggle('on', b.dataset.set === (options.drawSet || 'classic'));
    show('#segSet', mode === 'draw');
    const bossBtn = $('.opt[data-opt="boss"]');
    const noBoss = mode === 'teams' ? 'The boss finale is for free for all; a team battle is its own fight.'
      : mode === 'royale' ? 'A battle royale has no boss: the monsters just keep getting tougher.'
        : options.length === 'one' ? 'The boss finale ends a full game; one round skips it.' : '';
    bossBtn.title = noBoss || bossBtn.querySelector('small').textContent;
    bossBtn.classList.toggle('na', Boolean(noBoss));
    // A draw battle is all drawing and guessing: no typing switches, skills or perks.
    for (const k of ['streaks', 'specials', 'boss', 'perks', 'skills']) {
      const b = $(`.opt[data-opt="${k}"]`);
      if (mode !== 'draw') {
        if (k !== 'boss') {
          b.classList.remove('na');
          b.title = b.querySelector('small').textContent;
        }
        continue;
      }
      b.classList.add('na');
      b.title = 'Not in a draw battle: everyone just draws and guesses.';
    }
    // A battle royale is one battle that keeps going, so it has no game length to pick.
    const seg = $('#segLength');
    seg.classList.toggle('na', mode === 'royale');
    seg.title = mode === 'royale' ? 'A battle royale has no rounds: it goes on until one hero is left.'
      : mode === 'draw' ? 'A full game: everyone draws twice. One round: everyone draws once.'
        : 'A full game climbs from easy to hard; one round plays just the round that matches the difficulty';
    $('#segLevel').title = mode === 'draw' ? 'How long each drawing lasts: easy 100 seconds, normal 80, hard 60'
      : 'Easy: words fall slower and come less often. Hard: faster and more at once';
    $('#wordCount').textContent = options.wordCount || 0;
    $('#musicState').textContent = Music.on ? 'ON' : 'OFF';
    $('#btnMusic').textContent = Music.on ? 'MUSIC ON' : 'MUSIC OFF';
  }

  function setOptions(change) {
    socket.emit('host:options', change);
    prefs.merge(change);
  }

  // A new room starts with the switches (and words) this host used last time.
  function pushSavedOptions() {
    pushedOptions = true;
    const { music, ...saved } = prefs.get();
    if (Object.keys(saved).length) socket.emit('host:options', saved);
  }

  // Each option explains itself on hover too (short screens hide the description).
  for (const b of document.querySelectorAll('.opt')) b.title = b.querySelector('small')?.textContent || '';
  for (const b of document.querySelectorAll('.opt[data-opt]')) {
    b.onclick = () => setOptions({ [b.dataset.opt]: !options[b.dataset.opt] });
  }
  for (const b of document.querySelectorAll('[data-length]')) b.onclick = () => setOptions({ length: b.dataset.length });
  for (const b of document.querySelectorAll('[data-level]')) b.onclick = () => setOptions({ level: b.dataset.level });
  for (const b of document.querySelectorAll('[data-set]')) b.onclick = () => setOptions({ drawSet: b.dataset.set });

  // Same rules as the server: letters only, 3 to 13 long, no repeats.
  const cleanWords = (text) => [...new Set(String(text).toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3 && w.length <= 13))];
  function countWords() {
    const list = cleanWords($('#wordsText').value);
    const n = (f) => list.filter((w) => f(w.length)).length;
    $('#wordsCount').textContent = `${list.length} word${list.length === 1 ? '' : 's'} · ${n((l) => l <= 5)} easy · `
      + `${n((l) => l >= 6 && l <= 8)} medium · ${n((l) => l >= 8)} hard`;
  }
  $('#btnWords').onclick = () => {
    $('#wordsText').value = prefs.get().words || '';
    $('#wordsOnly').checked = Boolean(options.onlyMine);
    countWords();
    show('#wordsDlg', true);
    $('#wordsText').focus();
  };
  $('#wordsText').oninput = countWords;
  $('#btnWordsClear').onclick = () => {
    $('#wordsText').value = '';
    countWords();
  };
  $('#btnWordsCancel').onclick = () => show('#wordsDlg', false);
  $('#btnWordsSave').onclick = () => {
    setOptions({ words: $('#wordsText').value, onlyMine: $('#wordsOnly').checked });
    show('#wordsDlg', false);
  };

  function toggleMusic() {
    Sfx.unlock();
    Music.on = !Music.on;
    prefs.merge({ music: Music.on });
    renderOptions();
  }
  $('#btnMusic').onclick = toggleMusic;
  $('#btnMusicLobby').onclick = toggleMusic;

  function renderInter() {
    const r = state.round;
    $('#iTitle').textContent = `ROUND ${r + 1} COMPLETE!`;
    $('#iSub').textContent = teams
      ? `${TEAMS[0].name} ${teams[0].hp} HP  ·  ${TEAMS[1].name} ${teams[1].hp} HP`
      : ROUND_OUTRO[rounds[r]?.key] || '';
    const table = $('#iTable');
    table.innerHTML = '';
    table.append(el('div', { class: 'row head' }, [
      el('span', { text: '#' }), el('span'), el('span', { text: 'HERO' }),
      el('span', { class: 'rs', text: 'ROUND' }), el('span', { class: 'sc', text: 'TOTAL' }),
    ]));
    rankPlayers(players).slice(0, 8).forEach((p, i) => {
      table.append(el('div', { class: `row r${i + 1}${teams ? ` team${p.team}` : ''}` }, [
        el('span', { class: 'rk', text: `${i + 1}.` }),
        heroImg(p),
        el('span', { class: 'nm' }, nameParts(p)),
        el('span', { class: 'rs', text: `+${p.roundScores[r] || 0}` }),
        el('span', { class: 'sc', text: p.score }),
      ]));
    });
    tick(); // fill in the "next round" line before measuring
    const card = $('.inter-card');
    while (table.children.length > 4 && card.scrollHeight > card.clientHeight) table.lastChild.remove();
  }

  // The podium fills in from third to first under a drumroll; the rest of the field and the awards follow.
  let revealTimers = [];
  function renderFinal() {
    const ranked = rankPlayers(players);
    // Team battle: the winning side takes the title; the podium shows the top damage dealers from both sides.
    const tb = teams && winner !== null;
    const teamStyle = (p) => (tb ? `color:${TEAMS[p.team].color}` : '');
    $('#finalTitle').textContent = !tb ? 'VICTORY!' : winner === -1 ? 'DRAW!' : `${TEAMS[winner].name} WIN!`;
    $('#finalTitle').style.color = tb && winner >= 0 ? TEAMS[winner].color : '';
    if (tb) {
      $('#finalSub').textContent = ko && winner >= 0
        ? `K.O.! ${TEAMS[1 - winner].name} ran out of HP`
        : `${TEAMS[0].name} ${teams[0].hp} HP  ·  ${TEAMS[1].name} ${teams[1].hp} HP`;
    } else if (boss) {
      $('#finalSub').textContent = boss.down ? 'The Dragon King has fallen!' : 'The Dragon King got away... this time.';
    }
    const ry = mode === 'royale' && ranked[0];
    if (ry) {
      const top = ranked[0];
      $('#finalSub').textContent = top.out ? `${top.name} outlasted everyone!` : `${top.name} is the last hero standing with ${top.hp} HP!`;
    }
    show('#finalSub', tb || Boolean(boss) || Boolean(ry));
    const podium = $('#podium');
    podium.innerHTML = '';
    const pods = [];
    const order = [[1, 'p2'], [0, 'p1'], [2, 'p3']];
    for (const [idx, cls] of order) {
      const p = ranked[idx];
      if (!p) continue;
      const rec = records[p.id];
      const pod = el('div', { class: `pod ${cls} hide` }, [
        idx === 0 ? el('img', { class: 'crown', src: crownDataURL(), alt: '' }) : null,
        heroImg(p),
        el('div', { class: 'nm', style: teamStyle(p) }, nameParts(p)),
        rec ? el('div', { class: 'rec blink', text: rec.rank === 1 ? 'NEW HIGH SCORE!' : `HALL OF FAME #${rec.rank}` }) : null,
        el('div', { class: 'sc', text: `${p.score} PTS` }),
        el('div', { class: 'ko', text: ry ? (p.out ? `${p.kills} SLAIN · OUT` : `${p.kills} SLAIN · ${p.hp} HP LEFT`)
          : mode === 'draw' ? `${p.kills} GUESSED` : `${p.kills} ${tb ? 'WORDS' : 'MONSTERS SLAIN'}` }),
        el('div', { class: 'block', text: idx + 1 }),
      ]);
      pods[idx] = pod;
      podium.append(pod);
    }
    const rest = $('#finalRest');
    rest.innerHTML = '';
    ranked.slice(3, 15).forEach((p, i) => {
      rest.append(el('div', { class: `row${tb ? ` team${p.team}` : ''}` }, [
        el('span', { class: 'rk', text: `${i + 4}.` }),
        heroImg(p),
        el('span', { class: 'nm' }, nameParts(p)),
        el('span', { class: 'sc', text: p.score }),
      ]));
    });
    const awards = $('#awards');
    awards.innerHTML = '';
    for (const a of summary?.awards || []) {
      const p = players.find((pl) => pl.id === a.id);
      if (!p) continue;
      awards.append(el('div', { class: 'award', title: a.desc }, [
        heroImg(p),
        el('div', { class: 'at', text: a.title }),
        el('div', { class: 'an', text: p.name }),
        el('div', { class: 'av', text: `${a.desc} · ${a.value}` }),
      ]));
    }
    rest.classList.add('hide');
    awards.classList.add('hide');

    for (const id of revealTimers) clearTimeout(id);
    revealing = true;
    Music.stop();
    Sfx.play('drumroll');
    const at = (ms, fn) => revealTimers.push(setTimeout(fn, ms));
    const reveal = (idx) => {
      if (!pods[idx]) return;
      pods[idx].classList.remove('hide');
      if (idx > 0) Sfx.play('reveal');
    };
    at(500, () => reveal(2));
    at(1200, () => reveal(1));
    at(2000, () => {
      reveal(0);
      arena.confetti();
      Sfx.play('win');
    });
    at(3000, () => {
      rest.classList.remove('hide');
      awards.classList.remove('hide');
      if (awards.children.length) Sfx.play('award');
    });
    at(5000, () => {
      revealing = false;
      if (state.state === 'finished') Music.play('lobby');
    });
  }

  function tick() {
    if (teams) renderFx();
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
    if (mode === 'royale' && r && (state.state === 'playing' || state.state === 'countdown')) {
      royaleTick(r);
      return;
    }
    if (mode === 'draw' && r && (state.state === 'playing' || state.state === 'countdown')) {
      drawHud();
      return;
    }
    // The last ten seconds of a round: red edges, a ticking clock, faster music.
    const tense = state.state === 'playing' && Boolean(r) && left > 0 && left <= 10000 && !(boss && boss.down);
    show('#tension', tense);
    Music.setFast(tense);
    const sec = Math.ceil(left / 1000);
    if (tense && sec !== lastTick) Sfx.play('tick');
    lastTick = tense ? sec : null;
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

  // Battle royale HUD: how long the battle has gone on, and a bar running down to the next stage (or, in
  // the last one, the next speed-up). The final two heroes get the red edges and faster music.
  function royaleTick(r) {
    const t = now();
    const playing = state.state === 'playing' && royale;
    const elapsed = playing ? t - royale.start : 0;
    const next = rounds[state.round + 1];
    const stepMs = playing ? Math.max(0, royale.nextAt - t) : 0;
    const span = next ? next.at - r.at : 30000;
    $('#timeText').textContent = clock(elapsed);
    $('#timeFill').style.width = `${playing ? Math.min(100, (100 * stepMs) / span) : 100}%`;
    $('#timeFill').classList.toggle('low', Boolean(playing && stepMs < 5000));
    const ahead = !playing ? '' : next ? ` · ${next.name} IN ${clock(stepMs)}` : ` · FASTER IN ${clock(stepMs)}`;
    const count = royale ? ` · ${royale.left} OF ${royale.total} LEFT` : '';
    $('#hudTitle').textContent = `${r.title} · hits do ${r.damage}${count}${ahead}`;
    const tense = Boolean(playing && royale.total >= 2 && royale.left === 2);
    show('#tension', tense);
    Music.setFast(tense);
  }

  // Draw battle HUD: the clock for this part of the turn, and who's drawing. The last ten seconds of a
  // drawing tick, with red edges.
  function drawHud() {
    const D = state.state === 'playing' ? draw : null;
    const left = D ? Math.max(0, D.endsAt - now()) : 0;
    $('#timeFill').style.width = `${D && D.span ? Math.min(100, (100 * left) / D.span) : 100}%`;
    $('#timeFill').classList.toggle('low', Boolean(D && D.phase === 'draw' && left < 10000));
    $('#timeText').textContent = D ? clock(left) : '';
    $('#hudRound').textContent = `${characters() ? 'CHARACTER EDITION' : 'DRAW BATTLE'} · ${roundLabelDraw()}`;
    if (!D) {
      $('#hudTitle').textContent = 'Get your phones ready!';
    } else {
      const who = nameOf(D.drawer);
      const what = D.phase === 'choose' ? `${who} is picking a word`
        : D.phase === 'draw' ? `${who} is drawing · ${D.guessed.length} of ${Math.max(D.guessed.length, D.guessers)} got it` : 'The word is out!';
      $('#hudTitle').textContent = `TURN ${D.turn} OF ${D.turns} · ${what}`;
    }
    const tense = Boolean(D && D.phase === 'draw' && left > 0 && left <= 10000);
    show('#tension', tense);
    Music.setFast(tense);
    const sec = Math.ceil(left / 1000);
    if (tense && sec !== lastTick) Sfx.play('tick');
    lastTick = tense ? sec : null;
  }

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
    renderHofList($('#hofDaily'), null);
    let hof = { battle: [], solo: [], daily: [] };
    try {
      hof = await fetch('/api/highscores', { cache: 'no-store' }).then((r) => r.json());
    } catch (e) { /* show empty boards */ }
    renderHofList($('#hofBattle'), hof.battle, 'No battles recorded yet. Win one to get your name up here!');
    renderHofList($('#hofSolo'), hof.solo, 'No solo quests yet.');
    renderHofList($('#hofDaily'), hof.daily || [], "Nobody has played today's daily quest yet.");
    if (hof.day) $('#hofDay').textContent = `Today's quest · ${hof.day}`;
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
  for (const b of document.querySelectorAll('.mode-btn')) b.onclick = () => socket.emit('host:mode', { mode: b.dataset.mode });
  $('#btnShuffle').onclick = () => socket.emit('host:shuffle');
  $('#btnHof').onclick = openHof;
  $('#btnHof2').onclick = openHof;
  $('#btnHofClose').onclick = () => show('#hof', false);
  $('#btnMute').onclick = () => {
    Sfx.muted = !Sfx.muted;
    $('#btnMute').textContent = Sfx.muted ? 'SOUND OFF' : 'SOUND ON';
  };
})();
