// Host / big-screen controller: QR lobby, live battlefield, leaderboard and podium.
(function () {
  const { $, el, syncClock, watchBuild, rankPlayers, TEAMS, Sfx, Music, EMOTES } = window.WW;
  const { heroDataURL, powerDataURL, crownDataURL, POWERS } = window.Art;

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
  socket.on('skill:cast', (c) => {
    arena.castSkill(c, window.Art.classByKey(c.skill).skill.split(': ')[1] || '');
    Sfx.play(`skill:${c.skill}`);
  });
  socket.on('skill:use', (u) => {
    setScore(u.id, u.score, u.roundScore, u.kills);
    if (u.hp) setHp(u.hp);
    arena.skillTotal(u.id, u.total);
    scheduleBoard();
  });

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
    const enough = players.length >= (teamsOn ? 2 : 1);
    $('#btnStart').disabled = !enough;
    show('#btnShuffle', teamsOn && players.length > 1);
    if (teamsOn && players.length && !enough) $('#startHint').textContent = 'A team battle needs at least 2 heroes.';
    else if (teamsOn && enough) {
      const red = players.filter((p) => p.team === 0).length;
      $('#startHint').textContent = `${red} red vs ${players.length - red} blue. Click a hero to move them to the other team.`;
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

  function renderBoard() {
    const list = $('#boardList');
    list.innerHTML = '';
    rankPlayers(players).slice(0, 10).forEach((p, i) => {
      const bumped = prevScores.has(p.id) && prevScores.get(p.id) !== p.score;
      list.append(el('li', { class: `row r${i + 1}${bumped ? ' bump' : ''}` }, [
        el('span', { class: 'rk', text: `${i + 1}.` }),
        heroImg(p),
        el('span', { class: 'nm' }, nameParts(p)),
        el('span', { class: 'sc', text: p.score }),
      ]));
    });
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
    if (st === 'countdown' || st === 'playing') return r ? r.key : 'lobby';
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
    teams = s.teams || null;
    winner = s.winner ?? null;
    ko = Boolean(s.ko);
    effects = s.effects || [{}, {}];
    arena.setEffects(effects);
    if (s.players) setPlayers(s.players);
    else renderRoster();
    renderOptions();
    renderRoundChips();
    if (!pushedOptions && s.state === 'lobby') pushSavedOptions();
    const r = rounds[s.round];
    const st = s.state;
    const fighting = st === 'countdown' || st === 'playing';
    const teamsOn = mode === 'teams';

    for (const b of document.querySelectorAll('.mode-btn')) b.classList.toggle('on', b.dataset.mode === mode);
    arena.setTeamMode(teamsOn);
    if (st !== 'lobby' && st !== 'finished') show('#hof', false);
    show('#lobby', st === 'lobby');
    show('#hud', fighting || st === 'intermission');
    show('#teamBar', Boolean(teams) && (fighting || st === 'intermission'));
    show('#board', fighting && !teamsOn);
    show('#banner', st === 'countdown');
    show('#inter', st === 'intermission');
    show('#final', st === 'finished');
    arena.setReserveRight(fighting && !teamsOn ? 340 : 0);
    const hudH = st === 'lobby' || st === 'finished' ? 0 : $('#hud').offsetHeight;
    $('#teamBar').style.top = `${hudH}px`;
    const barH = teams && hudH ? $('#teamBar').offsetHeight : 0;
    arena.setReserveTop(hudH + barH);
    renderTeamBar();
    $('#inter').style.paddingTop = `${hudH + barH + 20}px`;
    $('#board').style.top = `${hudH + 18}px`;
    $('#board').style.maxHeight = `calc(100vh - ${hudH + 18}px - 24vh)`;

    if (st === 'lobby') {
      arena.setTheme('slime');
      arena.clearWords();
    }
    if (r) {
      arena.setTheme(r.monster);
      $('#hudRound').textContent = `ROUND ${s.round + 1} · ${r.name}`;
      $('#hudTitle').textContent = `${r.title} · x${r.multiplier} ${teamsOn ? 'damage' : 'points'}`;
      $('#bRound').textContent = r.key === 'boss' ? 'FINAL ROUND' : `ROUND ${s.round + 1}`;
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
    if (st === 'playing' && prev === 'countdown') {
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

  function renderRoundChips() {
    const box = $('#roundChips');
    box.innerHTML = '';
    rounds.forEach((r, i) => box.append(el('div', { class: `round-chip ${r.key}` }, [
      `${i + 1} · ${r.name}`, el('small', { text: `${r.title} · x${r.multiplier}` }),
    ])));
  }

  // ---- game options --------------------------------------------------
  function renderOptions() {
    for (const b of document.querySelectorAll('.opt[data-opt]')) b.classList.toggle('on', Boolean(options[b.dataset.opt]));
    const bossBtn = $('.opt[data-opt="boss"]');
    bossBtn.title = mode === 'teams' ? 'The boss finale is for free for all; a team battle is its own fight.' : '';
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

  for (const b of document.querySelectorAll('.opt[data-opt]')) {
    b.onclick = () => setOptions({ [b.dataset.opt]: !options[b.dataset.opt] });
  }

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
    show('#finalSub', tb || Boolean(boss));
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
        el('div', { class: 'ko', text: `${p.kills} ${tb ? 'WORDS' : 'MONSTERS SLAIN'}` }),
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
