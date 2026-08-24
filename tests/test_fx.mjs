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

// --- settings: saved blob wins over defaults, unknown keys dropped
mem.clear();
mem.set('gw_settings', JSON.stringify({ manta: false, bogus: 1 }));
s = loadSettings(globalThis.localStorage);
assert.equal(s.manta, false);
assert.equal('bogus' in s, false, 'unknown keys are not carried');

console.log('all fx checks passed');
