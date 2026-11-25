// Artillery: the battle on the server. Heroes take turns (two teams, or free for all): the hero whose turn
// it is can walk a little, jump, aim and fire. A shot is worked out here in full the moment it's fired
// (where it flies, what it blows up, who gets hurt or falls) and sent to every screen to play out. Heroes
// who are knocked out haunt the field as ghosts, and sudden death floods it. No sockets here: server.js
// runs the turns' clocks and passes things on. The numbers live in public/js/arty-rules.js, which the
// screens load too.
const A = require('./public/js/arty-rules');

const { MAP, HERO_MID, HERO_R } = A;

// Free for all: everyone is on "team 0" (so the turns go round them all), and every other hero is a foe.
const foe = (G, H, T) => (G.ffa ? H.id !== T.id : H.team !== T.team);
const ally = (G, H, T) => (G.ffa ? H.id === T.id : H.team === T.team);

function createArty({ players, length = 'full', level = 'normal', specials = true, ffa = false, rng = Math.random }) {
  const seed = Math.floor(rng() * 1e9);
  const style = Math.floor(rng() * A.STYLES.length);
  const G = {
    seed,
    style,
    ffa: Boolean(ffa),
    terrain: new A.Terrain(seed, style),
    craters: [], // [x, y, r, grow?] in the order they happened, so a screen that joins late can rebuild the ground
    heroes: new Map(),
    order: [[], []], // each team's heroes, in turn order (free for all: everyone in order[0])
    next: [0, 0], // whose turn it is next, in each team
    team: rng() < 0.5 ? 0 : 1, // the team that just went (the other goes first)
    turn: 0,
    turns: A.TURNS[length] || A.TURNS.full,
    level: A.LEVELS[level] || A.LEVELS.normal,
    specials,
    wind: 0,
    water: null, // sudden death: the water's surface (y), rising every turn
    phase: 'start', // 'aim' (someone's turn), 'fly' (a shot playing out), 'pass' (time ran out), 'over'
    active: null,
    endsAt: 0,
    double: false, // the active hero used DOUBLE this turn
    busyUntil: 0, // the active hero is in the air (jumping) until then
    hop: null, // their jump: { t0, path }, and whether they've flapped (a bat's second jump) in it
    flapped: false,
    fallAt: 0, // a hero who jumped off the bottom is out at this time (fallId), unless a flap saves them
    fallId: null,
    mult: 1, // the shot being worked out hits this much harder (FURY)
    orbs: [], // power-ups floating over the field: { id, kind, x, y }
    orbSeq: 0,
    winner: null,
    rng,
  };
  if (G.ffa) {
    // Everyone spread out across the whole field, in a random order.
    const list = players.slice();
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    list.forEach((p, i) => addHero(G, p, 0, i, list.length));
  } else {
    const teams = [players.filter((p) => p.team === 0), players.filter((p) => p.team === 1)];
    teams.forEach((list, team) => list.forEach((p, i) => addHero(G, p, team, i, list.length)));
  }
  return G;
}

// A spot with ground under it: on the hero's own side, evenly spread for the starting line-up (i of n), or
// anywhere on their side for someone joining later. Free for all: across the whole field.
function spotFor(G, team, i = null, n = 1) {
  const pick = G.ffa ? (f) => 0.05 + f * 0.9 : (f) => (team === 0 ? 0.05 + f * 0.32 : 0.95 - f * 0.32);
  const tries = [];
  if (i !== null) tries.push(pick((i + 0.5) / Math.max(1, n)));
  for (let k = 0; k < 40; k++) tries.push(pick(G.rng()));
  for (const f of tries) {
    for (const nudge of [0, 20, -20, 40, -40, 80, -80, 120, -120]) {
      const x = Math.max(30, Math.min(MAP.W - 30, f * MAP.W + nudge));
      const y = G.terrain.groundBelow(x, 0);
      if (y !== null && y > 40 && !G.terrain.solid(x, y - HERO_MID * 2)) return { x, y };
    }
  }
  const x = pick(0.5) * MAP.W;
  return { x, y: G.terrain.groundBelow(x, 0) ?? MAP.H / 2 };
}

// The hero's mount: their pet, and how it moves (see MOUNTS).
const mountOf = (H) => A.MOUNTS[H.pet] || A.MOUNTS[0];

// Where something moving along a path ([[t, x, y], ...]) is at time t.
function pathAt(path, t) {
  let i = 1;
  while (i < path.length && path[i][0] < t) i++;
  if (i >= path.length) return [path[path.length - 1][1], path[path.length - 1][2]];
  const [ta, xa, ya] = path[i - 1];
  const [tb, xb, yb] = path[i];
  const k = tb > ta ? Math.max(0, Math.min(1, (t - ta) / (tb - ta))) : 1;
  return [xa + (xb - xa) * k, ya + (yb - ya) * k];
}

function addHero(G, p, team = p.team, i = null, n = 1) {
  if (G.ffa) team = 0;
  const spot = spotFor(G, team, i, n);
  const pet = Number.isInteger(p.pet) && A.MOUNTS[p.pet] ? p.pet : 0;
  const stamina = A.STAMINA * (A.MOUNTS[pet].stamina || 1);
  const face = G.ffa ? (spot.x < MAP.W / 2 ? 1 : -1) : team === 0 ? 1 : -1;
  const H = {
    id: p.id, team, cls: A.SHOTS[p.cls] ? p.cls : 'knight', pet, x: spot.x, y: spot.y, face, angle: 45,
    hp: A.HP, max: A.HP, alive: true, special: 0, items: { heal: 1, double: 1 }, stamina, maxStamina: stamina, away: false,
    fury: false, shield: false, haste: false, twin: false, // power-ups waiting to be used
    ghostWait: 0, gx: spot.x, armed: false, // once knocked out: turns until its ghost bomb is ready, where it floats, and whether it's dropping one
    streak: 0, // shots in a row (their own turns) that hit a foe
    score: 0, dealt: 0, kos: 0, deaths: 0, best: 0, far: 0, power: 0, lastPower: 0, orbs: 0, haunted: 0,
  };
  G.heroes.set(H.id, H);
  G.order[team].push(H.id);
  return H;
}

function removeHero(G, id) {
  const H = G.heroes.get(id);
  if (!H) return;
  G.heroes.delete(id);
  G.order[H.team] = G.order[H.team].filter((x) => x !== id);
}

const aliveIn = (G, team) => [...G.heroes.values()].filter((H) => H.team === team && H.alive);

// The next hero to go: the other team if it has anyone standing, taking its heroes in turn (free for
// all: the next hero standing, round and round).
function startTurn(G, now) {
  let team = 1 - G.team;
  if (!aliveIn(G, team).length) team = G.team;
  const list = G.order[team];
  let H = null;
  for (let k = 0; k < list.length && !H; k++) {
    const h = G.heroes.get(list[(G.next[team] + k) % list.length]);
    if (h && h.alive) {
      H = h;
      G.next[team] = (G.next[team] + k + 1) % list.length;
    }
  }
  if (!H) return null;
  G.team = team;
  G.turn += 1;
  G.active = H.id;
  G.phase = 'aim';
  G.double = false;
  G.busyUntil = 0;
  G.wind = Math.round((G.rng() * 2 - 1) * G.level.wind);
  G.endsAt = now + G.level.turnMs;
  // Your shield lasts until now; HASTE doubles how far you can go this turn.
  H.shield = false;
  H.maxStamina = A.STAMINA * (mountOf(H).stamina || 1) * (H.haste ? A.ORBS.haste.stamina : 1);
  H.haste = false;
  H.stamina = H.maxStamina;
  H.power = 0;
  if (G.specials) H.special = Math.min(A.SPECIAL_MAX, H.special + A.SPECIAL_PER_TURN);
  if (G.turn === 1 || (G.turn % A.ORB.every === 1 && G.orbs.length < A.ORB.max)) spawnOrb(G);
  // Ghosts get closer to their next bomb.
  for (const T of G.heroes.values()) if (!T.alive && T.ghostWait > 0) T.ghostWait -= 1;
  return H;
}

// A power-up, floating somewhere over the middle of the field, in the open and not too near another.
function spawnOrb(G) {
  const kinds = Object.keys(A.ORBS);
  for (let k = 0; k < 40; k++) {
    const x = MAP.W * (0.3 + G.rng() * 0.4);
    const ground = G.terrain.groundBelow(x, 0);
    const y = Math.round(Math.max(90, (ground === null ? MAP.H * 0.65 : ground) - 110 - G.rng() * 220));
    const T = G.terrain;
    if ([[0, 0], [0, A.ORB.r], [0, -A.ORB.r], [A.ORB.r, 0], [-A.ORB.r, 0]].some(([dx, dy]) => T.solid(x + dx, y + dy))) continue;
    if (G.orbs.some((o) => Math.hypot(o.x - x, o.y - y) < 200)) continue;
    const o = { id: ++G.orbSeq, kind: kinds[Math.floor(G.rng() * kinds.length)], x: Math.round(x), y };
    G.orbs.push(o);
    return o;
  }
  return null;
}

// The shooter takes a power-up their shot hit (a ghost's bomb goes straight through them).
function grab(G, H, orbId, t, events) {
  if (!H.alive) return;
  const i = G.orbs.findIndex((o) => o.id === orbId);
  if (i < 0) return;
  const [o] = G.orbs.splice(i, 1);
  events.push({ t: Math.round(t), type: 'orb', id: H.id, orb: o.id, kind: o.kind, x: o.x, y: o.y });
  H.orbs += 1;
  if (o.kind === 'potion') {
    const before = H.hp;
    H.hp = Math.min(H.max, H.hp + A.ORBS.potion.hp);
    if (H.hp > before) events.push({ t: Math.round(t), type: 'heal', id: H.id, d: H.hp - before });
  } else if (o.kind === 'fury') H.fury = true;
  else if (o.kind === 'shield') H.shield = true;
  else if (o.kind === 'haste') H.haste = true;
  else if (o.kind === 'triple') H.twin = true;
}

const mine = (G, id) => {
  const H = G.heroes.get(id);
  return G.phase === 'aim' && H && H.alive && G.active === id ? H : null;
};

// Walk the active hero dir (-1 or 1) for dt seconds, along the ground, while their stamina lasts (their
// mount sets how fast, and how high a step they can climb). Returns 'fell' if they walked off into the drop.
function walk(G, id, dir, dt) {
  const H = mine(G, id);
  if (!H || !dir) return null;
  H.face = dir;
  const M = mountOf(H);
  const climb = A.CLIMB * (M.climb || 1);
  let left = Math.min(H.stamina, A.WALK_SPEED * (M.speed || 1) * dt);
  while (left > 0) {
    const nx = H.x + dir * Math.min(2, left);
    left -= 2;
    if (nx < 12 || nx > MAP.W - 12) break;
    const y = G.terrain.standAt(nx, H.y, climb);
    if (y === false) break; // a wall
    if (y === null && M.sure) break; // a goat stops at the edge of the drop
    H.stamina = Math.max(0, H.stamina - 2);
    H.x = nx;
    if (y === null) {
      knockOut(G, H, null, 0, [], 'fell');
      return 'fell';
    }
    H.y = y;
  }
  return 'ok';
}

// Jump the way they face (their mount sets how far and how high, and what it costs). Worked out in full
// now: returns the path for the screens to play, how long it takes (they can't do anything else until
// they land), and whether it ends off the bottom (a KO once they've fallen: see fallNow). A bat can jump
// once more in mid-air (a flap: half the cost, a little lower), from wherever it is on its way.
// null: not now, or not enough stamina left.
function jump(G, id, now) {
  const H = mine(G, id);
  if (!H) return null;
  const M = mountOf(H);
  let from = [H.x, H.y];
  const flap = now < G.busyUntil;
  if (flap) {
    if (!M.flap || G.flapped || !G.hop) return null;
    from = pathAt(G.hop.path, now - G.hop.t0);
  }
  const cost = Math.round(A.JUMP.cost * (M.jumpCost || 1) * (flap ? 0.5 : 1));
  if (H.stamina < cost) return null;
  const j = A.hop(G.terrain, from[0], from[1], H.face * A.JUMP.vx * (M.jumpX || 1), -A.JUMP.vy * (M.jumpY || 1) * (flap ? 0.85 : 1), M.glide || 0);
  H.stamina = Math.max(0, H.stamina - cost);
  H.x = Math.round(j.x);
  H.y = j.y;
  G.busyUntil = now + j.t;
  G.hop = { t0: now, path: j.path };
  G.flapped = flap;
  G.fallAt = j.fell ? now + j.t : 0;
  G.fallId = j.fell ? H.id : null;
  return { id: H.id, path: j.path, t: j.t, fell: j.fell, flap, x: H.x, y: H.y, stamina: Math.round(H.stamina) };
}

// A hero who jumped off the bottom is out once they've fallen. Returns their id when it happens.
function fallNow(G, now) {
  if (!G.fallAt || now < G.fallAt) return null;
  const H = G.heroes.get(G.fallId);
  G.fallAt = 0;
  G.fallId = null;
  if (!H || !H.alive) return null;
  knockOut(G, H, null, 0, [], 'fell');
  return H.id;
}

function aim(G, id, angle, face) {
  const H = mine(G, id);
  if (!H) return false;
  if (Number.isFinite(Number(angle))) H.angle = Math.max(A.ANGLE_MIN, Math.min(A.ANGLE_MAX, Math.round(Number(angle))));
  if (face === 1 || face === -1) H.face = face;
  return true;
}

function useItem(G, id, item) {
  const H = mine(G, id);
  if (!H || !A.ITEMS[item] || !H.items[item]) return false;
  if (item === 'heal') {
    if (H.hp >= H.max) return false;
    H.hp = Math.min(H.max, H.hp + A.ITEMS.heal.hp);
  }
  if (item === 'double') {
    if (G.double) return false;
    G.double = true;
  }
  H.items[item] = 0;
  return true;
}

// ---- ghosts --------------------------------------------------------------------------
// A ghost floats over x (any time). Returns its x, or null if it isn't a ghost (or its bomb is on its way).
function haunt(G, id, x) {
  const H = G.heroes.get(id);
  if (!H || H.alive || H.armed || !Number.isFinite(Number(x))) return null;
  H.gx = Math.round(Math.max(40, Math.min(MAP.W - 40, Number(x))));
  return H.gx;
}

// A ghost whose bomb is ready drops it where it floats: it falls once the turn's shot has landed.
function arm(G, id) {
  const H = G.heroes.get(id);
  if (!H || H.alive || H.armed || H.ghostWait > 0 || G.phase !== 'aim') return false;
  H.armed = true;
  return true;
}

// The ghosts' bombs, falling one after another from `t0` (ms into the shot `out`). Returns when the last
// one is done (or t0 if there are none).
function ghostBombs(G, out, t0) {
  let t = t0;
  let end = t0;
  for (const H of G.heroes.values()) {
    if (H.alive || !H.armed) continue;
    H.armed = false;
    H.ghostWait = A.GHOST.every;
    const from = { x: H.gx, y: A.ghostY(G.terrain, H.gx) + 24, vx: 0, vy: 120 };
    out.events.push({ t: Math.round(t), type: 'ghost', id: H.id, x: H.gx });
    const dealt = H.dealt;
    end = Math.max(end, shell(G, H, A.GHOST.bomb, 0, 0, t, out, from));
    H.haunted += H.dealt - dealt;
    t += 300;
  }
  return end;
}

// A turn that ran out (or ended without a shot) with ghost bombs waiting: they fall on their own. Returns
// a shot for the screens to play, or null if no ghost is dropping one.
function ghostVolley(G, now) {
  if (![...G.heroes.values()].some((H) => !H.alive && H.armed)) return null;
  const out = { id: null, ghost: true, shells: [], events: [], total: 0 };
  ghostBombs(G, out, 0);
  out.total = Math.max(500, ...out.shells.map((s) => s.end));
  out.slow = out.events.filter((e) => e.type === 'ko').length;
  G.phase = 'fly';
  G.endsAt = now + out.total + A.SHOW_MS + out.slow * A.SLOWMO_EXTRA;
  return out;
}

// ---- firing --------------------------------------------------------------------------
// Fire! Works out the whole shot: every shell's path, what each blast does, who falls, then the ghosts'
// bombs. Returns what the screens need to play it out: { id, special, shells: [{ kind, t0, path, booms }],
// events, total, hype (how it went, for the callouts), slow (knockouts: each one plays in slow motion) }.
function fire(G, id, data, now) {
  const H = mine(G, id);
  if (!H || now < G.busyUntil) return null;
  aim(G, id, data?.angle, data?.face);
  const power = Math.max(0, Math.min(100, Number(data?.power) || 0));
  const kit = A.SHOTS[H.cls];
  const special = (data?.shot === 'special' || Boolean(data?.special)) && G.specials && H.special >= A.SPECIAL_MAX;
  const alt = !special && data?.shot === 'two';
  const def = special ? kit.special.shot : alt ? kit.alt.shot : kit.shot;
  if (special) H.special = 0;
  H.lastPower = power;
  // Power-ups this shot uses up: FURY hits harder, TWIN SHOT fires it once more (on top of DOUBLE).
  G.mult = H.fury ? A.ORBS.fury.mult : 1;
  const rounds = 1 + (G.double ? 1 : 0) + (H.twin ? 1 : 0);
  const out = { id: H.id, special, alt, angle: H.angle, face: H.face, power, wind: G.wind, fury: H.fury, twin: H.twin, shells: [], events: [], total: 0 };
  H.fury = false;
  H.twin = false;
  const foes = [...G.heroes.values()].filter((T) => T.alive && foe(G, H, T));
  // One volley: `count` shells at once (fanned out) or one after another (`gap`). DOUBLE fires it again.
  const volley = [];
  const n = def.count || 1;
  for (let i = 0; i < n; i++) {
    volley.push({ t0: def.gap ? i * def.gap : 0, off: def.spread ? (i - (n - 1) / 2) * def.spread : 0 });
  }
  let start = 0;
  for (let round = 0; round < rounds; round++) {
    let end = start;
    for (const v of volley) {
      if (!H.alive && !def.teleport) break;
      end = Math.max(end, shell(G, H, def, power, v.off, start + v.t0, out));
    }
    start = end + 350;
  }
  G.mult = 1;
  out.hype = hypeOf(G, H, def, out, foes);
  // Then the ghosts' bombs, once it's all landed.
  ghostBombs(G, out, start);
  out.total = Math.max(500, ...out.shells.map((s) => s.end));
  out.slow = out.events.filter((e) => e.type === 'ko').length;
  G.phase = 'fly';
  G.endsAt = now + out.total + A.SHOW_MS + out.slow * A.SLOWMO_EXTRA;
  return out;
}

// How the shot went, for the screens' callouts: foes knocked out and hit, a direct hit, hurting your own
// side (or yourself), a near miss, and how many of your shots in a row have hit a foe.
function hypeOf(G, H, def, out, foes) {
  const hit = new Set();
  let kos = 0;
  let direct = false;
  let own = false;
  let ownKo = false;
  let self = false;
  for (const e of out.events) {
    const T = G.heroes.get(e.id);
    if (!T) continue;
    if (e.type === 'dmg' && e.by === H.id) {
      if (T === H) self = true;
      else if (foe(G, H, T)) {
        hit.add(T.id);
        if (e.direct) direct = true;
      } else own = true;
    } else if (e.type === 'ko') {
      if (e.by === H.id) kos += 1;
      else if (T !== H && !foe(G, H, T) && e.why !== 'drowned') ownKo = true;
    }
  }
  H.streak = hit.size ? H.streak + 1 : 0;
  // A near miss: nothing hit, but a blast landed close to a foe.
  let close = false;
  if (!hit.size) {
    for (const s of out.shells) {
      for (const b of s.booms) if (foes.some((T) => Math.hypot(T.x - b.x, T.y - HERO_MID - b.y) < (b.r || def.r) + HERO_R + 60)) close = true;
    }
  }
  return { kos, hits: hit.size, direct, own, ownKo, self, close, streak: H.streak };
}

// One shell: fly it, blow it up (and bounce it, roll it, split it, burst it), apply what happens.
// `from`: where and how fast it starts, for shells that come out of another (splits, bomblets, a ghost's
// bomb); otherwise it leaves the hero's hands. Returns when it's all done (ms).
function shell(G, H, def, power, off, t0, out, from = null) {
  const heroes = () => [...G.heroes.values()].filter((h) => h.alive).map((h) => ({ id: h.id, x: h.x, y: h.y }));
  let s = from || A.launch(H.x, H.y, H.face, H.angle + off, power);
  const record = { kind: def.kind, big: def.big || 1, t0, path: [], booms: [], end: t0 };
  out.shells.push(record);
  let t = t0;
  let done = t0;
  let bounces = def.bounce || 0;
  for (;;) {
    const flight = A.fly(G.terrain, heroes(), from ? null : H.id, s, def, G.wind, G.orbs);
    for (const p of flight.path) record.path.push([Math.round(t + p[0]), p[1], p[2]]);
    for (const g of flight.grabs) grab(G, H, g.id, t + g.t, out.events);
    t += flight.end.t;
    let end = flight.end;
    if (end.hit === 'gone') break;
    if (end.hit === 'split') {
      // The top of its arc: it splits into several, fanning out.
      const child = { ...def, split: 0, big: 0.8 };
      for (let i = 0; i < def.split; i++) {
        const k = i - (def.split - 1) / 2;
        done = Math.max(done, shell(G, H, child, power, 0, t, out, { x: end.x, y: end.y, vx: end.vx + k * 110, vy: end.vy }));
      }
      break;
    }
    if (end.hit === 'ground' && def.roll) {
      const rolled = roll(G, H, end, def, t, record);
      t = rolled.t;
      end = rolled.end;
      if (end.hit === 'gone') break;
    }
    boom(G, H, def, end, t, record, out);
    if (def.cluster) {
      // Bomblets, flung up and out from the blast.
      const c = def.cluster;
      const bit = { kind: 'shard', dmg: c.dmg, r: c.r, crater: c.crater, big: 0.6 };
      for (let i = 0; i < c.n; i++) {
        const vx = -260 + (520 * (i + 0.5)) / c.n + (G.rng() - 0.5) * 80;
        done = Math.max(done, shell(G, H, bit, 0, 0, t, out, { x: end.x, y: end.y - 10, vx, vy: -380 - G.rng() * 200 }));
      }
    }
    if (end.hit !== 'ground' || bounces <= 0) break;
    bounces -= 1;
    // Off it goes again, a little slower.
    s = { x: end.x, y: end.y - 8, vx: (end.vx || 0) * 0.75, vy: -Math.abs(end.vy || 0) * 0.55 };
  }
  record.end = t;
  return Math.max(t, done);
}

// A shell that lands and rolls: along the ground the way it was going, over bumps, down slopes, until it
// has rolled its distance, meets a wall or a hero (then it blows), or rolls off into the drop.
const ROLL_SPEED = 300;
function roll(G, H, end, def, t, record) {
  const dir = Math.sign(end.vx || 0) || H.face;
  let x = end.x;
  let y = G.terrain.groundBelow(x, end.y - 16);
  if (y === null) return { t, end };
  let left = def.roll;
  let n = 0;
  while (left > 0) {
    const nx = x + dir * 4;
    if (nx < 4 || nx > MAP.W - 4) return { t, end: { x, y: y - 8, hit: 'gone' } };
    const ny = G.terrain.standAt(nx, y);
    if (ny === false) break; // a wall
    t += (4 / ROLL_SPEED) * 1000;
    if (ny === null) {
      record.path.push([Math.round(t), Math.round(nx), y], [Math.round(t + 500), Math.round(nx + dir * 40), MAP.H + 80]);
      return { t: t + 500, end: { x: nx, y: MAP.H + 80, hit: 'gone' } };
    }
    x = nx;
    y = ny;
    left -= 4;
    if (++n % 3 === 0) record.path.push([Math.round(t), Math.round(x), y - 8]);
    for (const T of G.heroes.values()) {
      if (!T.alive || T === H) continue;
      if (Math.hypot(T.x - x, T.y - HERO_MID - (y - 8)) < HERO_R + 10) {
        record.path.push([Math.round(t), Math.round(x), y - 8]);
        return { t, end: { x, y: y - 8, hit: 'hero', hero: T.id } };
      }
    }
  }
  record.path.push([Math.round(t), Math.round(x), y - 8]);
  return { t, end: { x, y: y - 8, hit: 'ground' } };
}

// A blast at the end of a shell: dig (or raise) the ground, hurt everyone near, heal teammates, strike
// lightning, move the shooter (Shadow Step), then let anyone left standing on air fall.
function boom(G, H, def, end, t, record, out) {
  const x = Math.round(end.x);
  const y = Math.round(end.y);
  record.booms.push({ t: Math.round(t), x, y, r: def.r, crater: def.crater || 0, grow: def.grow || 0 });
  if (def.grow) {
    G.terrain.grow(x, y, def.grow);
    G.craters.push([x, y, def.grow, 1]);
  } else if (def.crater) {
    G.terrain.carve(x, y, def.crater);
    G.craters.push([x, y, def.crater, 0]);
  }
  const hits = new Map();
  const directs = new Set();
  const boost = sudden(G);
  for (const T of G.heroes.values()) {
    if (!T.alive) continue;
    const d = Math.hypot(T.x - x, T.y - HERO_MID - y);
    if (d > def.r + HERO_R) continue;
    const direct = end.hit === 'hero' && end.hero === T.id;
    let dmg = def.dmg * (1 - 0.5 * Math.min(1, d / def.r));
    if (direct) {
      dmg = def.dmg * (def.direct || 1.25);
      directs.add(T.id);
    }
    hits.set(T.id, Math.round(dmg * boost));
  }
  if (def.bolt) {
    for (const T of G.heroes.values()) {
      if (T.alive && Math.abs(T.x - x) < def.boltR) hits.set(T.id, (hits.get(T.id) || 0) + Math.round(def.bolt * boost));
    }
    out.events.push({ t: Math.round(t), type: 'bolt', x, r: def.boltR });
  }
  // A power-up caught in the blast is the shooter's too.
  for (const o of [...G.orbs]) if (Math.hypot(o.x - x, o.y - y) < def.r + A.ORB.r) grab(G, H, o.id, t, out.events);
  let drained = 0;
  for (const [tid, raw] of hits) {
    const T = G.heroes.get(tid);
    // FURY on the shot hits harder; a SHIELD takes half, and a turtle a little.
    const dmg = Math.round(raw * G.mult * (T && T.shield ? A.ORBS.shield.guard : 1) * (T ? mountOf(T).guard || 1 : 1));
    if (!T || !T.alive || dmg <= 0) continue;
    T.hp -= dmg;
    const enemy = foe(G, H, T);
    const e = { t: Math.round(t), type: 'dmg', id: tid, d: dmg, by: H.id };
    if (directs.has(tid)) e.direct = true;
    out.events.push(e);
    if (enemy) {
      H.score += dmg;
      H.dealt += dmg;
      H.best = Math.max(H.best, dmg);
      H.far = Math.max(H.far, Math.round(Math.abs(T.x - (H.alive ? H.x : H.gx))));
      drained += dmg;
      if (G.specials) {
        if (H.alive) H.special = Math.min(A.SPECIAL_MAX, H.special + dmg * A.SPECIAL_PER_DMG);
        T.special = Math.min(A.SPECIAL_MAX, T.special + dmg * A.SPECIAL_PER_HURT);
      }
    }
    if (T.hp <= 0) knockOut(G, T, H, t, out.events);
  }
  if (def.heal) {
    for (const T of G.heroes.values()) {
      if (!T.alive || !ally(G, H, T) || Math.hypot(T.x - x, T.y - y) > def.healR) continue;
      const before = T.hp;
      T.hp = Math.min(T.max, T.hp + def.heal);
      if (T.hp > before) out.events.push({ t: Math.round(t), type: 'heal', id: T.id, d: T.hp - before });
    }
  }
  if (def.drain && drained && H.alive) {
    const before = H.hp;
    H.hp = Math.min(H.max, H.hp + Math.round(drained * def.drain));
    if (H.hp > before) out.events.push({ t: Math.round(t), type: 'heal', id: H.id, d: H.hp - before });
  }
  if (def.teleport && H.alive) {
    const y2 = G.terrain.groundBelow(x, Math.max(0, y - 60));
    if (y2 !== null) {
      H.x = Math.max(12, Math.min(MAP.W - 12, x));
      H.y = y2;
      out.events.push({ t: Math.round(t), type: 'tele', id: H.id, x: Math.round(H.x), y: H.y });
    }
  }
  settle(G, H, t, out.events);
}

// After the ground changes: heroes buried by a mound climb out on top; heroes over a hole drop to the
// ground below, or off the bottom (a KO, to whoever blew the hole if it was a foe).
function settle(G, H, t, events) {
  for (const T of G.heroes.values()) {
    if (!T.alive) continue;
    let y = T.y;
    let up = 0;
    while (G.terrain.solid(T.x, y - 1) && up < 300) {
      y -= MAP.CELL;
      up += MAP.CELL;
    }
    const ground = G.terrain.groundBelow(T.x, y);
    if (ground === null) {
      events.push({ t: Math.round(t), type: 'fall', id: T.id, y: MAP.H + 80, out: true });
      knockOut(G, T, foe(G, H, T) ? H : null, t, events, 'fell');
    } else if (ground !== T.y) {
      events.push({ t: Math.round(t), type: 'fall', id: T.id, y: ground });
      T.y = ground;
    }
  }
}

// Out: the hero becomes a ghost, floating over where they fell; its first bomb is ready in a few turns.
function knockOut(G, T, H, t, events, why = 'hp') {
  if (!T.alive) return;
  T.alive = false;
  T.hp = 0;
  T.deaths += 1;
  T.ghostWait = A.GHOST.first;
  T.gx = Math.round(Math.max(40, Math.min(MAP.W - 40, T.x)));
  T.armed = false;
  T.fury = T.shield = T.haste = T.twin = false;
  if (why === 'fell') T.y = MAP.H + 80;
  const enemy = H && foe(G, H, T);
  if (enemy) {
    H.kos += 1;
    H.score += A.KO_POINTS;
  }
  events.push({ t: Math.round(t), type: 'ko', id: T.id, by: enemy ? H.id : null, why });
}

// Sudden death: from turn G.turns on, every hit is SUDDEN_STEP harder each turn (heals aren't).
function sudden(G) {
  return Math.min(A.SUDDEN_MAX, 1 + Math.max(0, G.turn - G.turns) * A.SUDDEN_STEP);
}

// Sudden death floods the field, between turns: when it starts the water fills the lowest dip, then it rises
// every turn. Feet in the water hurt; a hero under it drowns. Returns { water, events } for the screens, or
// null before sudden death.
function flood(G) {
  if (G.turn < G.turns) return null;
  if (G.water === null) {
    let deep = 0;
    for (let x = 4; x < MAP.W; x += 8) {
      const y = G.terrain.groundBelow(x, 0);
      if (y !== null) deep = Math.max(deep, y);
    }
    G.water = Math.min(MAP.H, deep || MAP.H);
  } else G.water = Math.max(A.WATER.top, G.water - A.WATER.rise);
  const events = [];
  for (const H of G.heroes.values()) {
    if (!H.alive || H.y <= G.water) continue;
    if (H.y - HERO_MID > G.water) {
      knockOut(G, H, null, 0, events, 'drowned');
      continue;
    }
    H.hp -= A.WATER.dmg;
    events.push({ t: 0, type: 'dmg', id: H.id, d: A.WATER.dmg, water: true });
    if (H.hp <= 0) knockOut(G, H, null, 0, events, 'drowned');
  }
  return { water: G.water, events };
}

// Who won, or null if it goes on. Teams: 0, 1, or -1 for a draw; the battle ends when a team is wiped out
// (or both are). Free for all: the last hero standing's id, or -1 if nobody is. `now`: end it here anyway
// (the host skipped, or LAST_TURN): the side (or hero) with the most HP wins.
function verdict(G, now = false) {
  if (G.ffa) {
    const up = [...G.heroes.values()].filter((H) => H.alive);
    if (G.heroes.size >= 2 && up.length === 1) return up[0].id;
    if (!up.length) return -1;
    if (!now && G.turn < A.LAST_TURN) return null;
    const most = Math.max(...up.map((H) => H.hp));
    const top = up.filter((H) => H.hp === most);
    return top.length === 1 ? top[0].id : -1;
  }
  const up = [aliveIn(G, 0), aliveIn(G, 1)];
  const had = [G.order[0].length, G.order[1].length];
  if (had[0] && had[1]) {
    if (!up[0].length && !up[1].length) return -1;
    if (!up[0].length) return 1;
    if (!up[1].length) return 0;
  } else if (!up[0].length && !up[1].length) return -1;
  if (!now && G.turn < A.LAST_TURN) return null;
  const hp = up.map((list) => list.reduce((s, h) => s + h.hp, 0));
  return hp[0] === hp[1] ? -1 : hp[0] > hp[1] ? 0 : 1;
}

function finish(G, winner) {
  G.phase = 'over';
  G.winner = winner;
  if (winner === -1 || winner === null) return;
  if (G.ffa) {
    const H = G.heroes.get(winner);
    if (H) H.score += A.FFA_WIN_POINTS;
    return;
  }
  for (const H of G.heroes.values()) if (H.team === winner) H.score += A.WIN_POINTS;
}

// What every screen gets with the room's state: the battlefield (seed and style), whose turn, the wind, the
// water (sudden death), the power-ups ([id, kind, x, y]) and every hero: [id, team, x, y, hp, alive, face,
// angle, special, heal item, double item, stamina, last power, power-ups waiting (1 fury, 2 shield, 4 haste,
// 8 twin), most stamina, ghost: turns until its bomb is ready (-1 alive), where it floats, dropping a bomb].
function stateOf(G) {
  return {
    seed: G.seed, style: G.style, ffa: G.ffa, turn: G.turn, turns: G.turns, team: G.team, active: G.active, wind: G.wind, phase: G.phase,
    endsAt: G.endsAt, double: G.double, winner: G.winner, specials: G.specials, turnMs: G.level.turnMs, boost: Math.round(sudden(G) * 10) / 10,
    water: G.water,
    orbs: G.orbs.map((o) => [o.id, o.kind, o.x, o.y]),
    heroes: [...G.heroes.values()].map((H) => [H.id, H.team, Math.round(H.x), H.y, Math.max(0, H.hp), H.alive ? 1 : 0, H.face, H.angle,
      Math.floor(H.special), H.items.heal, H.items.double, Math.round(H.stamina), H.lastPower,
      (H.fury ? 1 : 0) | (H.shield ? 2 : 0) | (H.haste ? 4 : 0) | (H.twin ? 8 : 0), Math.round(H.maxStamina),
      H.alive ? -1 : H.ghostWait, H.gx, H.armed ? 1 : 0]),
  };
}

module.exports = {
  createArty, addHero, removeHero, startTurn, walk, jump, fallNow, aim, useItem, fire, haunt, arm, ghostVolley, flood,
  verdict, finish, stateOf, aliveIn, spawnOrb, mountOf,
};
