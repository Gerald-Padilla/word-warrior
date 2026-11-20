// Phone controller: hero creator, lobby, typing battle and results.
(function () {
  const { $, el, syncClock, watchBuild, rankPlayers, drawStandings, drawCatsLabel, longClass, TEAMS, Sfx, Music, EMOTES } = window.WW;
  const { CLASSES, COLORS, SKINS, HAIRS, TRIMS, PETS, POWERS } = window.Art;
  const { heroDataURL, petDataURL, powerDataURL, crownDataURL, classByKey, classHasHair } = window.Art;

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* private mode */ } },
  };

  const socket = io();
  watchBuild(socket);
  let offset = 0;
  const now = () => Date.now() + offset;
  const arena = new Arena($('#arena'), { mode: 'phone', now });
  // Duel: the arena (following your hero) and your thumbs on it.
  const BR = window.BrawlRules;
  const bView = new BrawlView($('#bCanvas'), { now, phone: true });
  const bPad = new BrawlPad($('#bField'), { view: bView, onInput: (m) => socket.emit('brawl:in', m), onSkill: () => brawlSkill() });

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
  let royale = null; // battle royale: { start, nextAt, ramp, total, left, hp, damage }
  let brawl = null; // duel: { layout, start, endsAt, bossAt }
  let myFx = {}; // duel: power-ups you have going, name -> until (server ms)
  let lastKo = null; // duel: how you were last knocked out
  let fightAt = 0; // duel: when the fight started here (for FIGHT! and the help line)
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
  const royaleOn = () => mode === 'royale' && !solo;
  const knockedOut = () => royaleOn() && Boolean(me()?.out);
  const brawlOn = () => mode === 'brawl' && !solo;

  // ---- viewport: keep the typing bar above the on-screen keyboard ----
  // A PC window or a tablet gets the phone layout scaled up (--ui), so nothing ends up tiny on a big
  // screen: about 1000 x 620 on its side, 480 x 800 upright. Phones stay at 1. While you're typing, the
  // keyboard shrinking the window doesn't count, so the scale doesn't jump.
  let tallest = 0;
  let wideAt = 0;
  function uiScale() {
    const w = window.innerWidth;
    const typingNow = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
    if (w !== wideAt || !typingNow || window.innerHeight > tallest) tallest = window.innerHeight;
    wideAt = w;
    const h = tallest;
    const z = w > h ? Math.min(w / 1000, h / 620) : Math.min(w / 480, h / 800);
    return z < 1.05 ? 1 : Math.round(Math.min(2.5, z) * 100) / 100;
  }
  function fit() {
    const vv = window.visualViewport;
    const z = uiScale();
    const root = document.documentElement.style;
    root.setProperty('--ui', z);
    root.setProperty('--app-h', `${(vv ? vv.height : window.innerHeight) / z}px`);
    root.setProperty('--app-w', `${window.innerWidth / z}px`);
    $('#app').style.transform = vv && vv.offsetTop ? `translateY(${vv.offsetTop / z}px)` : '';
    requestAnimationFrame(syncReserve);
    // The canvases' CSS size may not change with the scale, so redraw them at their new size on screen.
    if (z !== shownScale) {
      shownScale = z;
      requestAnimationFrame(() => {
        arena.resize();
        stage.resize();
      });
    }
  }
  let shownScale = 1;

  // On a short landscape screen the HP bars (team battle) or standings (battle royale) float over the top
  // of the battlefield; keep the action below them.
  function syncReserve() {
    let top = 0;
    for (const strip of [$('#hpStrip'), $('#royale')]) {
      const over = !strip.classList.contains('hidden')
        && strip.getBoundingClientRect().top >= $('#field').getBoundingClientRect().top - 1;
      if (over) top = Math.max(top, strip.offsetHeight);
    }
    arena.setReserveTop(top);
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
    const kit = BR.KITS[look.cls] || BR.KITS.knight;
    if (you && brawlOn()) {
      const pet = BR.PETS[look.pet];
      $('#clsAttack').textContent = `ATTACK: ${cls.attack} · ${kit.hp} HP${pet ? ` · PET: ${pet.attack}` : ''}`;
      $('#clsPerk').textContent = `DUEL PERK: ${kit.perk.name}: ${kit.perk.text}`;
      $('#clsSkill').textContent = `DUEL SKILL: ${kit.skill.name}: ${kit.skill.text}`;
    } else {
      $('#clsPerk').textContent = `PERK: ${cls.perk} (when class perks are on)`;
      $('#clsSkill').textContent = `SKILL: ${cls.skill} (charges every 8 words, when skills are on)`;
    }
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
    chat = res.snapshot.chat || [];
    $('#btnQuit').classList.toggle('hidden', !solo);
    if (solo) loadHof().then(updateTopbar);
    arena.selfId = you;
    store.set(`ww_token_${code}`, res.token);
    history.replaceState(null, '', `/play?room=${code}`);
    rounds = res.snapshot.rounds;
    mode = res.snapshot.mode || 'ffa';
    setPlayers(res.snapshot.players);
    arena.setWords(res.snapshot.words);
    bView.selfId = you;
    applyState(res.snapshot);
    if (res.snapshot.brawlShots) bView.addShots(res.snapshot.brawlShots);
    // Draw battle under way: the drawing and guesses so far, and anything only you may know.
    if (res.snapshot.strokes) {
      pad.set(res.snapshot.strokes);
      const got = (res.snapshot.draw ? res.snapshot.draw.guessed : []).map((g) => ({ id: `got-${g.id}`, got: true, by: g.id, points: g.points, order: g.order }));
      dFeed = (res.snapshot.feed || []).concat(got);
      secret = res.snapshot.secret || null;
      renderDrawScreen();
      renderDFeed();
    }
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

  // ---- skills -------------------------------------------------------
  // Typing words charges your class's skill; when it's full, tap the button (or press Space) to use it.
  let skill = { on: false, charge: 0, max: 8, boost: 0 };
  const skillOf = (p) => {
    const [name, desc] = classByKey(p ? p.cls : look.cls).skill.split(': ');
    return { name, desc };
  };
  socket.on('skill:charge', (s) => {
    const was = skill.charge >= skill.max;
    skill = s;
    const ready = skill.charge >= skill.max;
    if (ready && !was && state.state === 'playing') {
      Sfx.play('reveal');
      showToast(`${skillOf(me()).name} READY! TAP IT OR PRESS SPACE`, 'good', 2000);
    }
    renderSkill();
  });
  // Whoever used a skill gets a banner with their hero on every phone, and the effect plays from them.
  socket.on('skill:cast', (c) => {
    arena.castSkill(c, classByKey(c.skill).skill.split(': ')[1] || '');
    if (c.id === you) {
      Sfx.play(`skill:${c.skill}`);
      if (navigator.vibrate) navigator.vibrate([30, 30, 60]);
    }
  });
  socket.on('skill:use', (u) => {
    setScore(u.id, u.score, u.roundScore, u.kills);
    if (u.hp) setHp(u.hp);
    if (u.id === you && u.myHp !== null && u.myHp !== undefined && me()) {
      me().hp = u.myHp;
      renderRoyale();
    }
    if (u.heal) {
      const o = arena.heroOrigin(u.id);
      setTimeout(() => arena.floatText(o.x, o.y - 10 * arena.U, `+${u.heal} HP`, '#7dff6b', null, 'SKILL'), 650);
    }
    arena.skillTotal(u.id, u.total);
  });

  // ---- battle royale -------------------------------------------------
  // Everyone's HP and score, a few times a second, for the standings.
  socket.on('royale:board', (list) => {
    for (const u of list) {
      const p = players.find((pl) => pl.id === u.id);
      if (p) Object.assign(p, u);
    }
    renderRoyale();
    updateTopbar();
  });
  socket.on('royale:stage', ({ round, ramp }) => {
    const r = rounds[round];
    if (!r || knockedOut()) return;
    if (ramp) arena.callout('FASTER!', '#ff7b4a', `Hits do ${r.damage} now`);
    else arena.callout(`${r.name}!`, { easy: '#8be36b', medium: '#b99cff', hard: '#ff7b4a' }[r.key] || '#ffd23f', `${r.title} · hits do ${r.damage}`);
    Sfx.play('round');
    if (navigator.vibrate) navigator.vibrate([40, 40, 40]);
  });
  socket.on('royale:out', ({ id, place, left }) => {
    const p = players.find((pl) => pl.id === id);
    if (p) Object.assign(p, { out: true, place, hp: 0 });
    if (royale) royale.left = left;
    if (id === you) {
      // You're out: the field empties and the banner says where you finished; the standings keep going.
      clearTyping();
      $('#typeIn').blur();
      $('#typeIn').disabled = true;
      updateTapHint();
      arena.royaleOut(you);
      Sfx.play('boom');
      if (navigator.vibrate) navigator.vibrate([120, 60, 200]);
      renderSkill();
    } else if (!knockedOut()) {
      showToast(`${p ? p.name : 'A hero'} IS OUT! ${left} LEFT`, 'good', 1800);
    }
    renderRoyale();
    updateTopbar();
    updateBanner();
  });

  // Your HP, how many are left, and the leaders: the top three, plus you if you're further down.
  const hpColor = (frac) => (frac > 0.5 ? '#5bd46a' : frac > 0.25 ? '#ffd23f' : '#ff5a4d');
  function renderRoyale() {
    const on = royaleOn() && Boolean(royale) && ['countdown', 'playing'].includes(state.state);
    const box = $('#royale');
    const wasHidden = box.classList.contains('hidden');
    box.classList.toggle('hidden', !on);
    if (wasHidden !== !on) requestAnimationFrame(syncReserve);
    if (!on) return;
    const mine = me();
    const max = royale.hp;
    const hp = mine ? mine.hp ?? max : 0;
    $('#ryFill').style.width = `${(100 * hp) / max}%`;
    $('#ryFill').style.background = hpColor(hp / max);
    $('#ryHp').textContent = mine && mine.out ? 'OUT' : hp;
    $('#ryLeft').textContent = `${royale.left}/${royale.total} LEFT`;
    const ranked = rankPlayers(players);
    const idx = ranked.findIndex((p) => p.id === you);
    const rows = ranked.slice(0, 3).map((p, i) => [p, i]);
    if (idx >= 3) rows.push([ranked[idx], idx]);
    const list = $('#ryList');
    list.innerHTML = '';
    for (const [p, i] of rows) {
      const frac = (p.hp ?? max) / max;
      list.append(el('li', { class: `${p.id === you ? 'me' : ''}${p.out ? ' out' : ''}` }, [
        el('span', { text: `${i + 1}.` }),
        heroImg(p),
        el('span', { class: 'nm', text: p.name }),
        p.out
          ? el('span', { class: 'gone', text: p.late ? 'LATE' : `OUT #${p.place}` })
          : el('span', { class: 'hpm' }, [el('i', { style: `width:${100 * frac}%;background:${hpColor(frac)}` })]),
        el('span', { class: 'sc', text: p.score }),
      ]));
    }
  }
  const shakeHp = () => {
    const bar = $('#ryBar');
    bar.classList.remove('hit');
    void bar.offsetWidth;
    bar.classList.add('hit');
  };

  function renderSkill() {
    const btn = $('#btnSkill');
    const st = state.state;
    const on = Boolean(skill.on && options.skills && you && (st === 'countdown' || st === 'playing' || st === 'intermission') && !knockedOut());
    btn.classList.toggle('hidden', !on);
    if (!on) return;
    const { name } = skillOf(me());
    const ready = skill.charge >= skill.max;
    btn.className = `skill${ready ? ' ready' : ''}${skill.boost ? ' boost' : ''}`;
    btn.innerHTML = '';
    btn.append(el('b', { text: name }),
      ready ? 'READY! (SPACE)' : skill.boost ? `BOOST x${skill.boost} LEFT` : `${skill.charge}/${skill.max} WORDS`,
      el('span', { class: 'fill', style: `width:${Math.min(100, (skill.charge / skill.max) * 100)}%` }));
  }

  function useSkill() {
    if (skill.charge < skill.max || state.state !== 'playing') return;
    skill.charge = 0;
    renderSkill();
    socket.emit('player:skill', {}, (res) => {
      if (res && !res.ok && res.reason === 'charging') showToast('SKILL STILL CHARGING', 'bad');
    });
  }
  // Keep the keyboard up: the button acts on press without taking focus from the typing box.
  $('#btnSkill').addEventListener('pointerdown', (e) => e.preventDefault());
  $('#btnSkill').addEventListener('click', useSkill);

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
    if (d.boosted) arena.useBoost(missile.by);
    if (missile.by === you) {
      Sfx.play('shoot');
      if (navigator.vibrate) navigator.vibrate(25);
    }
    if (!d.skill) noteStreak(missile.by, d);
  });
  socket.on('duel:block', (b) => {
    const w = arena.words.get(b.id);
    if (w && b.by !== you) lostWord(w.text, 'TOO SLOW!', `${nameOf(b.by)} blocked "${w.text}"`);
    setScore(b.by, b.score, b.roundScore, b.kills);
    arena.duelBlock(b.id, b.by, b.skill);
    if (b.boosted) arena.useBoost(b.by);
    if (b.by === you) showToast(`BLOCKED! +${b.gained}${b.perk ? ' PERK' : ''}`, 'good');
    if (!b.skill) noteStreak(b.by, b);
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
  socket.on('word:escape', ({ id, dmg, hp }) => {
    const w = arena.words.get(id);
    if (w) lostWord(w.text, 'TOO LATE!', `"${w.text}" ${w.kind === 'power' ? 'faded away' : 'got away'}`);
    arena.escape(id);
    if (solo) Sfx.play('escape');
    // Battle royale: it reached you.
    if (dmg && me()) {
      me().hp = hp;
      arena.royaleHurt(you, dmg, false);
      arena.flash('#e8371c');
      shakeHp();
      Sfx.play('escape');
      if (navigator.vibrate) navigator.vibrate(90);
      renderRoyale();
    }
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
    bView.setPlayers(list);
    arena.setRoyale(royaleOn(), royale ? royale.hp : 100);
    arena.setPlayers(list);
    // Team battle: your army is drawn on the near side, the enemy across from it.
    arena.setTeamMode(teamBattle(), teamBattle() ? myTeam() : null);
    updateTopbar();
    renderHp();
    renderRoyale();
    renderDrawTop();
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

  // ---- draw battle ---------------------------------------------------
  // Your turn: pick one of three words, then draw it with your finger while everyone else guesses.
  // Otherwise the drawing comes in as it's drawn and you type guesses. Right and close guesses only show
  // on your own phone; wrong ones go to everyone.
  const drawOn = () => mode === 'draw' && !solo;
  let draw = null; // the turn (see drawOf on the server)
  let secret = null; // just for you: { choices } when it's your turn to pick, { word } while you draw or once you've guessed it
  let dFeed = []; // { id, by, name, color, text }, { id, got: true, by, points, order }, or your own { id, close: true, text }
  let dTurn = 0; // the turn the board and the guesses are from
  const pad = new Sketch($('#dCanvas'));
  const pen = { c: 0, w: 1, eraser: false };
  const myTurn = () => drawOn() && Boolean(draw) && draw.drawer === you;
  const iGotIt = () => Boolean(draw && draw.guessed.some((g) => g.id === you));
  const canDraw = () => myTurn() && draw.phase === 'draw' && state.state === 'playing';
  // What one entry is (WORD, VERB, ANIMAL, FOOD, CHARACTER, TITLE, SONG, STAR or PERSON), and whether to name each word's category.
  const thing = () => options.drawNoun || 'WORD';
  const aThing = () => `${/^[AEIOU]/.test(thing()) ? 'AN' : 'A'} ${thing()}`; // "AN ANIMAL", "A WORD"
  const manyCats = () => (options.drawCats || []).length > 1;
  const clockText = (ms) => {
    const secs = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  };

  socket.on('draw:line', (l) => pad.add(l));
  socket.on('draw:undo', () => pad.undo());
  socket.on('draw:clear', () => pad.clear());
  socket.on('draw:secret', (s) => {
    secret = s;
    renderDrawScreen();
  });
  socket.on('draw:hint', ({ hint }) => {
    if (!draw) return;
    draw.hint = hint;
    renderDrawScreen();
    if (!myTurn() && !iGotIt()) {
      showDToast('A LETTER IS REVEALED!', 'good');
      Sfx.play('reveal');
    }
  });
  socket.on('draw:say', (m) => addDFeed(m));
  socket.on('draw:guessed', (g) => {
    setScore(g.id, g.score, g.roundScore, g.kills);
    setScore(g.drawer, g.drawerScore, g.drawerRoundScore);
    if (draw && !draw.guessed.some((x) => x.id === g.id)) draw.guessed = draw.guessed.concat({ id: g.id, points: g.points, order: g.order });
    addDFeed({ id: `got-${g.id}`, got: true, by: g.id, points: g.points, order: g.order });
    if (g.drawer === you && g.share) {
      showDToast(`${nameOf(g.id)} GOT IT! +${g.share} FOR YOU`, 'good');
      Sfx.play('join');
    } else if (g.id !== you) {
      Sfx.play('emote');
    }
    renderDrawScreen();
  });
  socket.on('draw:round', ({ round }) => {
    showDToast(`ROUND ${round + 1}: EVERYONE DRAWS AGAIN!`, 'good', 2400);
    Sfx.play('round');
  });

  function addDFeed(m) {
    dFeed = dFeed.concat(m).slice(-30);
    renderDFeed();
  }

  function renderDFeed() {
    const box = $('#dFeed');
    box.innerHTML = '';
    if (!dFeed.length) {
      box.append(el('div', { class: 'empty', text: myTurn() ? 'Guesses show up here as they come in.' : 'Type a guess below. Right answers stay secret!' }));
    }
    for (const m of dFeed) {
      if (m.got) {
        const nth = ['FIRST', '2ND', '3RD'][m.order];
        box.append(el('div', { class: `m got${m.by === you ? ' me' : ''}`, text: `${m.by === you ? 'YOU' : nameOf(m.by)} GOT IT! +${m.points}${nth ? ` · ${nth}` : ''}` }));
      } else if (m.close) {
        box.append(el('div', { class: 'm close me', text: `"${m.text}" IS CLOSE!` }));
      } else {
        box.append(el('div', { class: `m${m.by === you ? ' me' : ''}` }, [
          el('b', { text: `${m.done ? '✓ ' : ''}${m.name}`, style: `color:${(COLORS[m.color] || COLORS[0]).Q}` }), m.text,
        ]));
      }
    }
    box.scrollTop = box.scrollHeight;
  }

  let dToastTimer = null;
  function showDToast(text, kind, ms = 1600) {
    const t = $('#dToast');
    t.textContent = text;
    t.className = `toast show ${kind || ''}`;
    clearTimeout(dToastTimer);
    dToastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  // Round and turn, the clock, your score and place.
  function renderDrawTop() {
    if (!drawOn()) return;
    const D = draw;
    $('#dRound').textContent = D ? `${rounds.length === 1 ? '' : `R${state.round + 1} · `}TURN ${D.turn}/${D.turns}` : 'DRAW BATTLE';
    const mine = me();
    $('#dScore').textContent = mine ? mine.score : 0;
    const idx = rankPlayers(players).findIndex((p) => p.id === you);
    $('#dRank').textContent = idx >= 0 ? `#${idx + 1}/${players.length}` : '';
  }

  const LEVEL_NAMES = { easy: 'EASY', medium: 'MEDIUM', hard: 'HARD' };
  const NTH = ['1ST', '2ND', '3RD'];

  function renderDrawScreen() {
    if (!drawOn()) return;
    renderDrawTop();
    const D = state.state === 'playing' ? draw : null;
    // The word: yours to draw, the one you guessed, or its blanks.
    const hint = $('#dHint');
    hint.className = '';
    if (!D) {
      hint.className = 'note';
      hint.textContent = 'GET READY TO DRAW AND GUESS!';
    } else if (D.phase === 'choose') {
      hint.className = 'note';
      hint.textContent = myTurn() ? `YOUR TURN! PICK ${aThing()} TO DRAW` : `${nameOf(D.drawer)} IS PICKING ${aThing()}...`;
    } else if (D.phase === 'draw' && (myTurn() || iGotIt())) {
      hint.className = 'mine';
      hint.textContent = `${myTurn() ? 'DRAW: ' : '✓ '}${(secret && secret.word ? secret.word : '').toUpperCase()}`;
    } else if (D.phase === 'draw') {
      hint.textContent = D.hint;
    } else {
      hint.className = 'mine';
      hint.textContent = (D.word || '').toUpperCase();
    }
    if (hint.className !== 'note') hint.classList.add(...longClass(hint.textContent));
    const lvl = $('#dLevel');
    lvl.className = `d-tag ${D && D.level ? D.level : 'hidden'}`;
    lvl.textContent = D && D.level ? `${manyCats() && D.cat ? D.cat : LEVEL_NAMES[D.level]} · ${D.points}` : '';
    // The word's language (ENGLISH, TAGALOG or TAGLISH), so guessers know what to type in. Names have none.
    const lang = $('#dLang');
    lang.className = `d-tag${D && D.lang ? ` lang-${D.lang.toLowerCase()}` : ' hidden'}`;
    lang.textContent = D && D.lang ? D.lang : '';

    // Over the board: the countdown, your three words or who's picking, and the reveal.
    const over = $('#dOver');
    over.innerHTML = '';
    over.className = 'd-over hidden';
    if (state.state === 'countdown') {
      over.className = 'd-over';
      over.append(
        el('div', { class: 'o1', text: drawCatsLabel(options.drawCatNames) }),
        el('div', { class: 'o2', text: 'DRAW BATTLE' }),
        el('div', { class: 'o3', text: 'Take turns drawing on your phone. Guess the others\' drawings: the sooner, the more points!' }),
        el('div', { class: 'o4', text: '' }),
      );
    } else if (D && D.phase === 'choose') {
      over.className = 'd-over';
      if (myTurn() && secret && secret.choices) {
        over.append(
          el('div', { class: 'o2', text: 'YOUR TURN TO DRAW!' }),
          el('div', { class: 'o3', text: `Pick ${aThing().toLowerCase()}. Harder ones are worth more.` }),
          el('div', { class: 'd-picks' }, secret.choices.map((c, i) => el('button', {
            class: `d-pick ${c.level}`, type: 'button',
            onclick: () => {
              socket.emit('draw:pick', { i });
              secret = null;
              over.innerHTML = '';
              over.append(el('div', { class: 'o2', text: 'GET DRAWING!' }));
            },
          }, [c.text.toUpperCase(), el('small', { text: `${manyCats() && c.cat ? `${c.cat} · ` : ''}${LEVEL_NAMES[c.level]} · ${c.points}` })]))),
        );
      } else {
        const p = players.find((pl) => pl.id === D.drawer);
        over.append(
          p ? heroImg(p) : null,
          el('div', { class: 'o2', text: `${p ? p.name : 'Someone'} IS PICKING ${aThing()}` }),
          el('div', { class: 'o3', text: myTurn() ? '' : 'Get ready to guess!' }),
        );
      }
    } else if (D && D.phase === 'reveal' && D.standings) {
      // Between turns: everyone's scores, what they just scored and how far they moved. Your row always
      // stays in, even when the list is cut to fit.
      over.className = 'd-over standings';
      const list = el('div', { class: 'd-stand' });
      for (const s of drawStandings(players, D)) {
        list.append(el('div', { class: `row r${s.rank}${s.p.id === you ? ' me' : ''}`, style: `--i:${s.rank - 1}` }, [
          el('span', { class: 'rk', text: `${s.rank}.` }),
          heroImg(s.p),
          el('span', { class: 'nm', text: s.p.id === you ? `${s.p.name} (YOU)` : s.p.name }),
          el('span', { class: `mv${s.move > 0 ? ' climb' : s.move < 0 ? ' drop' : ''}`, text: s.move > 0 ? `▲${s.move}` : s.move < 0 ? `▼${-s.move}` : '' }),
          el('span', { class: 'gn', text: s.gain ? `+${s.gain}` : '' }),
          el('span', { class: 'sc', text: s.p.score }),
        ]));
      }
      over.append(el('div', { class: 'o1', text: `STANDINGS · TURN ${D.turn} OF ${D.turns}` }), list);
      const others = [...list.children].filter((r) => !r.classList.contains('me'));
      while (list.children.length > 3 && others.length && over.scrollHeight > over.clientHeight) others.pop().remove();
    } else if (D && D.phase === 'reveal') {
      over.className = 'd-over reveal';
      const got = D.guessed.length;
      const mineG = D.guessed.find((g) => g.id === you);
      let line;
      if (D.drawer === you) line = D.why === 'left' ? 'Your turn ended.' : got ? `${got} of ${Math.max(got, D.guessers)} got it · +${D.drawerPts} for your drawing` : 'Nobody got it this time.';
      else if (mineG) line = `You got it ${NTH[mineG.order] || ''}! +${mineG.points}`.replace(' !', '!');
      else line = D.why === 'left' ? `${nameOf(D.drawer)} left the battle` : `Not this time · ${got} of ${Math.max(got, D.guessers)} got it`;
      over.append(el('div', { class: 'o1', text: `THE ${thing()} WAS` }), el('div', { class: 'o2', text: (D.word || '?').toUpperCase() }), el('div', { class: 'o3', text: line }));
    }

    // The drawer gets the tools; everyone else the guess box (open while there's a drawing to guess). Once
    // you've got it you can keep chatting, as long as you don't give the word away.
    $('#dTools').classList.toggle('hidden', !canDraw());
    $('#dBoard').classList.toggle('mine', canDraw());
    const guessing = Boolean(D && D.phase === 'draw' && !myTurn());
    $('#dGuess').classList.toggle('hidden', myTurn());
    $('#dGuess').classList.toggle('done', iGotIt());
    const box = $('#dIn');
    box.disabled = !guessing;
    box.placeholder = !guessing ? 'Wait for the drawing...' : iGotIt() ? 'You got it! Chat away, no spoilers...' : 'Type your guess...';
    $('#dGuess button').textContent = iGotIt() ? 'SEND' : 'GUESS';
    if (!guessing && document.activeElement === box) box.blur();
    renderTools();
  }

  // ---- drawing on your turn
  const dCanvas = $('#dCanvas');
  let stroke = null; // { s, c, w, last } while your finger is down
  let inkBuf = null; // the part of the stroke not sent yet
  let strokeSeq = Math.floor(Math.random() * 1e6) * 10;
  const boardPoint = (e) => {
    const r = dCanvas.getBoundingClientRect();
    const k = r.width / Sketch.W;
    return [Math.round(Math.min(Sketch.W, Math.max(0, (e.clientX - r.left) / k))), Math.round(Math.min(Sketch.H, Math.max(0, (e.clientY - r.top) / k)))];
  };
  function flushInk() {
    if (inkBuf && inkBuf.p.length) socket.emit('draw:line', inkBuf);
    if (inkBuf) inkBuf = { ...inkBuf, p: [] };
  }
  function inkAt(e) {
    const [x, y] = boardPoint(e);
    if (stroke.last && Math.abs(x - stroke.last[0]) + Math.abs(y - stroke.last[1]) < 3) return;
    stroke.last = [x, y];
    pad.add({ s: stroke.s, c: stroke.c, w: stroke.w, p: [x, y] });
    inkBuf.p.push(x, y);
  }
  dCanvas.addEventListener('pointerdown', (e) => {
    if (!canDraw()) return;
    e.preventDefault();
    if (dCanvas.setPointerCapture) dCanvas.setPointerCapture(e.pointerId);
    flushInk();
    strokeSeq += 1;
    stroke = { s: strokeSeq, c: pen.eraser ? Sketch.ERASER : pen.c, w: pen.w, last: null };
    inkBuf = { s: stroke.s, c: stroke.c, w: stroke.w, p: [] };
    inkAt(e);
  });
  dCanvas.addEventListener('pointermove', (e) => {
    if (!stroke) return;
    e.preventDefault();
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ev of list.length ? list : [e]) inkAt(ev);
  });
  const penUp = () => {
    if (!stroke) return;
    flushInk();
    stroke = null;
  };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) dCanvas.addEventListener(ev, penUp);
  setInterval(() => { if (stroke) flushInk(); }, 50);

  // Colors (the paper's own color is the eraser), brush sizes, eraser, undo and clear.
  Sketch.COLORS.forEach((c, i) => {
    if (i === Sketch.ERASER) return;
    $('#dColors').append(el('button', {
      class: 'd-color', type: 'button', style: `background:${c}`, 'data-c': i, 'aria-label': 'Color',
      onclick: () => { pen.c = i; pen.eraser = false; renderTools(); },
    }));
  });
  ['S', 'M', 'L'].forEach((label, i) => {
    const dot = [6, 10, 16][i];
    $('#dSizes').append(el('button', {
      class: 'sz', type: 'button', 'data-w': i, onclick: () => { pen.w = i; renderTools(); },
    }, [el('i', { style: `width:${dot}px;height:${dot}px` }), ` ${label}`]));
  });
  $('#dEraser').onclick = () => { pen.eraser = !pen.eraser; renderTools(); };
  $('#dUndo').onclick = () => {
    if (!canDraw() || stroke || !pad.strokes.length) return;
    pad.undo();
    socket.emit('draw:undo');
  };
  $('#dClear').onclick = () => {
    if (!canDraw() || stroke || !pad.strokes.length) return;
    pad.clear();
    socket.emit('draw:clear');
  };
  function renderTools() {
    for (const b of document.querySelectorAll('.d-color')) b.classList.toggle('on', !pen.eraser && Number(b.dataset.c) === pen.c);
    for (const b of document.querySelectorAll('#dSizes button')) b.classList.toggle('on', Number(b.dataset.w) === pen.w);
    $('#dEraser').classList.toggle('on', pen.eraser);
  }

  // ---- guessing
  $('#dGuess').addEventListener('submit', (e) => {
    e.preventDefault();
    const box = $('#dIn');
    const text = box.value.trim();
    if (!text || !draw || draw.phase !== 'draw' || myTurn()) return;
    box.value = '';
    socket.emit('draw:guess', { text }, (res) => {
      if (!res) return;
      if (res.correct) {
        secret = { word: res.word };
        showDToast(`YOU GOT IT! +${res.points}`, 'good', 2200);
        Sfx.play('award');
        if (navigator.vibrate) navigator.vibrate([40, 30, 80]);
        renderDrawScreen();
      } else if (res.close) {
        addDFeed({ id: `close-${Date.now()}`, close: true, text });
        showDToast('SO CLOSE!', 'good');
        Sfx.play('beep');
      } else if (!res.ok && res.reason === 'answer') {
        // You already have it: a message with the word (or nearly) would give it away.
        showDToast('NO SPOILERS! THAT GIVES THE WORD AWAY', 'bad', 2000);
        Sfx.play('miss');
        const form = $('#dGuess');
        form.classList.remove('shake');
        void form.offsetWidth;
        form.classList.add('shake');
      } else if (!res.ok && res.reason === 'slow') {
        if (!box.value) box.value = text; // too quick after the last one: give it back to send again
      }
    });
  });
  // Tapping GUESS keeps the keyboard up.
  $('#dGuess button').addEventListener('pointerdown', (e) => e.preventDefault());

  // ---- phases --------------------------------------------------------
  function applyState(s) {
    const prev = state.state;
    state = { state: s.state, round: s.round, phaseEndsAt: s.phaseEndsAt };
    if (s.records) records = s.records;
    if (s.rounds) rounds = s.rounds;
    if (s.options) options = s.options;
    summary = s.summary || null;
    boss = s.boss || null;
    arena.setBoss(s.state === 'finished' ? null : boss); // the results screen has the boss's fate in words
    mode = s.mode || 'ffa';
    royale = s.royale || null;
    // Battle royale ice is on your own field: it comes with fx:ice and your snapshot, not the room's state.
    if (!royaleOn() || s.words) arena.setIce(s.iceUntil);
    teams = s.teams || null;
    winner = s.winner ?? null;
    ko = Boolean(s.ko);
    effects = s.effects || [{}, {}];
    arena.setEffects(effects);
    const prevBrawl = brawl;
    brawl = s.brawl || null;
    if (brawl) bView.setLayout(brawl.layout);
    if (brawl && (!prevBrawl || prevBrawl.start !== brawl.start)) {
      bView.reset();
      myFx = {};
      lastKo = null;
      fightAt = 0;
    }
    // Draw battle: a new turn starts with a blank board and no guesses (your secret for it comes next).
    const prevDraw = draw;
    draw = s.draw || null;
    if (draw && draw.turn !== dTurn) {
      dTurn = draw.turn;
      pad.clear();
      dFeed = [];
      secret = null;
      stroke = null;
      inkBuf = null;
      renderDFeed();
      if (draw.drawer === you) {
        Sfx.play('round');
        if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
        $('#dIn').blur();
      }
    }
    if (draw && prevDraw && prevDraw.turn === draw.turn && prevDraw.phase !== draw.phase) {
      if (draw.phase === 'draw' && draw.drawer !== you) {
        Sfx.play('go');
        setTimeout(() => { if (draw && draw.phase === 'draw' && !$('#dIn').disabled) $('#dIn').focus(); }, 50);
      }
      if (draw.phase === 'reveal') Sfx.play(draw.guessed.some((g) => g.id === you) || (draw.drawer === you && draw.guessed.length) ? 'reveal' : 'miss');
    }
    if (draw && prevDraw && prevDraw.turn === draw.turn && draw.standings && !prevDraw.standings) Sfx.play('join');
    if (s.players) setPlayers(s.players);
    else {
      arena.setTeamMode(teamBattle(), teamBattle() ? myTeam() : null);
      renderHp();
      renderRoyale();
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
    const arenaUp = brawlOn() && (st === 'countdown' || st === 'playing');
    bView.active = arenaUp;
    bView.selfId = you;
    bPad.setEnabled(arenaUp && st === 'playing');
    const typing = (st === 'countdown' || st === 'playing') && !knockedOut();
    $('#typeIn').disabled = (!typing && st !== 'intermission') || knockedOut();
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
    } else if (arenaUp) {
      // Duel: the arena, with your thumbs on it.
      $('#typeIn').blur();
      showScreen('scrBrawl');
      if (st === 'countdown' && prev !== 'countdown') Sfx.play('round');
      if (st === 'playing' && prev !== 'playing') {
        Sfx.play('go');
        fightAt = performance.now();
      }
      renderBrawlHud();
      brawlOverlay();
    } else if (drawOn()) {
      // Draw battle: its own screen, with the board in place of the battlefield.
      $('#typeIn').blur();
      showScreen('scrDraw');
      if (st === 'countdown' && prev !== 'countdown') Sfx.play('round');
      renderDrawScreen();
      renderDFeed();
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
    renderSkill();
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

  // ---- lobby chat ----------------------------------------------------
  let chat = []; // { id, by, name, color, text, at }, oldest first
  const CHAT_REFUSED = {
    slow: 'Easy there! Wait a moment before your next message.',
    off: 'The host has turned chat off.',
    'not-lobby': 'Chat is only open in the lobby.',
  };

  function renderChat() {
    const on = Boolean(options.chat) && !solo && Boolean(you);
    $('#chatBox').classList.toggle('hidden', !on);
    if (!on) return;
    const list = $('#chatList');
    list.innerHTML = '';
    if (!chat.length) list.append(el('div', { class: 'chat-empty', text: 'No messages yet. Say hi!' }));
    for (const m of chat) {
      list.append(el('div', { class: `chat-msg${m.by === you ? ' me' : ''}` }, [
        el('b', { text: m.name, style: `color:${(COLORS[m.color] || COLORS[0]).Q}` }), m.text,
      ]));
    }
    list.scrollTop = list.scrollHeight;
  }

  function lobbyNote(text) {
    $('#lobbyNote').textContent = text;
    $('#lobbyNote').classList.remove('hidden');
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => $('#lobbyNote').classList.add('hidden'), 3000);
  }

  socket.on('chat:msg', (m) => {
    chat = chat.concat(m).slice(-30);
    renderChat();
    if (m.by !== you && state.state === 'lobby') Sfx.play('emote');
  });
  socket.on('chat:clear', () => {
    chat = [];
    renderChat();
  });
  $('#chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('#chatIn').value.trim();
    if (!text) return;
    $('#chatIn').value = ''; // cleared now, so a quick next message isn't wiped when this one is confirmed
    socket.emit('chat:send', { text }, (res) => {
      if (res && res.ok) return;
      if (!$('#chatIn').value) $('#chatIn').value = text; // refused: give it back to try again
      if (res && CHAT_REFUSED[res.reason]) lobbyNote(CHAT_REFUSED[res.reason]);
    });
  });
  // Tapping SEND keeps the keyboard up, so you can keep chatting.
  $('#chatForm button').addEventListener('pointerdown', (e) => e.preventDefault());

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
      $('#fb1').textContent = r.key === 'boss' ? 'FINAL ROUND' : rounds.length === 1 ? 'ONE ROUND' : `ROUND ${state.round + 1}`;
      $('#fb2').textContent = r.name;
      $('#fb2').className = `fb-2 d-${r.key}`;
      $('#fb3').textContent = teamBattle()
        ? `${r.title} · x${r.multiplier} damage · you're ${TEAMS[myTeam()].name}`
        : r.key === 'boss' ? `${r.title} · every word you type hurts it!` : `${r.title} · x${r.multiplier} pts`;
      if (royaleOn()) {
        $('#fb1').textContent = 'BATTLE ROYALE';
        $('#fb2').textContent = `${royale ? royale.hp : 100} HP`;
        $('#fb2').className = 'fb-2 d-boss';
        $('#fb3').textContent = knockedOut() ? 'You joined mid-battle: watch this one, play the next!'
          : 'These monsters are yours alone. Words that reach you hurt. Last hero standing wins!';
      }
      $('#fb4').textContent = n > 3 ? 'READY?' : String(Math.max(1, n));
    } else if (st === 'playing' && knockedOut()) {
      // Out of the battle royale (or joined too late for it): where you finished, while the rest fight on.
      const mine = me();
      banner.classList.remove('hidden');
      $('#fb1').textContent = mine.late ? 'BATTLE UNDER WAY' : 'KNOCKED OUT!';
      $('#fb2').textContent = mine.late ? 'WATCHING' : `#${mine.place}`;
      $('#fb2').className = 'fb-2 d-boss';
      $('#fb3').textContent = mine.late ? 'You joined mid-battle. You\'ll be in the next one!'
        : `of ${royale ? royale.total : players.length} · ${mine.score} pts · ${mine.kills} slain`;
      $('#fb4').textContent = royale ? `${royale.left} LEFT` : '';
      $('#fb4').style.fontSize = '14px';
      return;
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
    $('#gRound').textContent = !r ? '' : royaleOn() ? `ROYALE ${r.name}`
      : `${daily ? 'DAILY ' : ''}${rounds.length === 1 ? '' : `R${state.round + 1} `}${r.name}`;
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
    if (brawlOn() && (state.state === 'playing' || state.state === 'countdown')) {
      const left = state.state === 'playing' ? Math.max(0, state.phaseEndsAt - now()) : (rounds[0] ? rounds[0].duration : 0);
      $('#bTime').textContent = clockText(left);
      $('#bTime').classList.toggle('low', state.state === 'playing' && left <= 10000);
      renderBrawlHud();
      brawlOverlay();
      return;
    }
    if (drawOn() && (state.state === 'playing' || state.state === 'countdown')) {
      // Draw battle: the clock for this part of the turn (or the countdown before the first one).
      const D = state.state === 'playing' ? draw : null;
      const left = Math.max(0, (D ? D.endsAt : state.phaseEndsAt) - now());
      $('#dTime').textContent = clockText(left);
      $('#dTime').classList.toggle('low', Boolean(D && D.phase === 'draw' && left <= 10000));
      const count = document.querySelector('#dOver .o4');
      if (count && state.state === 'countdown') {
        const n = Math.ceil(left / 1000);
        count.textContent = n > 3 ? 'READY?' : String(Math.max(1, n));
      }
      return;
    }
    if (royaleOn() && (state.state === 'playing' || state.state === 'countdown')) {
      // No round clock: how long the battle has gone on. Red edges when your HP runs low.
      const secs = state.state === 'playing' && royale ? Math.floor(Math.max(0, now() - royale.start) / 1000) : 0;
      $('#gTime').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      const mine = me();
      const low = state.state === 'playing' && mine && !mine.out && royale && mine.hp <= royale.hp * 0.3;
      $('#gTime').classList.toggle('low', Boolean(low));
      $('#field').classList.toggle('tense', Boolean(low));
      if (!$('#scrGame').classList.contains('hidden')) updateBanner();
      return;
    }
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
    } else if (e.key === ' ' || e.code === 'Space') {
      // No word has a space, so Space is free for the class skill.
      e.preventDefault();
      useSkill();
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
      } else if (res && !res.ok && res.reason !== 'taken' && res.reason !== 'not-playing') {
        // Anything else the server refused: say so rather than leave the word sitting there.
        showToast(res.reason === 'other-team' ? "THAT'S THE OTHER TEAM'S WORD" : res.reason === 'own-attack'
          ? 'THAT ONE IS YOUR TEAM\'S ATTACK' : "THAT WORD DIDN'T COUNT", 'bad', 1800);
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
      else if (k.skill) lostWord(word.text, 'ZAP!', `${name}'s skill hit "${word.text}"`);
      else lostWord(word.text, 'TOO SLOW!', `${name} got "${word.text}"`);
    }
    arena.kill(k.id, k.by, k.points, k);
    if (!k.bomb && !k.skill) noteStreak(k.by, k);
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
    const want = (state.state === 'countdown' || state.state === 'playing') && document.activeElement !== typeIn && !knockedOut();
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
      : royaleOn() ? 'BATTLE ROYALE: your own monsters and 100 HP. Words that reach you hurt. Last hero standing wins!'
        : drawOn() ? 'DRAW BATTLE: take turns drawing on your phone while everyone else guesses. The sooner you guess, the more points!'
          : brawlOn() ? 'DUEL: your phone steers your hero around the arena. Left thumb moves, right thumb attacks. KO heroes, slay monsters, grab power-ups!'
          : 'FREE FOR ALL: first to type a word gets the points!';
    $('#lobbyCount').textContent = players.length;
    // What the host has switched on, and your class's perk when perks are on.
    const opts = $('#lobbyOpts');
    opts.innerHTML = '';
    // What the host picked: the game's length and difficulty first, then the switches that are on.
    const one = options.length === 'one' && !royaleOn();
    const level = String(options.level || 'normal').toUpperCase();
    const drawing = drawOn();
    opts.append(el('span', {
      class: 'pick',
      text: brawlOn() ? `${clockText(rounds[0] ? rounds[0].duration : 240000)} ARENA FIGHT`
        : drawing ? (rounds.length === 1 ? 'EVERYONE DRAWS ONCE' : `EVERYONE DRAWS ${rounds.length} TIMES`)
        : royaleOn() ? 'NO ROUNDS: EASY > MEDIUM > HARD' : one ? `ONE ROUND · ${rounds[0]?.title || ''}` : `${rounds.length} ROUNDS`,
    }));
    opts.append(el('span', { class: `pick d-${level.toLowerCase()}`, text: drawing ? `${Math.round((rounds[0]?.time || 80000) / 1000)} SECONDS A DRAWING` : `${level} DIFFICULTY` }));
    // Draw battle: the word categories the host picked, one tag each.
    if (drawing) for (const name of options.drawCatNames || ['EVERYDAY THINGS']) opts.append(el('span', { class: 'pick', text: name }));
    const names = { streaks: 'STREAKS', specials: 'SPECIAL WORDS', boss: 'BOSS FINALE', perks: 'CLASS PERKS', skills: 'SKILLS', awards: 'AWARDS' };
    for (const [k, label] of Object.entries(names)) {
      if (drawing && k !== 'awards') continue; // no typing switches, perks or skills in a draw battle
      if (brawlOn() && (k === 'streaks' || k === 'specials')) continue; // no words in a duel
      if (brawlOn() && k === 'boss') {
        if (options.boss && options.length !== 'one') opts.append(el('span', { text: 'DRAGON KING' }));
        continue;
      }
      if (options[k] && !(tb && (k === 'boss' || k === 'specials')) && !((one || royaleOn()) && k === 'boss')) opts.append(el('span', { text: label }));
    }
    if (options.wordCount) opts.append(el('span', { text: `${options.wordCount} HOST WORDS` }));
    renderChat();
    const kit = mine && (BR.KITS[mine.cls] || BR.KITS.knight);
    const duel = brawlOn() && kit;
    if (duel) $('#lobbyClass').textContent = `${classByKey(mine.cls).name} · ${kit.hp} HP · ${classByKey(mine.cls).attack}`;
    const perk = options.perks && mine && !drawing ? (duel ? `${kit.perk.name}: ${kit.perk.text}` : classByKey(mine.cls).perk) : '';
    $('#lobbyPerk').textContent = perk ? `PERK: ${perk}` : '';
    $('#lobbyPerk').classList.toggle('hidden', !perk);
    const skl = options.skills && mine && !drawing ? (duel ? `${kit.skill.name}: ${kit.skill.text}` : classByKey(mine.cls).skill) : '';
    $('#lobbySkill').textContent = !skl ? '' : duel ? `SKILL: ${skl} (charges as you fight; tap SKILL or press E)`
      : `SKILL: ${skl} (every 8 words; tap it or press Space)`;
    $('#lobbySkill').classList.toggle('hidden', !skl);
    renderHowTo(mine, kit);
    const roster = $('#lobbyRoster');
    roster.innerHTML = '';
    for (const p of players) {
      const cls = `mini${p.id === you ? ' me' : ''}${tb ? ` team${p.team}` : ''}`;
      roster.append(el('div', { class: cls }, [heroImg(p), el('span', { text: p.name })]));
    }
  }

  // Duel: how to play, for this device (thumbs, or a keyboard and mouse), with your skill and your pet.
  function renderHowTo(mine, kit) {
    $('#lobbyHow').classList.toggle('hidden', !brawlOn() || !mine);
    if (!brawlOn() || !mine) return;
    const pet = BR.PETS[mine.pet];
    const rows = [
      ['MOVE', pcControls ? 'WASD or the arrow keys.' : 'Drag your left thumb anywhere on the left half of the screen.'],
      ['ATTACK', pcControls ? 'Hold the mouse button to attack toward the pointer, or Space to hit the nearest foe.'
        : 'Hold your right thumb on the right half to hit the nearest foe. Drag it to aim.'],
      options.skills ? ['SKILL', `${pcControls ? 'Press E' : 'Tap SKILL'} when it glows to use ${kit.skill.name}. It charges as you fight.`] : null,
      ['PET', pet ? `Your ${pet.name.toLowerCase()} attacks on its own: ${pet.attack}, ${pet.text}.`
        : 'No companion yet: pick one in CHANGE HERO and it fights beside you.'],
      ['POWER-UPS', 'Walk over them to take them. Shoot kegs to blow them up, and stand back!'],
      ['POINTS', `KO a hero +${BR.KO_POINTS}. Monsters +${BR.MONSTERS.slime.pts} to +${BR.MONSTERS.golem.pts}. Knocked out? You're back in ${BR.RESPAWN_MS / 1000} seconds.`],
    ].filter(Boolean);
    const list = $('#lobbyHowList');
    list.innerHTML = '';
    for (const [title, text] of rows) list.append(el('div', { class: 'how-row' }, [el('b', { text: title }), el('span', { text })]));
  }

  // The results. A battle shows what the big screen shows (podium, the rest of the field, the awards),
  // headed by how it went for you: VICTORY or DEFEAT for your team, or your place in free for all.
  // A solo quest shows your place in the Hall of Fame instead.
  function renderFinal() {
    const ranked = rankPlayers(players);
    const idx = ranked.findIndex((p) => p.id === you);
    const mine = ranked[idx];
    if (!mine) return;
    const rec = records[you];
    const tb = teamBattle() && teams && winner !== null;
    $('#scrFinal').classList.toggle('battle', !solo);
    $('#fHero').src = heroDataURL(mine);
    $('#fScore').textContent = mine.score;
    $('#fKills').textContent = mine.kills;
    $('#fRounds').textContent = rounds.map((r, i) => `${r.name} +${mine.roundScores[i] || 0}`).join('  ·  ');
    $('#fSoloActions').classList.toggle('hidden', !solo);
    $('#fWait').classList.toggle('hidden', solo);
    $('#fScoreLbl').textContent = tb ? 'DAMAGE + BLOCKS' : 'SCORE';
    $('#fKillsLbl').textContent = teamBattle() ? 'WORDS TYPED' : drawOn() ? 'DRAWINGS GUESSED' : brawlOn() ? 'KNOCKOUTS' : 'MONSTERS SLAIN';
    $('#fTitle').style.color = '';
    $('#fPlace').style.color = '';
    // Your typing stats (none in a draw battle), and any awards you won.
    const st = summary?.stats?.[you];
    const duel = brawlOn();
    $('#fTyping').classList.toggle('hidden', !st || (!st.words && !duel) || drawOn());
    // A duel has no typing to measure: monsters slain, times knocked out and the best KO streak instead.
    const label = (id, text) => { $(id).previousSibling.textContent = text; };
    label('#fWpm', duel ? 'SLAIN' : 'SPEED');
    label('#fAcc', duel ? "KO'D" : 'ACCURACY');
    label('#fBest', duel ? 'BEST RUN' : 'BEST STREAK');
    if (st && duel) {
      $('#fWpm').textContent = st.slain;
      $('#fAcc').textContent = st.deaths;
      $('#fBest').textContent = st.best ? `${st.best} KO` : '-';
    } else if (st) {
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
    top.classList.toggle('hidden', !solo);
    $('#fPodium').classList.toggle('hidden', solo);
    $('#fField').classList.toggle('hidden', solo);
    $('#fSub').classList.toggle('hidden', true);

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

    // Headline: how it went for you.
    if (tb) {
      const ours = myTeam();
      $('#fTitle').textContent = winner === -1 ? 'DRAW!' : winner === ours ? 'VICTORY!' : 'DEFEAT';
      $('#fTitle').style.color = winner === -1 ? '' : winner === ours ? '#8be36b' : 'var(--red)';
      $('#fPlace').textContent = `#${idx + 1} of ${ranked.length} · ${TEAMS[mine.team].name}`;
      $('#fPlace').style.color = TEAMS[mine.team].color;
    } else {
      $('#fTitle').textContent = idx === 0 ? 'VICTORY!' : idx < 3 ? 'PODIUM!' : 'WELL FOUGHT!';
      $('#fPlace').textContent = `#${idx + 1} of ${ranked.length}`;
    }
    $('#fRecord').textContent = rec ? (rec.rank === 1 ? 'NEW HIGH SCORE!' : `HALL OF FAME #${rec.rank}`) : '';
    $('#fRecord').classList.toggle('hidden', !rec);
    // The line under the big screen's title: how the teams finished, or what became of the boss.
    let sub = '';
    if (tb) {
      sub = ko && winner >= 0
        ? `K.O.! ${TEAMS[1 - winner].name} ran out of HP`
        : `${TEAMS[0].short} ${teams[0].hp} HP · ${TEAMS[1].short} ${teams[1].hp} HP`;
    } else if (boss) {
      sub = boss.down ? 'The Dragon King has fallen!' : 'The Dragon King got away... this time.';
    }
    // Battle royale: VICTORY for the last hero standing; everyone else sees where they went out.
    if (royaleOn()) {
      const top = ranked[0];
      sub = top ? (top.out ? `${top.name} outlasted everyone!` : `${top.name} is the last hero standing!`) : '';
      $('#fTitle').textContent = idx === 0 ? 'VICTORY!' : mine.late ? 'NEXT TIME!' : 'KNOCKED OUT';
      $('#fTitle').style.color = idx === 0 ? '#8be36b' : mine.late ? '' : 'var(--red)';
      $('#fPlace').textContent = mine.late ? 'You joined mid-battle' : idx === 0 && !mine.out ? `Last of ${ranked.filter((p) => !p.late).length} · ${mine.hp} HP left`
        : `#${idx + 1} of ${ranked.filter((p) => !p.late).length}`;
    }
    $('#fSub').textContent = sub;
    $('#fSub').classList.toggle('hidden', !sub);

    // Podium: second, first, third, like the big screen; team battles color names by team.
    const nameStyle = (p) => (tb ? `color:${TEAMS[p.team].color}` : '');
    const podium = $('#fPodium');
    podium.innerHTML = '';
    for (const [i, cls] of [[1, 'p2'], [0, 'p1'], [2, 'p3']]) {
      const p = ranked[i];
      if (!p) continue;
      const r = records[p.id];
      podium.append(el('div', { class: `mp ${cls}${p.id === you ? ' me' : ''}` }, [
        i === 0 ? el('img', { class: 'crown', src: crownDataURL(), alt: '' }) : null,
        el('img', { class: 'px-sprite h', src: heroDataURL(p), alt: '' }),
        el('div', { class: 'nm', text: p.name, style: p.id === you ? '' : nameStyle(p) }),
        el('div', { class: 'sc', text: `${p.score} PTS` }),
        r ? el('div', { class: 'rc', text: r.rank === 1 ? 'NEW HIGH SCORE!' : `HALL OF FAME #${r.rank}` }) : null,
        el('div', { class: 'blk', text: i + 1 }),
      ]));
    }

    // Everyone else, then the awards.
    const box = $('#fField');
    box.innerHTML = '';
    if (ranked.length > 3) {
      box.append(el('h3', { text: 'THE REST OF THE FIELD' }));
      ranked.slice(3).forEach((p, i) => {
        box.append(el('div', { class: `t3${p.id === you ? ' me' : ''}` }, [
          el('span', { text: `${i + 4}.` }), heroImg(p),
          el('span', { text: p.name, style: nameStyle(p) }),
          el('span', { class: 'sc', text: p.score }),
        ]));
      });
    }
    const awards = summary?.awards || [];
    if (awards.length) {
      box.append(el('h3', { text: 'AWARDS', style: ranked.length > 3 ? 'margin-top:10px' : '' }));
      for (const a of awards) {
        const p = players.find((pl) => pl.id === a.id);
        if (!p) continue;
        box.append(el('div', { class: `award-row${a.id === you ? ' me' : ''}` }, [
          heroImg(p),
          el('b', { text: `${a.title} · ${p.name}` }),
          el('small', { text: `${a.desc} · ${a.value}` }),
        ]));
      }
    }
    box.classList.toggle('hidden', !box.children.length);
  }

  // ---- duel --------------------------------------------------------------
  socket.on('brawl:snap', (snap) => bView.onSnap(snap));
  const MOB_NAMES = { slime: 'a slime', bat: 'a bat', skull: 'a skull', boss: 'the Dragon King', ghost: 'a ghost', goblin: 'a goblin',
    golem: 'a golem', spider: 'a spider', spirit: 'a fire spirit', kingslime: 'the King Slime' };
  bView.onNews = (n) => {
    if (n.type === 'ko' && n.id === you) {
      lastKo = n;
      myFx = {};
      if (navigator.vibrate) navigator.vibrate([80, 60, 140]);
    } else if (n.type === 'ko' && n.by === you) {
      bToast(`KO! ${nameOf(n.id)} +${n.pts}`, 'good');
    } else if (n.type === 'pick' && n.id === you) {
      if (n.until) myFx[n.item] = n.until;
      bToast(`${BR.ITEMS[n.item].name}!`, 'good');
    } else if (n.type === 'boss') {
      bToast('THE DRAGON KING IS HERE!', 'bad', 2500);
    }
  };

  let bToastTimer = null;
  function bToast(text, kind, ms = 1400) {
    const t = $('#bToast');
    t.textContent = text;
    t.className = `toast show ${kind || ''}`;
    clearTimeout(bToastTimer);
    bToastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  async function brawlSkill() {
    if (!brawlOn() || state.state !== 'playing') return;
    const res = await ack('brawl:skill', {});
    if (res && !res.ok && res.reason === 'charging') bToast('SKILL STILL CHARGING', 'bad');
  }
  $('#bSkill').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    Sfx.unlock();
    brawlSkill();
  });

  // HP, KOs, score and place, the skill's charge and the power-ups you have going.
  let fxShownKey = '';
  function renderBrawlHud() {
    const mine = me();
    const kit = BR.KITS[mine ? mine.cls : 'knight'] || BR.KITS.knight;
    const h = bView.hero(you);
    const alive = Boolean(h && (h.f & BR.F.alive));
    const hp = h ? Math.max(0, h.hp) : kit.hp;
    const frac = Math.max(0, Math.min(1, hp / kit.hp));
    $('#bHp').textContent = hp;
    $('#bHpFill').style.width = `${frac * 100}%`;
    $('#bHpFill').style.background = frac > 0.5 ? '#5bd46a' : frac > 0.25 ? '#ffd23f' : '#ff5a4d';
    $('#bKos').textContent = `${h ? h.kos : mine ? mine.kills : 0} KO`;
    $('#bScore').textContent = h ? h.score : mine ? mine.score : 0;
    const list = bView.standings().sort((a, b) => b.score - a.score || b.kos - a.kos);
    const idx = list.findIndex((x) => x.id === you);
    $('#bRank').textContent = idx >= 0 ? `#${idx + 1}/${list.length}` : '';
    $('#bField').classList.toggle('hurt', alive && frac <= 0.3);
    // Skill.
    const on = Boolean(options.skills);
    $('#bSkill').classList.toggle('hidden', !on);
    if (on) {
      const charge = h ? h.charge : 0;
      const ready = alive && charge >= BR.CHARGE_MAX;
      $('#bSkillName').textContent = kit.skill.name;
      $('#bSkillState').textContent = ready ? 'READY!' : `${charge}%`;
      $('#bSkillFill').style.width = `${charge}%`;
      $('#bSkill').classList.toggle('ready', ready);
    }
    // Power-ups, with seconds left.
    const t = now();
    const chips = Object.entries(myFx).filter(([, until]) => until > t).map(([k, until]) => [k, Math.ceil((until - t) / 1000)]);
    const key = JSON.stringify(chips);
    if (key !== fxShownKey) {
      fxShownKey = key;
      const box = $('#bFx');
      box.innerHTML = '';
      for (const [k, secs] of chips) {
        box.append(el('span', { style: `color:${(POWERS[k] || {}).color || '#fff'}` }, [el('img', { src: powerDataURL(k), alt: '' }), `${secs}`]));
      }
    }
  }

  // A mouse and keyboard get their own instructions.
  const pcControls = window.matchMedia('(pointer: fine)').matches && !window.matchMedia('(pointer: coarse)').matches;
  if (pcControls) $('#bHelp').textContent = 'WASD / ARROWS: MOVE · HOLD MOUSE OR SPACE: ATTACK · E: SKILL';

  // Over the arena: the countdown and how to play, FIGHT!, or who knocked you out and when you're back.
  function brawlOverlay() {
    const st = state.state;
    const h = bView.hero(you);
    const mine = me();
    const kit = BR.KITS[mine ? mine.cls : 'knight'] || BR.KITS.knight;
    let lines = null;
    if (st === 'countdown') {
      const n = Math.ceil(Math.max(0, state.phaseEndsAt - now()) / 1000);
      const how = pcControls ? 'WASD or arrows: move. Hold the mouse button (or Space) to attack.' : 'Left thumb: move. Right thumb: hold to attack, drag to aim.';
      lines = ['DUEL', n > 3 ? 'READY?' : String(Math.max(1, n)),
        `${how}${options.skills ? ` SKILL (${kit.skill.name}${pcControls ? ', key E' : ''}) charges as you fight.` : ''} KO a hero: +${BR.KO_POINTS}!`];
    } else if (st === 'playing' && performance.now() - fightAt < 800) {
      lines = ['', 'FIGHT!', ''];
    } else if (st === 'playing' && h && !(h.f & BR.F.alive)) {
      const by = lastKo && lastKo.by ? `by ${nameOf(lastKo.by)}` : lastKo && lastKo.mob ? `by ${MOB_NAMES[lastKo.mob] || 'a monster'}`
        : lastKo && lastKo.why === 'keg' ? 'by a keg' : '';
      lines = ['KNOCKED OUT', `BACK IN ${Math.max(1, Math.ceil(h.respawn / 1000))}`, by];
    } else if (st === 'playing' && !h) {
      lines = ['', 'JOINING...', ''];
    }
    $('#bOver').classList.toggle('hidden', !lines);
    if (lines) {
      $('#bO1').textContent = lines[0];
      $('#bO2').textContent = lines[1];
      $('#bO3').textContent = lines[2];
    }
    $('#bHelp').classList.toggle('gone', st === 'playing' && performance.now() - fightAt > 9000);
  }

  $('#btnTeam').onclick = () => {
    switchingTo = 1 - myTeam();
    socket.emit('player:team');
  };
  document.addEventListener('pointerdown', () => Sfx.unlock());
  buildCreator();
  refreshCreator(false);
})();
