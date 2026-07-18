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

// wiring: power from hub, belt miner->smelter->container
assert.ok(addWire(state, hub, 'pout', miner, 'pin', ctx), 'power to miner');
assert.ok(addWire(state, hub, 'pout', smelter, 'pin', ctx), 'power to smelter');
assert.ok(addWire(state, miner, 'out0', smelter, 'in0', ctx), 'belt miner->smelter');
assert.ok(addWire(state, smelter, 'out0', box, 'in0', ctx), 'belt smelter->container');
assert.ok(!canConnect(miner, 'out0', smelter, 'pin', state, ctx), 'kind mismatch rejected');
assert.ok(!canConnect(miner, 'out0', miner, 'out0', state, ctx), 'self wire rejected');

for (let i = 0; i < 600; i++) tick(state, 0.1, ctx); // 60s
assert.ok((box.buf['iron-ingot'] ?? 0) > 5, `container has ingots, got ${box.buf['iron-ingot']}`);
assert.ok(state.power.supply >= 30 && state.power.demand > 0, 'power accounting');

// unpowered miner produces nothing
const dep2 = addDeposit(state, 'copper-ore', 'mineral', 'normal', 1, 30, 30);
const dark = addNode(state, 'miner-mk1', 35, 30, ctx);
assert.ok(addWire(state, dep2, 'out0', dark, 'res0', ctx), 'deposit wired to dark miner');
tick(state, 0.1, ctx);
assert.equal(dark.status, 'no power');
assert.equal(dark.buf['copper-ore'] ?? 0, 0);

// unwired miner has no deposit
const lonely = addNode(state, 'miner-mk1', 60, 60, ctx);
assert.ok(addWire(state, hub, 'pout', lonely, 'pin', ctx));
tick(state, 0.1, ctx);
assert.equal(lonely.status, 'no deposit');
// removing the resource wire clears the stamp
const rw = state.wires.find((w) => w.kind === 'resource' && w.b.n === miner.id);
removeWire(state, rw.id);
assert.equal(miner.depositRes, null);

// save/load roundtrip
const restored = JSON.parse(JSON.stringify(state));
tick(restored, 0.1, ctx);
assert.ok(restored.time > state.time, 'restored state ticks');

console.log('all sim checks passed');
