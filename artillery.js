// Artillery: the battle on the server. Two teams take turns: the hero whose turn it is can walk a little,
// aim and fire. A shot is worked out here in full the moment it's fired (where it flies, what it blows up,
// who gets hurt or falls) and sent to every screen to play out. No sockets here: server.js runs the turns'
// clocks and passes things on. The numbers live in public/js/arty-rules.js, which the screens load too.
const A = require('./public/js/arty-rules');

const { MAP, HERO_MID, HERO_R } = A;

function createArty({ players, length = 'full', level = 'normal', specials = true, rng = Math.random }) {
  const seed = Math.floor(rng() * 1e9);
  const style = Math.floor(rng() * A.STYLES.length);
  const G = {
    seed,
    style,
    terrain: new A.Terrain(seed, style),
    craters: [], // [x, y, r, grow?] in the order they happened, so a screen that joins late can rebuild the ground
    heroes: new Map(),
    order: [[], []], // each team's heroes, in turn order
    next: [0, 0], // whose turn it is next, in each team
    team: rng() < 0.5 ? 0 : 1, // the team that just went (the other goes first)
    turn: 0,
    turns: A.TURNS[length] || A.TURNS.full,
    level: A.LEVELS[level] || A.LEVELS.normal,
    specials,
    wind: 0,
    phase: 'start', // 'aim' (someone's turn), 'fly' (a shot playing out), 'pass' (time ran out), 'over'
    active: null,
    endsAt: 0,
    double: false, // the active hero used DOUBLE this turn
    winner: null,
    rng,
  };
  const teams = [players.filter((p) => p.team === 0), players.filter((p) => p.team === 1)];
  teams.forEach((list, team) => list.forEach((p, i) => addHero(G, p, team, i, list.length)));
  return G;
}

// A spot on the hero's own side of the map with ground under it: evenly spread for the starting line-up
// (i of n), anywhere on their side for someone joining later.
function spotFor(G, team, i = null, n = 1) {
  const side = (f) => (team === 0 ? f : 1 - f);
  const tries = [];
  if (i !== null) tries.push(side(0.06 + (0.3 * (i + 0.5)) / Math.max(1, n)));
  for (let k = 0; k < 40; k++) tries.push(side(0.05 + G.rng() * 0.32));
  for (const f of tries) {
    for (const nudge of [0, 20, -20, 40, -40, 80, -80, 120, -120]) {
      const x = Math.max(30, Math.min(MAP.W - 30, f * MAP.W + nudge));
      const y = G.terrain.groundBelow(x, 0);
      if (y !== null && y > 40 && !G.terrain.solid(x, y - HERO_MID * 2)) return { x, y };
    }
  }
  return { x: side(0.2) * MAP.W, y: G.terrain.groundBelow(side(0.2) * MAP.W, 0) ?? MAP.H / 2 };
}

function addHero(G, p, team = p.team, i = null, n = 1) {
  const spot = spotFor(G, team, i, n);
  const H = {
    id: p.id, team, cls: A.SHOTS[p.cls] ? p.cls : 'knight', x: spot.x, y: spot.y, face: team === 0 ? 1 : -1, angle: 45,
    hp: A.HP, max: A.HP, alive: true, special: 0, items: { heal: 1, double: 1 }, stamina: A.STAMINA, away: false,
    score: 0, dealt: 0, kos: 0, deaths: 0, best: 0, far: 0, power: 0, lastPower: 0,
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

// The next hero to go: the other team if it has anyone standing, taking its heroes in turn.
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
  G.wind = Math.round((G.rng() * 2 - 1) * G.level.wind);
  G.endsAt = now + G.level.turnMs;
  H.stamina = A.STAMINA;
  H.power = 0;
  if (G.specials) H.special = Math.min(A.SPECIAL_MAX, H.special + A.SPECIAL_PER_TURN);
  return H;
}

const mine = (G, id) => {
  const H = G.heroes.get(id);
  return G.phase === 'aim' && H && H.alive && G.active === id ? H : null;
};

// Walk the active hero dir (-1 or 1) for dt seconds, along the ground, while their stamina lasts.
// Returns 'fell' if they walked off into the drop.
function walk(G, id, dir, dt) {
  const H = mine(G, id);
  if (!H || !dir) return null;
  H.face = dir;
  let left = Math.min(H.stamina, A.WALK_SPEED * dt);
  while (left > 0) {
    const nx = H.x + dir * Math.min(2, left);
    left -= 2;
    if (nx < 12 || nx > MAP.W - 12) break;
    const y = G.terrain.standAt(nx, H.y);
    if (y === false) break; // a wall
    H.stamina = Math.max(0, H.stamina - 2);
    H.x = nx;
    if (y === null) {
      knockOut(G, H, null, 0, []);
      return 'fell';
    }
    H.y = y;
  }
  return 'ok';
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

// Fire! Works out the whole shot: every shell's path, what each blast does, who falls. Returns what the
// screens need to play it out: { id, special, shells: [{ kind, t0, path, booms }], events, total }.
function fire(G, id, data, now) {
  const H = mine(G, id);
  if (!H) return null;
  aim(G, id, data?.angle, data?.face);
  const power = Math.max(0, Math.min(100, Number(data?.power) || 0));
  const kit = A.SHOTS[H.cls];
  const special = Boolean(data?.special) && G.specials && H.special >= A.SPECIAL_MAX;
  const def = special ? kit.special.shot : kit.shot;
  if (special) H.special = 0;
  H.lastPower = power;
  const out = { id: H.id, special, angle: H.angle, face: H.face, power, wind: G.wind, shells: [], events: [], total: 0 };
  // One volley: `count` shells at once (fanned out) or one after another (`gap`). DOUBLE fires it again.
  const volley = [];
  const n = def.count || 1;
  for (let i = 0; i < n; i++) {
    volley.push({ t0: def.gap ? i * def.gap : 0, off: def.spread ? (i - (n - 1) / 2) * def.spread : 0 });
  }
  let start = 0;
  for (let round = 0; round < (G.double ? 2 : 1); round++) {
    let end = start;
    for (const v of volley) {
      if (!H.alive && !def.teleport) break;
      end = Math.max(end, shell(G, H, def, power, v.off, start + v.t0, out));
    }
    start = end + 350;
  }
  out.total = Math.max(500, ...out.shells.map((s) => s.end));
  G.phase = 'fly';
  G.endsAt = now + out.total + A.SHOW_MS;
  return out;
}

// One shell: fly it, blow it up (and bounce it), apply what happens. Returns when it's done (ms).
function shell(G, H, def, power, off, t0, out) {
  const heroes = () => [...G.heroes.values()].filter((h) => h.alive).map((h) => ({ id: h.id, x: h.x, y: h.y }));
  let s = A.launch(H.x, H.y, H.face, H.angle + off, power);
  const record = { kind: def.kind, big: def.big || 1, t0, path: [], booms: [], end: t0 };
  out.shells.push(record);
  let t = t0;
  let bounces = def.bounce || 0;
  for (;;) {
    const { path, end } = A.fly(G.terrain, heroes(), H.id, s, def, G.wind);
    for (const p of path) record.path.push([Math.round(t + p[0]), p[1], p[2]]);
    t += end.t;
    if (end.hit === 'gone') break;
    boom(G, H, def, end, t, record, out);
    if (end.hit !== 'ground' || bounces <= 0) break;
    bounces -= 1;
    // Off it goes again, a little slower.
    s = { x: end.x, y: end.y - 8, vx: (end.vx || 0) * 0.75, vy: -Math.abs(end.vy || 0) * 0.55 };
  }
  record.end = t;
  return t;
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
  for (const T of G.heroes.values()) {
    if (!T.alive) continue;
    const d = Math.hypot(T.x - x, T.y - HERO_MID - y);
    if (d > def.r + HERO_R) continue;
    const direct = end.hit === 'hero' && end.hero === T.id;
    let dmg = def.dmg * (1 - 0.5 * Math.min(1, d / def.r));
    if (direct) dmg = def.dmg * (def.direct || 1.25);
    hits.set(T.id, Math.round(dmg));
  }
  if (def.bolt) {
    for (const T of G.heroes.values()) {
      if (T.alive && Math.abs(T.x - x) < def.boltR) hits.set(T.id, (hits.get(T.id) || 0) + def.bolt);
    }
    out.events.push({ t: Math.round(t), type: 'bolt', x, r: def.boltR });
  }
  let drained = 0;
  for (const [tid, dmg] of hits) {
    const T = G.heroes.get(tid);
    if (!T || !T.alive || dmg <= 0) continue;
    T.hp -= dmg;
    const enemy = T.team !== H.team;
    out.events.push({ t: Math.round(t), type: 'dmg', id: tid, d: dmg, by: H.id });
    if (enemy) {
      H.score += dmg;
      H.dealt += dmg;
      H.best = Math.max(H.best, dmg);
      H.far = Math.max(H.far, Math.round(Math.abs(T.x - H.x)));
      drained += dmg;
      if (G.specials) {
        H.special = Math.min(A.SPECIAL_MAX, H.special + dmg * A.SPECIAL_PER_DMG);
        T.special = Math.min(A.SPECIAL_MAX, T.special + dmg * A.SPECIAL_PER_HURT);
      }
    }
    if (T.hp <= 0) knockOut(G, T, H, t, out.events);
  }
  if (def.heal) {
    for (const T of G.heroes.values()) {
      if (!T.alive || T.team !== H.team || Math.hypot(T.x - x, T.y - y) > def.healR) continue;
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
// ground below, or off the bottom (a KO, to whoever blew the hole if it was an enemy).
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
      knockOut(G, T, T.team !== H.team ? H : null, t, events, 'fell');
    } else if (ground !== T.y) {
      events.push({ t: Math.round(t), type: 'fall', id: T.id, y: ground });
      T.y = ground;
    }
  }
}

function knockOut(G, T, H, t, events, why = 'hp') {
  if (!T.alive) return;
  T.alive = false;
  T.hp = 0;
  T.deaths += 1;
  if (why === 'fell') T.y = MAP.H + 80;
  const enemy = H && H.team !== T.team;
  if (enemy) {
    H.kos += 1;
    H.score += A.KO_POINTS;
  }
  events.push({ t: Math.round(t), type: 'ko', id: T.id, by: enemy ? H.id : null, why });
}

// Who won, once a team is wiped out or the turns are up: 0, 1, -1 for a draw, or null if it goes on.
function verdict(G) {
  const up = [aliveIn(G, 0), aliveIn(G, 1)];
  const had = [G.order[0].length, G.order[1].length];
  if (had[0] && had[1]) {
    if (!up[0].length && !up[1].length) return -1;
    if (!up[0].length) return 1;
    if (!up[1].length) return 0;
  } else if (!up[0].length && !up[1].length) return -1;
  if (G.turn < G.turns) return null;
  const hp = up.map((list) => list.reduce((s, h) => s + h.hp, 0));
  return hp[0] === hp[1] ? -1 : hp[0] > hp[1] ? 0 : 1;
}

function finish(G, winner) {
  G.phase = 'over';
  G.winner = winner;
  if (winner < 0) return;
  for (const H of G.heroes.values()) if (H.team === winner) H.score += A.WIN_POINTS;
}

// What every screen gets with the room's state: the battlefield (seed and style), whose turn, the wind and
// every hero: [id, team, x, y, hp, alive, face, angle, special, heal item, double item, stamina].
function stateOf(G) {
  return {
    seed: G.seed, style: G.style, turn: G.turn, turns: G.turns, team: G.team, active: G.active, wind: G.wind, phase: G.phase,
    endsAt: G.endsAt, double: G.double, winner: G.winner, specials: G.specials, turnMs: G.level.turnMs,
    heroes: [...G.heroes.values()].map((H) => [H.id, H.team, Math.round(H.x), H.y, Math.max(0, H.hp), H.alive ? 1 : 0, H.face, H.angle,
      Math.floor(H.special), H.items.heal, H.items.double, Math.round(H.stamina), H.lastPower]),
  };
}

module.exports = { createArty, addHero, removeHero, startTurn, walk, aim, useItem, fire, verdict, finish, stateOf, aliveIn };
