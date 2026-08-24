// node tests/test_fx.mjs — smallest checks that fail if fx/settings helpers break
import assert from 'node:assert/strict';

// 5-line localStorage stub so settings.js loads in Node.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const { loadSettings, DEFAULTS } = await import('../src/settings.js');

// --- settings: migration from the two old keys
mem.clear();
mem.set('gridworks-minimap', '0');
mem.set('gridworks-tutorial', 'skip');
let s = loadSettings(globalThis.localStorage);
assert.equal(s.mapOpen, false, 'old minimap key migrates');
assert.equal(s.tutorial, 'skip', 'old tutorial key migrates');
assert.equal(mem.has('gridworks-minimap'), false, 'old minimap key removed');
assert.equal(mem.has('gridworks-tutorial'), false, 'old tutorial key removed');
assert.equal(s.flow, true, 'unset keys take defaults');

// --- settings: corrupt blob falls back to defaults
mem.clear();
mem.set('gw_settings', '{not json');
s = loadSettings(globalThis.localStorage);
assert.deepEqual(s, DEFAULTS, 'corrupt settings -> defaults');

// --- settings: primitive JSON (not an object) falls back to defaults
mem.clear();
mem.set('gw_settings', '42');
s = loadSettings(globalThis.localStorage);
assert.deepEqual(s, DEFAULTS, 'primitive settings -> defaults');

// --- settings: saved blob wins over defaults, unknown keys dropped
mem.clear();
mem.set('gw_settings', JSON.stringify({ manta: false, bogus: 1 }));
s = loadSettings(globalThis.localStorage);
assert.equal(s.manta, false);
assert.equal('bogus' in s, false, 'unknown keys are not carried');

const FX = await import('../src/fx.js');

// --- flow: spacing tracks capacity ratio
assert.equal(FX.spacingFor(0), 40);
assert.equal(FX.spacingFor(1), 10);
assert.equal(FX.spacingFor(2), 10, 'clamped above saturation');
assert.ok(FX.spacingFor(0.25) > FX.spacingFor(0.5) && FX.spacingFor(0.5) > FX.spacingFor(0.75), 'monotone');

// --- flow: path measurement and sampling
const path = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }];
const { cum, len } = FX.pathLengths(path);
assert.equal(len, 70);
assert.deepEqual(cum, [0, 30, 70]);
assert.deepEqual(FX.pointAt(path, cum, 15), { x: 15, y: 0, a: 0 });
const p = FX.pointAt(path, cum, 50);
assert.equal(p.x, 30); assert.equal(p.y, 20); assert.ok(Math.abs(p.a - Math.PI / 2) < 1e-9);
assert.equal(Math.floor(len / FX.spacingFor(1)), 7, 'capsule count at saturation');

// --- day/night curve: 10-minute cycle, 0 at noon, 1 at midnight, continuous at the wrap
assert.equal(FX.nightDepth(0), 0);
assert.ok(Math.abs(FX.nightDepth(300) - 1) < 1e-9);
assert.ok(Math.abs(FX.nightDepth(599.999) - FX.nightDepth(0)) < 1e-3, 'continuous across cycle boundary');
assert.ok(FX.nightDepth(150) > 0.4 && FX.nightDepth(150) < 0.6);

console.log('all fx checks passed');
