// icons.js — six per-kind glyphs + the labelled meter bar. Inline SVG, currentColor, no assets.
// ponytail: per-kind only; per-resource overrides for headline resources if the panels read flat.
const wrap = (body) =>
  `<svg class="ico" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

// Path data is exported too: the canvas tile strokes the same shapes via Path2D.
export const ICON_PATH = {
  item: 'M4.5 3h7a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 11.5v-7A1.5 1.5 0 0 1 4.5 3z',
  fluid: 'M8 2.5 C5 6 4 8 4 10 a4 4 0 0 0 8 0 c0-2-1-4-4-7.5z',
  power: 'M9 2 4 9h4l-1 5 5-7H8z',
  ore: 'M3 12 6 5l3 3 2-3 2 7z',
};

const ICON = {
  item: wrap('<rect x="3" y="3" width="10" height="10" rx="1.5"/>'),
  fluid: wrap(`<path d="${ICON_PATH.fluid}"/>`),
  power: wrap(`<path d="${ICON_PATH.power}"/>`),
  ore: wrap(`<path d="${ICON_PATH.ore}"/>`),
  warn: wrap('<path d="M8 2.5 14 13H2z"/><path d="M8 7v3M8 11.5v.1"/>'),
  idle: wrap('<circle cx="8" cy="8" r="4.5" stroke-dasharray="2 2"/>'),
};

export function icon(kind) { return ICON[kind] ?? ''; }

export function meter(label, value, max, cls = '') {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return `<div class="ms-row"><span>${label}</span><span>${Math.round(value)}/${Math.round(max)}</span></div>
    <div class="ms-bar ${cls}"><i style="width:${pct}%"></i></div>`;
}
