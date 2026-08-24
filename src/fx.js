// fx.js — presentation-only effects. Owns transient visual state; saves nothing; never touches
// sim state. Pure helpers take numbers/arrays so they run in Node without a DOM.
import { settings } from './settings.js';

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
  cx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const p = pointAt(pts, cum, (offset + i * spacing) % len);
    if (w.kind === 'fluid') {
      cx.beginPath(); cx.arc(p.x, p.y, 2, 0, Math.PI * 2); cx.fill();
    } else {
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.a);
      cx.beginPath(); cx.roundRect(-3, -1.5, 6, 3, 1.5); cx.fill();
      cx.restore();
    }
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
