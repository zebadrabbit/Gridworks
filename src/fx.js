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

// ponytail: cache keyed by wire id + point count + endpoints; wires are re-sampled when moved.
const pathCache = new Map();
function measured(w, pts) {
  const key = `${pts.length}:${pts[0].x},${pts[0].y}:${pts[pts.length - 1].x},${pts[pts.length - 1].y}`;
  const c = pathCache.get(w.id);
  if (c && c.key === key) return c;
  const m = { key, ...pathLengths(pts) };
  pathCache.set(w.id, m);
  return m;
}

export function flow(cx, w, pts, ratio, speedMul, now, color) {
  if (!settings.flow || !(ratio > 0)) return;
  const { cum, len } = measured(w, pts);
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
