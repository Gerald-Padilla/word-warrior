// Phone controller: hero creator, lobby, typing battle and results.
(function () {
  const { $, el, syncClock, rankPlayers, TEAMS, Sfx, Music, EMOTES } = window.WW;
  const { CLASSES, COLORS, SKINS, HAIRS, TRIMS, PETS, POWERS } = window.Art;
  const { heroDataURL, petDataURL, powerDataURL, classByKey, classHasHair } = window.Art;

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* private mode */ } },
  };

  const socket = io();
  let offset = 0;
  const now = () => Date.now() + offset;
  const arena = new Arena($('#arena'), { mode: 'phone', now });

  let code = (new URLSearchParams(location.search).get('room') || '').toUpperCase().slice(0, 4);
  let battleCode = code; // battle room to go back to after a solo quest
  let solo = false;
  let records = {}; // playerId -> hall-of-fame entry earned in the last game
  let hof = null; // latest hall of fame from the server
  let hofBoard = 'solo';
  let you = null;
  let players = [];
  let rounds = [];
  let state = { state: 'none', round: -1, phaseEndsAt: 0 };
  let editing = false;
  let mode = 'ffa'; // or 'teams'
  let teams = null; // team battle: [{ hp, max }, { hp, max }]
  let winner = null; // team battle: 0, 1, or -1 for a draw
  let ko = false;
  let effects = [{}, {}]; // team battle power-ups: per team, name -> active until (server ms)
  let daily = null; // the date of the daily quest you're playing
  let options = {}; // the room's game options
  let summary = null; // finished: { stats, awards }
  let boss = null; // boss round: { hp, max, down }
  const toasted = new Set();

  const pick = (n) => Math.floor(Math.random() * n);
  const look = Object.assign({
    name: '',
    cls: CLASSES[pick(CLASSES.length)].key,
    color: pick(COLORS.length),
    skin: 0,
    hair: 0,
    trim: 0,
    pet: 0,
  }, store.get('ww_profile') || {});

  const ack = (ev, data) => new Promise((res) => socket.emit(ev, data, res));
  const me = () => players.find((p) => p.id === you);
  const teamBattle = () => mode === 'teams' && !solo;
  const myTeam = () => (me() ? me().team : 0);

  // ---- viewport: keep the typing bar above the on-screen keyboard ----
  function fit() {
    const vv = window.visualViewport;
    document.documentElement.style.setProperty('--app-h', `${vv ? vv.height : window.innerHeight}px`);
    $('#app').style.transform = vv && vv.offsetTop ? `translateY(${vv.offsetTop}px)` : '';
    requestAnimationFrame(syncReserve);
  }

  // On a short landscape screen the HP bars float over the top of the battlefield; keep the action below them.
  function syncReserve() {
    const strip = $('#hpStrip');
    const over = !strip.classList.contains('hidden')
      && strip.getBoundingClientRect().top >= $('#field').getBoundingClientRect().top - 1;
    arena.setReserveTop(over ? strip.offsetHeight : 0);
  }
  window.visualViewport?.addEventListener('resize', fit);
  window.visualViewport?.addEventListener('scroll', fit);
  window.addEventListener('resize', fit);
  fit();

  function showScreen(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
  }

  function showMsg(title, text, button) {
    $('#msgTitle').textContent = title;
    $('#msgTitle').classList.toggle('blink', !button);
    $('#msgText').textContent = text || '';
    $('#msgBtn').classList.toggle('hidden', !button);
    showScreen('scrMsg');
  }

  // ---- hero creator --------------------------------------------------
  // The preview is a tiny battlefield: your hero (and pet) knocks out a monster every couple of seconds.
  const stage = new Arena($('#stage'), { mode: 'phone', now: () => Date.now(), selfId: 'you', stage: true });
  const DEMO_WORDS = ['ogre', 'imp', 'slime', 'goblin', 'bat', 'troll', 'wraith', 'kobold'];
  const DEMO_THEMES = ['slime', 'bat', 'skull'];
  let demoId = 0;

  function demoAttack() {
    if ($('#scrJoin').classList.contains('hidden')) return;
    const id = ++demoId;
    if (id % 3 === 0) stage.setTheme(DEMO_THEMES[(id / 3) % DEMO_THEMES.length]);
    const text = DEMO_WORDS[id % DEMO_WORDS.length];
    stage.addWord({ id, text, x: 0.74, spawn: Date.now() - 3500, dur: 10000 });
    setTimeout(() => stage.kill(id, 'you', text.length * 10), 700);
  }
  setInterval(demoAttack, 2600);
  $('#stageBox').addEventListener('click', () => {
    Sfx.unlock();
    demoAttack();
  });

  function swatch(color, title, onclick) {
    return el('button', { class: 'swatch', type: 'button', title, style: `background:${color}`, onclick });
  }

  function buildCreator() {
    const grid = $('#clsGrid');
    for (const c of CLASSES) {
      grid.append(el('button', {
        class: 'cls-btn', 'data-cls': c.key, type: 'button',
        onclick: () => { look.cls = c.key; refreshCreator(true); },
      }, [el('img', { class: 'px-sprite', alt: '' }), el('span', { text: c.name })]));
    }
    COLORS.forEach((c, i) => $('#colorRow').append(swatch(c.P, c.name, () => { look.color = i; refreshCreator(true); })));
    SKINS.forEach((s, i) => $('#skinRow').append(swatch(s.S, 'Skin', () => { look.skin = i; refreshCreator(true); })));
    HAIRS.forEach((h, i) => $('#hairRow').append(swatch(h.H || '#f4f4f8', h.name, () => { look.hair = i; refreshCreator(true); })));
    TRIMS.forEach((t, i) => $('#trimRow').append(swatch(t.G, t.name, () => { look.trim = i; refreshCreator(true); })));
    PETS.forEach((p, i) => $('#petRow').append(el('button', {
      class: 'pet-btn', type: 'button', title: p ? p.name : 'No companion',
      onclick: () => { look.pet = i; refreshCreator(true); },
    }, [p ? el('img', { class: 'px-sprite', src: petDataURL(i), alt: '' }) : null, el('span', { text: p ? p.name : 'None' })])));
  }

  const NAME_START = ['Ar', 'Bel', 'Cor', 'Dra', 'El', 'Fen', 'Gal', 'Hal', 'Is', 'Jor', 'Kae', 'Lyr', 'Mor', 'Nim', 'Or', 'Pyr', 'Ryn', 'Syl', 'Tor', 'Val', 'Wyn', 'Zar'];
  const NAME_END = ['a', 'ion', 'is', 'or', 'wen', 'dor', 'ric', 'wyn', 'ath', 'iel', 'us', 'en', 'mir', 'ra', 'thas', 'ka'];
  const randomName = () => NAME_START[pick(NAME_START.length)] + NAME_END[pick(NAME_END.length)];

  function randomLook() {
    Object.assign(look, {
      cls: CLASSES[pick(CLASSES.length)].key, color: pick(COLORS.length), skin: pick(SKINS.length),
      hair: pick(HAIRS.length), trim: pick(TRIMS.length), pet: pick(PETS.length),
    });
    refreshCreator(true);
  }

  function refreshCreator(animate) {
    const cls = classByKey(look.cls);
    for (const b of document.querySelectorAll('.cls-btn')) {
      b.classList.toggle('on', b.dataset.cls === look.cls);
      b.querySelector('img').src = heroDataURL({ ...look, cls: b.dataset.cls });
    }
    [...$('#colorRow').children].forEach((b, i) => b.classList.toggle('on', i === look.color));
    [...$('#skinRow').children].forEach((b, i) => b.classList.toggle('on', i === look.skin));
    [...$('#hairRow').children].forEach((b, i) => b.classList.toggle('on', i === (look.hair || 0)));
    [...$('#trimRow').children].forEach((b, i) => b.classList.toggle('on', i === (look.trim || 0)));
    [...$('#petRow').children].forEach((b, i) => b.classList.toggle('on', i === (look.pet || 0)));
    // "Natural" shows the class's own hair color; classes under a helmet or hood have no hair to color.
    const hasHair = classHasHair(look.cls);
    $('#hairBlock').classList.toggle('hidden', !hasHair);
    if (hasHair) $('#hairRow').firstChild.style.background = cls.pal.H;
    $('#colorName').textContent = COLORS[look.color].name;
    $('#hairName').textContent = HAIRS[look.hair || 0].name;
    $('#trimName').textContent = TRIMS[look.trim || 0].name;
    $('#clsName').textContent = cls.name;
    $('#clsAttack').textContent = `ATTACK: ${cls.attack}`;
    $('#clsBlurb').textContent = cls.blurb;
    $('#clsPerk').textContent = `PERK: ${cls.perk} (when class perks are on)`;
    stage.setPlayers([{ id: 'you', ...look, name: look.name || 'You', connected: true }]);
    if (animate) stage.heroHop.set('you', performance.now());
  }

  $('#btnName').onclick = () => {
    $('#inName').value = randomName();
    look.name = $('#inName').value;
  };
  $('#btnRandom').onclick = randomLook;

  function openCreator(isEdit) {
    editing = isEdit;
    $('#joinFields').classList.toggle('hidden', isEdit);
    $('#btnJoin').textContent = isEdit ? 'SAVE HERO' : 'JOIN BATTLE';
    $('#btnSolo').classList.toggle('hidden', isEdit);
    $('#btnDaily').classList.toggle('hidden', isEdit);
    $('#btnHof').classList.toggle('hidden', isEdit);
    Music.stop();
    $('#inCode').value = code;
    $('#inName').value = look.name;
    $('#joinErr').textContent = '';
    refreshCreator(false);
    showScreen('scrJoin');
  }

  // Saves the creator's choices; false means the hero still needs a name.
  function saveLook() {
    look.name = $('#inName').value.trim() || look.name;
    store.set('ww_profile', look);
    if (look.name) return true;
    $('#joinErr').textContent = 'Give your hero a name!';
    $('#inName').focus();
    return false;
  }

  $('#btnJoin').onclick = async () => {
    Sfx.unlock();
    if (editing) {
      saveLook();
      editing = false;
      socket.emit('player:update', look);
      showForState();
      return;
    }
    code = $('#inCode').value.trim().toUpperCase();
    if (code.length !== 4) {
      $('#joinErr').textContent = 'Enter the 4-letter room code from the big screen.';
      return;
    }
    if (!saveLook()) return;
    $('#btnJoin').disabled = true;
    const res = await ack('player:join', { code, ...look });
    $('#btnJoin').disabled = false;
    if (!res || !res.ok) {
      $('#joinErr').textContent = (res && res.error) || 'Could not join. Try again.';
      return;
    }
    onJoined(res);
  };

  // PLAY SOLO, or the daily quest (the same words for everyone today, with its own Hall of Fame).
  async function startSolo(isDaily) {
    Sfx.unlock();
    if (!saveLook()) return;
    battleCode = $('#inCode').value.trim().toUpperCase();
    const btn = isDaily ? $('#btnDaily') : $('#btnSolo');
    btn.disabled = true;
    const res = await ack('solo:start', { ...look, daily: isDaily });
    btn.disabled = false;
    if (!res || !res.ok) {
      $('#joinErr').textContent = 'Could not start a solo quest. Try again.';
      return;
    }
    code = res.snapshot.code;
    onJoined(res);
  }
  $('#btnSolo').onclick = () => startSolo(false);
  $('#btnDaily').onclick = () => startSolo(true);

  $('#btnEdit').onclick = () => openCreator(true);
  $('#msgBtn').onclick = () => openCreator(false);

  // ---- solo ----------------------------------------------------------
  function leaveSolo() {
    socket.emit('solo:quit');
    store.del(`ww_token_${code}`);
    you = null;
    solo = false;
    daily = null;
    records = {};
    code = battleCode;
    arena.clearWords();
    history.replaceState(null, '', code ? `/play?room=${code}` : '/play');
    openCreator(false);
  }

  $('#btnAgain').onclick = () => socket.emit('solo:again');
  $('#btnMenu').onclick = leaveSolo;
  $('#btnQuit').onclick = () => {
    if (confirm('Leave this quest? This run will not be saved.')) leaveSolo();
  };

  // ---- hall of fame --------------------------------------------------
  async function loadHof() {
    try {
      hof = await fetch('/api/highscores', { cache: 'no-store' }).then((r) => r.json());
    } catch (e) { /* keep the last copy */ }
    return hof;
  }

  const fmtDate = (t) => new Date(t).toLocaleDateString('en', { day: 'numeric', month: 'short' }).toUpperCase();

  function hofRow(e, rank, mine) {
    const sub = e.place ? `#${e.place} of ${e.of} · ${fmtDate(e.at)}` : `${e.kills} slain · ${fmtDate(e.at)}`;
    return el('div', { class: `t3${mine ? ' me' : ''}` }, [
      el('span', { text: `${rank}.` }),
      heroImg(e),
      el('div', { class: 'who' }, [el('div', { text: e.name }), el('small', { text: sub })]),
      el('span', { class: 'sc', text: e.score }),
    ]);
  }

  function renderHofList(box, board, mineId) {
    const list = hof ? hof[board] || [] : null;
    if (!list || !list.length) {
      const empty = { solo: 'No solo legends yet. Be the first!', daily: "Nobody has finished today's daily quest yet.", battle: 'No battles recorded yet.' }[board];
      box.append(el('p', { class: 'hof-empty', text: list ? empty : 'Loading...' }));
      return;
    }
    list.forEach((e, i) => box.append(hofRow(e, i + 1, e.id === mineId)));
  }

  function renderHof() {
    for (const t of document.querySelectorAll('.tab')) t.classList.toggle('on', t.dataset.board === hofBoard);
    $('#hofList').innerHTML = '';
    renderHofList($('#hofList'), hofBoard);
  }

  for (const t of document.querySelectorAll('.tab')) {
    t.onclick = () => { hofBoard = t.dataset.board; renderHof(); };
  }
  $('#btnHof').onclick = async () => {
    showScreen('scrHof');
    renderHof();
    await loadHof();
    renderHof();
  };
  $('#btnHofBack').onclick = () => openCreator(false);

  // ---- connection ----------------------------------------------------
  socket.on('connect', async () => {
    offset = await syncClock(socket);
    const saved = code && store.get(`ww_token_${code}`);
    if (saved) {
      const res = await ack('player:resume', { code, token: saved });
      if (res && res.ok) return onJoined(res);
      store.del(`ww_token_${code}`);
    }
    if (you && solo) {
      leaveSolo();
      showMsg('QUEST ENDED', 'This solo quest has expired. Start a new one any time!', true);
    } else if (you) {
      you = null;
      showMsg('BATTLE ENDED', 'This room is closed. Scan the QR code on the big screen to join a new battle.', true);
    } else {
      openCreator(false);
    }
  });
  socket.on('disconnect', () => {
    if (you) showToast('Reconnecting...', 'bad', 3000);
  });

  function onJoined(res) {
    you = res.you;
    solo = Boolean(res.snapshot.solo);
    daily = res.snapshot.daily || null;
    $('#btnMusic').classList.toggle('hidden', !solo);
    if (!solo) battleCode = code;
    else if (battleCode === code) battleCode = ''; // resumed a solo quest after a reload
    records = res.snapshot.records || {};
    $('#btnQuit').classList.toggle('hidden', !solo);
    if (solo) loadHof().then(updateTopbar);
    arena.selfId = you;
    store.set(`ww_token_${code}`, res.token);
    history.replaceState(null, '', `/play?room=${code}`);
    rounds = res.snapshot.rounds;
    mode = res.snapshot.mode || 'ffa';
    setPlayers(res.snapshot.players);
    arena.setWords(res.snapshot.words);
    applyState(res.snapshot);
  }

  let switchingTo = null; // the team you asked to switch to with SWITCH TEAM
  let noteTimer = null;
  socket.on('room:players', (list) => {
    const before = me()?.team;
    setPlayers(list);
    if (you && !list.some((p) => p.id === you)) return;
    const after = me()?.team;
    if (teamBattle() && before !== undefined && after !== before && after !== switchingTo) {
      // The host moved you.
      $('#lobbyNote').textContent = `The host moved you to ${TEAMS[after].name}!`;
      $('#lobbyNote').classList.remove('hidden');
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => $('#lobbyNote').classList.add('hidden'), 4000);
      Sfx.play('join');
    }
    if (after === switchingTo) switchingTo = null;
    if (state.state === 'lobby' && !editing) renderLobby();
  });
  socket.on('room:state', (s) => applyState(s));
  socket.on('word:spawn', (w) => arena.addWord(w));
  socket.on('word:retime', (list) => arena.retime(list));
  socket.on('fx:ice', ({ until }) => arena.setIce(until));
  socket.on('player:streak', ({ id, streak }) => {
    const p = players.find((pl) => pl.id === id);
    if (p) p.streak = streak;
    if (id === you) renderStreak();
  });
  socket.on('player:emote', ({ id, e }) => arena.emote(id, e));
  socket.on('boss:hit', ({ hp, by, dmg }) => {
    if (boss) boss.hp = hp;
    arena.bossHit(hp, dmg);
    if (by === you) Sfx.play('bosshit');
  });
  socket.on('boss:down', ({ by }) => {
    if (boss) Object.assign(boss, { hp: 0, down: true });
    clearTyping();
    arena.bossDown();
    arena.callout('VICTORY!', '#ffd23f', by === you ? 'You slew the Dragon King!' : `${nameOf(by)} slew the Dragon King!`);
    Sfx.play('roar');
    Sfx.play('boom');
    if (navigator.vibrate) navigator.vibrate([80, 40, 160]);
  });

  // Streak milestones of your own get a callout; the chip in the corner keeps count.
  const STREAK_CALLS = { 3: ['ON FIRE!', '#ff7b1c'], 6: ['UNSTOPPABLE!', '#7fd4ff'], 10: ['LEGENDARY!', '#bb8cff'] };
  function noteStreak(by, k) {
    const p = players.find((pl) => pl.id === by);
    if (p && k.streak !== undefined) p.streak = k.streak;
    if (by !== you) return;
    const call = STREAK_CALLS[k.streak] || (k.streak > 10 && k.streak % 5 === 0 ? STREAK_CALLS[10] : null);
    if (call) {
      arena.callout(call[0], call[1], `${k.streak} in a row${k.mult > 1 ? ` · x${k.mult} points` : ''}`);
      Sfx.play('streak');
    }
    renderStreak(true);
  }

  function renderStreak(bump) {
    const chip = $('#streakChip');
    const s = (options.streaks && me()?.streak) || 0;
    const on = state.state === 'playing' && s >= 2;
    if (!on) {
      chip.classList.add('hidden');
      return;
    }
    let mult = s >= 10 ? 3 : s >= 6 ? 2 : s >= 3 ? 1.5 : 1;
    if (teamBattle()) mult = Math.min(2, mult);
    chip.textContent = `STREAK ${s}${mult > 1 ? ` · x${mult}` : ''}`;
    chip.className = `streak${s >= 10 ? ' max' : s >= 6 ? ' blue' : s >= 3 ? ' hot' : ''}`;
    if (bump) {
      void chip.offsetWidth;
      chip.classList.add('bump');
    }
  }

  // Team battle ---------------------------------------------------------
  const setScore = (id, score, roundScore, kills) => {
    const p = players.find((pl) => pl.id === id);
    if (!p) return;
    p.score = score;
    if (kills !== undefined) p.kills = kills;
    if (state.round >= 0 && roundScore !== undefined) p.roundScores[state.round] = roundScore;
    updateTopbar();
  };
  const setHp = (hp) => {
    if (!teams || !hp) return;
    hp.forEach((v, i) => { teams[i].hp = v; });
    renderHp();
  };
  const nameOf = (id) => players.find((p) => p.id === id)?.name || 'Someone';

  socket.on('duel:launch', (d) => {
    const { slot, missile } = d;
    if (missile.by !== you) lostWord(missile.text, 'TOO SLOW!', `${nameOf(missile.by)} launched "${missile.text}"`);
    arena.duelLaunch(slot, missile);
    if (missile.by === you) {
      Sfx.play('shoot');
      if (navigator.vibrate) navigator.vibrate(25);
    }
    noteStreak(missile.by, d);
  });
  socket.on('duel:block', (b) => {
    const w = arena.words.get(b.id);
    if (w && b.by !== you) lostWord(w.text, 'TOO SLOW!', `${nameOf(b.by)} blocked "${w.text}"`);
    setScore(b.by, b.score, b.roundScore, b.kills);
    arena.duelBlock(b.id, b.by);
    if (b.by === you) showToast(`BLOCKED! +${b.gained}${b.perk ? ' PERK' : ''}`, 'good');
    noteStreak(b.by, b);
  });
  socket.on('duel:hit', (h) => {
    const w = arena.words.get(h.id);
    if (w && h.team === myTeam()) lostWord(w.text, 'TOO LATE!', `"${w.text}" hit your team`);
    setScore(h.by, h.score, h.roundScore);
    arena.duelHit(h.id, h.team, h.dmg, h.shielded);
    setHp(h.hp);
    if (h.team === myTeam() && !h.shielded) {
      const bar = $(`#hpBar${h.team}`);
      bar.classList.remove('hit');
      void bar.offsetWidth;
      bar.classList.add('hit');
      Sfx.play('escape');
      if (navigator.vibrate) navigator.vibrate(60);
    }
  });
  socket.on('duel:power', (pw) => {
    const w = arena.words.get(pw.id);
    if (w && pw.by !== you) {
      const who = pw.team === myTeam() ? nameOf(pw.by) : `${TEAMS[pw.team].short} team`;
      lostWord(w.text, 'TOO SLOW!', `${who} grabbed "${w.text}"`);
    }
    const before = teams ? teams[pw.team].hp : 0;
    effects = pw.effects;
    arena.setEffects(effects);
    setHp(pw.hp);
    const info = POWERS[pw.power];
    const label = pw.power === 'potion' ? `+${(teams ? teams[pw.team].hp : 0) - before} HP` : `${info.name}!`;
    arena.duelPower(pw.id, pw.by, pw.team, pw.power, label);
    renderFx();
    const ours = pw.team === myTeam();
    showToast(`${ours ? (pw.by === you ? 'YOU' : nameOf(pw.by)) : TEAMS[pw.team].short} GOT ${info.name}!`, ours ? 'good' : 'bad', 1800);
    Sfx.play(ours ? 'join' : 'miss');
    noteStreak(pw.by, pw);
  });
  socket.on('duel:retime', (list) => arena.retime(list));
  socket.on('word:escape', ({ id }) => {
    const w = arena.words.get(id);
    if (w) lostWord(w.text, 'TOO LATE!', `"${w.text}" ${w.kind === 'power' ? 'faded away' : 'got away'}`);
    arena.escape(id);
    if (solo) Sfx.play('escape');
  });
  socket.on('word:clear', () => arena.clearWords());
  socket.on('word:kill', onKill);
  socket.on('player:kicked', () => {
    store.del(`ww_token_${code}`);
    you = null;
    showMsg('REMOVED', 'The host removed you from this battle.', true);
  });
  socket.on('room:closed', () => {
    if (solo) {
      leaveSolo();
      showMsg('QUEST ENDED', 'This solo quest has expired. Start a new one any time!', true);
      return;
    }
    store.del(`ww_token_${code}`);
    you = null;
    showMsg('BATTLE ENDED', 'The host closed this room.', true);
  });

  function setPlayers(list) {
    players = list;
    arena.setPlayers(list);
    // Team battle: your army is drawn on the near side, the enemy across from it.
    arena.setTeamMode(teamBattle(), teamBattle() ? myTeam() : null);
    updateTopbar();
    renderHp();
  }

  function renderHp() {
    const on = teamBattle() && Boolean(teams);
    const strip = $('#hpStrip');
    const wasHidden = strip.classList.contains('hidden');
    strip.classList.toggle('hidden', !on);
    if (wasHidden !== !on) syncReserve();
    if (!on) return;
    teams.forEach((t, i) => {
      $(`#hpFill${i}`).style.width = `${(t.hp / t.max) * 100}%`;
      $(`#hpFill${i}`).style.background = TEAMS[i].color;
      $(`#hpVal${i}`).textContent = t.hp;
      $(`#hpSide${i}`).classList.toggle('mine', i === myTeam());
      $(`#hpSide${i}`).querySelector('span').style.color = TEAMS[i].color;
    });
  }

  // Active power-ups under each HP bar, with seconds left.
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
      const box = $(`#hpFx${team}`);
      box.innerHTML = '';
      for (const [name, secs] of list) {
        box.append(el('span', { class: 'fx-chip', style: `color:${POWERS[name].color}` }, [
          el('img', { src: powerDataURL(name), alt: '' }), `${POWERS[name].short} ${secs}s`,
        ]));
      }
    });
  }

  // ---- phases --------------------------------------------------------
  function applyState(s) {
    const prev = state.state;
    state = { state: s.state, round: s.round, phaseEndsAt: s.phaseEndsAt };
    if (s.records) records = s.records;
    if (s.rounds) rounds = s.rounds;
    if (s.options) options = s.options;
    summary = s.summary || null;
    boss = s.boss || null;
    arena.setBoss(boss);
    arena.setIce(s.iceUntil);
    mode = s.mode || 'ffa';
    teams = s.teams || null;
    winner = s.winner ?? null;
    ko = Boolean(s.ko);
    effects = s.effects || [{}, {}];
    arena.setEffects(effects);
    if (s.players) setPlayers(s.players);
    else {
      arena.setTeamMode(teamBattle(), teamBattle() ? myTeam() : null);
      renderHp();
    }
    const r = rounds[s.round];
    if (r) arena.setTheme(r.monster);
    if (s.state === 'lobby') arena.setTheme('slime');
    if (editing && s.state !== 'lobby') editing = false;
    if (!you || editing) return;
    showForState(prev);
  }

  function showForState(prev) {
    const st = state.state;
    const typing = st === 'countdown' || st === 'playing';
    $('#typeIn').disabled = !typing && st !== 'intermission';
    if (st === 'lobby') {
      arena.clearWords();
      renderLobby();
      showScreen('scrLobby');
    } else if (st === 'finished') {
      $('#typeIn').blur();
      if (solo) {
        hof = null; // this run may have just entered it
        loadHof().then(() => { if (state.state === 'finished') renderFinal(); });
      }
      renderFinal();
      showScreen('scrFinal');
      const won = solo || records[you]?.rank === 1
        || (teamBattle() ? winner === myTeam() : rankPlayers(players)[0]?.id === you);
      if (prev && prev !== 'finished' && won) Sfx.play('win');
    } else {
      showScreen('scrGame');
      if (st === 'countdown' && prev !== 'countdown') {
        Sfx.play('round');
        clearTyping();
      }
      if (st === 'playing' && prev === 'countdown') {
        Sfx.play('go');
        flashBanner();
        if (rounds[state.round]?.key === 'boss') {
          Sfx.play('roar');
          arena.shake(2, 600);
        }
      }
      if (typing) $('#typeIn').focus();
    }
    updateBanner();
    updateTapHint();
    renderStreak();
    renderEmotes();
    syncMusic();
  }

  // Solo quests have their own soundtrack (battles leave the music to the big screen).
  Music.on = store.get('ww_music') !== false;
  function syncMusic() {
    $('#btnMusic').classList.toggle('off', !Music.on);
    if (!solo || !you) {
      Music.stop();
      return;
    }
    const st = state.state;
    const r = rounds[state.round];
    Music.play(st === 'countdown' || st === 'playing' ? r?.key : st === 'intermission' ? 'lobby' : null);
  }
  $('#btnMusic').onclick = () => {
    Sfx.unlock();
    Music.on = !Music.on;
    store.set('ww_music', Music.on);
    syncMusic();
  };

  // ---- emotes --------------------------------------------------------
  let emoteAt = 0;
  function sendEmote(i) {
    const t = performance.now();
    if (t - emoteAt < 1200) return;
    emoteAt = t;
    socket.emit('player:emote', { e: i });
    const bars = document.querySelectorAll('.emotes');
    bars.forEach((b) => b.classList.add('cool'));
    setTimeout(() => bars.forEach((b) => b.classList.remove('cool')), 1200);
    if (navigator.vibrate) navigator.vibrate(15);
  }
  for (const box of document.querySelectorAll('.emotes')) {
    EMOTES.forEach((e, i) => box.append(el('button', { type: 'button', text: e, 'aria-label': `Send ${e}`, onclick: () => sendEmote(i) })));
  }
  function renderEmotes() {
    const on = Boolean(options.emotes) && !solo && Boolean(you);
    $('#emoteLobby').classList.toggle('hidden', !on);
    $('#emoteGame').classList.toggle('hidden', !on || state.state !== 'intermission');
    $('#emoteFinal').classList.toggle('hidden', !on);
  }

  let fightUntil = 0;
  function flashBanner() {
    fightUntil = performance.now() + 700;
  }

  function updateBanner() {
    const st = state.state;
    const r = rounds[state.round];
    const banner = $('#gBanner');
    const left = Math.max(0, state.phaseEndsAt - now());
    $('#fb2').style.color = '';
    if (st === 'countdown' && r) {
      const n = Math.ceil(left / 1000);
      banner.classList.remove('hidden');
      $('#fb1').textContent = r.key === 'boss' ? 'FINAL ROUND' : `ROUND ${state.round + 1}`;
      $('#fb2').textContent = r.name;
      $('#fb2').className = `fb-2 d-${r.key}`;
      $('#fb3').textContent = teamBattle()
        ? `${r.title} · x${r.multiplier} damage · you're ${TEAMS[myTeam()].name}`
        : r.key === 'boss' ? `${r.title} · every word you type hurts it!` : `${r.title} · x${r.multiplier} pts`;
      $('#fb4').textContent = n > 3 ? 'READY?' : String(Math.max(1, n));
    } else if (st === 'playing' && performance.now() < fightUntil) {
      banner.classList.remove('hidden');
      $('#fb1').textContent = '';
      $('#fb2').textContent = '';
      $('#fb3').textContent = '';
      $('#fb4').textContent = 'FIGHT!';
    } else if (st === 'intermission' && r) {
      const ranked = rankPlayers(players);
      const idx = ranked.findIndex((p) => p.id === you);
      const mine = ranked[idx];
      const next = rounds[state.round + 1];
      const roundPts = mine ? mine.roundScores[state.round] || 0 : 0;
      banner.classList.remove('hidden');
      $('#fb1').textContent = `ROUND ${state.round + 1} CLEAR!`;
      $('#fb2').textContent = solo ? `+${roundPts}` : `#${idx + 1}`;
      $('#fb2').className = 'fb-2';
      if (!mine) $('#fb3').textContent = '';
      else if (solo) $('#fb3').textContent = `${mine.score} total · ${mine.kills} monsters slain`;
      else $('#fb3').textContent = `+${roundPts} this round · ${mine.score} total`;
      if (teamBattle() && teams) {
        const ours = teams[myTeam()].hp;
        const theirs = teams[1 - myTeam()].hp;
        $('#fb2').textContent = ours > theirs ? 'WINNING!' : ours < theirs ? 'LOSING!' : 'TIED!';
        $('#fb2').style.color = ours > theirs ? '#8be36b' : ours < theirs ? 'var(--red)' : '';
        $('#fb3').textContent = `You scored ${roundPts} · ${TEAMS[0].short} ${teams[0].hp} HP vs ${TEAMS[1].short} ${teams[1].hp} HP`;
      }
      $('#fb4').textContent = next ? `${next.name} IN ${Math.ceil(left / 1000)}` : '';
      $('#fb4').style.fontSize = '14px';
      return;
    } else {
      banner.classList.add('hidden');
    }
    $('#fb4').style.fontSize = '';
  }

  function updateTopbar() {
    const r = rounds[state.round];
    $('#gRound').textContent = r ? `${daily ? 'DAILY ' : ''}R${state.round + 1} ${r.name}` : '';
    const mine = me();
    $('#gScore').textContent = mine ? mine.score : 0;
    $('#gRank').style.color = '';
    if (teamBattle()) {
      $('#gRank').textContent = TEAMS[myTeam()].short;
      $('#gRank').style.color = TEAMS[myTeam()].color;
      return;
    }
    if (solo) {
      const board = hof && hof[daily ? 'daily' : 'solo'];
      const best = board && board[0] ? board[0].score : 0;
      $('#gRank').textContent = `HI ${Math.max(best, mine ? mine.score : 0)}`;
      return;
    }
    const idx = rankPlayers(players).findIndex((p) => p.id === you);
    $('#gRank').textContent = idx >= 0 ? `#${idx + 1}/${players.length}` : '';
  }

  function tick() {
    if (state.state === 'playing' || state.state === 'countdown') {
      const r = rounds[state.round];
      const left = state.state === 'playing' ? Math.max(0, state.phaseEndsAt - now()) : (r ? r.duration : 0);
      const secs = Math.ceil(left / 1000);
      $('#gTime').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      $('#gTime').classList.toggle('low', state.state === 'playing' && secs <= 10);
    } else if (state.state === 'intermission') {
      $('#gTime').textContent = 'BREAK';
      $('#gTime').classList.remove('low');
    }
    // The last ten seconds: red edges (and in solo, a ticking clock and faster music).
    const left = Math.max(0, state.phaseEndsAt - now());
    const tense = state.state === 'playing' && left > 0 && left <= 10000 && !(boss && boss.down);
    $('#field').classList.toggle('tense', tense);
    if (solo) {
      Music.setFast(tense);
      const sec = Math.ceil(left / 1000);
      if (tense && sec !== lastTick) Sfx.play('tick');
      lastTick = tense ? sec : null;
    }
    if (!$('#scrGame').classList.contains('hidden')) updateBanner();
    if (teams) renderFx();
  }
  let lastTick = null;
  setInterval(tick, 100);

  // ---- typing --------------------------------------------------------
  const typeIn = $('#typeIn');
  const normalize = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
  const visibleWords = () => arena.typeable(now());
  // The longest start of s that some word on screen still begins with.
  const matchPrefix = (s, words) => {
    let ok = s;
    while (ok && !words.some((w) => w.text.startsWith(ok))) ok = ok.slice(0, -1);
    return ok;
  };

  const typeShow = $('#typeShow');
  let shown = ''; // normalized text in the box after the last edit
  let keyTimes = []; // when each letter of `shown` was typed; the gaps go with each claim (auto-type guard)
  let lastCleared = null; // { text, kept }: the last text we cut back to `kept` ('' when wiped)

  // The box shows the part that still matches a word in gold and anything after it white on red.
  function showTyped(v, ok) {
    typeShow.textContent = '';
    if (ok) typeShow.append(el('span', { class: 'ok', text: ok }));
    if (v.length > ok.length) typeShow.append(el('span', { class: 'bad', text: v.slice(ok.length) }));
  }

  function setTypo(on) {
    typeIn.classList.toggle('miss', on);
    $('#typeHint').classList.toggle('hidden', !on);
    arena.typo = on;
  }

  function flashTypebar() {
    for (const node of [typeIn, $('#typebar')]) {
      node.classList.remove('oops');
      void node.offsetWidth;
      node.classList.add('oops');
    }
  }

  function clearTyping() {
    const v = normalize(typeIn.value);
    if (v) lastCleared = { text: v, kept: '' };
    typeIn.value = '';
    shown = '';
    keyTimes = [];
    arena.typed = '';
    showTyped('', '');
    setTypo(false);
  }

  // Nothing gets into the box except by typing it.
  for (const ev of ['paste', 'drop']) typeIn.addEventListener(ev, (e) => e.preventDefault());

  typeIn.addEventListener('input', (e) => {
    // Text put in by a script on the page doesn't count.
    if (!e.isTrusted) {
      typeIn.value = shown;
      return;
    }
    let v = normalize(typeIn.value);
    // Some phone keyboards re-insert the text we just wiped or cut back (plus the next key) in one go when
    // composition ends. Strip that replay and keep the new key.
    const lc = lastCleared;
    if (lc && shown === lc.kept && v.length > shown.length + 1
      && v.startsWith(lc.text) && v.length <= lc.text.length + 1) {
      v = lc.kept + v.slice(lc.text.length);
    }
    // One key, one letter: a word landing all at once (swipe, a keyboard suggestion, an auto-typer pasting)
    // is thrown away.
    if (v.length > shown.length + 1) {
      lastCleared = { text: v, kept: shown };
      typeIn.value = shown;
      showSteal('TYPE IT!', 'No swipe, paste or suggestions');
      return;
    }
    const playing = state.state === 'playing';
    const words = playing ? visibleWords() : [];
    // One Backspace throws away every red letter, back to the part that still matches a word.
    if (playing && v.length < shown.length && shown.startsWith(v)) {
      const good = matchPrefix(shown, words);
      if (v.length > good.length) {
        lastCleared = { text: v, kept: good };
        v = good;
      }
    }
    const grew = v.length > shown.length;
    let same = 0;
    while (same < v.length && v[same] === shown[same]) same++;
    keyTimes.length = Math.min(keyTimes.length, same);
    while (keyTimes.length < v.length) keyTimes.push(performance.now());
    shown = v;
    if (typeIn.value !== v) typeIn.value = v; // keep the real text lined up with the colored copy on top
    const hit = words.find((w) => w.text === v);
    if (hit) return claim(hit);
    const ok = playing ? matchPrefix(v, words) : v;
    arena.typed = ok;
    showTyped(v, ok);
    const typo = ok !== v;
    if (typo && grew) {
      // Every wrong key gets a shake, a buzz and a red flash - and ends your streak.
      flashTypebar();
      Sfx.play('miss');
      if (navigator.vibrate) navigator.vibrate(30);
      if (playing) {
        socket.emit('player:typo');
        const mine = me();
        if (mine && options.streaks && mine.streak >= 3) showToast(`STREAK LOST (${mine.streak} IN A ROW)`, 'bad');
        if (mine) mine.streak = 0;
        renderStreak();
      }
    }
    setTypo(typo);
  });

  // The word you were partway through is gone - someone else got it, or it got away. If nothing else on
  // screen still matches what you typed, start over and say so loudly.
  function lostWord(text, title, detail) {
    if (!arena.typed || !text.startsWith(arena.typed)) return;
    if (visibleWords().some((w) => w.text !== text && w.text.startsWith(arena.typed))) return;
    clearTyping();
    showSteal(title, detail);
  }

  let stealTimer = null;
  function showSteal(title, detail) {
    $('#stealTitle').textContent = title;
    $('#stealWho').textContent = detail;
    const box = $('#steal');
    box.classList.remove('hidden', 'pop');
    void box.offsetWidth;
    box.classList.add('pop');
    clearTimeout(stealTimer);
    stealTimer = setTimeout(() => box.classList.add('hidden'), 1600);
    flashTypebar();
    Sfx.play('miss');
    if (navigator.vibrate) navigator.vibrate([70, 40, 70]);
  }

  // Enter (the keyboard's Done key on phones) throws the whole word away. Backspace deletes one letter,
  // or all the red ones at once (see the input handler).
  typeIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.keyCode === 13) {
      e.preventDefault();
      clearTyping();
    }
  });

  function claim(word) {
    const keys = keyTimes.slice(1).map((t, i) => Math.round(t - keyTimes[i]));
    clearTyping();
    socket.emit('player:claim', { id: word.id, text: word.text, keys }, (res) => {
      if (res && !res.ok && res.reason === 'auto') {
        // The server thought a machine typed it; the word stays up for everyone else.
        showSteal('BLOCKED!', 'That looked like an auto-typer');
      } else if (res && !res.ok && res.reason === 'taken' && !toasted.has(word.id)) {
        // You finished it, but someone's claim reached the server first.
        toasted.add(word.id);
        showSteal('TOO SLOW!', `${res.by || 'Someone'} got "${word.text}" first`);
      }
    });
  }

  function onKill(k) {
    const word = arena.words.get(k.id);
    const p = players.find((pl) => pl.id === k.by);
    if (p) {
      p.score = k.score;
      p.kills = k.kills;
      if (state.round >= 0) p.roundScores[state.round] = k.roundScore;
    }
    const name = p ? p.name : 'Someone';
    if (k.by === you) {
      if (!k.bomb) Sfx.play('shoot');
      if (navigator.vibrate) navigator.vibrate(25);
    } else if (word) {
      toasted.add(k.id);
      if (k.bomb) lostWord(word.text, 'BOOM!', `${name}'s bomb blasted "${word.text}"`);
      else lostWord(word.text, 'TOO SLOW!', `${name} got "${word.text}"`);
    }
    arena.kill(k.id, k.by, k.points, k);
    if (!k.bomb) noteStreak(k.by, k);
    if (k.special === 'ice') {
      arena.callout('FREEZE!', '#7fd4ff', k.by === you ? 'Everything falls slower' : `${name} slowed everything`);
      Sfx.play('freeze');
    } else if (k.special === 'bomb') {
      arena.callout('BOOM!', '#ff7b1c', k.by === you ? 'You blasted the field!' : `${name} blasted the field`);
      Sfx.play('boom');
    } else if (k.special === 'gold' && k.by === you) {
      arena.callout('GOLD!', '#ffd23f', 'x3 points');
      Sfx.play('award');
    }
    updateTopbar();
  }

  arena.onHit = (pid) => { if (pid === you) Sfx.play('hit'); };

  let toastTimer = null;
  function showToast(text, kind, ms = 1400) {
    const t = $('#toast');
    t.textContent = text;
    t.className = `toast show ${kind || ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  // Tapping the battlefield keeps (or brings back) the keyboard.
  const field = $('#field');
  field.addEventListener('touchstart', (e) => {
    if (e.target.closest('.emotes')) return; // let emote taps through
    e.preventDefault();
    if (!typeIn.disabled) typeIn.focus();
  }, { passive: false });
  field.addEventListener('mousedown', (e) => {
    if (e.target.closest('.emotes')) return;
    e.preventDefault();
    if (!typeIn.disabled) typeIn.focus();
  });
  function updateTapHint() {
    const want = (state.state === 'countdown' || state.state === 'playing') && document.activeElement !== typeIn;
    $('#tapHint').classList.toggle('hidden', !want);
  }
  typeIn.addEventListener('focus', updateTapHint);
  typeIn.addEventListener('blur', updateTapHint);

  // ---- lobby + results ----------------------------------------------
  function heroImg(p) {
    return el('img', { class: 'px-sprite', src: heroDataURL(p), alt: '' });
  }

  function renderLobby() {
    const mine = me();
    if (mine) {
      $('#lobbyHero').src = heroDataURL(mine);
      $('#lobbyPet').classList.toggle('hidden', !PETS[mine.pet]);
      if (PETS[mine.pet]) $('#lobbyPet').src = petDataURL(mine.pet);
      $('#lobbyName').textContent = mine.name;
      $('#lobbyClass').textContent = `${classByKey(mine.cls).name} · ${classByKey(mine.cls).attack}`;
    }
    const tb = teamBattle();
    const side = mine ? TEAMS[mine.team] : null;
    $('#lobbyTeam').classList.toggle('hidden', !tb || !side);
    if (tb && side) {
      $('#lobbyTeam').textContent = side.name;
      $('#lobbyTeam').style.background = side.color;
    }
    $('#btnTeam').classList.toggle('hidden', !tb);
    $('#lobbyMode').textContent = tb
      ? "TEAM BATTLE: type your side's words to hit the other team!"
      : 'FREE FOR ALL: first to type a word gets the points!';
    $('#lobbyCount').textContent = players.length;
    // What the host has switched on, and your class's perk when perks are on.
    const opts = $('#lobbyOpts');
    opts.innerHTML = '';
    const names = { streaks: 'STREAKS', specials: 'SPECIAL WORDS', boss: 'BOSS FINALE', perks: 'CLASS PERKS', awards: 'AWARDS' };
    for (const [k, label] of Object.entries(names)) {
      if (options[k] && !(tb && (k === 'boss' || k === 'specials'))) opts.append(el('span', { text: label }));
    }
    if (options.wordCount) opts.append(el('span', { text: `${options.wordCount} HOST WORDS` }));
    const perk = options.perks && mine ? classByKey(mine.cls).perk : '';
    $('#lobbyPerk').textContent = perk ? `PERK: ${perk}` : '';
    $('#lobbyPerk').classList.toggle('hidden', !perk);
    const roster = $('#lobbyRoster');
    roster.innerHTML = '';
    for (const p of players) {
      const cls = `mini${p.id === you ? ' me' : ''}${tb ? ` team${p.team}` : ''}`;
      roster.append(el('div', { class: cls }, [heroImg(p), el('span', { text: p.name })]));
    }
  }

  function renderFinal() {
    const ranked = rankPlayers(players);
    const idx = ranked.findIndex((p) => p.id === you);
    const mine = ranked[idx];
    if (!mine) return;
    const rec = records[you];
    $('#fHero').src = heroDataURL(mine);
    $('#fScore').textContent = mine.score;
    $('#fKills').textContent = mine.kills;
    $('#fRounds').textContent = rounds.map((r, i) => `${r.name} +${mine.roundScores[i] || 0}`).join('  ·  ');
    $('#fSoloActions').classList.toggle('hidden', !solo);
    $('#fWait').classList.toggle('hidden', solo);
    $('#fScoreLbl').textContent = 'SCORE';
    $('#fKillsLbl').textContent = teamBattle() ? 'WORDS TYPED' : 'MONSTERS SLAIN';
    $('#fPlace').style.color = '';
    // Your typing stats, and any awards you won.
    const st = summary?.stats?.[you];
    $('#fTyping').classList.toggle('hidden', !st || !st.words);
    if (st) {
      $('#fWpm').textContent = st.wpm ? `${st.wpm} WPM` : '-';
      $('#fAcc').textContent = `${st.acc}%`;
      $('#fBest').textContent = options.streaks ? st.best : '-';
    }
    const won = $('#fAwards');
    won.innerHTML = '';
    for (const a of (summary?.awards || []).filter((x) => x.id === you)) {
      won.append(el('div', { class: 'my-award' }, [`★ ${a.title}`, el('small', { text: `${a.desc} · ${a.value}` })]));
    }
    const top = $('#fTop');
    top.innerHTML = '';
    const topHeroes = (colorByTeam) => {
      top.append(el('h3', { text: 'TOP HEROES' }));
      ranked.slice(0, 3).forEach((p, i) => {
        top.append(el('div', { class: `t3${p.id === you ? ' me' : ''}` }, [
          el('span', { text: `${i + 1}.` }), heroImg(p),
          el('span', { text: p.name, style: colorByTeam ? `color:${TEAMS[p.team].color}` : '' }),
          el('span', { class: 'sc', text: p.score }),
        ]));
      });
    };

    if (teamBattle() && teams && winner !== null) {
      const ours = myTeam();
      $('#fTitle').textContent = winner === -1 ? 'DRAW!' : winner === ours ? 'VICTORY!' : 'DEFEAT...';
      $('#fPlace').textContent = winner === -1
        ? `${TEAMS[0].short} ${teams[0].hp} HP · ${TEAMS[1].short} ${teams[1].hp} HP`
        : `${TEAMS[winner].name} WIN${ko ? ' BY K.O.!' : '!'}`;
      $('#fPlace').style.color = winner >= 0 ? TEAMS[winner].color : '';
      $('#fRecord').classList.add('hidden');
      $('#fScoreLbl').textContent = 'DAMAGE + BLOCKS';
      topHeroes(true);
      return;
    }

    if (solo) {
      const board = daily ? 'daily' : 'solo';
      if (daily) $('#fTitle').textContent = rec && rec.rank === 1 ? 'BEST TODAY!' : 'DAILY QUEST DONE!';
      else $('#fTitle').textContent = rec && rec.rank === 1 ? 'NEW HIGH SCORE!' : 'QUEST COMPLETE!';
      if (rec) $('#fPlace').textContent = `#${rec.rank} ${daily ? 'today' : 'in the Hall of Fame'}`;
      else $('#fPlace').textContent = mine.score ? 'Not in the Hall of Fame... yet!' : 'No monsters slain this time!';
      if (boss) $('#fPlace').textContent += boss.down ? ' · Dragon King slain!' : ' · The Dragon King got away';
      $('#fRecord').classList.add('hidden');
      top.append(el('h3', { text: daily ? `DAILY QUEST · ${daily}` : 'HALL OF FAME · SOLO' }));
      renderHofList(top, board, rec && rec.entryId);
      if (hof && rec && rec.rank > (hof[board] || []).length) {
        top.append(el('p', { class: 'hof-empty', text: '...' }), hofRow({ ...mine, at: Date.now() }, rec.rank, true));
      }
      return;
    }

    $('#fTitle').textContent = idx === 0 ? 'VICTORY!' : idx < 3 ? 'PODIUM!' : 'WELL FOUGHT!';
    $('#fPlace').textContent = `#${idx + 1} of ${ranked.length}`;
    $('#fRecord').textContent = rec ? (rec.rank === 1 ? 'NEW HIGH SCORE!' : `HALL OF FAME #${rec.rank}`) : '';
    $('#fRecord').classList.toggle('hidden', !rec);
    topHeroes(false);
  }

  $('#btnTeam').onclick = () => {
    switchingTo = 1 - myTeam();
    socket.emit('player:team');
  };
  document.addEventListener('pointerdown', () => Sfx.unlock());
  buildCreator();
  refreshCreator(false);
})();
