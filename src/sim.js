// sim.js — pure game logic (no DOM). Source of truth: data/source/satisfactory_data.json
export const TILE = 32;
export const WORLD_W = 240;
export const WORLD_H = 160;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ponytail: coal/fuel/biomass generator, container, HUB stats are wiki values not present
// in the source JSON; biomass burner + plant deposits are the power bootstrap.
const EXTRA_DEFS = {
  'storage-container': { name: 'Storage Container', type: 'store', storeKind: 'item', cap: 2400, size: 2 },
  'fluid-buffer': { name: 'Fluid Buffer', type: 'store', storeKind: 'fluid', cap: 2400, size: 2 },
  'coal-generator': { name: 'Coal Generator', type: 'generator', powerOut: 75, burn: { coal: 15, water: 45 }, size: 3 },
  'fuel-generator': { name: 'Fuel Generator', type: 'generator', powerOut: 250, burn: { fuel: 20 }, size: 3 },
  // ponytail: wiki stats (satisfactory.fandom.com) — burner 30 MW; fuel MJ: leaves 15,
  // wood 100, mycelia 20, biomass 180, solid biofuel 450. Plant emission rates invented
  // for idle pacing.
  'biomass-burner': { name: 'Biomass Burner', type: 'generator', powerOut: 30, size: 2,
    fuels: { leaves: 15, wood: 100, mycelia: 20, biomass: 180, 'solid-biofuel': 450 } },
  'the-hub': { name: 'The HUB', type: 'hub', powerOut: 0, size: 4 },
  'deposit': { name: 'Deposit', type: 'deposit', size: 2 },
  splitter: { name: 'Splitter', type: 'logistic', lkind: 'item', nIn: 1, nOut: 3, size: 1 },
  merger: { name: 'Merger', type: 'logistic', lkind: 'item', nIn: 3, nOut: 1, size: 1 },
  'pipe-splitter': { name: 'Pipe Splitter', type: 'logistic', lkind: 'fluid', nIn: 1, nOut: 3, size: 1 },
  'pipe-merger': { name: 'Pipe Merger', type: 'logistic', lkind: 'fluid', nIn: 3, nOut: 1, size: 1 },
};
// Buildings whose data lists power:0 but which do draw variable power in-game.
const DRAW_OVERRIDE = { accelerator: 500, converter: 250, 'quantum-encoder': 1000 };

// ponytail: hand-rolled milestone ladder shaped after the wiki's early tiers; costs are
// idle-scaled guesses, tune freely. Item keys are validated against the JSON at load.
export const START_UNLOCKED = ['miner-mk1', 'smelter', 'constructor', 'biomass-burner',
  'storage-container', 'splitter', 'merger', 'pipe-splitter', 'pipe-merger', 'the-hub'];
export const MILESTONES = [
  { name: 'Part Assembly', cost: { 'iron-plate': 100, 'iron-rod': 100 },
    rewards: { buildings: ['assembler'], beltMark: 1 } },
  { name: 'Screws & Wire', cost: { screw: 500, wire: 300, 'copper-ingot': 100 },
    rewards: { buildings: ['miner-mk2'] } },
  { name: 'Coal Power', cost: { 'reinforced-iron-plate': 50, rotor: 25, cable: 100 },
    rewards: { buildings: ['coal-generator', 'water-extractor', 'fluid-buffer'] } },
  { name: 'Basic Steel', cost: { concrete: 300, 'copper-sheet': 150 },
    rewards: { buildings: ['foundry'], beltMark: 2 } },
  { name: 'Oil Processing', cost: { 'steel-beam': 100, 'steel-pipe': 100 },
    rewards: { buildings: ['oil-pump', 'oil-refinery', 'fuel-generator', 'packager'], beltMark: 3, pipeMark: 1 } },
  { name: 'Advanced Manufacturing', cost: { plastic: 200, rubber: 200, 'modular-frame': 25 },
    rewards: { buildings: ['manufacturer', 'miner-mk3'], beltMark: 4 } },
  { name: 'High Tech', cost: { computer: 50, 'smart-plating': 20 },
    rewards: { buildings: ['blender', 'nuclear-power-plant', 'accelerator', 'converter', 'quantum-encoder'], beltMark: 5 } },
];

export function validateMilestones(ctx) {
  for (const m of MILESTONES) {
    for (const res of Object.keys(m.cost)) if (!ctx.names[res]) throw new Error(`milestone ${m.name}: unknown item ${res}`);
    for (const b of m.rewards.buildings ?? []) if (!ctx.catalog[b]) throw new Error(`milestone ${m.name}: unknown building ${b}`);
  }
}

export function isUnlocked(state, key) {
  return !state.unlocked || state.unlocked.buildings.includes(key);
}

export function buildCtx(data) {
  const catalog = {};
  for (const m of data.miners) {
    catalog[m.key_name] = {
      key: m.key_name, name: m.name, type: 'miner',
      minerCat: m.category, rate: m.base_rate, draw: m.power, size: 2,
    };
  }
  for (const b of data.buildings) {
    catalog[b.key_name] = {
      key: b.key_name, name: b.name, type: 'machine', cat: b.category,
      draw: b.power || DRAW_OVERRIDE[b.key_name] || 0,
      powerOut: b.key_name === 'nuclear-power-plant' ? 2500 : 0,
      size: 3,
    };
  }
  for (const [key, def] of Object.entries(EXTRA_DEFS)) catalog[key] = { key, draw: 0, ...def };

  const recipesByCat = {};
  for (const r of data.recipes) (recipesByCat[r.category] ??= []).push(r);
  const recipeByKey = {};
  for (const r of data.recipes) recipeByKey[r.key_name] = r;

  const names = {};
  for (const it of [...data.items, ...data.fluids]) names[it.key_name] = it.name;

  const built = {
    catalog, recipesByCat, recipeByKey, names,
    fluids: new Set(data.fluids.map((f) => f.key_name)),
    resources: data.resources,
    belts: data.belts,
    pipes: data.pipes,
  };
  validateMilestones(built);
  return built;
}

export function kindOf(res, ctx) { return ctx.fluids.has(res) ? 'fluid' : 'item'; }

// ---------------------------------------------------------------- map / state

const PURITIES = [[0.5, 'impure'], [1, 'normal'], [2, 'pure']];
// hub always spawns at the map center; keep deposits from scattering onto its footprint
export const HUB_X = Math.floor(WORLD_W / 2) - 2;
export const HUB_Y = Math.floor(WORLD_H / 2) - 2;

export function genMap(seed, ctx) {
  const rng = mulberry32(seed);
  const deposits = [];
  const totalW = ctx.resources.filter((r) => r.category === 'mineral')
    .reduce((s, r) => s + r.weight, 0);
  const pickMineral = () => {
    let roll = rng() * totalW;
    for (const r of ctx.resources) {
      if (r.category !== 'mineral') continue;
      roll -= r.weight;
      if (roll <= 0) return r.key_name;
    }
    return 'iron-ore';
  };
  const free = (x, y) => (Math.abs(HUB_X - x) > 8 || Math.abs(HUB_Y - y) > 8) &&
    deposits.every((d) => Math.abs(d.x - x) > 12 || Math.abs(d.y - y) > 12);
  const scatter = (count, resFn, cat) => {
    for (let i = 0; i < count; i++) {
      for (let tries = 0; tries < 60; tries++) {
        const x = 2 + Math.floor(rng() * (WORLD_W - 6));
        const y = 2 + Math.floor(rng() * (WORLD_H - 6));
        if (!free(x, y)) continue;
        const p = rng();
        const [mult, purity] = p < 0.25 ? PURITIES[0] : p < 0.75 ? PURITIES[1] : PURITIES[2];
        deposits.push({ id: deposits.length, res: resFn(), cat, purity, mult, x, y, size: 2 });
        break;
      }
    }
  };
  scatter(28, pickMineral, 'mineral');
  scatter(5, () => 'crude-oil', 'oil');
  scatter(7, () => 'water', 'water');
  scatter(8, () => 'leaves', 'plant');
  return deposits;
}

export function addDeposit(state, res, cat, purity, mult, x, y) {
  const node = { id: state.nextId++, key: 'deposit', x, y, res, cat, purity, mult,
    fixed: true, buf: {}, status: '' };
  state.nodes.push(node);
  return node;
}

export function newGame(seed, ctx) {
  const state = { seed, time: 0, nextId: 1, nodes: [], wires: [], shipped: {},
    beltMark: 0, pipeMark: 0, msProgress: {},
    unlocked: { milestone: 0, buildings: [...START_UNLOCKED] } };
  for (const d of genMap(seed, ctx)) addDeposit(state, d.res, d.cat, d.purity, d.mult, d.x, d.y);
  const hub = addNode(state, 'the-hub', HUB_X, HUB_Y, ctx);
  hub.fixed = true;
  return state;
}

// ---------------------------------------------------------------------- ports

export function portsOf(node, ctx) {
  const def = ctx.catalog[node.key];
  const ports = [];
  const inP = (id, kind, res, i) => ports.push({ id, dir: 'in', kind, res, side: 'W', idx: i });
  const outP = (id, kind, res, i) => ports.push({ id, dir: 'out', kind, res, side: 'E', idx: i });
  if (def.type === 'miner') {
    inP('res0', 'resource', null, 0);
    outP('out0', def.minerCat === 'mineral' ? 'item' : 'fluid', node.depositRes ?? null, 0);
  } else if (def.type === 'deposit') {
    if (node.cat === 'plant') { outP('out0', 'item', null, 0); }
    else {
      const n = node.cat === 'water' ? { 0.5: 2, 1: 3, 2: 4 }[node.mult] : 1;
      for (let i = 0; i < n; i++) outP('out' + i, 'resource', node.res, i);
    }
  } else if (def.type === 'machine' && node.recipe) {
    const r = ctx.recipeByKey[node.recipe];
    r.ingredients.forEach(([res], i) => inP('in' + i, kindOf(res, ctx), res, i));
    r.products.forEach(([res], i) => outP('out' + i, kindOf(res, ctx), res, i));
  } else if (def.type === 'store') {
    inP('in0', def.storeKind, null, 0);
    outP('out0', def.storeKind, null, 0);
  } else if (def.type === 'generator') {
    if (def.burn) Object.keys(def.burn).forEach((res, i) => inP('in' + i, kindOf(res, ctx), res, i));
    else ports.push({ id: 'in0', dir: 'in', kind: 'item', res: null, side: 'W', idx: 0,
                      accepts: Object.keys(def.fuels) });
  } else if (def.type === 'hub') {
    inP('in0', 'item', null, 0);
    inP('in1', 'fluid', null, 1);
  } else if (def.type === 'logistic') {
    for (let i = 0; i < def.nIn; i++) inP('in' + i, def.lkind, null, i);
    for (let i = 0; i < def.nOut; i++) outP('out' + i, def.lkind, null, i);
  }
  if (def.draw > 0) ports.push({ id: 'pin', dir: 'in', kind: 'power', res: null, side: 'N', idx: 0 });
  if (def.powerOut > 0) ports.push({ id: 'pout', dir: 'out', kind: 'power', res: null, side: 'N', idx: 1 });
  return ports;
}

export function getPort(node, portId, ctx) {
  return portsOf(node, ctx).find((p) => p.id === portId);
}

export function canConnect(aNode, aPort, bNode, bPort, state, ctx) {
  if (aNode.id === bNode.id) return false;
  const pa = getPort(aNode, aPort, ctx);
  const pb = getPort(bNode, bPort, ctx);
  if (!pa || !pb || pa.kind !== pb.kind) return false;
  if (pa.kind === 'power') { /* power wires are undirected */ } else {
    if (pa.dir === pb.dir) return false;
    const [src, dst] = pa.dir === 'out' ? [pa, pb] : [pb, pa];
    if (src.res && dst.res && src.res !== dst.res) return false;
  }
  {
    const [sp, dp] = pa.dir === 'out' ? [pa, pb] : [pb, pa];
    if (dp.accepts && sp.res && !dp.accepts.includes(sp.res)) return false;
  }
  if (pa.kind === 'resource') {
    const [srcN, srcP, dstN, dstP] = pa.dir === 'out' ? [aNode, aPort, bNode, bPort] : [bNode, bPort, aNode, aPort];
    const dstDef = ctx.catalog[dstN.key];
    if (ctx.catalog[srcN.key].type !== 'deposit' || dstDef.type !== 'miner') return false;
    if (dstDef.minerCat !== srcN.cat) return false;
    if (state.wires.some((w) => w.kind === 'resource' &&
        ((w.a.n === srcN.id && w.a.p === srcP) || (w.b.n === dstN.id)))) return false; // port used / miner taken
  }
  return !state.wires.some((w) =>
    (w.a.n === aNode.id && w.a.p === aPort && w.b.n === bNode.id && w.b.p === bPort) ||
    (w.a.n === bNode.id && w.a.p === bPort && w.b.n === aNode.id && w.b.p === aPort));
}

export function addWire(state, aNode, aPort, bNode, bPort, ctx) {
  if (!canConnect(aNode, aPort, bNode, bPort, state, ctx)) return null;
  const pa = getPort(aNode, aPort, ctx);
  // normalize so a = source for item/fluid wires
  let a = { n: aNode.id, p: aPort }, b = { n: bNode.id, p: bPort };
  if (pa.kind !== 'power' && pa.dir === 'in') [a, b] = [b, a];
  const wire = { id: state.nextId++, a, b, kind: pa.kind, flow: 0, style: 'noodle', pts: [] };
  if (wire.kind === 'item') wire.mark = state.beltMark ?? 0;
  if (wire.kind === 'fluid') wire.mark = state.pipeMark ?? 0;
  state.wires.push(wire);
  if (wire.kind === 'resource') {
    const src = state.nodes.find((n) => n.id === wire.a.n);
    const dst = state.nodes.find((n) => n.id === wire.b.n);
    dst.depositRes = src.res; dst.depositMult = src.mult;
  }
  return wire;
}

export function removeWire(state, id) {
  const w = state.wires.find((q) => q.id === id);
  if (!w) return;
  if (w.kind === 'resource') {
    const dst = state.nodes.find((n) => n.id === w.b.n);
    if (dst) { dst.depositRes = null; dst.depositMult = null; }
  }
  state.wires = state.wires.filter((q) => q.id !== id);
}

// ------------------------------------------------------------------ placement

export function nodeRect(node, ctx) {
  const s = ctx.catalog[node.key].size;
  return { x: node.x, y: node.y, w: s, h: s };
}
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// Returns {ok, snap?, reason?}
export function canPlace(state, key, x, y, ctx) {
  if (!isUnlocked(state, key)) return { ok: false, reason: 'locked — complete milestones' };
  const def = ctx.catalog[key];
  if (x < 0 || y < 0 || x + def.size > WORLD_W || y + def.size > WORLD_H) return { ok: false, reason: 'out of bounds' };
  const rect = { x, y, w: def.size, h: def.size };
  if (state.nodes.some((n) => overlaps(rect, nodeRect(n, ctx)))) return { ok: false, reason: 'blocked' };
  return { ok: true, snap: { x, y } };
}

export function addNode(state, key, x, y, ctx) {
  const chk = canPlace(state, key, x, y, ctx);
  if (!chk.ok) return null;
  const node = {
    id: state.nextId++, key, x: chk.snap.x, y: chk.snap.y,
    buf: {}, recipe: null, progress: 0, status: 'idle',
  };
  state.nodes.push(node);
  return node;
}

export function removeNode(state, id) {
  if (state.nodes.find((n) => n.id === id)?.fixed) return;
  const wireIds = state.wires.filter((w) => w.a.n === id || w.b.n === id).map((w) => w.id);
  for (const wid of wireIds) removeWire(state, wid);
  state.nodes = state.nodes.filter((n) => n.id !== id);
}

export function setRecipe(state, node, recipeKey, ctx) {
  node.recipe = recipeKey;
  node.progress = 0;
  node.buf = {};
  // drop wires whose port no longer exists or no longer matches
  state.wires = state.wires.filter((w) => {
    for (const end of [w.a, w.b]) {
      if (end.n !== node.id) continue;
      const other = state.nodes.find((n) => n.id === (end === w.a ? w.b : w.a).n);
      const otherEnd = end === w.a ? w.b : w.a;
      if (!getPort(node, end.p, ctx)) return false;
      if (!canConnectExisting(node, end.p, other, otherEnd.p, ctx)) return false;
    }
    return true;
  });
}
function canConnectExisting(aNode, aPort, bNode, bPort, ctx) {
  const pa = getPort(aNode, aPort, ctx), pb = getPort(bNode, bPort, ctx);
  if (!pa || !pb || pa.kind !== pb.kind) return false;
  if (pa.kind !== 'power' && pa.res && pb.res && pa.res !== pb.res) return false;
  if (pa.accepts && pb.res && !pa.accepts.includes(pb.res)) return false;
  if (pb.accepts && pa.res && !pb.accepts.includes(pa.res)) return false;
  return true;
}

// ----------------------------------------------------------------------- tick

const BUF_CAP = 100; // per-resource cap for miner/machine/generator buffers

function bufTotal(buf) { return Object.values(buf).reduce((s, v) => s + v, 0); }

function powerNetworks(state, ctx) {
  const parent = {};
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const n of state.nodes) parent[n.id] = n.id;
  for (const w of state.wires) if (w.kind === 'power') parent[find(w.a.n)] = find(w.b.n);
  const nets = {};
  for (const n of state.nodes) {
    const def = ctx.catalog[n.key];
    if (!(def.draw > 0 || def.powerOut > 0)) continue;
    const root = find(n.id);
    const net = (nets[root] ??= { supply: 0, demand: 0 });
    if (def.draw > 0) net.demand += def.draw;
    if (def.powerOut > 0 && supplying(n, def)) net.supply += def.powerOut;
    n._net = root;
  }
  return nets;
}
function supplying(node, def) {
  if (def.type === 'generator') {
    return def.burn
      ? Object.keys(def.burn).every((res) => (node.buf[res] ?? 0) > 0)
      : Object.keys(def.fuels).some((res) => (node.buf[res] ?? 0) > 0);
  }
  if (def.powerOut > 0) return node.progress > 0; // nuclear plant supplies while reacting
  return false;
}

export function tick(state, dt, ctx) {
  const nets = powerNetworks(state, ctx);
  const ratioOf = (node) => {
    const def = ctx.catalog[node.key];
    if (!(def.draw > 0)) return 1;
    const net = nets[node._net];
    if (!net || net.supply <= 0) return 0;
    return Math.min(1, net.supply / net.demand);
  };
  state.power = Object.values(nets).reduce(
    (acc, n) => ({ supply: acc.supply + n.supply, demand: acc.demand + n.demand }),
    { supply: 0, demand: 0 });

  for (const node of state.nodes) {
    const def = ctx.catalog[node.key];
    const r = ratioOf(node);
    if (def.type === 'miner') {
      if (!node.depositRes) { node.status = 'no deposit'; continue; }
      if (r <= 0) { node.status = 'no power'; continue; }
      const res = node.depositRes;
      const have = node.buf[res] ?? 0;
      if (have >= BUF_CAP) { node.status = 'output full'; continue; }
      node.buf[res] = Math.min(BUF_CAP, have + (def.rate * node.depositMult / 60) * dt * r);
      node.status = 'mining';
    } else if (def.type === 'machine') {
      if (!node.recipe) { node.status = 'no recipe'; continue; }
      if (r <= 0) { node.status = 'no power'; continue; }
      const recipe = ctx.recipeByKey[node.recipe];
      if (node.progress <= 0) {
        if (recipe.ingredients.every(([res, amt]) => (node.buf[res] ?? 0) >= amt)) {
          for (const [res, amt] of recipe.ingredients) node.buf[res] -= amt;
          node.progress = 1e-9;
        } else { node.status = 'waiting for input'; continue; }
      }
      node.progress += (dt * r) / recipe.time;
      node.status = 'crafting';
      if (node.progress >= 1) {
        if (recipe.products.every(([res]) => (node.buf[res] ?? 0) < BUF_CAP)) {
          for (const [res, amt] of recipe.products) node.buf[res] = (node.buf[res] ?? 0) + amt;
          node.progress = 0;
        } else { node.progress = 1; node.status = 'output full'; }
      }
    } else if (def.type === 'generator') {
      if (supplying(node, def)) {
        if (def.burn) {
          for (const [res, perMin] of Object.entries(def.burn)) {
            node.buf[res] = Math.max(0, (node.buf[res] ?? 0) - (perMin / 60) * dt);
          }
        } else {
          const fuel = Object.keys(def.fuels).find((res) => (node.buf[res] ?? 0) > 0);
          if (fuel) node.buf[fuel] = Math.max(0, node.buf[fuel] - (def.powerOut / def.fuels[fuel]) * dt);
        }
        node.status = 'generating';
      } else node.status = 'no fuel';
    } else if (def.type === 'store') {
      node.status = bufTotal(node.buf) >= def.cap ? 'full' : 'storing';
    } else if (def.type === 'hub') {
      const ms = MILESTONES[state.unlocked?.milestone];
      node.status = ms ? `milestone: ${ms.name}` : 'all milestones complete';
      if (ms && Object.entries(ms.cost).every(([res, amt]) => (state.msProgress[res] ?? 0) >= amt)) {
        for (const b of ms.rewards.buildings ?? []) if (!state.unlocked.buildings.includes(b)) state.unlocked.buildings.push(b);
        if (ms.rewards.beltMark != null) state.beltMark = ms.rewards.beltMark;
        if (ms.rewards.pipeMark != null) state.pipeMark = ms.rewards.pipeMark;
        state.msProgress = {};
        state.unlocked.milestone++;
      }
    } else if (def.type === 'deposit') {
      if (node.cat === 'plant') {
        node.buf.leaves = Math.min(50, (node.buf.leaves ?? 0) + (20 * node.mult / 60) * dt);
        node.buf.wood = Math.min(50, (node.buf.wood ?? 0) + (5 * node.mult / 60) * dt);
        node.status = 'growing';
      } else node.status = '';
    } else if (def.type === 'logistic') {
      node.status = 'ok';
    }
  }

  const byId = Object.fromEntries(state.nodes.map((n) => [n.id, n]));
  const outWires = {};
  for (const w of state.wires) if (w.kind === 'item' || w.kind === 'fluid') (outWires[w.a.n] ??= []).push(w);
  // snapshot logistic-node buffers so fair-share is computed against the pre-tick total,
  // not a live buffer that shrinks as earlier sibling wires in this same tick drain it
  const logisticBuf = {};
  for (const n of state.nodes) if (ctx.catalog[n.key].type === 'logistic') logisticBuf[n.id] = { ...n.buf };
  for (const wire of state.wires) {
    wire.flow = 0;
    if (wire.kind === 'power') continue;
    const src = byId[wire.a.n], dst = byId[wire.b.n];
    if (!src || !dst) continue;
    const srcPort = getPort(src, wire.a.p, ctx);
    const dstPort = getPort(dst, wire.b.p, ctx);
    if (!srcPort || !dstPort) continue;
    const res = srcPort.res ?? dstPort.res ??
      Object.keys(src.buf)
        .filter((k) => src.buf[k] > 1e-9 && kindOf(k, ctx) === wire.kind &&
          (!dstPort.accepts || dstPort.accepts.includes(k)))
        .reduce((best, k) => (best == null || src.buf[k] > src.buf[best] ? k : best), null);
    if (!res || (dstPort.res && dstPort.res !== res)) continue;
    if (dstPort.accepts && !dstPort.accepts.includes(res)) continue;
    const rate = (wire.kind === 'fluid' ? ctx.pipes[wire.mark ?? 0].rate : ctx.belts[wire.mark ?? 0].rate) / 60;
    const dstDef = ctx.catalog[dst.key];
    const space = dstDef.type === 'hub' ? Infinity
      : dstDef.type === 'store' ? dstDef.cap - bufTotal(dst.buf)
      : BUF_CAP - (dst.buf[res] ?? 0);
    // ponytail: proportional split each tick, not whole-unit round-robin — same steady-state rates
    const share = ctx.catalog[src.key].type === 'logistic'
      ? (logisticBuf[src.id]?.[res] ?? 0) / (outWires[src.id]?.length ?? 1) : (src.buf[res] ?? 0);
    const amt = Math.min(rate * dt, share, Math.max(0, space));
    if (amt <= 1e-9) continue;
    src.buf[res] -= amt;
    if (dstDef.type === 'hub') {
      state.shipped[res] = (state.shipped[res] ?? 0) + amt;
      state.msProgress[res] = (state.msProgress[res] ?? 0) + amt;
    } else dst.buf[res] = (dst.buf[res] ?? 0) + amt;
    wire.flow = amt / dt;
  }
  state.time += dt;
}
