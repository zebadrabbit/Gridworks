// settings.js — display preferences. One object, one localStorage key. Never part of the save:
// preferences must survive New Map and save import.
export const DEFAULTS = {
  flow: true, pulses: true, bursts: true, dayNight: true, manta: true,
  wireStyle: 'noodle',   // default style for new wires
  mapOpen: true,
  tutorial: null,        // null = never asked | 'go' = following along | 'skip' = dismissed
};
const KEY = 'gw_settings';
const OLD_MAP = 'gridworks-minimap', OLD_TUT = 'gridworks-tutorial';

// Pure over `storage` so it is testable in Node. Migrates the two pre-panel keys once.
export function loadSettings(storage) {
  let saved = {};
  try { saved = JSON.parse(storage.getItem(KEY) ?? '{}') ?? {}; } catch { saved = {}; }
  if (typeof saved !== 'object') saved = {};
  const s = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (k in saved) s[k] = saved[k];
  const oldMap = storage.getItem(OLD_MAP), oldTut = storage.getItem(OLD_TUT);
  if (oldMap !== null) { s.mapOpen = oldMap !== '0'; storage.removeItem(OLD_MAP); }
  if (oldTut !== null) { s.tutorial = oldTut; storage.removeItem(OLD_TUT); }
  if (oldMap !== null || oldTut !== null) storage.setItem(KEY, JSON.stringify(s));
  return s;
}

const storage = globalThis.localStorage;
export const settings = storage ? loadSettings(storage) : { ...DEFAULTS };
export function saveSettings() { storage?.setItem(KEY, JSON.stringify(settings)); }
