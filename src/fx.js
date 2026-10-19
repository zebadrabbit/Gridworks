// fx.js — presentation-only effects. Owns transient visual state; saves nothing; never touches
// sim state. Pure helpers take numbers/arrays so they run in Node without a DOM.
import { settings } from './settings.js';

// ------------------------------------------------------------------ square wire routing
// A square wire leaves its port straight for STUB px, then only ever turns 90°; same on the way
// in. Sides are the port's tile edge ('E' out, 'W' in, 'N' power). Waypoints are forced corners.
const STUB = 16;
const NORMAL = { E: [1, 0], W: [-1, 0], N: [0, -1] };
export function squarePath(p1, s1, p2, s2, wps = []) {
  const [nx1, ny1] = NORMAL[s1] ?? NORMAL.E, [nx2, ny2] = NORMAL[s2] ?? NORMAL.W;
  const a = { x: p1.x + nx1 * STUB, y: p1.y + ny1 * STUB };
  const b = { x: p2.x + nx2 * STUB, y: p2.y + ny2 * STUB };
  const pts = [p1, a];
  if (s1 === 'N' && s2 === 'N') {                  // power: inverted U over the higher port
    const top = Math.min(a.y, b.y);
    pts.push({ x: a.x, y: top }, { x: b.x, y: top });
  } else if (wps.length) {                         // every leg horizontal first, then vertical,
    let cur = a;                                   // so each corner is arrived at vertically
    for (const w of [...wps, b]) { pts.push({ x: w.x, y: cur.y }, w); cur = w; }
    pts.pop();
  } else if ((b.x - a.x) * nx1 >= 0) {             // target ahead: Z, vertical run at mid x
    const mx = (a.x + b.x) / 2;
    pts.push({ x: mx, y: a.y }, { x: mx, y: b.y });
  } else {                                         // target behind: go round at mid y
    let my = (a.y + b.y) / 2;
    if (Math.abs(a.y - b.y) < 40) my = Math.min(a.y, b.y) - 40;
    pts.push({ x: a.x, y: my }, { x: b.x, y: my });
  }
  pts.push(b, p2);
  const out = [pts[0]];                            // drop zero-length legs, merge collinear ones
  for (const q of pts.slice(1)) {
    const l = out[out.length - 1], k = out[out.length - 2];
    if (q.x === l.x && q.y === l.y) continue;
    if (k && ((k.x === l.x && l.x === q.x) || (k.y === l.y && l.y === q.y))) out[out.length - 1] = q;
    else out.push(q);
  }
  return out;
}

// ------------------------------------------------------------------ flow capsules
// Spacing between shapes: 40px at a trickle, 10px at (or above) belt capacity.
export const spacingFor = (ratio) => 40 - 30 * Math.min(1, Math.max(0, ratio));

export function pathLengths(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { cum, len: cum[cum.length - 1] };
}

// Point at distance d along the polyline, with the segment angle.
export function pointAt(pts, cum, d) {
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1] || 1;
  const t = (d - cum[i - 1]) / seg;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, a: Math.atan2(b.y - a.y, b.x - a.x) };
}

// ponytail: path measured every frame; ~33 hypot per wire is cheaper than a correct cache key
export function flow(cx, w, pts, ratio, speedMul, now, color) {
  if (!settings.flow || !(ratio > 0)) return;
  const { cum, len } = pathLengths(pts);
  const spacing = spacingFor(ratio);
  const count = Math.floor(len / spacing);
  if (count < 1) return;
  const offset = ((now / 40) * speedMul) % spacing;
  // Batched per wire: one path/stroke (or fill) for every capsule instead of one save/restore
  // each — same pixels, far fewer canvas calls on wire-dense maps.
  cx.beginPath();
  if (w.kind === 'fluid') {
    for (let i = 0; i < count; i++) {
      const p = pointAt(pts, cum, (offset + i * spacing) % len);
      cx.moveTo(p.x + 2, p.y);
      cx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    }
    cx.fillStyle = color;
    cx.fill();
  } else {
    for (let i = 0; i < count; i++) {
      const p = pointAt(pts, cum, (offset + i * spacing) % len);
      const dx = Math.cos(p.a) * 3, dy = Math.sin(p.a) * 3;
      cx.moveTo(p.x - dx, p.y - dy);
      cx.lineTo(p.x + dx, p.y + dy);
    }
    cx.lineCap = 'round'; cx.lineWidth = 3; cx.strokeStyle = color;
    cx.stroke();
    cx.lineCap = 'butt';
  }
}

// ------------------------------------------------------------------ status pulses
// One expanding ring per status *change*; a steady tile never animates.
const PULSE_MS = 500;
const pulses = [];
export function pulse(rect, color, now) {
  if (!settings.pulses) return;
  pulses.push({ ...rect, color, t0: now });
}
export function drawPulses(cx, now) {
  for (let i = pulses.length - 1; i >= 0; i--) {
    const p = pulses[i], k = (now - p.t0) / PULSE_MS;
    if (k >= 1) { pulses.splice(i, 1); continue; }
    const grow = 8 * k;
    cx.globalAlpha = 1 - k;
    cx.strokeStyle = p.color; cx.lineWidth = 2;
    cx.beginPath(); cx.roundRect(p.x - grow, p.y - grow, p.w + 2 * grow, p.h + 2 * grow, 6 + grow); cx.stroke();
  }
  cx.globalAlpha = 1;
}

// ------------------------------------------------------------------ event bursts
const MAX_PARTICLES = 200; // a save import that retro-toasts a dozen achievements cannot hitch
const particles = [];
export function burst(x, y, now) {
  if (!settings.bursts) return;
  const n = 12 + Math.floor(Math.random() * 9);
  for (let i = 0; i < n && particles.length < MAX_PARTICLES; i++) {
    const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 50;
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t0: now, life: 600 + Math.random() * 300 });
  }
}
export function drawParticles(cx, now) {
  cx.fillStyle = '#4dd8ff';
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i], age = (now - p.t0) / 1000, k = age * 1000 / p.life;
    if (k >= 1) { particles.splice(i, 1); continue; }
    cx.globalAlpha = 1 - k;
    cx.fillRect(p.x + p.vx * age - 1, p.y + p.vy * age - 1, 2, 2);
  }
  cx.globalAlpha = 1;
}

// ------------------------------------------------------------------ ambient
export const CYCLE = 600; // seconds of game time per day
export const nightDepth = (time) => (1 - Math.cos(2 * Math.PI * ((time % CYCLE) / CYCLE))) / 2;

// Dark, soft blob drifting under the world on a slow Lissajous path. Purely ambient.
export function manta(cx, time, worldW, worldH) {
  if (!settings.manta) return;
  const x = worldW / 2 + worldW * 0.42 * Math.sin(time / 97);
  const y = worldH / 2 + worldH * 0.42 * Math.sin(time / 151);
  const rx = 160, ry = 96; // ~10x6 tiles
  const g = cx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, 'rgba(0,0,0,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  cx.save(); cx.translate(x, y); cx.scale(1, ry / rx); cx.translate(-x, -y);
  cx.fillStyle = g; cx.fillRect(x - rx, y - rx, rx * 2, rx * 2);
  cx.restore();
}

// Slow diagonal specular band across a deposit, ~4s period.
export function shimmer(cx, x, y, w, h, now) {
  if (!settings.dayNight) return;
  const k = (now / 4000) % 1;
  const g = cx.createLinearGradient(x - w + k * 2 * w, y, x + k * 2 * w, y + h);
  g.addColorStop(0.45, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.15)'); g.addColorStop(0.55, 'rgba(255,255,255,0)');
  cx.fillStyle = g;
  cx.beginPath(); cx.roundRect(x + 2, y + 2, w - 4, h - 4, 8); cx.fill();
}

// Screen-space tint over the world; text and tile fills are drawn later and stay untouched.
export function nightTint(cx, w, h, n) {
  if (n <= 0) return;
  cx.fillStyle = `rgba(4,6,20,${0.25 * n})`;
  cx.fillRect(0, 0, w, h);
}
