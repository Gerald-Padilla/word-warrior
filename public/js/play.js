// Phone controller: hero creator, lobby, typing battle and results.
(function () {
  const { $, el, syncClock, rankPlayers, Sfx } = window.WW;
  const { CLASSES, COLORS, SKINS, heroDataURL, classByKey } = window.Art;

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
  const toasted = new Set();

  const look = Object.assign({
    name: '',
    cls: CLASSES[Math.floor(Math.random() * CLASSES.length)].key,
    color: Math.floor(Math.random() * COLORS.length),
    skin: 0,
  }, store.get('ww_profile') || {});

  const ack = (ev, data) => new Promise((res) => socket.emit(ev, data, res));
  const me = () => players.find((p) => p.id === you);

  // ---- viewport: keep the typing bar above the on-screen keyboard ----
  function fit() {
    const vv = window.visualViewport;
    document.documentElement.style.setProperty('--app-h', `${vv ? vv.height : window.innerHeight}px`);
    $('#app').style.transform = vv && vv.offsetTop ? `translateY(${vv.offsetTop}px)` : '';
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
  function buildCreator() {
    const grid = $('#clsGrid');
    for (const c of CLASSES) {
      grid.append(el('button', {
        class: 'cls-btn', 'data-cls': c.key, type: 'button',
        onclick: () => { look.cls = c.key; refreshCreator(true); },
      }, [el('img', { class: 'px-sprite', alt: '' }), el('span', { text: c.name })]));
    }
    COLORS.forEach((c, i) => $('#colorRow').append(el('button', {
      class: 'swatch', type: 'button', title: c.name, style: `background:${c.P}`,
      onclick: () => { look.color = i; refreshCreator(true); },
    })));
    SKINS.forEach((s, i) => $('#skinRow').append(el('button', {
      class: 'swatch', type: 'button', style: `background:${s.S}`,
      onclick: () => { look.skin = i; refreshCreator(true); },
    })));
    $('#previewImg').addEventListener('click', () => hop($('#previewImg')));
  }

  function hop(img) {
    img.classList.remove('hop', 'bob');
    void img.offsetWidth;
    img.classList.add('hop');
    setTimeout(() => { img.classList.remove('hop'); img.classList.add('bob'); }, 360);
  }

  function refreshCreator(animate) {
    const cls = classByKey(look.cls);
    for (const b of document.querySelectorAll('.cls-btn')) {
      b.classList.toggle('on', b.dataset.cls === look.cls);
      b.querySelector('img').src = heroDataURL({ ...look, cls: b.dataset.cls });
    }
    [...$('#colorRow').children].forEach((b, i) => b.classList.toggle('on', i === look.color));
    [...$('#skinRow').children].forEach((b, i) => b.classList.toggle('on', i === look.skin));
    $('#previewImg').src = heroDataURL(look);
    $('#clsName').textContent = cls.name;
    $('#clsAttack').textContent = `ATTACK: ${cls.attack}`;
    $('#clsBlurb').textContent = cls.blurb;
    if (animate) hop($('#previewImg'));
  }

  function openCreator(isEdit) {
    editing = isEdit;
    $('#joinFields').classList.toggle('hidden', isEdit);
    $('#btnJoin').textContent = isEdit ? 'SAVE HERO' : 'JOIN BATTLE';
    $('#btnSolo').classList.toggle('hidden', isEdit);
    $('#btnHof').classList.toggle('hidden', isEdit);
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

  $('#btnSolo').onclick = async () => {
    Sfx.unlock();
    if (!saveLook()) return;
    battleCode = $('#inCode').value.trim().toUpperCase();
    $('#btnSolo').disabled = true;
    const res = await ack('solo:start', look);
    $('#btnSolo').disabled = false;
    if (!res || !res.ok) {
      $('#joinErr').textContent = 'Could not start a solo quest. Try again.';
      return;
    }
    code = res.snapshot.code;
    onJoined(res);
  };

  $('#btnEdit').onclick = () => openCreator(true);
  $('#msgBtn').onclick = () => openCreator(false);

  // ---- solo ----------------------------------------------------------
  function leaveSolo() {
    socket.emit('solo:quit');
    store.del(`ww_token_${code}`);
    you = null;
    solo = false;
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
    const list = hof ? hof[board] : null;
    if (!list || !list.length) {
      const empty = board === 'solo' ? 'No solo legends yet. Be the first!' : 'No battles recorded yet.';
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
    if (!solo) battleCode = code;
    else if (battleCode === code) battleCode = ''; // resumed a solo quest after a reload
    records = res.snapshot.records || {};
    $('#btnQuit').classList.toggle('hidden', !solo);
    if (solo) loadHof().then(updateTopbar);
    arena.selfId = you;
    store.set(`ww_token_${code}`, res.token);
    history.replaceState(null, '', `/play?room=${code}`);
    rounds = res.snapshot.rounds;
    setPlayers(res.snapshot.players);
    arena.setWords(res.snapshot.words);
    applyState(res.snapshot);
  }

  socket.on('room:players', (list) => {
    setPlayers(list);
    if (you && !list.some((p) => p.id === you)) return;
    if (state.state === 'lobby' && !editing) renderLobby();
  });
  socket.on('room:state', (s) => applyState(s));
  socket.on('word:spawn', (w) => arena.addWord(w));
  socket.on('word:escape', ({ id }) => {
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
    updateTopbar();
  }

  // ---- phases --------------------------------------------------------
  function applyState(s) {
    const prev = state.state;
    state = { state: s.state, round: s.round, phaseEndsAt: s.phaseEndsAt };
    if (s.records) records = s.records;
    if (s.players) setPlayers(s.players);
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
      const won = solo || records[you]?.rank === 1 || rankPlayers(players)[0]?.id === you;
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
      }
      if (typing) $('#typeIn').focus();
    }
    updateBanner();
    updateTapHint();
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
    if (st === 'countdown' && r) {
      const n = Math.ceil(left / 1000);
      banner.classList.remove('hidden');
      $('#fb1').textContent = `ROUND ${state.round + 1}`;
      $('#fb2').textContent = r.name;
      $('#fb2').className = `fb-2 ${['d-easy', 'd-medium', 'd-hard'][state.round] || ''}`;
      $('#fb3').textContent = `${r.title} · x${r.multiplier} pts`;
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
    $('#gRound').textContent = r ? `R${state.round + 1} ${r.name}` : '';
    const mine = me();
    $('#gScore').textContent = mine ? mine.score : 0;
    if (solo) {
      const best = hof && hof.solo[0] ? hof.solo[0].score : 0;
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
    if (!$('#scrGame').classList.contains('hidden')) updateBanner();
  }
  setInterval(tick, 100);

  // ---- typing --------------------------------------------------------
  const typeIn = $('#typeIn');
  const normalize = (s) => s.toLowerCase().replace(/[^a-z]/g, '');

  function visibleWords() {
    const t = now();
    return [...arena.words.values()].filter((w) => t >= w.spawn && t <= w.spawn + w.dur);
  }

  let shown = ''; // normalized text in the box after the last edit
  let lastCleared = null; // { text, t } of the last text we wiped

  function clearTyping() {
    const v = normalize(typeIn.value);
    if (v) lastCleared = { text: v, t: performance.now() };
    typeIn.value = '';
    shown = '';
    arena.typed = '';
    typeIn.classList.remove('miss');
  }

  typeIn.addEventListener('input', () => {
    let v = normalize(typeIn.value);
    // Some phone keyboards re-insert the text we just wiped (plus the next key) when composition ends.
    // Only strip that exact replay so a word swiped in one go isn't cut short.
    const lc = lastCleared;
    if (lc && !shown && performance.now() - lc.t < 1500 && lc.text.length >= 2
      && v.startsWith(lc.text) && v.length <= lc.text.length + 1) {
      v = v.slice(lc.text.length);
      typeIn.value = v;
    }
    shown = v;
    arena.typed = v;
    if (!v || state.state !== 'playing') {
      typeIn.classList.remove('miss');
      return;
    }
    const words = visibleWords();
    const hit = words.find((w) => w.text === v);
    if (hit) return claim(hit);
    const onTrack = words.some((w) => w.text.startsWith(v));
    if (!onTrack && !typeIn.classList.contains('miss')) Sfx.play('miss');
    typeIn.classList.toggle('miss', !onTrack);
  });

  // Enter (the keyboard's Done key on phones) throws the whole word away; Backspace deletes one letter.
  typeIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.keyCode === 13) {
      e.preventDefault();
      clearTyping();
    }
  });

  function claim(word) {
    clearTyping();
    socket.emit('player:claim', { id: word.id, text: word.text }, (res) => {
      if (res && !res.ok && res.reason === 'taken' && !toasted.has(word.id)) {
        toasted.add(word.id);
        showToast(`TOO SLOW! ${res.by || 'Someone'} got it`, 'bad');
        Sfx.play('miss');
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
    if (k.by === you) {
      Sfx.play('shoot');
      if (navigator.vibrate) navigator.vibrate(25);
    } else if (word && arena.typed && word.text.startsWith(arena.typed)) {
      // Someone sniped the word you were typing.
      const others = visibleWords().some((w) => w.id !== k.id && w.text.startsWith(arena.typed));
      if (!others) {
        clearTyping();
        toasted.add(k.id);
        showToast(`TOO SLOW! ${p ? p.name : 'Someone'} got "${word.text}"`, 'bad');
        Sfx.play('miss');
      }
    }
    arena.kill(k.id, k.by, k.points);
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
    e.preventDefault();
    if (!typeIn.disabled) typeIn.focus();
  }, { passive: false });
  field.addEventListener('mousedown', (e) => {
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
      $('#lobbyName').textContent = mine.name;
      $('#lobbyClass').textContent = `${classByKey(mine.cls).name} · ${classByKey(mine.cls).attack}`;
    }
    $('#lobbyCount').textContent = players.length;
    const roster = $('#lobbyRoster');
    roster.innerHTML = '';
    for (const p of players) {
      roster.append(el('div', { class: `mini${p.id === you ? ' me' : ''}` }, [heroImg(p), el('span', { text: p.name })]));
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
    const top = $('#fTop');
    top.innerHTML = '';

    if (solo) {
      $('#fTitle').textContent = rec && rec.rank === 1 ? 'NEW HIGH SCORE!' : 'QUEST COMPLETE!';
      if (rec) $('#fPlace').textContent = `#${rec.rank} in the Hall of Fame`;
      else $('#fPlace').textContent = mine.score ? 'Not in the Hall of Fame... yet!' : 'No monsters slain this time!';
      $('#fRecord').classList.add('hidden');
      top.append(el('h3', { text: 'HALL OF FAME · SOLO' }));
      renderHofList(top, 'solo', rec && rec.entryId);
      if (hof && rec && rec.rank > hof.solo.length) {
        top.append(el('p', { class: 'hof-empty', text: '...' }), hofRow({ ...mine, at: Date.now() }, rec.rank, true));
      }
      return;
    }

    $('#fTitle').textContent = idx === 0 ? 'VICTORY!' : idx < 3 ? 'PODIUM!' : 'WELL FOUGHT!';
    $('#fPlace').textContent = `#${idx + 1} of ${ranked.length}`;
    $('#fRecord').textContent = rec ? (rec.rank === 1 ? 'NEW HIGH SCORE!' : `HALL OF FAME #${rec.rank}`) : '';
    $('#fRecord').classList.toggle('hidden', !rec);
    top.append(el('h3', { text: 'TOP HEROES' }));
    ranked.slice(0, 3).forEach((p, i) => {
      top.append(el('div', { class: `t3${p.id === you ? ' me' : ''}` }, [
        el('span', { text: `${i + 1}.` }), heroImg(p), el('span', { text: p.name }), el('span', { class: 'sc', text: p.score }),
      ]));
    });
  }

  document.addEventListener('pointerdown', () => Sfx.unlock());
  buildCreator();
  refreshCreator(false);
})();
