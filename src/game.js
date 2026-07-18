// game.js — canvas rendering + input. Logic lives in sim.js.
import * as S from './sim.js';

const T = S.TILE;
const SAVE_KEY = 'gridworks-save-v1';
const KIND_COLOR = { item: '#58d68d', fluid: '#5dade2', power: '#f4d03f' };
const TYPE_COLOR = {
  miner: '#f5a623', machine: '#4dd8ff', store: '#a29bfe',
  generator: '#f4d03f', hub: '#ff6b81',
};
const DEP_STYLE = {
  mineral: { fill: '#241c14', edge: '#8d6e63' },
  oil: { fill: '#15151c', edge: '#7d7d8f' },
  water: { fill: '#0d2230', edge: '#38bdf8' },
};

const canvas = document.getElementById('canvas');
const cx = canvas.getContext('2d');
let ctx, state;
const cam = { x: 0, y: 0, z: 1 };
const ui = { mode: 'idle', placeKey: null, wireFrom: null, sel: null, hover: null,
  mouse: { x: 0, y: 0 }, drag: null, hint: '' };

// ------------------------------------------------------------------ geometry

const toWorld = (px, py) => ({ x: (px - cam.x) / cam.z, y: (py - cam.y) / cam.z });
const nodePx = (n) => {
  const s = ctx.catalog[n.key].size * T;
  return { x: n.x * T, y: n.y * T, w: s, h: s };
};

function portPos(node, port) {
  const r = nodePx(node);
  const sibs = S.portsOf(node, ctx).filter((p) => p.side === port.side);
  const i = sibs.findIndex((p) => p.id === port.id);
  const t = (i + 1) / (sibs.length + 1);
  if (port.side === 'W') return { x: r.x, y: r.y + t * r.h };
  if (port.side === 'E') return { x: r.x + r.w, y: r.y + t * r.h };
  return { x: r.x + t * r.w, y: r.y }; // N
}

function portAt(wx, wy) {
  for (const node of state.nodes) {
    for (const port of S.portsOf(node, ctx)) {
      const p = portPos(node, port);
      if (Math.hypot(p.x - wx, p.y - wy) < 9 / cam.z + 4) return { node, port };
    }
  }
  return null;
}
function nodeAt(wx, wy) {
  for (let i = state.nodes.length - 1; i >= 0; i--) {
    const r = nodePx(state.nodes[i]);
    if (wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h) return state.nodes[i];
  }
  return null;
}
function depositAtPx(wx, wy) {
  return state.deposits.find((d) =>
    wx >= d.x * T && wx <= (d.x + d.size) * T && wy >= d.y * T && wy <= (d.y + d.size) * T);
}
function wireEnds(w) {
  const a = state.nodes.find((n) => n.id === w.a.n);
  const b = state.nodes.find((n) => n.id === w.b.n);
  if (!a || !b) return null;
  const pa = S.getPort(a, w.a.p, ctx), pb = S.getPort(b, w.b.p, ctx);
  if (!pa || !pb) return null;
  return [portPos(a, pa), portPos(b, pb)];
}
function wireAt(wx, wy) {
  for (const w of state.wires) {
    const ends = wireEnds(w);
    if (!ends) continue;
    const [p1, p2] = ends;
    for (let t = 0; t <= 1; t += 0.05) {
      const q = bezPoint(p1, p2, t);
      if (Math.hypot(q.x - wx, q.y - wy) < 7 / cam.z + 3) return w;
    }
  }
  return null;
}
function bezPoint(p1, p2, t) {
  const dx = Math.max(40, Math.abs(p2.x - p1.x) / 2);
  const c1 = { x: p1.x + dx, y: p1.y }, c2 = { x: p2.x - dx, y: p2.y };
  const u = 1 - t;
  return {
    x: u * u * u * p1.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p2.x,
    y: u * u * u * p1.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p2.y,
  };
}

// ----------------------------------------------------------------- rendering

function draw(now) {
  canvas.width = innerWidth; canvas.height = innerHeight;
  cx.fillStyle = '#0a0c12';
  cx.fillRect(0, 0, canvas.width, canvas.height);
  cx.save();
  cx.translate(cam.x, cam.y);
  cx.scale(cam.z, cam.z);

  drawGrid();
  for (const d of state.deposits) drawDeposit(d);
  for (const w of state.wires) drawWire(w, now);
  if (ui.mode === 'wire' && ui.wireFrom) drawWirePreview();
  for (const n of state.nodes) drawNode(n);
  if (ui.mode === 'place' && ui.placeKey) drawGhost();
  cx.restore();
}

function drawGrid() {
  const tl = toWorld(0, 0), br = toWorld(canvas.width, canvas.height);
  const x0 = Math.max(0, Math.floor(tl.x / T)), x1 = Math.min(S.WORLD_W, Math.ceil(br.x / T));
  const y0 = Math.max(0, Math.floor(tl.y / T)), y1 = Math.min(S.WORLD_H, Math.ceil(br.y / T));
  for (let gx = x0; gx <= x1; gx++) {
    cx.strokeStyle = gx % 8 === 0 ? 'rgba(77,216,255,0.10)' : 'rgba(77,216,255,0.04)';
    cx.lineWidth = 1 / cam.z;
    cx.beginPath(); cx.moveTo(gx * T, y0 * T); cx.lineTo(gx * T, y1 * T); cx.stroke();
  }
  for (let gy = y0; gy <= y1; gy++) {
    cx.strokeStyle = gy % 8 === 0 ? 'rgba(77,216,255,0.10)' : 'rgba(77,216,255,0.04)';
    cx.beginPath(); cx.moveTo(x0 * T, gy * T); cx.lineTo(x1 * T, gy * T); cx.stroke();
  }
  cx.strokeStyle = 'rgba(77,216,255,0.35)';
  cx.lineWidth = 2 / cam.z;
  cx.strokeRect(0, 0, S.WORLD_W * T, S.WORLD_H * T);
}

function panel(x, y, w, h, edge, glow) {
  cx.beginPath();
  cx.roundRect(x, y, w, h, 6);
  cx.fillStyle = 'rgba(14,19,29,0.92)';
  cx.fill();
  cx.shadowColor = edge; cx.shadowBlur = glow;
  cx.strokeStyle = edge; cx.lineWidth = 1.6 / cam.z + 0.4;
  cx.stroke();
  cx.shadowBlur = 0;
}

function drawDeposit(d) {
  const st = DEP_STYLE[d.cat];
  const x = d.x * T, y = d.y * T, s = d.size * T;
  cx.beginPath(); cx.roundRect(x + 2, y + 2, s - 4, s - 4, 8);
  cx.fillStyle = st.fill; cx.fill();
  cx.strokeStyle = st.edge; cx.lineWidth = 1.2; cx.setLineDash([4, 3]);
  cx.stroke(); cx.setLineDash([]);
  cx.fillStyle = st.edge; cx.font = '9px monospace'; cx.textAlign = 'center';
  cx.fillText(ctx.names[d.res] ?? d.res, x + s / 2, y + s / 2 - 2);
  cx.fillText(d.purity, x + s / 2, y + s / 2 + 9);
  if (ui.sel?.type === 'deposit' && ui.sel.id === d.id) selOutline(x, y, s, s);
}

function drawNode(n) {
  const def = ctx.catalog[n.key];
  const r = nodePx(n);
  const color = TYPE_COLOR[def.type] ?? '#4dd8ff';
  panel(r.x + 1, r.y + 1, r.w - 2, r.h - 2, color, 10);

  cx.fillStyle = '#e8f6ff'; cx.font = 'bold 10px monospace'; cx.textAlign = 'center';
  cx.fillText(def.name, r.x + r.w / 2, r.y + 14, r.w - 10);
  const bad = ['no power', 'no fuel', 'no recipe'].includes(n.status);
  cx.fillStyle = bad ? '#ff7675' : '#7a8aa0'; cx.font = '9px monospace';
  cx.fillText(n.status, r.x + r.w / 2, r.y + 25, r.w - 8);

  if (def.type === 'machine' && n.recipe) {
    cx.fillStyle = '#152232';
    cx.fillRect(r.x + 8, r.y + r.h - 12, r.w - 16, 5);
    cx.fillStyle = color;
    cx.fillRect(r.x + 8, r.y + r.h - 12, (r.w - 16) * Math.min(1, n.progress), 5);
  }
  if (def.type === 'store' || def.type === 'miner') {
    const total = Object.values(n.buf).reduce((s, v) => s + v, 0);
    cx.fillStyle = '#9fb0c3'; cx.font = '9px monospace';
    cx.fillText(Math.floor(total), r.x + r.w / 2, r.y + r.h - 8);
  }

  for (const port of S.portsOf(n, ctx)) {
    const p = portPos(n, port);
    cx.beginPath(); cx.arc(p.x, p.y, 5, 0, 7);
    cx.fillStyle = '#0a0c12'; cx.fill();
    cx.lineWidth = 2; cx.strokeStyle = KIND_COLOR[port.kind];
    cx.shadowColor = KIND_COLOR[port.kind]; cx.shadowBlur = 6;
    cx.stroke(); cx.shadowBlur = 0;
    if (port.dir === 'in') { cx.beginPath(); cx.arc(p.x, p.y, 2, 0, 7); cx.fillStyle = KIND_COLOR[port.kind]; cx.fill(); }
  }
  if (ui.sel?.type === 'node' && ui.sel.id === n.id) selOutline(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
}

function selOutline(x, y, w, h) {
  cx.setLineDash([5, 4]); cx.strokeStyle = '#ffffffaa'; cx.lineWidth = 1.5 / cam.z;
  cx.strokeRect(x, y, w, h); cx.setLineDash([]);
}

function strokeWirePath(p1, p2) {
  const dx = Math.max(40, Math.abs(p2.x - p1.x) / 2);
  cx.beginPath();
  cx.moveTo(p1.x, p1.y);
  cx.bezierCurveTo(p1.x + dx, p1.y, p2.x - dx, p2.y, p2.x, p2.y);
  cx.stroke();
}

function drawWire(w, now) {
  const ends = wireEnds(w);
  if (!ends) return;
  const [p1, p2] = ends;
  const color = KIND_COLOR[w.kind];
  const selected = ui.sel?.type === 'wire' && ui.sel.id === w.id;
  cx.lineWidth = selected ? 3.5 : 2;
  cx.shadowColor = color; cx.shadowBlur = selected ? 10 : 5;
  if (w.kind === 'power') {
    cx.strokeStyle = color + 'cc';
    strokeWirePath(p1, p2);
  } else {
    cx.strokeStyle = color + '44';
    strokeWirePath(p1, p2);
    if (w.flow > 0) { // marching ants
      cx.strokeStyle = color;
      cx.setLineDash([7, 7]);
      cx.lineDashOffset = -(now / 40) % 14;
      strokeWirePath(p1, p2);
      cx.setLineDash([]);
    }
  }
  cx.shadowBlur = 0;
}

function drawWirePreview() {
  const from = ui.wireFrom;
  const p1 = portPos(from.node, from.port);
  const p2 = ui.mouse;
  const over = portAt(p2.x, p2.y);
  const ok = over && S.canConnect(from.node, from.port.id, over.node, over.port.id, state, ctx);
  cx.strokeStyle = ok ? KIND_COLOR[from.port.kind] : (over ? '#ff7675' : KIND_COLOR[from.port.kind] + '66');
  cx.lineWidth = 2; cx.setLineDash([5, 5]);
  strokeWirePath(p1, over ? portPos(over.node, over.port) : p2);
  cx.setLineDash([]);
}

function drawGhost() {
  const def = ctx.catalog[ui.placeKey];
  const gx = Math.round(ui.mouse.x / T - def.size / 2);
  const gy = Math.round(ui.mouse.y / T - def.size / 2);
  const chk = S.canPlace(state, ui.placeKey, gx, gy, ctx);
  const px = (chk.ok ? chk.snap.x : gx) * T, py = (chk.ok ? chk.snap.y : gy) * T;
  cx.globalAlpha = 0.55;
  panel(px, py, def.size * T, def.size * T, chk.ok ? '#58d68d' : '#ff7675', 12);
  cx.globalAlpha = 1;
  ui.hint = chk.ok ? `click to place ${def.name} · shift = multi · esc = cancel` : (chk.reason ?? '');
}

// -------------------------------------------------------------------- input

canvas.addEventListener('mousedown', (e) => {
  const w = toWorld(e.offsetX, e.offsetY);
  if (e.button === 1 || e.button === 2 || e.ctrlKey) { ui.drag = { pan: true, sx: e.clientX, sy: e.clientY }; return; }

  if (ui.mode === 'place') {
    const def = ctx.catalog[ui.placeKey];
    const gx = Math.round(w.x / T - def.size / 2), gy = Math.round(w.y / T - def.size / 2);
    const node = S.addNode(state, ui.placeKey, gx, gy, ctx);
    if (node) {
      select({ type: 'node', id: node.id });
      if (!e.shiftKey) setMode('idle');
    }
    return;
  }

  const port = portAt(w.x, w.y);
  if (port) { ui.mode = 'wire'; ui.wireFrom = port; return; }

  const node = nodeAt(w.x, w.y);
  if (node) {
    select({ type: 'node', id: node.id });
    ui.drag = { node, ox: w.x / T - node.x, oy: w.y / T - node.y, fx: node.x, fy: node.y };
    return;
  }
  const wire = wireAt(w.x, w.y);
  if (wire) { select({ type: 'wire', id: wire.id }); return; }
  const dep = depositAtPx(w.x, w.y);
  if (dep) { select({ type: 'deposit', id: dep.id }); return; }
  select(null);
  ui.drag = { pan: true, sx: e.clientX, sy: e.clientY };
});

canvas.addEventListener('mousemove', (e) => {
  ui.mouse = toWorld(e.offsetX, e.offsetY);
  if (ui.drag?.pan) {
    cam.x += e.clientX - ui.drag.sx; cam.y += e.clientY - ui.drag.sy;
    ui.drag.sx = e.clientX; ui.drag.sy = e.clientY;
  } else if (ui.drag?.node) {
    ui.drag.node.x = Math.round(ui.mouse.x / T - ui.drag.ox);
    ui.drag.node.y = Math.round(ui.mouse.y / T - ui.drag.oy);
  }
});

addEventListener('mouseup', () => {
  if (ui.drag?.node) {
    const n = ui.drag.node;
    const [nx, ny] = [n.x, n.y];
    // validate the move: pull the node out, re-check placement
    state.nodes = state.nodes.filter((q) => q.id !== n.id);
    const chk = S.canPlace(state, n.key, nx, ny, ctx);
    const movedToNewDeposit = chk.ok && chk.deposit && chk.deposit.id !== n.depositId;
    if (chk.ok && (nx !== ui.drag.fx || ny !== ui.drag.fy)) {
      n.x = chk.snap.x; n.y = chk.snap.y;
      if (movedToNewDeposit) {
        n.depositId = chk.deposit.id; n.depositRes = chk.deposit.res; n.depositMult = chk.deposit.mult;
      }
    } else { n.x = ui.drag.fx; n.y = ui.drag.fy; }
    state.nodes.push(n);
  }
  if (ui.mode === 'wire' && ui.wireFrom) {
    const over = portAt(ui.mouse.x, ui.mouse.y);
    if (over) {
      const from = ui.wireFrom;
      const a = state.nodes.find((q) => q.id === from.node.id);
      if (a) S.addWire(state, a, from.port.id, over.node, over.port.id, ctx);
    }
    setMode('idle');
  }
  ui.drag = null;
  refreshInspector();
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
  const z = Math.min(2.5, Math.max(0.2, cam.z * f));
  cam.x = e.offsetX - (e.offsetX - cam.x) * (z / cam.z);
  cam.y = e.offsetY - (e.offsetY - cam.y) * (z / cam.z);
  cam.z = z;
}, { passive: false });

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

addEventListener('keydown', (e) => {
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
  if (e.key === 'Escape') { setMode('idle'); select(null); }
  if ((e.key === 'Delete' || e.key === 'Backspace') && ui.sel) {
    if (ui.sel.type === 'node') {
      const n = state.nodes.find((q) => q.id === ui.sel.id);
      if (n?.key === 'the-hub') return; // keep the HUB
      S.removeNode(state, ui.sel.id);
    }
    if (ui.sel.type === 'wire') state.wires = state.wires.filter((w) => w.id !== ui.sel.id);
    select(null);
  }
});

function setMode(mode, key = null) {
  ui.mode = mode; ui.placeKey = key; ui.wireFrom = null; ui.hint = '';
  document.querySelectorAll('.pal-item').forEach((el) =>
    el.classList.toggle('active', mode === 'place' && el.dataset.key === key));
}
function select(sel) { ui.sel = sel; refreshInspector(); }

// ----------------------------------------------------------------- DOM panels

function buildPalette() {
  const groups = [
    ['Miners', Object.values(ctx.catalog).filter((d) => d.type === 'miner')],
    ['Production', Object.values(ctx.catalog).filter((d) => d.type === 'machine')],
    ['Power', Object.values(ctx.catalog).filter((d) => d.type === 'generator')],
    ['Logistics', Object.values(ctx.catalog).filter((d) => d.type === 'store')],
  ];
  const pal = document.getElementById('palette');
  pal.innerHTML = '';
  for (const [title, defs] of groups) {
    const g = document.createElement('div');
    g.className = 'pal-group';
    g.innerHTML = `<h3>${title}</h3>`;
    for (const def of defs) {
      const el = document.createElement('div');
      el.className = 'pal-item';
      el.dataset.key = def.key;
      const meta = def.powerOut ? `+${def.powerOut}MW` : def.draw ? `${def.draw}MW` : '';
      el.innerHTML = `<span>${def.name}</span><small>${meta}</small>`;
      el.onclick = () => setMode(ui.placeKey === def.key ? 'idle' : 'place', ui.placeKey === def.key ? null : def.key);
      g.appendChild(el);
    }
    pal.appendChild(g);
  }
}

const fmt = (v) => (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10);

function refreshInspector() {
  const box = document.getElementById('inspector');
  if (!ui.sel) { box.innerHTML = '<div class="dim">Nothing selected</div>'; return; }

  if (ui.sel.type === 'deposit') {
    const d = state.deposits.find((q) => q.id === ui.sel.id);
    if (!d) return select(null);
    box.innerHTML = `<h2>${ctx.names[d.res] ?? d.res}</h2>
      <div class="dim">${d.cat} deposit · ${d.purity} (x${d.mult})</div>
      <section class="dim">Place a ${d.cat === 'mineral' ? 'miner' : d.cat === 'oil' ? 'Oil Extractor' : 'Water Extractor'} on it.</section>`;
    return;
  }
  if (ui.sel.type === 'wire') {
    const w = state.wires.find((q) => q.id === ui.sel.id);
    if (!w) return select(null);
    box.innerHTML = `<h2>${w.kind} wire</h2>
      <div class="dim">flow: ${fmt(w.flow * 60)}/min</div>
      <section><button class="danger" id="del">Delete (Del)</button></section>`;
    box.querySelector('#del').onclick = () => { state.wires = state.wires.filter((q) => q.id !== w.id); select(null); };
    return;
  }

  const n = state.nodes.find((q) => q.id === ui.sel.id);
  if (!n) return select(null);
  const def = ctx.catalog[n.key];
  const statusCls = ['no power', 'no fuel', 'no recipe'].includes(n.status) ? 'bad'
    : ['waiting for input', 'output full', 'full', 'idle'].includes(n.status) ? 'warn' : 'good';
  let html = `<h2>${def.name}</h2><div class="status ${statusCls}">${n.status}</div>`;
  if (n.depositRes) html += `<div class="dim">on ${ctx.names[n.depositRes]} (x${n.depositMult})</div>`;
  if (def.draw) html += `<div class="dim">draws ${def.draw} MW</div>`;
  if (def.powerOut) html += `<div class="dim">supplies ${def.powerOut} MW</div>`;

  if (def.type === 'machine') {
    const recipes = ctx.recipesByCat[def.cat] ?? [];
    html += `<section><label class="dim">Recipe</label><select id="recipe">
      <option value="">— none —</option>
      ${recipes.map((r) => `<option value="${r.key_name}" ${n.recipe === r.key_name ? 'selected' : ''}>${r.name}</option>`).join('')}
    </select><div class="dim" id="recipe-io"></div></section>`;
  }
  html += `<section id="bufs"></section>`;
  if (n.key !== 'the-hub') html += `<section><button class="danger" id="del">Delete (Del)</button></section>`;
  else html += `<section class="dim">Shipped:<div id="bufs2"></div></section>`;
  box.innerHTML = html;

  const sel = box.querySelector('#recipe');
  if (sel) {
    sel.onchange = () => { S.setRecipe(state, n, sel.value || null, ctx); refreshInspector(); };
    const r = ctx.recipeByKey[n.recipe];
    if (r) {
      box.querySelector('#recipe-io').textContent =
        r.ingredients.map(([k, a]) => `${a} ${ctx.names[k] ?? k}`).join(' + ') + ' → ' +
        r.products.map(([k, a]) => `${a} ${ctx.names[k] ?? k}`).join(' + ') + ` (${r.time}s)`;
    }
  }
  const del = box.querySelector('#del');
  if (del) del.onclick = () => { S.removeNode(state, n.id); select(null); };
  updateBuffers();
}

function updateBuffers() {
  if (ui.sel?.type !== 'node') return;
  const n = state.nodes.find((q) => q.id === ui.sel.id);
  if (!n) return;
  const render = (buf) => Object.entries(buf).filter(([, v]) => v > 0.05)
    .map(([k, v]) => `<div class="buf"><span>${ctx.names[k] ?? k}</span><span>${fmt(v)}</span></div>`)
    .join('') || '<div class="dim">empty</div>';
  const bufs = document.getElementById('bufs');
  if (bufs) bufs.innerHTML = render(n.buf);
  const shipped = document.getElementById('bufs2');
  if (shipped) shipped.innerHTML = render(state.shipped);
}

function updateHud() {
  const p = state.power ?? { supply: 0, demand: 0 };
  document.getElementById('hud-power').textContent = `⚡ ${fmt(p.demand)} / ${fmt(p.supply)} MW`;
  const total = Object.values(state.shipped).reduce((s, v) => s + v, 0);
  document.getElementById('hud-shipped').textContent = `📦 ${Math.floor(total)} shipped`;
  document.getElementById('hud-hint').textContent = ui.hint ||
    (ui.mode === 'wire' ? 'drag to a matching port' : 'drag ports to wire · right-drag to pan · wheel to zoom');
}

// --------------------------------------------------------------- persistence

function save() { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* corrupt save -> new game */ }
  return null;
}

// --------------------------------------------------------------------- main

async function main() {
  const data = await (await fetch('data/source/satisfactory_data.json')).json();
  ctx = S.buildCtx(data);
  state = load() ?? S.newGame((Math.random() * 1e9) | 0, ctx);
  buildPalette();

  const hub = state.nodes.find((n) => n.key === 'the-hub');
  cam.z = 0.9;
  if (hub) {
    cam.x = innerWidth / 2 - (hub.x + 2) * T * cam.z;
    cam.y = innerHeight / 2 - (hub.y + 2) * T * cam.z;
  }

  document.getElementById('btn-reset').onclick = () => {
    if (!confirm('Abandon this factory and generate a new map?')) return;
    state = S.newGame((Math.random() * 1e9) | 0, ctx);
    select(null); save();
  };
  setInterval(save, 5000);
  addEventListener('beforeunload', save);
  setInterval(updateBuffers, 400);

  let last = performance.now(), acc = 0;
  const STEP = 0.1;
  function frame(now) {
    acc += Math.min(0.5, (now - last) / 1000); last = now;
    while (acc >= STEP) { S.tick(state, STEP, ctx); acc -= STEP; }
    draw(now);
    updateHud();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main();

// dev/debug hook (also used by the headless smoke driver)
window.gw = {
  S, cam,
  get state() { return state; },
  get ctx() { return ctx; },
  portScreen(nodeId, portId) {
    const n = state.nodes.find((q) => q.id === nodeId);
    const p = portPos(n, S.getPort(n, portId, ctx));
    return { x: p.x * cam.z + cam.x, y: p.y * cam.z + cam.y };
  },
  toScreen(wx, wy) { return { x: wx * cam.z + cam.x, y: wy * cam.z + cam.y }; },
};
