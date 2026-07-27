// node test_sim.mjs — smallest checks that fail if the sim logic breaks
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { buildCtx, newGame, addNode, addWire, removeWire, addDeposit, setRecipe, tick, canConnect, portsOf, MILESTONES, isUnlocked, normalizeSave, START_UNLOCKED, simulateOffline, OFFLINE_CAP, ELEVATOR_PHASES, ELEVATOR_ITEMS } from '../src/sim.js';

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

console.log('all sim checks passed');
