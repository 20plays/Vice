// Derives Vice's five accent ramps and writes ui-src/theme/accents.ts.
//
// Run with: node tools/derive-accents.mjs
//
// Why this exists rather than five hand-picked hexes: the neutral theme places
// its dark-mode colours on a documented ramp (chroma x0.85 off the source hue),
// tuned to sit on the #1b1b1b body. Vice's original accents were chosen against
// a near-black #050810 void with glow behind them, so they read hot on warm
// grays. Each accent keeps its own hue and moves to neutral's tonal position,
// which is why the violet purple stays violet instead of snapping to the
// palette's magenta.

import {writeFileSync} from 'node:fs';

const srgbToLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = c => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

const hexToRgb = hex => [0, 2, 4].map(i => parseInt(hex.slice(1 + i, 3 + i), 16) / 255);

const rgbToHex = rgb =>
  '#' + rgb.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');

function rgbToOklab([r, g, b]) {
  const [lr, lg, lb] = [r, g, b].map(srgbToLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, a, bb]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * bb) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(linearToSrgb);
}

const toOklch = ([L, a, b]) => [L, Math.hypot(a, b), (Math.atan2(b, a) * 180 / Math.PI + 360) % 360];
const toOklab = ([L, C, H]) => [L, C * Math.cos(H * Math.PI / 180), C * Math.sin(H * Math.PI / 180)];
const hexToOklch = hex => toOklch(rgbToOklab(hexToRgb(hex)));
const inGamut = rgb => rgb.every(v => v >= -0.0001 && v <= 1.0001);

// Reduce chroma until the colour fits sRGB, so a requested L/H is never
// silently clipped into a different hue.
function oklchToHex([L, C, H]) {
  if (inGamut(oklabToRgb(toOklab([L, C, H])))) return rgbToHex(oklabToRgb(toOklab([L, C, H])));
  let lo = 0, hi = C;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklabToRgb(toOklab([L, mid, H])))) lo = mid; else hi = mid;
  }
  return rgbToHex(oklabToRgb(toOklab([L, lo, H])));
}

const luminance = rgb => {
  const [R, G, B] = rgb.map(srgbToLinear);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
};

function contrast(a, b) {
  const la = luminance(hexToRgb(a));
  const lb = luminance(hexToRgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// The accents Vice shipped through 2.7.2. Hue is taken from these; lightness
// and chroma are not.
const SOURCE = {
  blue: '#0099ff',
  purple: '#8b5cf6',
  green: '#10b981',
  red: '#ef4444',
  orange: '#f97316',
};

// Surfaces the accent has to survive, from neutralTheme.ts.
const BODY = '#1b1b1b';
const SURFACE = '#262626';
const ON_ACCENT = '#171717';

const ACCENT_L = 0.71;   // uniform, so all five read equally bright in the swatch row
const CHROMA = 0.85;     // neutral's documented dark-ramp chroma reduction
const AMBIENT_L = 0.30;  // a wash, not a glow
const AMBIENT_C_MAX = 0.075;
// The page background, not the cards. Cards stay neutral and separate by tone
// the way Material's surface containers do; the hue lives underneath them so
// the whole window feels like it belongs to the theme without any single
// element looking tinted.
//
// The hue is offset from the accent rather than matching it. A background in
// the accent's own hue reads as a washed-out version of the accent; a
// neighbouring hue reads as a considered pairing. 25 degrees is enough to
// separate them and small enough to stay harmonious.
const BG_L = 0.205;        // lifted off pure black so the wash has somewhere to land
const BG_C = 0.016;        // present at a glance only when you look for it
const BG_HUE_OFFSET = 25;

const rows = Object.entries(SOURCE).map(([name, source]) => {
  const [, c, h] = hexToOklch(source);
  const base = oklchToHex([ACCENT_L, c * CHROMA, h]);
  return {
    name,
    source,
    base,
    hover: oklchToHex([ACCENT_L + 0.06, c * CHROMA, h]),
    active: oklchToHex([ACCENT_L - 0.07, c * CHROMA, h]),
    ambient: oklchToHex([AMBIENT_L, Math.min(c * 0.45, AMBIENT_C_MAX), h]),
    bg: oklchToHex([BG_L, BG_C, (h + BG_HUE_OFFSET) % 360]),
    onAccent: contrast(base, ON_ACCENT),
    onBody: contrast(base, BODY),
    onSurface: contrast(base, SURFACE),
  };
});

// Text and accents sit on the tinted background, so both are held to the bar.
const TEXT = '#ededed';
for (const r of rows) {
  r.textOnBg = contrast(TEXT, r.bg);
  r.accentOnBg = contrast(r.base, r.bg);
}

const failures = rows.filter(
  r => Math.min(r.onAccent, r.onBody, r.onSurface, r.textOnBg, r.accentOnBg) < 4.5,
);
if (failures.length) {
  console.error('Accents below WCAG AA 4.5:1:', failures.map(f => f.name).join(', '));
  process.exit(1);
}

for (const r of rows) {
  console.log(
    `${r.name.padEnd(7)} ${r.source} -> ${r.base}  ` +
    `on-accent ${r.onAccent.toFixed(2)}  on-body ${r.onBody.toFixed(2)}  ` +
    `on-surface ${r.onSurface.toFixed(2)}  bg ${r.bg} ` +
    `text-on-bg ${r.textOnBg.toFixed(2)}  accent-on-bg ${r.accentOnBg.toFixed(2)}`,
  );
}

const body = rows
  .map(r =>
    `  ${r.name}: {\n` +
    `    base: '${r.base}',\n` +
    `    hover: '${r.hover}',\n` +
    `    active: '${r.active}',\n` +
    `    ambient: '${r.ambient}',\n` +
    `    bg: '${r.bg}',\n` +
    `  },`,
  )
  .join('\n');

writeFileSync(
  new URL('../ui-src/theme/accents.ts', import.meta.url),
  `// Generated by tools/derive-accents.mjs. Do not edit by hand.
//
// Each accent keeps the hue Vice shipped and moves to the tonal position the
// neutral theme uses for dark mode, so it sits correctly on the #1b1b1b body
// instead of on the old near-black void. Every value clears WCAG AA against
// the body, the raised surface, and its own on-accent text colour.

export type AccentName = ${Object.keys(SOURCE).map(n => `'${n}'`).join(' | ')};

export interface AccentRamp {
  /** Fills, focus rings, the record indicator. Carries dark on-accent text. */
  base: string;
  hover: string;
  active: string;
  /** Drives the ambient background wash. Never used for text. */
  ambient: string;
  /** The page background: a neighbouring hue to the accent, never black. */
  bg: string;
}

export const ACCENTS: Record<AccentName, AccentRamp> = {
${body}
};

export const DEFAULT_ACCENT: AccentName = 'blue';

export const ACCENT_NAMES = Object.keys(ACCENTS) as AccentName[];
`,
);

console.log('\nWrote ui-src/theme/accents.ts');
