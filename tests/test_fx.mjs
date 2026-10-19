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

// --- square wire routing: straight stub out of the port, 90° bends only, no zero-length legs
const sq = (a, sa, b, sb, wps = []) => FX.squarePath(a, sa, b, sb, wps);
const ortho = (pts) => pts.every((q, i) => i === 0 || q.x === pts[i - 1].x || q.y === pts[i - 1].y);
const noDup = (pts) => pts.every((q, i) => i === 0 || q.x !== pts[i - 1].x || q.y !== pts[i - 1].y);
let r = sq({ x: 72, y: 86 }, 'E', { x: 228, y: 86 }, 'W');
assert.ok(ortho(r) && noDup(r), 'lined up: orthogonal, no dup points');
assert.equal(r.length, 2, 'lined up: one straight leg');
r = sq({ x: 72, y: 50 }, 'E', { x: 228, y: 120 }, 'W');
assert.ok(ortho(r) && noDup(r));
assert.ok(r[1].y === 50 && r[1].x >= 72 + 16, 'leaves E port straight for at least the stub');
assert.ok(r[r.length - 2].y === 120 && r[r.length - 2].x <= 228 - 16, 'enters W port straight for at least the stub');
assert.equal(r.length, 4, 'offset ahead: Z with two bends');
assert.equal(r[1].x, r[2].x, 'Z vertical run');
r = sq({ x: 224, y: 50 }, 'E', { x: 40, y: 130 }, 'W');
assert.ok(ortho(r) && noDup(r));
assert.equal(r.length, 6, 'target behind: four bends');
assert.ok(r[1].x === 240 && r[r.length - 2].x === 24, 'goes round outside both stubs');
r = sq({ x: 72, y: 70 }, 'N', { x: 232, y: 100 }, 'N');
assert.ok(ortho(r) && noDup(r));
assert.equal(r.length, 4, 'power top-to-top: inverted U, two bends');
assert.ok(r.every((q) => q.y <= 100) && r[1].y === 54 && r[2].y === 54, 'U runs above the higher port');
r = sq({ x: 72, y: 50 }, 'E', { x: 228, y: 120 }, 'W', [{ x: 150, y: 140 }]);
assert.ok(ortho(r) && noDup(r));
assert.ok(r.some((q) => q.x === 150 && q.y === 140), 'waypoint is on the path');
const i = r.findIndex((q) => q.x === 150 && q.y === 140);
assert.ok(r[i - 1].x === 150 && r[i + 1].y === 140, 'waypoint is a corner: arrive vertical, leave horizontal');
assert.ok(!r.some((q, k) => k > 0 && k < r.length - 1 && r[k - 1].y > q.y && r[k + 1].y > q.y && r[k - 1].x === q.x && r[k + 1].x === q.x), 'never doubles back');

console.log('all fx checks passed');
