import {defineTheme} from '@astryxdesign/core/theme';

import {neutralTheme} from '../../src/themes/neutral/neutralTheme';
import {ACCENTS, type AccentName} from './accents';

// Chunky geometry, in the manner of Android's expressive quick settings: a
// control is an object you could pick up, not a rectangle with the corners
// taken off. Radius scales with the element rather than staying constant, so a
// small control reads as nearly circular while a panel stays a soft rectangle.
const RADIUS = {
  '--radius-inner': '0.75rem',     // 12px, inputs and small controls
  '--radius-element': '1.25rem',   // 20px, buttons and nav items
  '--radius-container': '1.75rem', // 28px, cards, tiles and panels
  '--radius-page': '2.25rem',      // 36px, the app frame
} as const;

// A spring with real overshoot. Expressed as a cubic-bezier rather than a
// linear() spring so it degrades identically on the WebKit2GTK fallback path
// that some users land on.
const EASE_SPRING = 'cubic-bezier(.34, 1.56, .64, 1)';

/**
 * Everything shared across the five accents: geometry and motion. Split out so
 * a radius change is one edit rather than five.
 */
const viceBase = defineTheme({
  name: 'vice-base',
  extends: neutralTheme,
  motion: {fast: 140, medium: 320, slow: 700, ratio: 0.75, easing: EASE_SPRING},
  tokens: {...RADIUS},
});

// Vice's accent is user state, not a brand constant: five swatches in Settings,
// default blue, persisted per install. Astryx's rule is never to override
// --color-* in :root, so each swatch is its own theme and <Theme> swaps them at
// runtime.
//
// Neutral's own accent is deliberately monochrome (#ebebeb on dark) with dark
// on-accent text. Substituting a coloured accent at the same tonal position
// keeps that contrast relationship intact, which is why on-accent text stays
// #171717 rather than flipping to white.
function accentTheme(name: AccentName) {
  const {base} = ACCENTS[name];
  return defineTheme({
    name: `vice-${name}`,
    extends: viceBase,
    tokens: {
      // Dark-only app, but both slots are filled so a light render never
      // falls back to neutral's grayscale accent.
      '--color-accent': [base, base],
      '--color-text-accent': [base, base],
      '--color-icon-accent': [base, base],
      '--color-on-accent': ['#171717', '#171717'],

      // Neutral hardcodes its own blue (#0074e2) into the focus and selection
      // rings. Left alone, a purple install would still focus blue.
      '--shadow-inset-hover': `inset 0px 0px 0px 2px ${base}4D`,
      '--shadow-inset-selected': `inset 0px 0px 0px 2px ${base}80`,
    },
    components: {
      statusdot: {'variant:accent': {backgroundColor: base}},
      progressbar: {'variant:accent': {'--color-accent': base}},
      button: {
        'variant:primary': {backgroundColor: base, color: '#171717'},
      },
      link: {base: {color: base}},
    },
  });
}

/**
 * Values our own CSS needs that are not part of the design system's token set:
 * the hover/active ends of the accent ramp and the ambient wash. Set as inline
 * custom properties on the app root rather than smuggled through defineTheme,
 * so they stay visible and typed.
 */
export function accentVars(name: AccentName): Record<string, string> {
  const {hover, active, ambient, bg} = ACCENTS[name];
  return {
    '--vice-accent-hover': hover,
    '--vice-accent-active': active,
    '--vice-ambient': ambient,
    '--vice-bg': bg,
    '--vice-ease-spring': EASE_SPRING,
  };
}

export const VICE_THEMES = {
  blue: accentTheme('blue'),
  purple: accentTheme('purple'),
  green: accentTheme('green'),
  red: accentTheme('red'),
  orange: accentTheme('orange'),
} satisfies Record<AccentName, ReturnType<typeof accentTheme>>;
