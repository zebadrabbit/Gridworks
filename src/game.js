// game.js — canvas rendering + input. Logic lives in sim.js.
import * as S from './sim.js';

const T = S.TILE;
const SAVE_KEY = 'gridworks-save-v2';
const KIND_COLOR = { item: '#58d68d', fluid: '#5dade2', power: '#f4d03f', resource: '#e17055' };
const TYPE_COLOR = {
  miner: '#f5a623', machine: '#4dd8ff', store: '#a29bfe',
  generator: '#f4d03f', hub: '#ff6b81', deposit: '#8d6e63', logistic: '#58d68d',
  elevator: '#c084fc',
};
// status-light colors, matching .status.bad/.warn/.good in style.css.
// no white entry: overclocking, the only thing that would emit it, does not exist yet.
const LIGHT_COLOR = { red: '#ff7675', yellow: '#f4d03f', green: '#58d68d' };
const DEP_STYLE = {
  mineral: { fill: '#241c14', edge: '#8d6e63' },
  oil: { fill: '#15151c', edge: '#7d7d8f' },
  water: { fill: '#0d2230', edge: '#38bdf8' },
  plant: { fill: '#12240f', edge: '#7bed9f' },
};

const canvas = document.getElementById('canvas');
const cx = canvas.getContext('2d');
const tip = document.createElement('div');
tip.id = 'tooltip';
document.body.appendChild(tip);
let ctx, state;
const cam = { x: 0, y: 0, z: 1 };
const ui = { mode: 'idle', placeKey: null, wireFrom: null, sel: null, hover: null,
  mouse: { x: 0, y: 0 }, drag: null, hint: '', wireStyle: 'noodle',
  paused: false, speed: 1 };

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
    if (distToPath(wirePath(ends[0], ends[1], w), wx, wy) < 7 / cam.z + 3) return w;
  }
  return null;
}

function handleAt(wx, wy) {
  if (ui.sel?.type !== 'wire') return null;
  const w = state.wires.find((q) => q.id === ui.sel.id);
  if (!w || w.style !== 'straight') return null;
  for (let i = 0; i < w.pts.length; i++) {
    if (Math.hypot(w.pts[i].x - wx, w.pts[i].y - wy) < 8 / cam.z + 3) return { w, i };
  }
  return null;
}

function wirePath(p1, p2, w) {
  if (w?.style === 'straight') return [p1, ...w.pts, p2];
  // noodle: sample the cubic bezier
  const dx = Math.max(40, Math.abs(p2.x - p1.x) / 2);
  const c1 = { x: p1.x + dx, y: p1.y }, c2 = { x: p2.x - dx, y: p2.y };
  const pts = [];
  const N = 32; // ponytail: fixed sampling, plenty smooth at max zoom 2.5
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    pts.push({
      x: u * u * u * p1.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p2.x,
      y: u * u * u * p1.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p2.y,
    });
  }
  return pts;
}

function strokePts(pts) {
  cx.beginPath();
  cx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) cx.lineTo(pts[i].x, pts[i].y);
  cx.stroke();
}

function distToPath(pts, wx, wy) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const vx = b.x - a.x, vy = b.y - a.y;
    const len2 = vx * vx + vy * vy;
    const t = len2 ? Math.max(0, Math.min(1, ((wx - a.x) * vx + (wy - a.y) * vy) / len2)) : 0;
    best = Math.min(best, Math.hypot(a.x + t * vx - wx, a.y + t * vy - wy));
  }
  return best;
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

function drawNode(n) {
  const def = ctx.catalog[n.key];
  const r = nodePx(n);
  const light = S.lightOf(n, def);
  const color = LIGHT_COLOR[light] ?? TYPE_COLOR[def.type] ?? '#4dd8ff';

  if (def.type === 'deposit') {
    const st = DEP_STYLE[n.cat];
    cx.beginPath(); cx.roundRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 8);
    cx.fillStyle = st.fill; cx.fill();
    cx.strokeStyle = st.edge; cx.lineWidth = 1.2; cx.setLineDash([4, 3]);
    cx.stroke(); cx.setLineDash([]);
    cx.fillStyle = st.edge; cx.font = '9px monospace'; cx.textAlign = 'center';
    cx.fillText(ctx.names[n.res] ?? n.res, r.x + r.w / 2, r.y + r.h / 2 - 2);
    cx.fillText(n.purity, r.x + r.w / 2, r.y + r.h / 2 + 9);
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
    return;
  }

  panel(r.x + 1, r.y + 1, r.w - 2, r.h - 2, color, 10);

  cx.fillStyle = '#e8f6ff'; cx.font = 'bold 10px monospace'; cx.textAlign = 'center';
  cx.fillText(def.name, r.x + r.w / 2, r.y + 14, r.w - 10);
  cx.fillStyle = light === 'red' ? LIGHT_COLOR.red : '#7a8aa0'; cx.font = '9px monospace';
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

function drawWire(w, now) {
  const ends = wireEnds(w);
  if (!ends) return;
  const pts = wirePath(ends[0], ends[1], w);
  const color = KIND_COLOR[w.kind];
  const selected = ui.sel?.type === 'wire' && ui.sel.id === w.id;
  cx.lineWidth = selected ? 3.5 : (w.kind === 'fluid' ? 3 : 2);
  cx.shadowColor = color; cx.shadowBlur = selected ? 10 : 5;
  if (w.kind === 'power') {
    cx.strokeStyle = color + 'cc';
    strokePts(pts);
  } else {
    cx.strokeStyle = color + '44';
    strokePts(pts);
    if (w.flow > 0) { // marching ants
      cx.strokeStyle = color;
      cx.setLineDash([7, 7]);
      cx.lineDashOffset = -(now / 40) * (1 + (w.mark ?? 0) * 0.4) % 14;
      strokePts(pts);
      cx.setLineDash([]);
    }
  }
  cx.shadowBlur = 0;
  if (selected && w.style === 'straight') {
    for (let i = 0; i < w.pts.length; i++) {
      const p = w.pts[i];
      const s = 5 / cam.z + 2;
      cx.fillStyle = ui.sel.wp === i ? '#ffffff' : color;
      cx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
  }
}

function drawWirePreview() {
  const from = ui.wireFrom;
  const p1 = portPos(from.node, from.port);
  const p2 = ui.mouse;
  const over = portAt(p2.x, p2.y);
  const ok = over && S.canConnect(from.node, from.port.id, over.node, over.port.id, state, ctx);
  cx.strokeStyle = ok ? KIND_COLOR[from.port.kind] : (over ? '#ff7675' : KIND_COLOR[from.port.kind] + '66');
  cx.lineWidth = 2; cx.setLineDash([5, 5]);
  strokePts(wirePath(p1, over ? portPos(over.node, over.port) : p2, { style: ui.wireStyle, pts: [] }));
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

function updateTooltip(e) {
  if (ui.drag || ui.mode !== 'idle') { tip.style.display = 'none'; return; }
  let html = '';
  const port = portAt(ui.mouse.x, ui.mouse.y);
  if (port) {
    const { node, port: p } = port;
    html = `<b>${p.dir === 'in' ? 'input' : 'output'}</b> · ${p.kind}`;
    if (p.res) html += `<div class="dim">${ctx.names[p.res] ?? p.res}</div>`;
    else if (p.accepts) html += `<div class="dim">accepts: ${p.accepts.map((r) => ctx.names[r] ?? r).join(', ')}</div>`;
    html += `<div class="dim">${ctx.catalog[node.key].name}</div>`;
  } else {
    const w = wireAt(ui.mouse.x, ui.mouse.y);
    if (w) {
      if (w.kind === 'power') {
        html = `<b>power line</b>`;
      } else {
        const a = state.nodes.find((n) => n.id === w.a.n);
        const b = state.nodes.find((n) => n.id === w.b.n);
        const res = (a && S.getPort(a, w.a.p, ctx)?.res) ?? (b && S.getPort(b, w.b.p, ctx)?.res);
        const markName = w.kind === 'fluid' ? ctx.pipes[w.mark ?? 0]?.name : ctx.belts[w.mark ?? 0]?.name;
        html = `<b>${res ? (ctx.names[res] ?? res) : 'idle'}</b> · ${Math.round(w.flow * 60)}/min`;
        if (markName) html += `<div class="dim">${markName}</div>`;
      }
    }
  }
  if (!html) { tip.style.display = 'none'; return; }
  tip.innerHTML = html;
  tip.style.display = 'block';
  tip.style.left = (e.clientX + 14) + 'px';
  tip.style.top = (e.clientY + 14) + 'px';
}

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

  const h = handleAt(w.x, w.y);
  if (h) { ui.sel = { type: 'wire', id: h.w.id, wp: h.i }; ui.drag = { wp: h }; return; }

  const port = portAt(w.x, w.y);
  if (port) { ui.mode = 'wire'; ui.wireFrom = port; return; }

  const node = nodeAt(w.x, w.y);
  if (node) {
    select({ type: 'node', id: node.id });
    if (!node.fixed) ui.drag = { node, ox: w.x / T - node.x, oy: w.y / T - node.y, fx: node.x, fy: node.y };
    return;
  }
  const wire = wireAt(w.x, w.y);
  if (wire) { select({ type: 'wire', id: wire.id }); return; }
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
  } else if (ui.drag?.wp) {
    const { w, i } = ui.drag.wp;
    w.pts[i] = { x: ui.mouse.x, y: ui.mouse.y };
  }
  updateTooltip(e);
});

addEventListener('mouseup', () => {
  if (ui.drag?.node) {
    const n = ui.drag.node;
    const [nx, ny] = [n.x, n.y];
    // validate the move: pull the node out, re-check placement
    state.nodes = state.nodes.filter((q) => q.id !== n.id);
    const chk = S.canPlace(state, n.key, nx, ny, ctx);
    if (chk.ok && (nx !== ui.drag.fx || ny !== ui.drag.fy)) {
      n.x = chk.snap.x; n.y = chk.snap.y;
    } else { n.x = ui.drag.fx; n.y = ui.drag.fy; }
    state.nodes.push(n);
  }
  if (ui.mode === 'wire' && ui.wireFrom) {
    const over = portAt(ui.mouse.x, ui.mouse.y);
    if (over) {
      const from = ui.wireFrom;
      const a = state.nodes.find((q) => q.id === from.node.id);
      if (a) {
        const nw = S.addWire(state, a, from.port.id, over.node, over.port.id, ctx);
        if (nw) nw.style = ui.wireStyle;
      }
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

canvas.addEventListener('dblclick', (e) => {
  const p = toWorld(e.offsetX, e.offsetY);
  const wire = wireAt(p.x, p.y);
  if (!wire || wire.style !== 'straight') return;
  const ends = wireEnds(wire);
  if (!ends) return;
  const pts = [ends[0], ...wire.pts, ends[1]];
  let best = 0, bestD = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToPath([pts[i], pts[i + 1]], p.x, p.y);
    if (d < bestD) { bestD = d; best = i; }
  }
  wire.pts.splice(best, 0, { x: p.x, y: p.y });
  select({ type: 'wire', id: wire.id, wp: best });
});

addEventListener('keydown', (e) => {
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
  if (e.key === 'Escape') { setMode('idle'); select(null); }
  if ((e.key === 'Delete' || e.key === 'Backspace') && ui.sel) {
    if (ui.sel.type === 'node') {
      const n = state.nodes.find((q) => q.id === ui.sel.id);
      if (n?.key === 'the-hub') return; // keep the HUB
      S.removeNode(state, ui.sel.id);
    }
    if (ui.sel.type === 'wire') {
      const w = state.wires.find((q) => q.id === ui.sel.id);
      if (w && ui.sel.wp != null && w.pts[ui.sel.wp]) {
        w.pts.splice(ui.sel.wp, 1);
        select({ type: 'wire', id: w.id });
        return;
      }
      S.removeWire(state, ui.sel.id);
    }
    select(null);
  }
  if (e.key === 's' || e.key === 'S') {
    if (ui.sel?.type === 'wire') {
      const w = state.wires.find((q) => q.id === ui.sel.id);
      if (w) { w.style = w.style === 'straight' ? 'noodle' : 'straight'; select({ type: 'wire', id: w.id }); }
    } else {
      ui.wireStyle = ui.wireStyle === 'straight' ? 'noodle' : 'straight';
      ui.hint = `new wires: ${ui.wireStyle} · S to toggle`;
    }
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
    ['Logistics', Object.values(ctx.catalog).filter((d) => d.type === 'store' || d.type === 'logistic')],
    ['Special', Object.values(ctx.catalog).filter((d) => d.type === 'elevator')],
  ];
  const pal = document.getElementById('palette');
  pal.innerHTML = '';
  for (const [title, defs] of groups) {
    const g = document.createElement('div');
    g.className = 'pal-group';
    g.innerHTML = `<h3>${title}</h3>`;
    for (const def of defs) {
      const el = document.createElement('div');
      const locked = !S.isUnlocked(state, def.key);
      el.className = locked ? 'pal-item locked' : 'pal-item';
      el.dataset.key = def.key;
      const meta = locked ? (S.MILESTONES.find((m) => m.rewards.buildings?.includes(def.key))?.name ?? '')
        : def.powerOut ? `+${def.powerOut}MW` : def.draw ? `${def.draw}MW` : '';
      el.innerHTML = `<span>${def.name}</span><small>${meta}</small>`;
      el.onclick = () => setMode(ui.placeKey === def.key ? 'idle' : 'place', ui.placeKey === def.key ? null : def.key);
      g.appendChild(el);
    }
    pal.appendChild(g);
  }
  document.querySelectorAll('.pal-item').forEach((el) =>
    el.classList.toggle('active', ui.mode === 'place' && el.dataset.key === ui.placeKey));
}

const fmt = (v) => (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10);

function refreshInspector() {
  const box = document.getElementById('inspector');
  if (!ui.sel) { box.innerHTML = '<div class="dim">Nothing selected</div>'; return; }

  if (ui.sel.type === 'wire') {
    const w = state.wires.find((q) => q.id === ui.sel.id);
    if (!w) return select(null);
    const marks = w.kind === 'fluid' ? ctx.pipes : (w.kind === 'item' ? ctx.belts : null);
    const maxMark = w.kind === 'fluid' ? (state.pipeMark ?? ctx.pipes.length - 1) : (state.beltMark ?? ctx.belts.length - 1);
    const markHtml = marks ? `<section><label class="dim">Tier</label><select id="mark">
      ${Array.from({ length: maxMark + 1 }, (_, i) =>
        `<option value="${i}" ${w.mark === i ? 'selected' : ''}>${marks[i].rate}/min</option>`).join('')}
    </select></section>` : '';
    box.innerHTML = `<h2>${w.kind} wire</h2>
      <div class="dim">flow: ${fmt(w.flow * 60)}/min</div>
      ${markHtml}
      <section><button class="danger" id="del">Delete (Del)</button></section>`;
    const markSel = box.querySelector('#mark');
    if (markSel) markSel.onchange = () => { w.mark = +markSel.value; refreshInspector(); };
    box.querySelector('#del').onclick = () => { S.removeWire(state, w.id); select(null); };
    return;
  }

  const n = state.nodes.find((q) => q.id === ui.sel.id);
  if (!n) return select(null);
  const def = ctx.catalog[n.key];

  if (def.type === 'deposit') {
    const used = state.wires.filter((w) => w.a.n === n.id || w.b.n === n.id).length;
    const total = S.portsOf(n, ctx).length;
    box.innerHTML = `<h2>${ctx.names[n.res] ?? n.res}</h2>
      <div class="dim">${n.cat} deposit · ${n.purity} (x${n.mult})</div>
      <section class="dim">${used}/${total} ports wired</section>
      ${n.cat === 'plant' ? '<section id="bufs"></section>' : ''}`;
    if (n.cat === 'plant') updateBuffers();
    return;
  }

  const statusCls = { red: 'bad', yellow: 'warn', green: 'good' }[S.lightOf(n, def)] ?? '';
  let html = `<h2>${def.name}</h2><div class="status ${statusCls}">${n.status}</div>`;
  if (['miner', 'machine', 'generator'].includes(def.type)) {
    const lived = (n.tGreen ?? 0) + (n.tYellow ?? 0) + (n.tRed ?? 0);
    const uptime = lived > 0 ? `${Math.round(((n.tGreen ?? 0) / lived) * 100)}% uptime` : '—';
    const made = n.made != null ? ` · ${Math.floor(n.made).toLocaleString()} produced` : '';
    html += `<div class="dim">${uptime}${made}</div>`;
  }
  if (n.depositRes) html += `<div class="dim">on ${ctx.names[n.depositRes]} (x${n.depositMult})</div>`;
  else if (def.type === 'miner') html += `<div class="dim">wire a deposit to res port</div>`;
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

function updateMilestonePanel() {
  const box = document.getElementById('milestone');
  const idx = state.unlocked?.milestone ?? 0;
  const ms = S.MILESTONES[idx];
  const bars = (cost, progress) => Object.entries(cost).map(([res, amt]) => {
    const have = fmt(progress[res] ?? 0);
    const pct = Math.min(100, (Math.min(amt, have) / amt) * 100);
    return `<div class="ms-row"><span>${ctx.names[res] ?? res}</span><span>${Math.min(amt, have)}/${amt}</span></div>
      <div class="ms-bar"><i style="width:${pct}%"></i></div>`;
  }).join('');
  if (ms) { box.innerHTML = `<h3>${ms.name}</h3>${bars(ms.cost, state.msProgress)}`; return; }
  const ph = S.ELEVATOR_PHASES[state.elevator?.phase ?? 0];
  if (!ph) { box.innerHTML = `<h3>Project Assembly</h3><div class="dim">🚀 Complete — you win!</div>`; return; }
  if (!state.nodes.some((n) => n.key === 'space-elevator')) {
    box.innerHTML = `<h3>Project Assembly</h3><div class="dim">Build the Space Elevator</div>`;
    return;
  }
  box.innerHTML = `<h3>Phase ${(state.elevator.phase ?? 0) + 1}: ${ph.name}</h3>${bars(ph.cost, state.elevator.progress)}`;
}

// Red machines are listed one per node. A brownout is a property of a power network, so
// it is listed once per network — twelve entries for one cause is the noise this removes.
function alertList() {
  const out = [];
  const nets = {};
  for (const n of state.nodes) {
    const def = ctx.catalog[n.key];
    if (S.lightOf(n, def) === 'red') out.push({ id: n.id, text: `${def.name} — ${n.status}` });
    // ratio 0 means the network is dead, and those machines are already listed as red
    if (n._net != null && n.ratio > 0 && n.ratio < S.THROTTLE_LIGHT) (nets[n._net] ??= []).push(n);
  }
  for (const group of Object.values(nets)) {
    out.push({ id: group[0].id, warn: true,
      text: `${group.length} machines throttled — grid at ${Math.round(group[0].ratio * 100)}%` });
  }
  return out;
}

function panTo(id) {
  const n = state.nodes.find((q) => q.id === id);
  if (!n) return;
  const half = ctx.catalog[n.key].size / 2;
  cam.x = innerWidth / 2 - (n.x + half) * T * cam.z;
  cam.y = innerHeight / 2 - (n.y + half) * T * cam.z;
  select({ type: 'node', id });
}

function refreshAlerts() {
  const chip = document.getElementById('hud-alerts');
  const box = document.getElementById('alerts');
  const list = alertList();
  chip.textContent = `⚠ ${list.length}`;
  chip.style.display = list.length ? '' : 'none';
  if (!list.length) box.classList.remove('open');
  if (!box.classList.contains('open')) return;
  box.style.left = chip.getBoundingClientRect().left + 'px';
  box.innerHTML = '';
  for (const a of list) {
    const el = document.createElement('div');
    el.className = a.warn ? 'alert warn' : 'alert';
    el.textContent = a.text;
    el.onclick = () => panTo(a.id);
    box.appendChild(el);
  }
}

function updateHud() {
  const p = state.power ?? { supply: 0, demand: 0 };
  document.getElementById('hud-power').textContent = `⚡ ${fmt(p.demand)} / ${fmt(p.supply)} MW`;
  const total = Object.values(state.shipped).reduce((s, v) => s + v, 0);
  document.getElementById('hud-shipped').textContent = `📦 ${Math.floor(total)} shipped`;
  document.getElementById('hud-seed').textContent = `🌱 ${state.seed}`;
  document.getElementById('hud-hint').textContent = ui.hint ||
    (ui.mode === 'wire' ? 'drag to a matching port' : 'drag ports to wire · right-drag to pan · wheel to zoom');
}

// --------------------------------------------------------------- persistence

function save() {
  state.savedAt = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(state, (k, v) => (k === '_net' ? undefined : v)));
}
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return S.normalizeSave(JSON.parse(raw), ctx);
  } catch { /* corrupt save -> new game */ }
  return null;
}

// --------------------------------------------------------------------- main

const fmtDur = (s) => {
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('fade'), 7000);
  setTimeout(() => el.remove(), 8000);
}

async function main() {
  const data = await (await fetch('data/source/satisfactory_data.json')).json();
  ctx = S.buildCtx(data);
  state = load() ?? S.newGame((Math.random() * 1e9) | 0, ctx);
  const away = state.savedAt ? (Date.now() - state.savedAt) / 1000 : 0;
  if (away > 60) {
    const before = Object.values(state.shipped).reduce((s, v) => s + v, 0);
    const simulated = S.simulateOffline(state, away, ctx);
    const gained = Object.values(state.shipped).reduce((s, v) => s + v, 0) - before;
    toast(`Welcome back — simulated ${fmtDur(simulated)} of offline progress` +
      (gained >= 1 ? ` · shipped ${Math.floor(gained)} items` : ''));
  }
  buildPalette();

  const hub = state.nodes.find((n) => n.key === 'the-hub');
  cam.z = 0.9;
  if (hub) {
    cam.x = innerWidth / 2 - (hub.x + 2) * T * cam.z;
    cam.y = innerHeight / 2 - (hub.y + 2) * T * cam.z;
  }

  const hashSeed = (str) => {
    let h = 2166136261;
    for (const c of str) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  const startFresh = (seed) => {
    state = S.newGame(seed, ctx);
    lastPhase = state.elevator?.phase ?? 0;
    select(null); save(); buildPalette(); updateMilestonePanel();
  };
  document.getElementById('btn-reset').onclick = () => {
    if (!confirm('Abandon this factory and generate a new map?')) return;
    const input = prompt('Map seed (blank = random):', '');
    if (input === null) return;
    const t = input.trim();
    startFresh(t === '' ? (Math.random() * 1e9) | 0 : /^\d+$/.test(t) ? parseInt(t, 10) >>> 0 : hashSeed(t));
  };

  document.getElementById('btn-export').onclick = () => {
    save();
    const blob = new Blob([localStorage.getItem(SAVE_KEY)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gridworks-save-${state.seed}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const fileInput = document.getElementById('file-import');
  document.getElementById('btn-import').onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const f = fileInput.files[0];
    fileInput.value = '';
    if (!f) return;
    try {
      const s = S.normalizeSave(JSON.parse(await f.text()), ctx);
      if (!s) throw new Error('not a Gridworks save');
      state = s;
      lastPhase = state.elevator?.phase ?? 0;
      select(null); save(); buildPalette(); updateMilestonePanel();
      toast('Save imported');
    } catch (err) { alert('Import failed: ' + err.message); }
  };

  const pauseBtn = document.getElementById('btn-pause');
  const speedBtn = document.getElementById('btn-speed');
  const togglePause = () => { ui.paused = !ui.paused; pauseBtn.textContent = ui.paused ? '▶' : '⏸'; };
  pauseBtn.onclick = togglePause;
  speedBtn.onclick = () => {
    ui.speed = ui.speed >= 4 ? 1 : ui.speed * 2;
    speedBtn.textContent = ui.speed + 'x';
  };
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
    if (e.key === ' ') { e.preventDefault(); togglePause(); }
  });

  document.getElementById('hud-alerts').onclick = () => {
    document.getElementById('alerts').classList.toggle('open');
    refreshAlerts();
  };

  setInterval(save, 5000);
  addEventListener('beforeunload', save);
  setInterval(updateBuffers, 400);
  setInterval(updateMilestonePanel, 400);
  setInterval(refreshAlerts, 400);
  updateMilestonePanel();

  let last = performance.now(), acc = 0, lastMs = -1, lastPhase = state.elevator?.phase ?? 0;
  const STEP = 0.1;
  function frame(now) {
    acc += Math.min(0.5, (now - last) / 1000) * (ui.paused ? 0 : ui.speed); last = now;
    while (acc >= STEP) { S.tick(state, STEP, ctx); acc -= STEP; }
    if ((state.unlocked?.milestone ?? 0) !== lastMs) { lastMs = state.unlocked?.milestone ?? 0; buildPalette(); }
    const phase = state.elevator?.phase ?? 0;
    if (phase !== lastPhase) {
      lastPhase = phase;
      toast(phase >= S.ELEVATOR_PHASES.length
        ? '🚀 Project Assembly complete — you win!'
        : `Space Elevator phase ${phase} complete`);
    }
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
