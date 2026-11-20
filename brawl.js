// Duel ("brawl" in the code): a real-time arena fight. Heroes run around a walled courtyard, attack each
// other with their class's attack, grab power-ups and fight off monsters that pour in from the gates.
// A knocked-out hero comes back a few seconds later; the most points when time runs out wins.
//
// This file is the simulation only: no sockets. server.js creates a fight, passes on each phone's
// controls, steps it every TICK_MS and sends the screens its snapshots. The numbers and texts live in
// public/js/brawl-rules.js, which the screens load too.
const R = require('./public/js/brawl-rules');

const { ARENA, KITS, PERK, SKILL, MONSTERS, ITEMS, ITEM_KEYS, KEG, F, HERO_R } = R;
const TYPE_INDEX = Object.fromEntries(R.MONSTER_TYPES.map((k, i) => [k, i]));
const ITEM_INDEX = Object.fromEntries(ITEM_KEYS.map((k, i) => [k, i]));
const SHOT_STEP = 12; // shots move in steps this long, so fast ones can't skip past a hero
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function createBrawl({ now, duration, level = 'normal', perks = true, skills = true, boss = false, rng = Math.random, layout = null }) {
  const index = layout ?? Math.floor(rng() * R.LAYOUTS.length);
  const map = R.buildLayout(index);
  const endsAt = now + duration;
  return {
    layout: index,
    start: now,
    t: now,
    lastStep: now,
    endsAt,
    level: R.LEVELS[level] || R.LEVELS.normal,
    perks,
    skills,
    rng,
    blocks: map.blocks,
    kegs: map.kegs.map((k, i) => ({ id: i, x: k.x, y: k.y, r: KEG.r, hp: KEG.hp, backAt: 0 })),
    heroes: new Map(),
    monsters: new Map(),
    shots: new Map(),
    items: new Map(),
    zones: new Map(),
    nextId: 1,
    nextMobAt: now + 1500,
    nextItemAt: now + 4000,
    bossAt: boss ? endsAt - R.BOSS_LEFT_MS : Infinity,
    bossCame: false,
    slow: null, // Slow Time: { by, until } slows everyone but the hero who took it
    news: [], // what the server passes on to every screen at once: KOs, skills, power-ups, the boss
    fx: [], // little things for the next snapshot: hits, blasts, monsters slain
    newShots: [], // shots fired since the last snapshot
    gone: [], // shots that hit something or ran out since the last snapshot
  };
}

const rand = (B, lo, hi) => lo + B.rng() * (hi - lo);
const liveKegs = (B) => B.kegs.filter((k) => !k.backAt);
const heroesIn = (B) => [...B.heroes.values()].filter((H) => H.alive && !H.away);

// ---- heroes ------------------------------------------------------------
// A free spot away from everyone: the best of a few random tries.
function freeSpot(B, margin = 70, avoid = true) {
  let best = null;
  for (let i = 0; i < 24; i++) {
    const x = rand(B, margin, ARENA.W - margin);
    const y = rand(B, margin, ARENA.H - margin);
    if (R.inBlock(x, y, HERO_R + 8, B.blocks) || B.kegs.some((k) => Math.hypot(k.x - x, k.y - y) < k.r + HERO_R + 8)) continue;
    let room = 600;
    if (avoid) {
      for (const H of B.heroes.values()) if (H.alive && !H.away) room = Math.min(room, Math.hypot(H.x - x, H.y - y));
      for (const M of B.monsters.values()) room = Math.min(room, Math.hypot(M.x - x, M.y - y) + 80);
    }
    if (!best || room > best.room) best = { x, y, room };
  }
  return best || { x: ARENA.W / 2, y: ARENA.H / 2 + 120 };
}

function addHero(B, p, now) {
  const kit = KITS[p.cls] || KITS.knight;
  const spot = freeSpot(B);
  const H = {
    id: p.id, cls: KITS[p.cls] ? p.cls : 'knight', kit, x: spot.x, y: spot.y, face: spot.x < ARENA.W / 2 ? 0 : Math.PI,
    hp: kit.hp, max: kit.hp, alive: true, respawnAt: 0, safeUntil: now + R.SPAWN_SAFE_MS, cdAt: 0, charge: 0,
    input: { mx: 0, my: 0, ax: 0, ay: 0, fire: false }, until: {}, stunUntil: 0, slowUntil: 0, slowF: 1,
    lastHurtAt: 0, hit: null, streak: 0, bestStreak: 0, attacks: 0, echoAt: 0, echoAng: 0, whirlNext: 0, stormAt: 0, stormAng: 0,
    away: false, score: 0, kos: 0, deaths: 0, slain: 0, dealt: 0, bossDmg: 0, bossFrac: 0, bossKill: false,
  };
  B.heroes.set(H.id, H);
  return H;
}

function removeHero(B, id) {
  B.heroes.delete(id);
  for (const M of B.monsters.values()) if (M.owner === id) B.monsters.delete(M.id);
}

// A phone's controls: move (mx, my) and aim (ax, ay) as directions, and whether attack is held. No aim
// while attacking means "at whatever's nearest".
function setInput(B, id, data) {
  const H = B.heroes.get(id);
  if (!H) return;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const unit = (x, y, max) => {
    const d = Math.hypot(x, y);
    return d > max ? [x / d * max, y / d * max] : d < 0.15 ? [0, 0] : [x, y];
  };
  [H.input.mx, H.input.my] = unit(num(data?.mx), num(data?.my), 1);
  const [ax, ay] = unit(num(data?.ax), num(data?.ay), 1);
  const d = Math.hypot(ax, ay);
  [H.input.ax, H.input.ay] = d ? [ax / d, ay / d] : [0, 0];
  H.input.fire = Boolean(data?.fire);
}

// A hero whose phone dropped out leaves the field (nobody can hit them) until it's back.
function setAway(B, id, away, now) {
  const H = B.heroes.get(id);
  if (!H || H.away === away) return;
  H.away = away;
  H.input = { mx: 0, my: 0, ax: 0, ay: 0, fire: false };
  if (!away && H.alive) H.safeUntil = now + R.SPAWN_SAFE_MS;
}

function respawn(B, H, t) {
  const spot = freeSpot(B);
  Object.assign(H, { x: spot.x, y: spot.y, hp: H.max, alive: true, safeUntil: t + R.SPAWN_SAFE_MS, until: {}, stunUntil: 0, slowUntil: 0, echoAt: 0, stormAt: 0 });
  B.fx.push({ k: 'spawn', id: H.id, x: Math.round(H.x), y: Math.round(H.y), t });
}

function speedOf(B, H, t) {
  let s = H.kit.speed;
  if (B.perks && H.cls === 'rogue') s *= PERK.sly;
  if (t < (H.until.haste || 0)) s *= ITEMS.haste.speed;
  if (t < (H.until.wall || 0)) s *= SKILL.wallSpeed;
  if (t < (H.until.whirl || 0)) s *= SKILL.whirlSpeed;
  if (t < (H.until.hymn || 0)) s *= SKILL.hymnSpeed;
  if (B.slow && t < B.slow.until && B.slow.by !== H.id) s *= ITEMS.slow.speed;
  if (t < H.slowUntil) s *= H.slowF;
  return s;
}

function heroStep(B, H, t, dt) {
  if (H.away) return;
  if (!H.alive) {
    if (t >= H.respawnAt) respawn(B, H, t);
    return;
  }
  if (B.perks && H.cls === 'druid' && t - H.lastHurtAt >= PERK.bloomAfter) H.hp = Math.min(H.max, H.hp + PERK.bloomHps * dt);
  if (B.skills) gainCharge(B, H, R.CHARGE_PER_SEC * dt);
  const stunned = t < H.stunUntil;
  const { mx, my, ax, ay } = H.input;
  if (!stunned && (mx || my)) {
    const s = speedOf(B, H, t) * dt;
    const p = R.moveCircle(H.x, H.y, HERO_R, mx * s, my * s, B.blocks, liveKegs(B));
    H.x = p.x;
    H.y = p.y;
  }
  if (ax || ay) H.face = Math.atan2(ay, ax);
  else if (mx || my) H.face = Math.atan2(my, mx);
  if (H.input.fire && !stunned && t >= H.cdAt && !(t < (H.until.whirl || 0))) attack(B, H, t);
  // A Bard's echo, the second ring of a Shuriken Storm, and a Whirlwind's spin.
  if (H.echoAt && t >= H.echoAt) {
    H.echoAt = 0;
    volley(B, H, H.echoAng, t);
  }
  if (H.stormAt && t >= H.stormAt) {
    H.stormAt = 0;
    ring(B, H, H.stormAng + Math.PI / SKILL.stormCount, t);
  }
  if (t < (H.until.whirl || 0) && t >= H.whirlNext) {
    H.whirlNext = t + SKILL.whirlEvery;
    blast(B, H.x, H.y, SKILL.whirlR, SKILL.whirlDmg, { hero: H }, t, { knock: 40, fx: false });
  }
}

function gainCharge(B, H, n) {
  if (!B.skills) return;
  H.charge = Math.min(R.CHARGE_MAX, H.charge + n * (B.perks && H.cls === 'wizard' ? PERK.arcane : 1));
}

// The nearest foe within reach that a shot could get to (no wall in the way), or null.
function autoTarget(B, H, reach) {
  let best = null;
  let bestD = reach;
  const consider = (o) => {
    const d = Math.hypot(o.x - H.x, o.y - H.y);
    if (d < bestD && !R.lineBlocked(H.x, H.y, o.x, o.y, B.blocks)) {
      best = o;
      bestD = d;
    }
  };
  for (const o of B.heroes.values()) if (o !== H && o.alive && !o.away && !(B.t < (o.until.stealth || 0))) consider(o);
  for (const M of B.monsters.values()) if (M.owner !== H.id) consider(M);
  return best;
}

function aimOf(B, H, reach) {
  if (H.input.ax || H.input.ay) return Math.atan2(H.input.ay, H.input.ax);
  const o = autoTarget(B, H, reach);
  return o ? Math.atan2(o.y - H.y, o.x - H.x) : H.face;
}

function attack(B, H, t) {
  const a = H.kit.atk;
  const ang = aimOf(B, H, a.range * 1.05);
  H.face = ang;
  H.cdAt = t + a.cd / (t < (H.until.hymn || 0) ? SKILL.hymnRate : 1);
  H.safeUntil = 0; // attacking ends the spawn protection
  H.attacks += 1;
  volley(B, H, ang, t);
  if (B.perks && H.cls === 'bard' && H.attacks % PERK.echoEvery === 0) {
    H.echoAt = t + 140;
    H.echoAng = ang;
  }
}

// One attack: the class's shots (several for the Rogue), three times over with Multi-Shot.
function volley(B, H, ang, t) {
  const a = H.kit.atk;
  const n = a.count || 1;
  const fans = t < (H.until.triple || 0) ? [-ITEMS.triple.spread, 0, ITEMS.triple.spread] : [0];
  for (const f of fans) {
    for (let i = 0; i < n; i++) shoot(B, H, a, ang + f + (i - (n - 1) / 2) * (a.spread || 0), t);
  }
}

// Shuriken Storm: shots in every direction.
function ring(B, H, ang, t) {
  for (let i = 0; i < SKILL.stormCount; i++) shoot(B, H, H.kit.atk, ang + (i / SKILL.stormCount) * Math.PI * 2, t);
}

function shoot(B, H, a, ang, t, extra = {}) {
  const S = {
    id: B.nextId++, kind: a.kind, owner: H ? H.id : null, mob: null,
    x: (H ? H.x : 0) + Math.cos(ang) * 20, y: (H ? H.y : 0) + Math.sin(ang) * 20,
    vx: Math.cos(ang) * a.speed, vy: Math.sin(ang) * a.speed, speed: a.speed, left: a.range, range: a.range,
    r: a.r, dmg: a.dmg, pierce: a.pierce || 0, splash: a.splash || 0, splashR: a.splashR || 0, knock: a.knock || 0,
    slow: a.slow || 0, homing: a.homing || 0, heal: a.heal || 0, hits: new Set(), t0: t, ...extra,
  };
  B.shots.set(S.id, S);
  B.newShots.push([S.id, S.kind, Math.round(S.x), Math.round(S.y), Math.round(S.vx), Math.round(S.vy), S.range, S.owner || '', t, S.homing ? 1 : 0]);
  return S;
}

// A monster's fireball: hurts heroes only.
function mobShot(B, M, ang, t, { dmg, speed, range, kind }) {
  const S = {
    id: B.nextId++, kind, owner: null, mob: M.id, x: M.x + Math.cos(ang) * M.r, y: M.y + Math.sin(ang) * M.r,
    vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, speed, left: range, range, r: 12,
    dmg: Math.round(dmg * B.level.dmg), pierce: 0, splash: 0, splashR: 0, knock: 0, slow: 0, homing: 0, heal: 0, hits: new Set(), t0: t,
  };
  B.shots.set(S.id, S);
  B.newShots.push([S.id, S.kind, Math.round(S.x), Math.round(S.y), Math.round(S.vx), Math.round(S.vy), S.range, '', t, 0]);
}

// ---- damage --------------------------------------------------------------
// How much harder a hero hits this target: Fury, and the Barbarian's, Valkyrie's and Archer's perks.
function hitMod(B, H, target, t) {
  let m = t < (H.until.fury || 0) ? ITEMS.fury.dmg : 1;
  if (B.perks) {
    if (H.cls === 'barbarian') m *= 1 + PERK.bloodlust * (1 - H.hp / H.max);
    if (H.cls === 'valkyrie' && H.hp > H.max / 2) m *= PERK.valor;
    if (H.cls === 'archer' && target && dist(H, target) > PERK.eagleFar) m *= PERK.eagle;
  }
  if (t < (H.until.stealth || 0)) {
    m *= SKILL.stealthHit;
    H.until.stealth = 0; // the first hit out of the shadows gives the Rogue away
  }
  return m;
}

// src: { hero, mob } - who did it. A Necromancer's ghost hits for its owner.
function hurt(B, target, amount, src, t, why = 'hit') {
  let H = src.hero || null;
  if (!H && src.mob && src.mob.owner) H = B.heroes.get(src.mob.owner) || null;
  if (target.kit) return hurtHero(B, target, amount, H, src.mob, t, why);
  if (target.type) return hurtMonster(B, target, amount, H, t);
  return hurtKeg(B, target, amount, H, t);
}

function hurtHero(B, T, amount, H, mob, t, why) {
  if (!T.alive || T.away || H === T) return 0;
  if (mob && mob.owner === T.id) return 0;
  const at = { x: Math.round(T.x), y: Math.round(T.y - 30), t };
  if (t < T.safeUntil || t < (T.until.shield || 0) || t < (T.until.wall || 0)) {
    B.fx.push({ k: 'block', ...at, id: T.id });
    return 0;
  }
  if (B.perks && T.cls === 'ninja' && B.rng() < PERK.dodge) {
    B.fx.push({ k: 'dodge', ...at, id: T.id });
    return 0;
  }
  let d = amount * (H ? hitMod(B, H, T, t) : 1);
  if (B.perks && T.cls === 'knight') d *= PERK.guard;
  d = Math.max(1, Math.round(d));
  T.hp -= d;
  T.lastHurtAt = t;
  if (H) {
    T.hit = { by: H.id, at: t };
    H.dealt += d;
    gainCharge(B, H, d * R.CHARGE_PER_DMG);
  }
  B.fx.push({ k: 'hit', ...at, id: T.id, d, by: H ? H.id : '' });
  if (T.hp <= 0) knockOut(B, T, H, mob, t, why);
  return d;
}

function hurtMonster(B, M, amount, H, t) {
  if (!B.monsters.has(M.id)) return 0;
  if (H && M.owner === H.id) return 0;
  const d = Math.max(1, Math.round(amount * (H ? hitMod(B, H, M, t) : 1)));
  M.hp -= d;
  M.hurtAt = t;
  if (H) {
    H.dealt += d;
    gainCharge(B, H, d * R.CHARGE_PER_DMG);
    if (M.type === 'boss') {
      // Everyone who hurts the Dragon King scores for it as they go.
      const dealt = Math.min(d, d + M.hp);
      H.bossDmg += dealt;
      H.bossFrac += dealt * R.BOSS_PTS_PER_DMG;
      const pts = Math.floor(H.bossFrac);
      H.bossFrac -= pts;
      H.score += pts;
    }
  }
  B.fx.push({ k: 'hit', x: Math.round(M.x), y: Math.round(M.y - M.r - 6), t, m: M.id, d, by: H ? H.id : '' });
  if (M.hp <= 0) slay(B, M, H, t);
  return d;
}

function hurtKeg(B, K, amount, H, t) {
  if (K.backAt) return 0;
  K.hp -= amount;
  if (K.hp > 0) return amount;
  K.backAt = t + KEG.backMs;
  K.hp = KEG.hp;
  blast(B, K.x, K.y, KEG.blastR, KEG.dmg, { hero: H }, t, { knock: 120, hurtsOwner: true, kind: 'keg' });
  return amount;
}

// Everything within r of (x, y) takes dmg. The hero behind it is spared (unless it's a keg going off).
function blast(B, x, y, r, dmg, src, t, { knock = 0, stun = 0, hurtsOwner = false, fx = true, kind = 'boom' } = {}) {
  if (fx) B.fx.push({ k: kind, x: Math.round(x), y: Math.round(y), r, t });
  const owner = src.hero || null;
  for (const T of [...B.heroes.values()]) {
    if (!T.alive || T.away || (T === owner && !hurtsOwner)) continue;
    if (Math.hypot(T.x - x, T.y - y) > r + HERO_R) continue;
    if (dmg > 0 && T === owner) hurtHero(B, T, dmg, null, null, t, 'keg');
    else if (dmg > 0) hurt(B, T, dmg, src, t, kind);
    if (knock && T.alive) push(B, T, x, y, knock);
    if (stun && T.alive) T.stunUntil = Math.max(T.stunUntil, t + stun);
  }
  for (const M of [...B.monsters.values()]) {
    if (owner && M.owner === owner.id) continue;
    if (Math.hypot(M.x - x, M.y - y) > r + M.r) continue;
    if (dmg > 0) hurt(B, M, dmg, src, t);
    if (knock && M.type !== 'boss' && B.monsters.has(M.id)) push(B, M, x, y, knock);
    if (stun && M.type !== 'boss') M.stunUntil = Math.max(M.stunUntil || 0, t + stun);
  }
  for (const K of B.kegs) {
    if (!K.backAt && Math.hypot(K.x - x, K.y - y) < r + K.r && Math.hypot(K.x - x, K.y - y) > 1) hurtKeg(B, K, KEG.hp, owner, t);
  }
}

// Shoves something away from (x, y), stopping at walls.
function push(B, o, x, y, by) {
  const d = Math.hypot(o.x - x, o.y - y) || 1;
  const r = o.kit ? HERO_R : o.r;
  const fly = o.type && MONSTERS[o.type].fly;
  const p = fly ? { x: R.clamp(o.x + ((o.x - x) / d) * by, r, ARENA.W - r), y: R.clamp(o.y + ((o.y - y) / d) * by, r, ARENA.H - r) }
    : R.moveCircle(o.x, o.y, r, ((o.x - x) / d) * by, ((o.y - y) / d) * by, B.blocks, liveKegs(B));
  o.x = p.x;
  o.y = p.y;
}

function heal(H, n) {
  if (H.alive) H.hp = Math.min(H.max, H.hp + n);
}

// A hero at 0 HP. The KO goes to whoever hit them (or hurt them in the last few seconds, if a monster or a
// keg finished them off).
function knockOut(B, T, H, mob, t, why) {
  T.alive = false;
  T.hp = 0;
  T.respawnAt = t + R.RESPAWN_MS;
  T.deaths += 1;
  T.until = {};
  T.echoAt = 0;
  T.stormAt = 0;
  let killer = H;
  if (!killer && T.hit && t - T.hit.at < R.ASSIST_MS) killer = B.heroes.get(T.hit.by) || null;
  if (killer === T) killer = null;
  let pts = 0;
  const shutdown = T.streak >= R.SHUTDOWN_STREAK;
  if (killer) {
    killer.kos += 1;
    killer.streak += 1;
    killer.bestStreak = Math.max(killer.bestStreak, killer.streak);
    pts = R.KO_POINTS + (shutdown ? R.SHUTDOWN_BONUS : 0);
    killer.score += pts;
    gainCharge(B, killer, R.CHARGE_PER_KO);
    if (B.perks && killer.cls === 'necromancer') heal(killer, PERK.harvestKo);
  }
  const lost = T.streak;
  T.streak = 0;
  T.hit = null;
  B.news.push({ type: 'ko', id: T.id, by: killer ? killer.id : null, mob: !killer && mob ? (mob.owner ? 'ghost' : mob.type) : null,
    why, pts, streak: killer ? killer.streak : 0, shutdown: shutdown && Boolean(killer), lost, x: Math.round(T.x), y: Math.round(T.y), t });
}

// ---- monsters --------------------------------------------------------------
function addMonster(B, type, x, y, t, extra = {}) {
  const def = MONSTERS[type];
  const heroes = Math.max(1, heroesIn(B).length);
  const hp = type === 'boss' ? Math.round((def.hp + def.hpPerHero * heroes) * B.level.mob) : def.hp;
  const M = {
    id: B.nextId++, type, x, y, r: def.r, hp, max: hp, target: null, retargetAt: 0, hitAt: t + 400, shotAt: t + rand(B, 800, def.shotMs || 2000),
    fireAt: t + 2500, callAt: t + 5000, stunUntil: 0, seed: B.rng() * 100, checkAt: t + 1000, lastX: x, lastY: y, detourUntil: 0, detour: 0,
    owner: null, until: 0, slowUntil: 0, hurtAt: 0, ...extra,
  };
  B.monsters.set(M.id, M);
  return M;
}

function spawnMonsters(B, t) {
  const heroes = heroesIn(B).length;
  if (!heroes) return;
  const elapsed = t - B.start;
  if (!B.bossCame && t >= B.bossAt) {
    B.bossCame = true;
    const M = addMonster(B, 'boss', ARENA.W / 2, 40, t);
    B.news.push({ type: 'boss', id: M.id, hp: M.max, t });
  }
  if (t < B.nextMobAt) return;
  B.nextMobAt = t + 950 * B.level.spawn * rand(B, 0.7, 1.3);
  const count = [...B.monsters.values()].filter((M) => M.type !== 'boss' && !M.owner).length;
  const cap = Math.min(40, Math.round((3 + 1.6 * heroes) * B.level.mob) + Math.min(8, Math.floor(elapsed / 30000)));
  if (count >= cap) return;
  const roll = B.rng();
  const type = elapsed < 40000 ? (roll < 0.6 ? 'slime' : 'bat') : roll < 0.45 ? 'slime' : roll < 0.75 ? 'bat' : 'skull';
  const g = R.GATES[Math.floor(B.rng() * R.GATES.length)];
  const along = rand(B, -70, 70);
  addMonster(B, type, g.x + (g.y === ARENA.H / 2 ? 0 : along), g.y + (g.y === ARENA.H / 2 ? along : 0), t);
}

// Who a monster goes for: the nearest hero it can see (a Rogue in the shadows is hidden). A Necromancer's
// ghost goes for the nearest foe of its owner, hero or monster.
function pickTarget(B, M) {
  let best = null;
  let bestD = M.owner ? 700 : Infinity;
  for (const H of B.heroes.values()) {
    if (!H.alive || H.away || H.id === M.owner || B.t < (H.until.stealth || 0)) continue;
    const d = Math.hypot(H.x - M.x, H.y - M.y);
    if (d < bestD) { best = H; bestD = d; }
  }
  if (M.owner) {
    for (const O of B.monsters.values()) {
      if (O === M || O.owner === M.owner) continue;
      const d = Math.hypot(O.x - M.x, O.y - M.y);
      if (d < bestD) { best = O; bestD = d; }
    }
  }
  return best;
}

function monsterStep(B, M, t, dt) {
  const def = MONSTERS[M.type];
  if (M.owner && t >= M.until) {
    B.monsters.delete(M.id);
    B.fx.push({ k: 'mdie', m: TYPE_INDEX.ghost, x: Math.round(M.x), y: Math.round(M.y), t });
    return;
  }
  if (t >= M.retargetAt) {
    M.retargetAt = t + 400;
    M.target = pickTarget(B, M);
  }
  const T = M.target && (M.target.kit ? (M.target.alive && !M.target.away ? M.target : null) : B.monsters.has(M.target.id) ? M.target : null);
  if (t < M.stunUntil) return;
  let speed = def.speed;
  if (B.slow && t < B.slow.until && M.owner !== B.slow.by) speed *= ITEMS.slow.speed;
  if (t < M.slowUntil) speed *= SKILL.growSlow;
  let dx = 0;
  let dy = 0;
  if (T) {
    const d = Math.hypot(T.x - M.x, T.y - M.y) || 1;
    let ang = Math.atan2(T.y - M.y, T.x - M.x);
    if (M.type === 'skull') {
      // Keep its distance and spit fireballs at whoever it can see.
      if (d < def.keep - 40) ang += Math.PI;
      else if (d < def.keep + 40) ang += Math.PI / 2 * (Math.sin(t / 900 + M.seed) > 0 ? 1 : -1);
      if (t >= M.shotAt && d < def.shotRange && T.kit && !R.lineBlocked(M.x, M.y, T.x, T.y, B.blocks)) {
        M.shotAt = t + def.shotMs * rand(B, 0.85, 1.15);
        mobShot(B, M, Math.atan2(T.y - M.y, T.x - M.x), t, { dmg: def.shotDmg, speed: def.shotSpeed, range: def.shotRange, kind: 'mfire' });
      }
    }
    if (M.type === 'bat') ang += Math.sin(t / 220 + M.seed) * 0.9;
    if (M.type === 'slime') speed *= 0.55 + 0.75 * Math.abs(Math.sin(t / 260 + M.seed)); // hop, hop
    if (M.type === 'boss') bossMoves(B, M, T, t);
    if (t < M.detourUntil) ang += M.detour;
    const reach = M.r + (T.kit ? HERO_R : T.r) - 4;
    if (d > reach || M.type === 'skull') {
      dx = Math.cos(ang) * speed * dt;
      dy = Math.sin(ang) * speed * dt;
    }
  } else if (!M.owner) {
    // Nobody to chase: drift toward the middle.
    const ang = Math.atan2(ARENA.H / 2 - M.y, ARENA.W / 2 - M.x) + Math.sin(t / 700 + M.seed);
    dx = Math.cos(ang) * speed * 0.4 * dt;
    dy = Math.sin(ang) * speed * 0.4 * dt;
  }
  if (dx || dy) {
    if (def.fly) {
      M.x = R.clamp(M.x + dx, M.r, ARENA.W - M.r);
      M.y = R.clamp(M.y + dy, M.r, ARENA.H - M.r);
    } else {
      const p = R.moveCircle(M.x, M.y, M.r, dx, dy, B.blocks, liveKegs(B));
      M.x = p.x;
      M.y = p.y;
    }
  }
  // Stuck on a wall? Go around for a moment.
  if (t >= M.checkAt) {
    if (T && Math.hypot(M.x - M.lastX, M.y - M.lastY) < 12 && Math.hypot(T.x - M.x, T.y - M.y) > M.r + 40) {
      M.detour = (B.rng() < 0.5 ? -1 : 1) * rand(B, 1, 1.6);
      M.detourUntil = t + 900;
    }
    M.checkAt = t + 1000;
    M.lastX = M.x;
    M.lastY = M.y;
  }
  // Touching a hero (or, for a ghost, a foe) hurts it.
  if (t >= M.hitAt) {
    const dmg = M.owner ? def.dmg : Math.round(def.dmg * B.level.dmg);
    for (const H of B.heroes.values()) {
      if (!H.alive || H.away || H.id === M.owner) continue;
      if (Math.hypot(H.x - M.x, H.y - M.y) > M.r + HERO_R + 4) continue;
      hurt(B, H, dmg, { mob: M }, t, 'touch');
      M.hitAt = t + def.hitMs;
      break;
    }
    if (M.owner && t >= M.hitAt && T && !T.kit && Math.hypot(T.x - M.x, T.y - M.y) < M.r + T.r + 4) {
      hurt(B, T, dmg, { mob: M }, t);
      M.hitAt = t + def.hitMs;
    }
  }
}

// The Dragon King breathes a fan of fire at its target and calls in minions now and then.
function bossMoves(B, M, T, t) {
  const def = MONSTERS.boss;
  if (t >= M.fireAt) {
    M.fireAt = t + def.fireMs;
    const ang = Math.atan2(T.y - M.y, T.x - M.x);
    for (let i = 0; i < def.fireCount; i++) {
      const a = ang + (i - (def.fireCount - 1) / 2) * (def.fireSpread / (def.fireCount - 1));
      mobShot(B, M, a, t, { dmg: def.fireDmg, speed: def.fireSpeed, range: def.fireRange, kind: 'bfire' });
    }
    B.fx.push({ k: 'roar', x: Math.round(M.x), y: Math.round(M.y), t });
  }
  if (t >= M.callAt) {
    M.callAt = t + def.callMs;
    for (let i = 0; i < def.call; i++) {
      const a = (i / def.call) * Math.PI * 2;
      addMonster(B, i % 2 ? 'bat' : 'slime', R.clamp(M.x + Math.cos(a) * 90, 30, ARENA.W - 30), R.clamp(M.y + Math.sin(a) * 90, 30, ARENA.H - 30), t);
    }
  }
}

// Separation: monsters on the ground don't pile into one spot.
function spreadMonsters(B) {
  const list = [...B.monsters.values()].filter((M) => M.type !== 'boss');
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const min = a.r + b.r;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const k = ((min - d) / d) * 0.5;
      a.x -= dx * k;
      a.y -= dy * k;
      b.x += dx * k;
      b.y += dy * k;
    }
  }
}

function slay(B, M, H, t) {
  B.monsters.delete(M.id);
  const def = MONSTERS[M.type];
  let pts = 0;
  if (M.type === 'boss') {
    B.news.push({ type: 'bossdown', by: H ? H.id : null, x: Math.round(M.x), y: Math.round(M.y), t });
    if (H) {
      H.score += def.pts;
      H.bossKill = true;
      pts = def.pts;
    }
    for (let i = 0; i < 5; i++) addItem(B, t, M.x + rand(B, -110, 110), M.y + rand(B, -60, 90));
  } else if (H && !M.owner) {
    H.slain += 1;
    pts = Math.round(def.pts * (B.perks && H.cls === 'pirate' ? PERK.plunderPts : 1));
    H.score += pts;
    if (B.perks && H.cls === 'necromancer') heal(H, PERK.harvestMob);
    const drop = def.drop * (B.perks && H.cls === 'pirate' ? PERK.plunderDrop : 1);
    if (B.rng() < drop) addItem(B, t, M.x, M.y);
  }
  B.fx.push({ k: 'mdie', m: TYPE_INDEX[M.type], x: Math.round(M.x), y: Math.round(M.y), t, by: H ? H.id : '', pts });
}

// ---- shots -------------------------------------------------------------------
function shotStep(B, S, t, dt) {
  const steps = Math.max(1, Math.ceil((S.speed * dt) / SHOT_STEP));
  const owner = S.owner ? B.heroes.get(S.owner) : null;
  for (let i = 0; i < steps; i++) {
    if (S.homing) steer(B, S, owner, dt / steps);
    S.x += (S.vx * dt) / steps;
    S.y += (S.vy * dt) / steps;
    S.left -= (S.speed * dt) / steps;
    if (S.x < 0 || S.y < 0 || S.x > ARENA.W || S.y > ARENA.H || R.inBlock(S.x, S.y, 0, B.blocks)) return endShot(B, S, t, true);
    for (const K of B.kegs) {
      if (K.backAt || Math.hypot(K.x - S.x, K.y - S.y) > K.r + S.r) continue;
      hurtKeg(B, K, S.dmg, owner, t);
      return endShot(B, S, t, true);
    }
    // A monster's fireball hurts heroes; a hero's shot hurts other heroes and monsters (not its own ghosts).
    for (const H of B.heroes.values()) {
      if (!H.alive || H.away || H.id === S.owner || S.hits.has(H.id)) continue;
      if (Math.hypot(H.x - S.x, H.y - S.y) > HERO_R + S.r) continue;
      if (strike(B, S, H, owner, t)) return;
    }
    if (!S.mob) {
      for (const M of B.monsters.values()) {
        if (M.owner && M.owner === S.owner) continue;
        if (S.hits.has(M.id) || Math.hypot(M.x - S.x, M.y - S.y) > M.r + S.r) continue;
        if (strike(B, S, M, owner, t)) return;
      }
    }
    if (S.left <= 0) return endShot(B, S, t, Boolean(S.splash));
  }
  if (S.homing) B.homing.push([S.id, Math.round(S.x), Math.round(S.y), Math.round(S.vx), Math.round(S.vy)]);
}

// A shot reaches something. True when the shot is used up.
function strike(B, S, target, owner, t) {
  S.hits.add(target.id);
  const mob = S.mob ? B.monsters.get(S.mob) : null;
  hurt(B, target, S.dmg, { hero: owner, mob: mob || (S.mob ? { type: 'skull' } : null) }, t, 'shot');
  if (S.heal && owner) heal(owner, S.heal);
  if (S.slow) {
    if (target.kit) {
      target.slowUntil = t + S.slow;
      target.slowF = 0.65;
    } else target.slowUntil = t + S.slow;
  }
  if (S.knock && (target.kit ? target.alive : B.monsters.has(target.id) && target.type !== 'boss')) push(B, target, S.x - S.vx * 0.05, S.y - S.vy * 0.05, S.knock);
  if (S.pierce > 0) {
    S.pierce -= 1;
    return false;
  }
  endShot(B, S, t, true);
  return true;
}

function endShot(B, S, t, impact) {
  B.shots.delete(S.id);
  B.gone.push([S.id, t, Math.round(S.x), Math.round(S.y), impact ? 1 : 0]);
  if (S.splash && impact) {
    const owner = S.owner ? B.heroes.get(S.owner) : null;
    blast(B, S.x, S.y, S.splashR, S.splash, { hero: owner }, t, { kind: 'splash' });
  }
}

// A Soul Bolt bends toward the nearest foe ahead of it.
function steer(B, S, owner, dt) {
  let best = null;
  let bestD = 360;
  const ang = Math.atan2(S.vy, S.vx);
  const look = (o) => {
    const d = Math.hypot(o.x - S.x, o.y - S.y);
    if (d >= bestD) return;
    let off = Math.atan2(o.y - S.y, o.x - S.x) - ang;
    off = Math.atan2(Math.sin(off), Math.cos(off));
    if (Math.abs(off) < 1.3) { best = { o, off }; bestD = d; }
  };
  for (const H of B.heroes.values()) if (H.alive && !H.away && H.id !== S.owner && !(B.t < (H.until.stealth || 0))) look(H);
  for (const M of B.monsters.values()) if (M.owner !== S.owner) look(M);
  if (!best) return;
  const turn = Math.max(-S.homing * dt, Math.min(S.homing * dt, best.off));
  const a = ang + turn;
  S.vx = Math.cos(a) * S.speed;
  S.vy = Math.sin(a) * S.speed;
}

// ---- power-ups -----------------------------------------------------------------
function addItem(B, t, x = null, y = null) {
  let kind = 'potion';
  const total = ITEM_KEYS.reduce((s, k) => s + ITEMS[k].weight, 0);
  let roll = B.rng() * total;
  for (const k of ITEM_KEYS) {
    roll -= ITEMS[k].weight;
    if (roll < 0) { kind = k; break; }
  }
  let spot = x === null ? freeSpot(B, 90, false) : { x: R.clamp(x, 40, ARENA.W - 40), y: R.clamp(y, 40, ARENA.H - 40) };
  if (R.inBlock(spot.x, spot.y, 16, B.blocks)) spot = freeSpot(B, 90, false);
  const I = { id: B.nextId++, kind, x: Math.round(spot.x), y: Math.round(spot.y), until: t + R.ITEM_LIFE_MS };
  B.items.set(I.id, I);
  return I;
}

function itemsStep(B, t) {
  const heroes = heroesIn(B);
  if (t >= B.nextItemAt) {
    B.nextItemAt = t + rand(B, ...R.ITEM_EVERY_MS);
    const regular = [...B.items.values()].length;
    if (heroes.length && regular < 2 + Math.ceil(heroes.length / 3)) addItem(B, t);
  }
  for (const I of [...B.items.values()]) {
    if (t >= I.until) {
      B.items.delete(I.id);
      continue;
    }
    const H = heroes.find((h) => Math.hypot(h.x - I.x, h.y - I.y) < HERO_R + R.ITEM_R);
    if (H) take(B, H, I, t);
  }
}

function take(B, H, I, t) {
  B.items.delete(I.id);
  const def = ITEMS[I.kind];
  const longer = B.perks && H.cls === 'cleric' ? PERK.blessedTime : 1;
  let until = 0;
  if (I.kind === 'potion') heal(H, def.heal * (B.perks && H.cls === 'cleric' ? PERK.blessedHeal : 1));
  else if (I.kind === 'bomb') blast(B, H.x, H.y, def.r, def.dmg, { hero: H }, t, { knock: 140, kind: 'bomb' });
  else if (I.kind === 'slow') {
    until = t + def.ms * longer;
    B.slow = { by: H.id, until };
  } else {
    until = t + def.ms * longer;
    H.until[I.kind] = until;
  }
  B.news.push({ type: 'pick', id: H.id, item: I.kind, until, x: I.x, y: I.y, t });
}

// ---- skills ----------------------------------------------------------------------
function useSkill(B, id, t) {
  const H = B.heroes.get(id);
  if (!B.skills || !H || !H.alive || H.away || H.charge < R.CHARGE_MAX || t < H.stunUntil) return false;
  H.charge = 0;
  H.safeUntil = 0;
  const S = SKILL;
  let aim = aimOf(B, H, 520);
  let at = null; // where an aimed skill lands
  const ahead = (far) => {
    const o = !(H.input.ax || H.input.ay) && autoTarget(B, H, far + 200);
    const d = o ? Math.min(far + 200, Math.hypot(o.x - H.x, o.y - H.y)) : far;
    return { x: R.clamp(H.x + Math.cos(aim) * d, 30, ARENA.W - 30), y: R.clamp(H.y + Math.sin(aim) * d, 30, ARENA.H - 30) };
  };
  switch (H.cls) {
    case 'knight': H.until.wall = t + S.wallMs; break;
    case 'barbarian': H.until.whirl = t + S.whirlMs; H.whirlNext = t; break;
    case 'wizard':
      at = ahead(S.meteorAhead);
      addZone(B, 'meteor', at.x, at.y, S.meteorR, H.id, t + S.meteorDelay, t + S.meteorDelay);
      break;
    case 'archer':
      for (let i = 0; i < S.fanCount; i++) {
        shoot(B, H, H.kit.atk, aim + (i / (S.fanCount - 1) - 0.5) * S.fanSpread, t);
      }
      break;
    case 'rogue': {
      const { mx, my } = H.input;
      if (mx || my) aim = Math.atan2(my, mx);
      const from = { x: Math.round(H.x), y: Math.round(H.y) };
      for (let s = 0; s < S.stepDist; s += 20) {
        const p = R.moveCircle(H.x, H.y, HERO_R, Math.cos(aim) * 20, Math.sin(aim) * 20, B.blocks, liveKegs(B));
        if (Math.hypot(p.x - H.x, p.y - H.y) < 4) break;
        H.x = p.x;
        H.y = p.y;
      }
      H.until.stealth = t + S.stealthMs;
      at = from; // where they vanished from
      break;
    }
    case 'cleric':
      heal(H, S.sanctHeal);
      blast(B, H.x, H.y, S.sanctR, S.sanctDmg, { hero: H }, t, { knock: S.sanctKnock, kind: 'holy' });
      break;
    case 'ninja':
      ring(B, H, aim, t);
      H.stormAt = t + S.stormGap;
      H.stormAng = aim;
      break;
    case 'necromancer':
      for (let i = 0; i < S.ghosts; i++) {
        const a = aim + ((i - 1) * Math.PI) / 3;
        addMonster(B, 'ghost', R.clamp(H.x + Math.cos(a) * 40, 20, ARENA.W - 20), R.clamp(H.y + Math.sin(a) * 40, 20, ARENA.H - 20), t,
          { owner: H.id, until: t + S.ghostMs });
      }
      break;
    case 'druid':
      addZone(B, 'grow', H.x, H.y, S.growR, H.id, t, t + S.growMs);
      break;
    case 'pirate': {
      at = ahead(S.barrageAhead);
      for (let i = 0; i < S.barrageCount; i++) {
        const a = rand(B, 0, Math.PI * 2);
        const r = rand(B, 0, S.barrageSpread);
        addZone(B, 'cannon', R.clamp(at.x + Math.cos(a) * r, 20, ARENA.W - 20), R.clamp(at.y + Math.sin(a) * r, 20, ARENA.H - 20),
          S.barrageR, H.id, t + 450 + i * S.barrageGap, t + 450 + i * S.barrageGap);
      }
      break;
    }
    case 'bard':
      H.until.hymn = t + S.hymnMs;
      blast(B, H.x, H.y, S.hymnR, 0, { hero: H }, t, { stun: S.hymnStun, kind: 'hymn' });
      break;
    case 'valkyrie': {
      const hit = [];
      for (const T of B.heroes.values()) if (T !== H && T.alive && !T.away && dist(T, H) < S.thunderR + HERO_R) hit.push(T);
      for (const M of B.monsters.values()) if (M.owner !== H.id && dist(M, H) < S.thunderR + M.r) hit.push(M);
      B.fx.push({ k: 'thunder', x: Math.round(H.x), y: Math.round(H.y), r: S.thunderR, t, to: hit.map((o) => [Math.round(o.x), Math.round(o.y)]) });
      for (const o of hit) {
        if (o.kit) o.stunUntil = Math.max(o.stunUntil, t + S.thunderStun);
        else if (o.type !== 'boss') o.stunUntil = Math.max(o.stunUntil || 0, t + S.thunderStun);
        hurt(B, o, S.thunderDmg, { hero: H }, t, 'skill');
      }
      break;
    }
    default: break;
  }
  B.news.push({ type: 'skill', id: H.id, cls: H.cls, x: Math.round(H.x), y: Math.round(H.y), at, t });
  return true;
}

function addZone(B, kind, x, y, r, owner, at, until) {
  const Z = { id: B.nextId++, kind, x: Math.round(x), y: Math.round(y), r, owner, at, until, next: at };
  B.zones.set(Z.id, Z);
}

function zonesStep(B, t) {
  for (const Z of [...B.zones.values()]) {
    const H = B.heroes.get(Z.owner) || null;
    if (Z.kind === 'meteor' || Z.kind === 'cannon') {
      if (t < Z.at) continue;
      B.zones.delete(Z.id);
      const dmg = Z.kind === 'meteor' ? SKILL.meteorDmg : SKILL.barrageDmg;
      blast(B, Z.x, Z.y, Z.r, dmg, { hero: H }, t, { knock: Z.kind === 'meteor' ? 120 : 60, kind: Z.kind });
    } else if (Z.kind === 'grow') {
      if (t >= Z.until) {
        B.zones.delete(Z.id);
        continue;
      }
      if (t < Z.next) continue;
      Z.next = t + 250;
      for (const T of B.heroes.values()) {
        if (T === H || !T.alive || T.away || Math.hypot(T.x - Z.x, T.y - Z.y) > Z.r + HERO_R) continue;
        T.slowUntil = t + 350;
        T.slowF = SKILL.growSlow;
        hurt(B, T, SKILL.growDps / 4, { hero: H }, t, 'skill');
      }
      for (const M of [...B.monsters.values()]) {
        if ((H && M.owner === H.id) || Math.hypot(M.x - Z.x, M.y - Z.y) > Z.r + M.r) continue;
        M.slowUntil = t + 350;
        hurt(B, M, SKILL.growDps / 4, { hero: H }, t);
      }
    }
  }
}

// ---- the clock ---------------------------------------------------------------------
function step(B, t) {
  const dt = R.TICK_MS / 1000;
  B.t = t;
  if (B.slow && t >= B.slow.until) B.slow = null;
  for (const K of B.kegs) {
    if (K.backAt && t >= K.backAt && !heroesIn(B).some((H) => Math.hypot(H.x - K.x, H.y - K.y) < K.r + HERO_R + 6)) K.backAt = 0;
  }
  spawnMonsters(B, t);
  for (const H of B.heroes.values()) heroStep(B, H, t, dt);
  for (const M of [...B.monsters.values()]) if (B.monsters.has(M.id)) monsterStep(B, M, t, dt);
  spreadMonsters(B);
  for (const S of [...B.shots.values()]) if (B.shots.has(S.id)) shotStep(B, S, t, dt);
  zonesStep(B, t);
  itemsStep(B, t);
}

// Runs the fight up to `now` in fixed steps. Returns how many it ran.
function advance(B, now) {
  if (now - B.lastStep > R.TICK_MS * 12) B.lastStep = now - R.TICK_MS * 12; // a stalled server doesn't fast-forward
  let n = 0;
  B.homing = [];
  while (B.lastStep + R.TICK_MS <= now) {
    B.lastStep += R.TICK_MS;
    B.homing = [];
    step(B, B.lastStep);
    n += 1;
  }
  return n;
}

// What the screens draw from, and everything that happened since the last one. Rows are arrays to keep
// it small: see public/js/brawl.js for how they're read.
function snapshot(B) {
  const flags = (H) => {
    const t = B.t;
    let f = 0;
    if (H.alive) f |= F.alive;
    if (t < H.safeUntil) f |= F.safe;
    if (t < (H.until.shield || 0)) f |= F.shield;
    if (t < (H.until.fury || 0)) f |= F.fury;
    if (t < (H.until.haste || 0)) f |= F.haste;
    if (t < (H.until.triple || 0)) f |= F.triple;
    if (t < (H.until.stealth || 0)) f |= F.stealth;
    if (t < H.stunUntil) f |= F.stun;
    if (t < H.slowUntil || (B.slow && t < B.slow.until && B.slow.by !== H.id)) f |= F.slow;
    if (t < (H.until.wall || 0)) f |= F.wall;
    if (t < (H.until.whirl || 0)) f |= F.whirl;
    if (t < (H.until.hymn || 0)) f |= F.hymn;
    if (H.away) f |= F.away;
    return f;
  };
  const snap = {
    t: B.t,
    h: [...B.heroes.values()].map((H) => [H.id, Math.round(H.x), Math.round(H.y), Math.ceil(H.hp), Math.round(H.face * 100), flags(H),
      Math.floor(H.charge), H.score, H.kos, H.alive ? 0 : Math.max(0, H.respawnAt - B.t)]),
    m: [...B.monsters.values()].map((M) => [M.id, TYPE_INDEX[M.type], Math.round(M.x), Math.round(M.y), Math.max(0, Math.round((100 * M.hp) / M.max)),
      M.owner || '', B.t < M.stunUntil ? 1 : 0]),
    s: B.newShots,
    g: B.gone,
    hm: B.homing || [],
    i: [...B.items.values()].map((I) => [I.id, ITEM_INDEX[I.kind], I.x, I.y, I.until]),
    k: B.kegs.map((K) => (K.backAt ? 0 : 1)).join(''),
    z: [...B.zones.values()].map((Z) => [Z.id, Z.kind, Z.x, Z.y, Z.r, Z.at, Z.until, Z.owner || '']),
    fx: B.fx,
    slow: B.slow ? [B.slow.by, B.slow.until] : null,
  };
  B.newShots = [];
  B.gone = [];
  B.fx = [];
  return snap;
}

// Shots already in flight, for a screen that joins mid-fight.
function liveShots(B) {
  return [...B.shots.values()].map((S) => [S.id, S.kind, Math.round(S.x), Math.round(S.y), Math.round(S.vx), Math.round(S.vy), Math.max(0, Math.round(S.left)),
    S.owner || '', B.t, S.homing ? 1 : 0]);
}

function takeNews(B) {
  const n = B.news;
  B.news = [];
  return n;
}

module.exports = { createBrawl, addHero, removeHero, setInput, setAway, useSkill, advance, snapshot, liveShots, takeNews, TYPE_INDEX, ITEM_INDEX };
