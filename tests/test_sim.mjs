// node test_sim.mjs — smallest checks that fail if the sim logic breaks
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { buildCtx, newGame, addNode, addWire, setRecipe, tick, canConnect, portsOf } from '../src/sim.js';

const data = JSON.parse(readFileSync(new URL('../data/source/satisfactory_data.json', import.meta.url)));
const ctx = buildCtx(data);

const state = newGame(42, ctx);
const hub = state.nodes[0];
assert.equal(hub.key, 'the-hub');
assert.ok(state.deposits.length >= 30, 'map has deposits');
assert.ok(state.deposits.some((d) => d.cat === 'water'), 'water deposits exist');

// plant a known deposit + miner + smelter + container chain (deterministic map)
const dep = { id: 999, res: 'iron-ore', cat: 'mineral', purity: 'pure', mult: 2, x: 5, y: 5, size: 2 };
const wdep = { id: 997, res: 'water', cat: 'water', purity: 'normal', mult: 1, x: 40, y: 40, size: 2 };
state.deposits = [dep, wdep];
const miner = addNode(state, 'miner-mk1', 5, 5, ctx);
assert.ok(miner, 'miner placed on deposit');
assert.equal(miner.depositRes, 'iron-ore');
assert.equal(addNode(state, 'miner-mk1', 5, 5, ctx), null, 'deposit occupied rejected');
assert.equal(addNode(state, 'water-extractor', 5, 5, ctx), null, 'wrong miner category rejected');

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
const dep2 = { id: 998, res: 'copper-ore', cat: 'mineral', purity: 'normal', mult: 1, x: 30, y: 30, size: 2 };
state.deposits.push(dep2);
const dark = addNode(state, 'miner-mk1', 30, 30, ctx);
tick(state, 0.1, ctx);
assert.equal(dark.status, 'no power');
assert.equal(dark.buf['copper-ore'] ?? 0, 0);

// water extractor outputs fluid
const pump = addNode(state, 'water-extractor', wdep.x, wdep.y, ctx);
assert.ok(pump, 'water extractor placed');
assert.equal(portsOf(pump, ctx).find((p) => p.id === 'out0').kind, 'fluid');

// save/load roundtrip
const restored = JSON.parse(JSON.stringify(state));
tick(restored, 0.1, ctx);
assert.ok(restored.time > state.time, 'restored state ticks');

console.log('all sim checks passed');
