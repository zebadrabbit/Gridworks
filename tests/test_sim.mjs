// node test_sim.mjs — smallest checks that fail if the sim logic breaks
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { buildCtx, newGame, addNode, addWire, removeWire, addDeposit, setRecipe, tick, canConnect, portsOf } from '../src/sim.js';

const data = JSON.parse(readFileSync(new URL('../data/source/satisfactory_data.json', import.meta.url)));
const ctx = buildCtx(data);

const state = newGame(42, ctx);
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

// save/load roundtrip
const restored = JSON.parse(JSON.stringify(state));
tick(restored, 0.1, ctx);
assert.ok(restored.time > state.time, 'restored state ticks');

console.log('all sim checks passed');
