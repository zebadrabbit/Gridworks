// node test_sim.mjs — smallest checks that fail if the sim logic breaks
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { buildCtx, newGame, addNode, addWire, removeWire, addDeposit, setRecipe, tick, canConnect, portsOf, MILESTONES, isUnlocked, normalizeSave, START_UNLOCKED, simulateOffline, OFFLINE_CAP, ELEVATOR_PHASES, ELEVATOR_ITEMS, lightOf, THROTTLE_LIGHT, genMap, distT, tierOf, tierFactor, HUB_X, HUB_Y, START_RADIUS, MAX_DIST, START_BUNDLE, CHUNK, CHUNK_W, CHUNK_H, chunkIndex, removeNode, revealAll } from '../src/sim.js';

const data = JSON.parse(readFileSync(new URL('../data/source/satisfactory_data.json', import.meta.url)));
const ctx = buildCtx(data);

const state = newGame(42, ctx);
state.unlocked.buildings = Object.keys(ctx.catalog); state.beltMark = ctx.belts.length - 1; state.pipeMark = ctx.pipes.length - 1;
const hub = state.nodes.find((n) => n.key === 'the-hub');
assert.equal(hub.key, 'the-hub');
assert.ok(state.nodes.filter((n) => n.key === 'deposit').length >= 30, 'map has deposit nodes');
assert.ok(state.nodes.some((n) => n.cat === 'water'), 'water deposits exist');

// deposits are fixed nodes with resource out ports; miners wire to them
state.nodes = state.nodes.filter((n) => n.key === 'the-hub'); // keep hub only
state.wires = [];
const dep = addDeposit(state, 'iron-ore', 'mineral', 'pure', 2, 5, 5);
const wdep = addDeposit(state, 'water', 'water', 'normal', 1, 40, 40);
assert.ok(dep.fixed, 'deposit is fixed');
assert.equal(portsOf(dep, ctx)[0].kind, 'resource');
assert.equal(portsOf(wdep, ctx).length, 3, 'normal water deposit has 3 out ports');

const miner = addNode(state, 'miner-mk1', 10, 5, ctx);
assert.ok(miner, 'miner placed on empty ground');
assert.ok(addWire(state, dep, 'out0', miner, 'res0', ctx), 'deposit wired to miner');
assert.equal(miner.depositRes, 'iron-ore');
assert.equal(miner.depositMult, 2);
const miner2 = addNode(state, 'miner-mk1', 10, 10, ctx);
assert.equal(addWire(state, dep, 'out0', miner2, 'res0', ctx), null, 'deposit port already used');
const pump = addNode(state, 'water-extractor', 44, 40, ctx);
assert.equal(addWire(state, dep, 'out0', pump, 'res0', ctx), null, 'category mismatch rejected');
assert.equal(portsOf(pump, ctx).find((p) => p.id === 'out0').kind, 'fluid');
assert.ok(addWire(state, wdep, 'out0', pump, 'res0', ctx), 'water wired to extractor');

const smelter = addNode(state, 'smelter', 12, 5, ctx);
setRecipe(state, smelter, 'iron-ingot', ctx);
const box = addNode(state, 'storage-container', 20, 5, ctx);

// bootstrap: plant -> biomass burner -> powers miner
const plant = addDeposit(state, 'leaves', 'plant', 'normal', 1, 50, 20);
const burner = addNode(state, 'biomass-burner', 55, 20, ctx);
assert.ok(addWire(state, plant, 'out0', burner, 'in0', ctx), 'plant belts into burner');
assert.equal(addWire(state, dep, 'out0', burner, 'in0', ctx), null, 'resource port cannot feed burner');
assert.ok(addWire(state, burner, 'pout', miner, 'pin', ctx), 'burner powers miner');
assert.ok(addWire(state, burner, 'pout', smelter, 'pin', ctx), 'power to smelter');
burner.buf.wood = 50; // pre-stock so power flows immediately; leaves grow slowly
assert.ok(addWire(state, miner, 'out0', smelter, 'in0', ctx), 'belt miner->smelter');
assert.ok(addWire(state, smelter, 'out0', box, 'in0', ctx), 'belt smelter->container');
assert.ok(!canConnect(miner, 'out0', smelter, 'pin', state, ctx), 'kind mismatch rejected');
assert.ok(!canConnect(miner, 'out0', miner, 'out0', state, ctx), 'self wire rejected');

const burner2 = addNode(state, 'biomass-burner', 60, 25, ctx);
assert.equal(addWire(state, smelter, 'out0', burner2, 'in0', ctx), null, 'wrong item rejected by accepts');

for (let i = 0; i < 600; i++) tick(state, 0.1, ctx); // 60s
assert.ok((box.buf['iron-ingot'] ?? 0) > 5, `container has ingots, got ${box.buf['iron-ingot']}`);
assert.ok(state.power.supply >= 30 && state.power.demand > 0, 'power accounting');
assert.ok((state.nodes.find((n) => n.id === plant.id).buf.leaves ?? 0) >= 0, 'plant grows');
assert.equal(ctx.catalog['the-hub'].powerOut, 0, 'hub gives no free power');
assert.ok(state.power.supply >= 30, 'burner supplies');

// unpowered miner produces nothing
const dep2 = addDeposit(state, 'copper-ore', 'mineral', 'normal', 1, 30, 30);
const dark = addNode(state, 'miner-mk1', 35, 30, ctx);
assert.ok(addWire(state, dep2, 'out0', dark, 'res0', ctx), 'deposit wired to dark miner');
tick(state, 0.1, ctx);
assert.equal(dark.status, 'no power');
assert.equal(dark.buf['copper-ore'] ?? 0, 0);

// unwired miner has no deposit
const lonely = addNode(state, 'miner-mk1', 60, 60, ctx);
assert.ok(addWire(state, burner, 'pout', lonely, 'pin', ctx));
tick(state, 0.1, ctx);
assert.equal(lonely.status, 'no deposit');
// removing the resource wire clears the stamp
const rw = state.wires.find((w) => w.kind === 'resource' && w.b.n === miner.id);
removeWire(state, rw.id);
assert.equal(miner.depositRes, null);

// splitter: 60/min in -> 3 x 20/min out
{
  const s2 = newGame(7, ctx);
  s2.unlocked.buildings = Object.keys(ctx.catalog); s2.beltMark = ctx.belts.length - 1; s2.pipeMark = ctx.pipes.length - 1;
  s2.nodes = s2.nodes.filter((n) => n.key === 'the-hub'); s2.wires = [];
  const d = addDeposit(s2, 'iron-ore', 'mineral', 'normal', 1, 5, 5);
  const m = addNode(s2, 'miner-mk1', 10, 5, ctx);   // 60/min
  const sp = addNode(s2, 'splitter', 16, 5, ctx);
  const boxes = [0, 1, 2].map((i) => addNode(s2, 'storage-container', 20, 3 + i * 3, ctx));
  const plant2 = addDeposit(s2, 'leaves', 'plant', 'normal', 1, 50, 20);
  const burner3 = addNode(s2, 'biomass-burner', 55, 20, ctx);
  addWire(s2, plant2, 'out0', burner3, 'in0', ctx);
  burner3.buf.wood = 50; // pre-stock so power flows immediately
  addWire(s2, d, 'out0', m, 'res0', ctx);
  addWire(s2, burner3, 'pout', m, 'pin', ctx);
  addWire(s2, m, 'out0', sp, 'in0', ctx);
  boxes.forEach((b, i) => assert.ok(addWire(s2, sp, 'out' + i, b, 'in0', ctx)));
  for (let i = 0; i < 1200; i++) tick(s2, 0.1, ctx); // 120s
  const got = boxes.map((b) => b.buf['iron-ore'] ?? 0);
  const total = got.reduce((a, v) => a + v, 0);
  assert.ok(total > 100, `throughput ${total}`);
  for (const g of got) assert.ok(Math.abs(g - total / 3) < total * 0.1, `even split ${got}`);
}

// belt marks: default = highest unlocked, throughput follows ctx.belts[mark].rate
{
  const s3 = newGame(9, ctx);
  s3.nodes = s3.nodes.filter((n) => n.key === 'the-hub'); s3.wires = [];
  assert.equal(s3.beltMark, 0, 'fresh game starts at belt mk1');
  s3.unlocked.buildings = Object.keys(ctx.catalog); s3.beltMark = ctx.belts.length - 1; s3.pipeMark = ctx.pipes.length - 1;
  const d = addDeposit(s3, 'iron-ore', 'mineral', 'pure', 2, 5, 5);
  const m = addNode(s3, 'miner-mk2', 10, 5, ctx); // 120/min base * 2 = 240
  const box = addNode(s3, 'storage-container', 16, 5, ctx);
  const plant = addDeposit(s3, 'leaves', 'plant', 'pure', 2, 5, 20);
  const b = addNode(s3, 'biomass-burner', 10, 20, ctx);
  addWire(s3, plant, 'out0', b, 'in0', ctx);
  addWire(s3, b, 'pout', m, 'pin', ctx);
  addWire(s3, d, 'out0', m, 'res0', ctx);
  const w = addWire(s3, m, 'out0', box, 'in0', ctx);
  assert.equal(w.mark, ctx.belts.length - 1);
  w.mark = 1; // belt2 = 120/min
  b.buf.wood = 50;
  for (let i = 0; i < 600; i++) tick(s3, 0.1, ctx);
  const got = box.buf['iron-ore'] ?? 0;
  assert.ok(got > 100 && got < 130, `mk2 belt caps at ~120/min, got ${got}`);
}

// milestones: fresh game locks most buildings, shipping completes the active milestone
{
  const s4 = newGame(11, ctx);
  assert.equal(s4.beltMark, 0, 'fresh game starts at belt mk1');
  assert.ok(isUnlocked(s4, 'smelter'));
  assert.ok(!isUnlocked(s4, 'assembler'));
  assert.equal(addNode(s4, 'assembler', 2, 2, ctx), null, 'locked building rejected');
  const hub4 = s4.nodes.find((n) => n.key === 'the-hub');
  // ship milestone 1's cost straight into the hub via a stocked container
  const box = addNode(s4, 'storage-container', 2, 10, ctx);
  const need = MILESTONES[0].cost;
  for (const [res, amt] of Object.entries(need)) box.buf[res] = amt + 10;
  addWire(s4, box, 'out0', hub4, 'in0', ctx);
  for (let i = 0; i < 6000 && s4.unlocked.milestone === 0; i++) tick(s4, 0.1, ctx);
  assert.equal(s4.unlocked.milestone, 1, 'milestone 1 complete');
  for (const b of MILESTONES[0].rewards.buildings ?? []) assert.ok(isUnlocked(s4, b), b + ' unlocked');
  if (MILESTONES[0].rewards.beltMark != null) assert.equal(s4.beltMark, MILESTONES[0].rewards.beltMark);
}

// plant deposit -> storage container: wood should not be starved by regenerating leaves
{
  const s5 = newGame(13, ctx);
  s5.nodes = s5.nodes.filter((n) => n.key === 'the-hub'); s5.wires = [];
  const plant5 = addDeposit(s5, 'leaves', 'plant', 'normal', 1, 50, 20);
  const box5 = addNode(s5, 'storage-container', 20, 5, ctx);
  addWire(s5, plant5, 'out0', box5, 'in0', ctx);
  for (let i = 0; i < 3000; i++) tick(s5, 0.1, ctx); // 5 minutes
  const leaves = box5.buf.leaves ?? 0;
  const wood = box5.buf.wood ?? 0;
  assert.ok(leaves > 1, `container got leaves, got ${leaves}`);
  assert.ok(wood > 1, `container got wood, got ${wood}`);
}

// save/load roundtrip
const restored = JSON.parse(JSON.stringify(state));
tick(restored, 0.1, ctx);
assert.ok(restored.time > state.time, 'restored state ticks');

// wires carry render style + waypoints (persisted, sim-inert)
const anyWire = state.wires[0];
assert.equal(anyWire.style, 'noodle', 'new wires default to noodle style');
assert.deepEqual(anyWire.pts, [], 'new wires start with no waypoints');
anyWire.style = 'straight'; anyWire.pts = [{ x: 100, y: 200 }];
const rt = JSON.parse(JSON.stringify(state));
assert.equal(rt.wires[0].style, 'straight', 'style survives save round-trip');
assert.deepEqual(rt.wires[0].pts, [{ x: 100, y: 200 }], 'pts survive save round-trip');

// merger: stocked containers feed one belt out at belt rate, items conserved
{
  const s6 = newGame(17, ctx);
  s6.unlocked.buildings = Object.keys(ctx.catalog); s6.beltMark = 0;
  s6.nodes = s6.nodes.filter((n) => n.key === 'the-hub'); s6.wires = [];
  const sources = [0, 1, 2].map((i) => addNode(s6, 'storage-container', 5, 3 + i * 3, ctx));
  for (const src of sources) src.buf['iron-ore'] = 200;
  const mg = addNode(s6, 'merger', 10, 6, ctx);
  const sink = addNode(s6, 'storage-container', 14, 6, ctx);
  sources.forEach((src, i) => assert.ok(addWire(s6, src, 'out0', mg, 'in' + i, ctx), 'source into merger'));
  assert.ok(addWire(s6, mg, 'out0', sink, 'in0', ctx), 'merger into sink');
  for (let i = 0; i < 1200; i++) tick(s6, 0.1, ctx); // 120s @ belt1 60/min
  const got = sink.buf['iron-ore'] ?? 0;
  assert.ok(got > 100 && got <= 121, `merger passes ~60/min, got ${got}`);
  const remaining = sources.reduce((a, s) => a + (s.buf['iron-ore'] ?? 0), 0) + (mg.buf['iron-ore'] ?? 0) + got;
  assert.ok(Math.abs(remaining - 600) < 1, `items conserved through merger, got ${remaining}`);
}

// pipe splitter: extractor fluid fans out evenly across three buffers
{
  const s7 = newGame(19, ctx);
  s7.unlocked.buildings = Object.keys(ctx.catalog); s7.pipeMark = 0;
  s7.nodes = s7.nodes.filter((n) => n.key === 'the-hub'); s7.wires = [];
  const wdep = addDeposit(s7, 'water', 'water', 'normal', 1, 5, 5);
  const pump = addNode(s7, 'water-extractor', 10, 5, ctx);
  const sp = addNode(s7, 'pipe-splitter', 14, 5, ctx);
  const tanks = [0, 1, 2].map((i) => addNode(s7, 'fluid-buffer', 18, 3 + i * 3, ctx));
  const burner = addNode(s7, 'biomass-burner', 10, 12, ctx);
  burner.buf.wood = 50;
  assert.ok(addWire(s7, wdep, 'out0', pump, 'res0', ctx));
  assert.ok(addWire(s7, burner, 'pout', pump, 'pin', ctx));
  assert.ok(addWire(s7, pump, 'out0', sp, 'in0', ctx), 'pump into pipe splitter');
  tanks.forEach((t, i) => assert.ok(addWire(s7, sp, 'out' + i, t, 'in0', ctx)));
  for (let i = 0; i < 1200; i++) tick(s7, 0.1, ctx); // 120s @ 120/min extraction
  const got = tanks.map((t) => t.buf.water ?? 0);
  const total = got.reduce((a, v) => a + v, 0);
  assert.ok(total > 100, `pipe splitter throughput ${total}`);
  for (const g of got) assert.ok(Math.abs(g - total / 3) < total * 0.1, `even fluid split ${got}`);
}

// coal generator: burns coal + water together, stops when either runs out
{
  const s8 = newGame(23, ctx);
  s8.unlocked.buildings = Object.keys(ctx.catalog);
  s8.nodes = s8.nodes.filter((n) => n.key === 'the-hub'); s8.wires = [];
  const dep = addDeposit(s8, 'iron-ore', 'mineral', 'normal', 1, 5, 5);
  const m = addNode(s8, 'miner-mk1', 10, 5, ctx);
  const gen = addNode(s8, 'coal-generator', 10, 10, ctx);
  gen.buf.coal = 2; gen.buf.water = 200; // 15 coal/min -> exhausted after ~8s
  assert.ok(addWire(s8, dep, 'out0', m, 'res0', ctx));
  assert.ok(addWire(s8, gen, 'pout', m, 'pin', ctx));
  for (let i = 0; i < 50; i++) tick(s8, 0.1, ctx); // 5s: still burning
  assert.equal(gen.status, 'generating');
  assert.equal(m.status, 'mining');
  assert.ok(gen.buf.coal < 2 && gen.buf.water < 200, 'both burn resources deplete');
  for (let i = 0; i < 150; i++) tick(s8, 0.1, ctx); // 20s total: coal gone
  assert.equal(gen.status, 'no fuel');
  assert.equal(m.status, 'no power');
}

// power throttling: supply/demand ratio < 1 slows machines proportionally
{
  const s9 = newGame(27, ctx);
  s9.unlocked.buildings = Object.keys(ctx.catalog);
  s9.nodes = s9.nodes.filter((n) => n.key === 'the-hub'); s9.wires = [];
  const dep = addDeposit(s9, 'iron-ore', 'mineral', 'normal', 1, 5, 5);
  const m = addNode(s9, 'miner-mk1', 10, 5, ctx);
  const hog = addNode(s9, 'accelerator', 10, 10, ctx); // big idle draw drags the ratio down
  const burner = addNode(s9, 'biomass-burner', 16, 10, ctx);
  burner.buf.wood = 50;
  assert.ok(addWire(s9, dep, 'out0', m, 'res0', ctx));
  assert.ok(addWire(s9, burner, 'pout', m, 'pin', ctx));
  assert.ok(addWire(s9, burner, 'pout', hog, 'pin', ctx));
  for (let i = 0; i < 600; i++) tick(s9, 0.1, ctx); // 60s
  const ratio = 30 / (ctx.catalog['miner-mk1'].draw + ctx.catalog['accelerator'].draw);
  assert.ok(ratio < 1, 'network is actually oversubscribed');
  const expected = 60 * ratio; // 60/min miner for 60s, throttled
  const got = m.buf['iron-ore'] ?? 0;
  assert.ok(Math.abs(got - expected) < 0.5, `throttled mining ~${expected.toFixed(2)}, got ${got}`);
}

// setRecipe drops wires that no longer match, keeps ones that still do
{
  const s10 = newGame(29, ctx);
  s10.unlocked.buildings = Object.keys(ctx.catalog);
  s10.nodes = s10.nodes.filter((n) => n.key === 'the-hub'); s10.wires = [];
  const dep = addDeposit(s10, 'iron-ore', 'mineral', 'normal', 1, 5, 5);
  const m = addNode(s10, 'miner-mk1', 10, 5, ctx);
  const sm = addNode(s10, 'smelter', 14, 5, ctx);
  const box = addNode(s10, 'storage-container', 20, 5, ctx);
  setRecipe(s10, sm, 'iron-ingot', ctx);
  assert.ok(addWire(s10, dep, 'out0', m, 'res0', ctx));
  assert.ok(addWire(s10, m, 'out0', sm, 'in0', ctx), 'ore into smelter');
  assert.ok(addWire(s10, sm, 'out0', box, 'in0', ctx), 'ingots into container');
  setRecipe(s10, sm, 'copper-ingot', ctx);
  assert.ok(!s10.wires.some((w) => w.a.n === m.id && w.b.n === sm.id), 'mismatched input wire dropped');
  assert.ok(s10.wires.some((w) => w.a.n === sm.id && w.b.n === box.id), 'container output wire kept');
}

// nuclear plant parked at output-full must not supply power (no fuel is consumed there)
{
  const s11 = newGame(31, ctx);
  s11.unlocked.buildings = Object.keys(ctx.catalog);
  s11.nodes = s11.nodes.filter((n) => n.key === 'the-hub'); s11.wires = [];
  const dep = addDeposit(s11, 'iron-ore', 'mineral', 'normal', 1, 5, 5);
  const m = addNode(s11, 'miner-mk1', 10, 5, ctx);
  const npp = addNode(s11, 'nuclear-power-plant', 10, 10, ctx);
  assert.ok(addWire(s11, dep, 'out0', m, 'res0', ctx));
  assert.ok(addWire(s11, npp, 'pout', m, 'pin', ctx));
  npp.progress = 0.5; // mid-reaction: supplies
  tick(s11, 0.1, ctx);
  assert.equal(m.status, 'mining', 'reacting plant powers the miner');
  npp.progress = 1; // parked: waste output full, consuming nothing
  tick(s11, 0.1, ctx);
  assert.equal(m.status, 'no power', 'output-blocked plant supplies nothing');
}

// milestone ladder reachability: every cost item is producible with only the
// buildings unlocked before that milestone (raw resources via unlocked miner
// categories, leaves/wood via plant deposits, everything else via recipes)
{
  const producible = (item, cats, minerCats, visiting = new Set()) => {
    if (visiting.has(item)) return false;
    const res = ctx.resources.find((r) => r.key_name === item);
    if (res) return minerCats.has(res.category);
    if (item === 'leaves' || item === 'wood') return true;
    visiting.add(item);
    const ok = data.recipes.some((r) => cats.has(r.category) &&
      r.products.some(([p]) => p === item) &&
      r.ingredients.every(([i]) => producible(i, cats, minerCats, visiting)));
    visiting.delete(item);
    return ok;
  };
  const unlocked = [...START_UNLOCKED];
  for (const ms of MILESTONES) {
    const cats = new Set(unlocked.map((k) => ctx.catalog[k].cat).filter(Boolean));
    const minerCats = new Set(unlocked.filter((k) => ctx.catalog[k].type === 'miner')
      .map((k) => ctx.catalog[k].minerCat));
    for (const item of Object.keys(ms.cost)) {
      assert.ok(producible(item, cats, minerCats), `${ms.name}: ${item} is producible when the milestone is active`);
    }
    unlocked.push(...(ms.rewards.buildings ?? []));
  }
}

// normalizeSave: fills defaults, drops unknown keys and their wires, strips transients
{
  const s12 = newGame(33, ctx);
  const hub12 = s12.nodes.find((n) => n.key === 'the-hub');
  const raw = JSON.parse(JSON.stringify(s12));
  delete raw.msProgress; delete raw.unlocked; delete raw.beltMark; delete raw.pipeMark; delete raw.shipped;
  raw.nodes.push({ id: 9999, key: 'gone-building', x: 1, y: 1, buf: {} });
  raw.wires.push({ id: 10000, a: { n: 9999, p: 'out0' }, b: { n: hub12.id, p: 'in0' }, kind: 'item' });
  raw.wires.push({ id: 10001, a: { n: raw.nodes[0].id, p: 'out0' }, b: { n: hub12.id, p: 'in0' }, kind: 'item' });
  raw.nodes[0]._net = 123;
  const norm = normalizeSave(raw, ctx);
  assert.ok(norm, 'normalizeSave returns a usable state');
  assert.ok(!norm.nodes.some((n) => n.key === 'gone-building'), 'unknown-key node dropped');
  assert.ok(!norm.wires.some((w) => w.a.n === 9999 || w.b.n === 9999), 'wire to dropped node removed');
  assert.ok(norm.wires.some((w) => w.id === 10001), 'wire between surviving nodes kept');
  const kept = norm.wires.find((w) => w.id === 10001);
  assert.equal(kept.style, 'noodle', 'missing style normalized');
  assert.deepEqual(kept.pts, [], 'missing pts normalized');
  assert.ok(!('_net' in norm.nodes[0]), 'transient _net stripped');
  assert.equal(norm.beltMark, 0);
  assert.deepEqual(norm.msProgress, {});
  assert.ok(norm.unlocked.buildings.includes('miner-mk1'), 'default unlocks filled');
  assert.equal(normalizeSave(null, ctx), null, 'null save rejected');
  assert.equal(normalizeSave({}, ctx), null, 'shapeless save rejected');
  assert.equal(normalizeSave({ nodes: [], wires: [] }, ctx), null, 'hubless save rejected');
}

// offline progress: coarse offline sim matches fine online sim; away time is capped
{
  const build = (seed) => {
    const s = newGame(seed, ctx);
    s.unlocked.buildings = Object.keys(ctx.catalog);
    s.nodes = s.nodes.filter((n) => n.key === 'the-hub'); s.wires = [];
    const d = addDeposit(s, 'iron-ore', 'mineral', 'normal', 1, 5, 5);
    const m = addNode(s, 'miner-mk1', 10, 5, ctx);
    const box = addNode(s, 'storage-container', 16, 5, ctx);
    const b = addNode(s, 'biomass-burner', 10, 12, ctx);
    b.buf.wood = 200; // 0.3 wood/s -> lasts the whole run
    addWire(s, d, 'out0', m, 'res0', ctx);
    addWire(s, b, 'pout', m, 'pin', ctx);
    addWire(s, m, 'out0', box, 'in0', ctx);
    return { s, box };
  };
  const online = build(35);
  for (let i = 0; i < 6000; i++) tick(online.s, 0.1, ctx); // 600s live at 10 Hz
  const offline = build(35);
  assert.equal(simulateOffline(offline.s, 600, ctx), 600, 'full away time simulated');
  const a = online.box.buf['iron-ore'] ?? 0;
  const b = offline.box.buf['iron-ore'] ?? 0;
  assert.ok(a > 500, `online chain produced, got ${a}`);
  assert.ok(Math.abs(a - b) < a * 0.05, `offline matches online within 5% (${a} vs ${b})`);
  const capped = build(37);
  assert.equal(simulateOffline(capped.s, OFFLINE_CAP + 9999, ctx), OFFLINE_CAP, 'away time capped');
  // savedAt is metadata game.js writes; normalizeSave must pass it through
  const withStamp = build(39).s;
  withStamp.savedAt = 1234567890;
  const norm = normalizeSave(JSON.parse(JSON.stringify(withStamp)), ctx);
  assert.equal(norm.savedAt, 1234567890, 'savedAt survives normalizeSave');
}

// map seeds are deterministic and shareable
{
  const layout = (s) => s.nodes.map((n) => [n.key, n.x, n.y, n.res ?? '', n.purity ?? '']);
  assert.deepEqual(layout(newGame(4242, ctx)), layout(newGame(4242, ctx)), 'same seed, same map');
  assert.notDeepEqual(layout(newGame(4242, ctx)), layout(newGame(4243, ctx)), 'different seed, different map');
}

// space elevator: unlocked by the last milestone, ships phases, rejects non-parts
{
  const s = newGame(41, ctx);
  assert.ok(!isUnlocked(s, 'space-elevator'), 'elevator locked at start');
  assert.ok(MILESTONES[MILESTONES.length - 1].rewards.buildings.includes('space-elevator'),
    'final milestone unlocks the elevator');
  s.unlocked.buildings = Object.keys(ctx.catalog);
  s.unlocked.milestone = MILESTONES.length; // ladder finished
  s.nodes = s.nodes.filter((n) => n.key === 'the-hub'); s.wires = [];
  const elev = addNode(s, 'space-elevator', 10, 5, ctx);
  assert.ok(elev, 'elevator placeable when unlocked');
  const box = addNode(s, 'storage-container', 20, 5, ctx);
  const junk = addNode(s, 'storage-container', 20, 10, ctx);
  junk.buf['iron-plate'] = 500;
  assert.ok(addWire(s, box, 'out0', elev, 'in0', ctx), 'container feeds elevator');
  assert.ok(addWire(s, junk, 'out0', elev, 'in0', ctx), 'second belt allowed');
  // phase 1 needs smart-plating; junk iron plates must not move (accepts filter)
  box.buf['smart-plating'] = ELEVATOR_PHASES[0].cost['smart-plating'] + 5;
  for (let i = 0; i < 1200 && s.elevator.phase === 0; i++) tick(s, 0.1, ctx);
  assert.equal(s.elevator.phase, 1, 'phase 1 completes from shipped smart-plating');
  assert.equal(junk.buf['iron-plate'], 500, 'non-project items never leave the container');
  // run the remaining phases by stocking each cost
  for (let phase = 1; phase < ELEVATOR_PHASES.length; phase++) {
    for (const [res, amt] of Object.entries(ELEVATOR_PHASES[phase].cost)) box.buf[res] = amt + 5;
    for (let i = 0; i < 20000 && s.elevator.phase === phase; i++) tick(s, 0.1, ctx);
    assert.equal(s.elevator.phase, phase + 1, `phase ${phase + 1} completes`);
  }
  tick(s, 0.1, ctx);
  assert.equal(elev.status, 'Project Assembly complete', 'victory status after final phase');
  // every project part is producible with the buildings the full ladder unlocks
  const unlockedAll = [...START_UNLOCKED, ...MILESTONES.flatMap((m) => m.rewards.buildings ?? [])];
  const cats = new Set(unlockedAll.map((k) => ctx.catalog[k].cat).filter(Boolean));
  const minerCats = new Set(unlockedAll.filter((k) => ctx.catalog[k].type === 'miner')
    .map((k) => ctx.catalog[k].minerCat));
  const producible = (item, visiting = new Set()) => {
    if (visiting.has(item)) return false;
    const res = ctx.resources.find((r) => r.key_name === item);
    if (res) return minerCats.has(res.category);
    if (item === 'leaves' || item === 'wood') return true;
    visiting.add(item);
    const ok = data.recipes.some((r) => cats.has(r.category) &&
      r.products.some(([p]) => p === item) &&
      r.ingredients.every(([i]) => producible(i, visiting)));
    visiting.delete(item);
    return ok;
  };
  for (const item of ELEVATOR_ITEMS) assert.ok(producible(item), `${item} producible post-ladder`);
  // elevator state survives normalization; old saves get a default
  const norm = normalizeSave(JSON.parse(JSON.stringify(s)), ctx);
  assert.equal(norm.elevator.phase, ELEVATOR_PHASES.length, 'elevator phase survives save');
  const old = JSON.parse(JSON.stringify(s));
  delete old.elevator;
  assert.deepEqual(normalizeSave(old, ctx).elevator, { phase: 0, progress: {} }, 'old saves default elevator');
}

// status lights: one pure mapping from status (+ power ratio) to a light color
{
  const mach = ctx.catalog.smelter;
  const mine = ctx.catalog['miner-mk1'];
  const gen = ctx.catalog['biomass-burner'];
  const box = ctx.catalog['storage-container'];

  assert.equal(lightOf({ status: 'no power' }, mach), 'red');
  assert.equal(lightOf({ status: 'no recipe' }, mach), 'red');
  assert.equal(lightOf({ status: 'no fuel' }, gen), 'red');
  assert.equal(lightOf({ status: 'no deposit' }, mine), 'red');

  assert.equal(lightOf({ status: 'waiting for input' }, mach), 'yellow');
  assert.equal(lightOf({ status: 'output full' }, mine), 'yellow');
  assert.equal(lightOf({ status: 'full' }, box), 'yellow');

  assert.equal(lightOf({ status: 'crafting' }, mach), 'green', 'missing ratio counts as full power');
  assert.equal(lightOf({ status: 'mining', ratio: 1 }, mine), 'green');
  assert.equal(lightOf({ status: 'generating' }, gen), 'green');
  assert.equal(lightOf({ status: 'storing' }, box), 'green');

  // brownout: the status string still says "crafting", the light must not say green
  assert.equal(lightOf({ status: 'crafting', ratio: 0.5 }, mach), 'yellow');
  assert.equal(lightOf({ status: 'crafting', ratio: THROTTLE_LIGHT }, mach), 'green', 'boundary is inclusive-green');
  assert.equal(lightOf({ status: 'crafting', ratio: THROTTLE_LIGHT - 0.01 }, mach), 'yellow');

  // unlit node types keep their per-type color
  assert.equal(lightOf({ status: 'ok' }, ctx.catalog.splitter), null, 'logistics get no light');
  assert.equal(lightOf({ status: 'ok' }, ctx.catalog['pipe-merger']), null);
  assert.equal(lightOf({ status: 'milestone: Part Assembly' }, ctx.catalog['the-hub']), null);
  assert.equal(lightOf({ status: 'phase 1: Platform' }, ctx.catalog['space-elevator']), null);
  assert.equal(lightOf({ status: 'growing' }, ctx.catalog.deposit), null);
  assert.equal(lightOf({ status: 'idle' }, mach), null, 'pre-first-tick status has no light');
}

// tick stores the power ratio on every node so the renderer never recomputes networks
{
  const s = newGame(45, ctx);
  s.unlocked.buildings = Object.keys(ctx.catalog);
  s.nodes = s.nodes.filter((n) => n.key === 'the-hub'); s.wires = [];
  const d = addDeposit(s, 'iron-ore', 'mineral', 'normal', 1, 5, 5);
  const m = addNode(s, 'miner-mk1', 10, 5, ctx);
  const b = addNode(s, 'biomass-burner', 10, 12, ctx);
  b.buf.wood = 50;
  addWire(s, d, 'out0', m, 'res0', ctx);
  addWire(s, b, 'pout', m, 'pin', ctx);
  tick(s, 0.1, ctx);
  assert.equal(m.ratio, 1, 'fully supplied miner runs at ratio 1');
  assert.equal(b.ratio, 1, 'a node that draws no power reports ratio 1');
  const hub = s.nodes.find((n) => n.key === 'the-hub');
  assert.equal(hub.ratio, 1, 'ratio is written even for a node type that gets no light');
}

// brownout: an oversubscribed network throttles, still reports "mining", lights yellow
{
  const s = newGame(47, ctx);
  s.unlocked.buildings = Object.keys(ctx.catalog);
  s.nodes = s.nodes.filter((n) => n.key === 'the-hub'); s.wires = [];
  const d = addDeposit(s, 'iron-ore', 'mineral', 'normal', 1, 5, 5);
  const m = addNode(s, 'miner-mk1', 10, 5, ctx);
  const hog = addNode(s, 'accelerator', 10, 10, ctx); // 500 MW idle draw
  const b = addNode(s, 'biomass-burner', 16, 10, ctx); // 30 MW
  b.buf.wood = 50;
  addWire(s, d, 'out0', m, 'res0', ctx);
  addWire(s, b, 'pout', m, 'pin', ctx);
  addWire(s, b, 'pout', hog, 'pin', ctx);
  tick(s, 0.1, ctx);
  assert.ok(m.ratio > 0 && m.ratio < 1, `browned-out miner has a partial ratio, got ${m.ratio}`);
  assert.equal(m.status, 'mining', 'the status string cannot express a brownout');
  assert.equal(lightOf(m, ctx.catalog['miner-mk1']), 'yellow', 'but the light can');
}

// lifetime counters: production is conserved, and state-time accumulates the same
// whether the run happened live or through the coarse offline simulator
{
  const build = (seed) => {
    const s = newGame(seed, ctx);
    s.unlocked.buildings = Object.keys(ctx.catalog);
    s.nodes = s.nodes.filter((n) => n.key === 'the-hub'); s.wires = [];
    const hubN = s.nodes[0];
    const d = addDeposit(s, 'iron-ore', 'mineral', 'normal', 1, 5, 5);
    const m = addNode(s, 'miner-mk1', 10, 5, ctx);
    const sm = addNode(s, 'smelter', 14, 5, ctx);
    const b = addNode(s, 'biomass-burner', 10, 12, ctx);
    b.buf.wood = 200; // 0.3 wood/s -> lasts the whole run
    setRecipe(s, sm, 'iron-ingot', ctx);
    addWire(s, d, 'out0', m, 'res0', ctx);
    addWire(s, b, 'pout', m, 'pin', ctx);
    addWire(s, b, 'pout', sm, 'pin', ctx);
    addWire(s, m, 'out0', sm, 'in0', ctx);
    addWire(s, sm, 'out0', hubN, 'in0', ctx);
    return { s, m, sm };
  };

  const live = build(49);
  for (let i = 0; i < 3000; i++) tick(live.s, 0.1, ctx); // 300s

  // every ingot the smelter made is either shipped to the HUB or still in its buffer
  const shipped = live.s.shipped['iron-ingot'] ?? 0;
  const held = live.sm.buf['iron-ingot'] ?? 0;
  assert.ok(live.sm.made > 100, `smelter produced, got ${live.sm.made}`);
  assert.ok(Math.abs(live.sm.made - (shipped + held)) < 1e-6,
    `made ${live.sm.made} == shipped ${shipped} + held ${held}`);
  assert.ok(live.m.made > 100, `miner produced, got ${live.m.made}`);
  assert.equal(live.s.nodes.find((n) => n.key === 'biomass-burner').made, undefined,
    'generators produce no items and get no made counter');

  // 300s of green uptime, whether live or offline
  const total = (n) => (n.tGreen ?? 0) + (n.tYellow ?? 0) + (n.tRed ?? 0);
  assert.ok(Math.abs(total(live.m) - 300) < 1e-6, `all live time accounted, got ${total(live.m)}`);

  const away = build(49);
  assert.equal(simulateOffline(away.s, 300, ctx), 300);
  assert.ok(Math.abs(total(away.m) - 300) < 1e-6, `all offline time accounted, got ${total(away.m)}`);
  assert.ok(Math.abs((live.m.tGreen ?? 0) - (away.m.tGreen ?? 0)) < 0.6,
    `uptime matches within one offline step (${live.m.tGreen} vs ${away.m.tGreen})`);
  assert.ok(live.m.tGreen > 290, `miner ran green nearly the whole time, got ${live.m.tGreen}`);

  // counters are plain numbers: they survive a save round-trip untouched
  const rt = normalizeSave(JSON.parse(JSON.stringify(live.s)), ctx);
  const rtM = rt.nodes.find((n) => n.id === live.m.id);
  assert.equal(rtM.made, live.m.made, 'made survives save/normalize');
  assert.equal(rtM.tGreen, live.m.tGreen, 'tGreen survives save/normalize');
}

// a red node accumulates tRed, not tGreen
{
  const s = newGame(51, ctx);
  s.unlocked.buildings = Object.keys(ctx.catalog);
  s.nodes = s.nodes.filter((n) => n.key === 'the-hub'); s.wires = [];
  const d = addDeposit(s, 'copper-ore', 'mineral', 'normal', 1, 30, 30);
  const dark = addNode(s, 'miner-mk1', 35, 30, ctx); // wired to ore, never powered
  addWire(s, d, 'out0', dark, 'res0', ctx);
  for (let i = 0; i < 100; i++) tick(s, 0.1, ctx); // 10s
  assert.equal(dark.status, 'no power');
  assert.ok(Math.abs(dark.tRed - 10) < 1e-6, `unpowered miner banks red time, got ${dark.tRed}`);
  assert.equal(dark.tGreen, undefined, 'never green, never allocated');
  assert.equal(dark.made, undefined, 'never produced');
}

// miner buffer clamps at BUF_CAP: made only banks what actually fit, not the raw
// uncapped per-tick gain
{
  const s = newGame(53, ctx);
  s.unlocked.buildings = Object.keys(ctx.catalog);
  s.nodes = s.nodes.filter((n) => n.key === 'the-hub'); s.wires = [];
  const d = addDeposit(s, 'iron-ore', 'mineral', 'pure', 2, 5, 5); // pure: mult 2
  // miner-mk3: 240/min base * mult 2 = 8/s uncapped -> 0.8/tick at dt=0.1, well over
  // the 0.1 of headroom below
  const m = addNode(s, 'miner-mk3', 10, 5, ctx);
  const b = addNode(s, 'biomass-burner', 10, 12, ctx);
  b.buf.wood = 50;
  addWire(s, d, 'out0', m, 'res0', ctx);
  addWire(s, b, 'pout', m, 'pin', ctx);
  m.buf['iron-ore'] = 99.9; // just under the cap (100 — BUF_CAP is not exported)
  const madeBefore = m.made ?? 0;
  tick(s, 0.1, ctx);
  assert.equal(m.buf['iron-ore'], 100, 'buffer clamps exactly at the cap');
  assert.ok(Math.abs((m.made - madeBefore) - 0.1) < 1e-9,
    `made grows by only the amount that fit, got ${m.made - madeBefore}`);
}

// poles: 1-in/1-out relays for each wire kind, so a cross-map run can be built as hops
{
  // all three are available from the start — they solve a pain that exists on the first run
  const fresh = newGame(53, ctx);
  for (const k of ['power-pole', 'conveyor-pole', 'pipe-pole']) {
    assert.ok(isUnlocked(fresh, k), k + ' unlocked from the start');
    assert.equal(ctx.catalog[k].size, 1, k + ' is a 1-tile node');
    assert.equal(ctx.catalog[k].draw, 0, k + ' draws no power');
    assert.ok(!ctx.catalog[k].powerOut, k + ' supplies no power');
  }

  // power: a generator reaches a distant machine through a chain of poles, and the poles
  // themselves stay out of the supply/demand accounting
  {
    const s = newGame(53, ctx);
    s.nodes = s.nodes.filter((n) => n.key === 'the-hub'); s.wires = [];
    const d = addDeposit(s, 'iron-ore', 'mineral', 'normal', 1, 5, 5);
    const m = addNode(s, 'miner-mk1', 10, 5, ctx);
    const b = addNode(s, 'biomass-burner', 60, 60, ctx); // far away
    b.buf.wood = 50;
    const p1 = addNode(s, 'power-pole', 30, 30, ctx);
    const p2 = addNode(s, 'power-pole', 45, 45, ctx);
    assert.ok(addWire(s, d, 'out0', m, 'res0', ctx));
    assert.ok(addWire(s, b, 'pout', p1, 'in0', ctx), 'generator into pole');
    assert.ok(addWire(s, p1, 'out0', p2, 'in0', ctx), 'pole chains to pole');
    assert.ok(addWire(s, p2, 'out0', m, 'pin', ctx), 'pole into machine');
    tick(s, 0.1, ctx);
    assert.equal(m.status, 'mining', 'power reaches the miner through two poles');
    assert.equal(m.ratio, 1, 'poles add no loss');
    assert.equal(s.power.demand, ctx.catalog['miner-mk1'].draw, 'poles add no demand');
    assert.equal(s.power.supply, 30, 'poles add no supply');
    assert.equal(p1._net, undefined, 'poles never join the net accounting, so never alert');
    // a pole only accepts its own wire kind
    const box = addNode(s, 'storage-container', 20, 20, ctx);
    assert.equal(addWire(s, box, 'out0', p1, 'in0', ctx), null, 'item wire rejected by power pole');
  }

  // conveyor: items survive the hop, and throughput is unchanged from a direct belt
  {
    const s = newGame(55, ctx);
    s.nodes = s.nodes.filter((n) => n.key === 'the-hub'); s.wires = [];
    const src = addNode(s, 'storage-container', 5, 5, ctx);
    src.buf['iron-ore'] = 300;
    const pole = addNode(s, 'conveyor-pole', 10, 5, ctx);
    const sink = addNode(s, 'storage-container', 15, 5, ctx);
    assert.ok(addWire(s, src, 'out0', pole, 'in0', ctx), 'container into conveyor pole');
    assert.ok(addWire(s, pole, 'out0', sink, 'in0', ctx), 'conveyor pole into container');
    for (let i = 0; i < 1200; i++) tick(s, 0.1, ctx); // 120s @ belt1 60/min
    const got = sink.buf['iron-ore'] ?? 0;
    assert.ok(got > 100 && got <= 121, `pole passes ~60/min, got ${got}`);
    const total = (src.buf['iron-ore'] ?? 0) + (pole.buf['iron-ore'] ?? 0) + got;
    assert.ok(Math.abs(total - 300) < 1, `items conserved through the pole, got ${total}`);
    assert.equal(pole.status, 'ok');
    assert.equal(lightOf(pole, ctx.catalog['conveyor-pole']), null, 'relays get no status light');
    assert.equal(addWire(s, src, 'out0', addNode(s, 'pipe-pole', 20, 5, ctx), 'in0', ctx), null,
      'item wire rejected by pipe pole');
  }

  // pipe: fluid survives the hop
  {
    const s = newGame(57, ctx);
    s.unlocked.buildings = Object.keys(ctx.catalog); // extractor/buffer are milestone rewards
    s.nodes = s.nodes.filter((n) => n.key === 'the-hub'); s.wires = [];
    const wdep = addDeposit(s, 'water', 'water', 'normal', 1, 5, 5);
    const pump = addNode(s, 'water-extractor', 10, 5, ctx);
    const b = addNode(s, 'biomass-burner', 10, 12, ctx);
    b.buf.wood = 50;
    const pole = addNode(s, 'pipe-pole', 16, 5, ctx);
    const tank = addNode(s, 'fluid-buffer', 20, 5, ctx);
    assert.ok(addWire(s, wdep, 'out0', pump, 'res0', ctx));
    assert.ok(addWire(s, b, 'pout', pump, 'pin', ctx));
    assert.ok(addWire(s, pump, 'out0', pole, 'in0', ctx), 'extractor into pipe pole');
    assert.ok(addWire(s, pole, 'out0', tank, 'in0', ctx), 'pipe pole into tank');
    for (let i = 0; i < 1200; i++) tick(s, 0.1, ctx); // 120s
    assert.ok((tank.buf.water ?? 0) > 100, `fluid passes the pole, got ${tank.buf.water}`);
  }
}

// ore tiering: distance from the HUB attenuates each resource's spawn weight, and the
// late-game tiers have a hard floor so no seed can put uranium next to the hub
{
  assert.equal(tierOf('iron-ore'), 0);
  assert.equal(tierOf('coal'), 1);
  assert.equal(tierOf('crude-oil'), 2);
  assert.equal(tierOf('nitrogen-gas'), 3);
  assert.equal(tierOf('uranium'), 4);
  assert.equal(tierOf('not-a-real-resource'), 0, 'unknown resources default to tier 0');

  // distT measures from the HUB centre, not its corner
  assert.equal(distT(HUB_X + 2, HUB_Y + 2), 0, 'hub centre is t=0');
  assert.ok(distT(0, 0) > 0.99, `map corner is t~1, got ${distT(0, 0)}`);
  assert.ok(distT(HUB_X + 2 + 40, HUB_Y + 2) > 0.2 && distT(HUB_X + 2 + 40, HUB_Y + 2) < 0.3,
    '40 tiles out lands in the tier-1 band');

  // tierFactor takes a key string, so it also works for leaves, which is an item and has
  // no entry in data.resources at all
  assert.equal(tierFactor('leaves', 0), 1, 'plants peak at the hub');
  assert.equal(tierFactor('leaves', 1), 0, 'plants do not spawn at the map edge');
  // uranium (tier 4, peak t=1) is far enough from t=0.5 that the band alone already zeroes
  // it (band decays to 0 below t=0.65) — this is a band-decay check, not a floor check.
  assert.equal(tierFactor('uranium', 0.5), 0, 'band decay alone zeroes uranium this far from its peak');
  assert.ok(tierFactor('uranium', 1) > 0.9, 'uranium peaks at the map edge');
  // the floor's only live region is tier 3, t in [0.4, 0.6): there the band alone would still
  // give a nonzero factor (~0.286 at t=0.5), so these are the assertions that actually die if
  // `if (tier >= 3 && t < FLOOR_T) return 0;` is removed from tierFactor.
  assert.equal(tierFactor('nitrogen-gas', 0.5), 0, 'the floor zeroes tier 3 at t=0.5 even though the band alone would not');
  assert.equal(tierFactor('bauxite', 0.5), 0, 'the floor zeroes tier 3 at t=0.5 even though the band alone would not');

  const res = (k) => ctx.resources.find((r) => r.key_name === k);
  assert.equal(ctx.resources.filter((r) => r.category === 'plant').length, 0,
    'there is no plant resource category — leaves must stay hardcoded in the scatter');
  // tier 0 peaks at the hub and dies off with distance
  assert.ok(tierFactor('iron-ore', 0) > tierFactor('iron-ore', 0.5),
    'iron prefers positions near the hub');
  assert.equal(tierFactor('iron-ore', 1), 0, 'tier 0 cannot spawn at the map edge');
  // tier 4 peaks at the edge; both of these points are also zeroed by band decay alone
  // (band dies below t=0.65 for tier 4), so the floor is redundant here — band-decay checks.
  assert.equal(tierFactor('uranium', 0), 0, 'band decay zeroes uranium at the hub (floor coincides)');
  assert.equal(tierFactor('uranium', 0.59), 0, 'band decay zeroes uranium at t=0.59, below the 0.65 band edge (floor coincides)');
  assert.ok(tierFactor('uranium', 1) > 0, 'uranium can spawn at the map edge');
  assert.ok(tierFactor('nitrogen-gas', 0.3) === 0 && tierFactor('nitrogen-gas', 0.8) > 0,
    'nitrogen-gas shares the tier-3 floor (t=0.3 is band decay; t=0.8 is past the floor, not testing it either)');
  // How common a resource is comes from its JSON weight and nothing else — distance decides
  // where a pick lands, never how often it is picked (see the abundance sweep below).
  assert.ok(res('iron-ore').weight > res('limestone').weight,
    'iron is commoner than limestone in the JSON (307 vs 233)');
}

// tiering actually biases placement across many seeds, and the floor holds on every one
{
  const FLOOR_T = 0.6;
  const near = [], far = [];
  let uraniumSeen = 0;
  for (let seed = 1000; seed < 1200; seed++) {
    const deps = genMap(seed, ctx);
    // the true minimum across 50,000 seeds is 42 (seed 15283); 44 was a spot-check lucky
    // to the 1000-1199 sweep range, not a real floor
    assert.ok(deps.length >= 40, `seed ${seed} generated ${deps.length} deposits, expected >= 40`);
    for (const d of deps) {
      const t = distT(d.x, d.y);
      const tier = tierOf(d.res);
      if (tier >= 3) {
        assert.ok(t >= FLOOR_T,
          `seed ${seed}: ${d.res} (tier ${tier}) spawned at t=${t.toFixed(3)}, inside the floor`);
      }
      if (d.res === 'uranium') uraniumSeen++;
      if (tier === 0) near.push(t);
      if (tier === 3) far.push(t);
    }
  }
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  assert.ok(far.length > 0, 'tier-3 resources do spawn somewhere across 200 seeds');
  assert.ok(mean(far) - mean(near) >= 0.20,
    `tier 3 spawns further out than tier 0 (near ${mean(near).toFixed(3)}, far ${mean(far).toFixed(3)})`);
  assert.ok(uraniumSeen > 0, 'uranium is still reachable on some seed');
}

// abundance: how common a resource is comes from its JSON weight, and only from that. Tiering
// decides where a deposit lands, never how many there are.
// This is the test whose absence let a real defect ship: scatter() used to sample a position
// first and then ask which resource belonged there, which tied a resource's map-wide count to
// the share of the map its tier band covered. Tier 0's band is a small disc around the hub and
// tier 3's is most of the map, so bauxite (weight 41) outnumbered iron (weight 307) 3.4 to 2.5,
// and 59% of maps held no iron at all beyond the two guaranteed starters — two Mk1 miners to
// feed a ladder that wants 200 iron parts at milestone 1 and 200 steel parts at milestone 5.
{
  const SEEDS = 1000;
  const counts = {};    // every mineral deposit
  const scattered = {}; // starters excluded — the scatter is the part JSON weight governs
  const tier0T = [];    // where tier 0 ends up, to prove the position side still tiers
  for (let seed = 5000; seed < 5000 + SEEDS; seed++) {
    for (const d of genMap(seed, ctx)) {
      if (tierOf(d.res) === 0) tier0T.push(distT(d.x, d.y));
      if (d.cat !== 'mineral') continue;
      counts[d.res] = (counts[d.res] || 0) + 1;
      if (!d.start) scattered[d.res] = (scattered[d.res] || 0) + 1;
    }
  }
  const per = (m, k) => (m[k] || 0) / SEEDS; // mean deposits per map
  const minerals = ctx.resources.filter((r) => r.category === 'mineral');

  // a deposit has exactly one output port, so two iron patches means two miners for the whole
  // early ladder: iron and limestone scarcity is unplayable, not merely annoying
  assert.ok(per(counts, 'iron-ore') >= 6.0,
    `iron averages >= 6 deposits per map, got ${per(counts, 'iron-ore').toFixed(2)}`);
  assert.ok(per(counts, 'limestone') >= 4.5,
    `limestone averages >= 4.5 deposits per map, got ${per(counts, 'limestone').toFixed(2)}`);

  // the top of the abundance table must be the top of the weight table
  const ranked = minerals.map((r) => [r.key_name, per(counts, r.key_name)]).sort((a, b) => b[1] - a[1]);
  const table = ranked.map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ');
  assert.equal(ranked[0][0], 'iron-ore', `iron (weight 307) is the commonest mineral: ${table}`);
  assert.equal(ranked[1][0], 'limestone', `limestone (weight 233) is second: ${table}`);
  // and no late-tier ore may outnumber coal, however much map area its band covers
  for (const r of minerals) {
    if (tierOf(r.key_name) < 2) continue;
    assert.ok(per(counts, r.key_name) <= per(counts, 'coal'),
      `${r.key_name} (tier ${tierOf(r.key_name)}, weight ${r.weight}) must not outnumber coal ` +
      `(weight 141): ${per(counts, r.key_name).toFixed(2)} vs ${per(counts, 'coal').toFixed(2)}`);
  }

  // The sharp form, and the one that fails if position sampling ever feeds back into the pick:
  // deposits-per-map divided by JSON weight is one constant across the whole category, tier
  // regardless. Under the area-driven bug this spread over a factor of 50 (iron 0.0015,
  // caterium 0.079); even a mild feedback (weight scaled by 1 + tierFactor) pushes iron to
  // 0.78x and caterium to 1.21x, so the band has to be tight. Measured over 40 disjoint
  // 1,000-seed windows the true spread is 0.906-1.093, so 0.85-1.15 has room without being
  // slack. Uranium (weight 7, ~0.17 deposits per map) is too rare to average this tightly.
  const heavy = minerals.filter((r) => r.weight >= 30);
  const ratio = (r) => per(scattered, r.key_name) / r.weight;
  const meanRatio = heavy.reduce((s, r) => s + ratio(r), 0) / heavy.length;
  for (const r of heavy) {
    const rel = ratio(r) / meanRatio;
    assert.ok(rel > 0.85 && rel < 1.15,
      `${r.key_name} (weight ${r.weight}, tier ${tierOf(r.key_name)}) averages ` +
      `${per(scattered, r.key_name).toFixed(3)} scattered deposits per map — ` +
      `${rel.toFixed(2)}x the weight-proportional rate`);
  }

  // Abundance is now independent of position, which means the tiering needs its own guard here:
  // deleting the position weighting in scatter() (scoring every candidate equally) leaves every
  // assertion above happy, and even leaves the tier-3-minus-tier-0 gap above 0.20 — the hard
  // floor alone earns that. What it does do is move tier 0 out from a mean t of 0.372 to 0.473,
  // uniform placement. 0.42 sits between the two, ~40x the observed spread of the real figure
  // (0.3722-0.3759 across 40 disjoint 1,000-seed windows) away from it.
  const meanT0 = tier0T.reduce((s, v) => s + v, 0) / tier0T.length;
  assert.ok(meanT0 <= 0.42,
    `tier-0 deposits average t=${meanT0.toFixed(4)}; above 0.42 means positions are no longer ` +
    'being chosen for the resource (uniform placement gives ~0.473)');
}

// every seed hands you a playable start inside the HUB's reveal radius
{
  const need = { 'iron-ore': 2, 'copper-ore': 1, limestone: 1, leaves: 2, water: 1 };
  let nitrogenSeen = 0;
  for (let seed = 2000; seed < 2200; seed++) {
    const deps = genMap(seed, ctx);
    const inStart = deps.filter((d) => distT(d.x, d.y) * MAX_DIST <= START_RADIUS);
    for (const [res, count] of Object.entries(need)) {
      const got = inStart.filter((d) => d.res === res).length;
      assert.ok(got >= count,
        `seed ${seed}: needed ${count} ${res} within ${START_RADIUS} tiles, got ${got}`);
    }
    // starters must clear the HUB footprint like every other deposit
    for (const d of inStart) {
      assert.ok(Math.abs(HUB_X - d.x) > 8 || Math.abs(HUB_Y - d.y) > 8,
        `seed ${seed}: ${d.res} at ${d.x},${d.y} overlaps the HUB footprint`);
    }
    // the starter bundle is a hard guarantee — all 7 deposits must land inside START_RADIUS
    // even if rejection sampling had to retry 400 times per deposit. Silent exhaustion would
    // mean rare unplayable maps if this ever regresses (e.g., START_RADIUS shrinks or free()
    // tightens). Exact count check on the start flag detects any exhaustion.
    const bundlePlaced = deps.filter((d) => d.start === true).length;
    assert.equal(bundlePlaced, START_BUNDLE.length,
      `seed ${seed}: starter bundle placed ${bundlePlaced} deposits, expected exactly ${START_BUNDLE.length}`);
    if (deps.some((d) => d.res === 'nitrogen-gas')) nitrogenSeen++;
  }
  // the regression this fixes: nitrogen-gas is in the JSON (category water, weight 40) and
  // water-extractor has minerCat 'water', but scatter() hardcoded 'water' so it never spawned
  assert.ok(nitrogenSeen > 0, 'nitrogen-gas can now spawn on some seed');

  // density is unchanged: the bundle comes out of the category budgets, not on top of them
  const deps = genMap(2222, ctx);
  assert.ok(deps.length >= 44 && deps.length <= 48,
    `map still holds ~48 deposits, got ${deps.length}`);
  assert.equal(START_BUNDLE.length, 7, 'bundle is 7 deposits: 4 mineral, 2 plant, 1 water');
}

// fog of war: explored chunks accumulate around owned buildings and never un-reveal
{
  assert.equal(CHUNK_W * CHUNK_H, 600, '240x160 world in 8-tile chunks is 600 chunks');
  assert.equal(chunkIndex(0, 0), 0);
  assert.equal(chunkIndex(7, 7), 0, 'a chunk covers 8 tiles');
  assert.equal(chunkIndex(8, 0), 1);
  assert.equal(chunkIndex(0, 8), CHUNK_W, 'row 1 starts one chunk-row in');

  const s = newGame(3000, ctx);
  assert.equal(s.explored.length, 600, 'a new game has an explored array');
  // the hub reveals its own chunk, and the guaranteed starters are inside that reveal
  assert.equal(s.explored[chunkIndex(HUB_X + 2, HUB_Y + 2)], 1, 'hub chunk is revealed');
  for (const d of s.nodes.filter((n) => n.key === 'deposit')) {
    if (distT(d.x, d.y) * MAX_DIST <= START_RADIUS) {
      assert.equal(s.explored[chunkIndex(d.x, d.y)], 1,
        `starter ${d.res} at ${d.x},${d.y} is inside the hub reveal`);
    }
  }
  // the far corner is not revealed by the hub alone
  assert.equal(s.explored[chunkIndex(2, 2)], 0, 'the map corner starts fogged');

  // deposits are not yours and reveal nothing; a building you place does.
  // Drop the deposits first so the chosen spot cannot be blocked by a seed-dependent one.
  s.nodes = s.nodes.filter((n) => n.key === 'the-hub'); s.wires = [];
  const before = s.explored.reduce((a, v) => a + v, 0);
  const far = addNode(s, 'storage-container', 20, 20, ctx);
  assert.ok(far, 'container placed in the fog');
  tick(s, 0.1, ctx);
  const after = s.explored.reduce((a, v) => a + v, 0);
  assert.ok(after > before, `placing a building reveals chunks (${before} -> ${after})`);
  assert.equal(s.explored[chunkIndex(20, 20)], 1, 'its own chunk is revealed');

  // reveal is monotone — deleting the building does not re-fog, online or offline
  removeNode(s, far.id);
  tick(s, 0.1, ctx);
  assert.equal(s.explored.reduce((a, v) => a + v, 0), after, 'revealed is permanent');
  simulateOffline(s, 600, ctx);
  assert.equal(s.explored.reduce((a, v) => a + v, 0), after, 'offline never un-reveals');

  // moving a node invalidates its cache and reveals new surroundings
  const mover = addNode(s, 'storage-container', 5, 5, ctx);
  tick(s, 0.1, ctx);
  const beforeMove = s.explored.reduce((a, v) => a + v, 0);
  mover.x = 230; mover.y = 150; // move to the far corner
  tick(s, 0.1, ctx);
  const afterMove = s.explored.reduce((a, v) => a + v, 0);
  assert.ok(afterMove > beforeMove, 'moving a building reveals new chunks');
  assert.equal(s.explored[chunkIndex(230, 150)], 1, 'moved building reveals its new position');

  // survives a save round-trip, and old saves without it get a valid default
  const rt = normalizeSave(JSON.parse(JSON.stringify(s)), ctx);
  assert.deepEqual(rt.explored, s.explored, 'explored survives save/normalize');
  const old = JSON.parse(JSON.stringify(s));
  delete old.explored;
  const fixed = normalizeSave(old, ctx);
  assert.equal(fixed.explored.length, 600, 'a save written before fog gets a default');
  // a save from a differently-sized world is repaired rather than trusted
  const wrong = JSON.parse(JSON.stringify(s));
  wrong.explored = [1, 1, 1];
  const r2 = normalizeSave(wrong, ctx);
  assert.equal(r2.explored.length, 600, 'wrong-length explored repaired');
  // normalizeSave's own `delete n._fog` (separate from revealAll's) must actually run, or a
  // node's stale cache survives the repair and revealAll silently skips it forever, leaving
  // the repaired array permanently black. r2.explored is already exactly 600 long by this
  // point, so revealAll's own array-repair branch does NOT fire here — this isolates
  // normalizeSave's guard specifically.
  revealAll(r2, ctx);
  assert.equal(r2.explored[chunkIndex(HUB_X + 2, HUB_Y + 2)], 1, 'reveal recovers after repair');

  // revealAll's own array-repair branch has the same guard, and must be tested independently:
  // corrupt explored directly on a live state (bypassing normalizeSave entirely) so revealAll's
  // internal repair-and-clear-cache branch is what has to fire.
  const s2 = newGame(3001, ctx);
  tick(s2, 0.1, ctx); // populates the hub's _fog cache at its current position
  s2.explored = [1, 1, 1]; // corrupt in place, bypassing normalizeSave
  revealAll(s2, ctx);
  assert.equal(s2.explored.length, 600, 'revealAll itself repairs a wrong-length explored array');
  assert.equal(s2.explored[chunkIndex(HUB_X + 2, HUB_Y + 2)], 1,
    'revealAll recovers reveal after repairing in place, even with a stale _fog cache');
}

console.log('all sim checks passed');
