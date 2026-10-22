import { StyleSheet } from 'react-native';

export type GameStatus = 'playing' | 'completed' | 'backlog' | 'dropped';

/**
 * Neutral scale for the dark theme (design reference ordering): the number grows with
 * lightness, from the screen background (0) up to white (1000).
 */
export const contrast = {
  0: '#16181c',
  25: '#1c1f26',
  50: '#22262f',
  100: '#2a2d3c',
  200: '#3a4050',
  300: '#485066',
  // Design reference value is #5a6378 (2.95:1 on bg); nudged so textLow reaches 3:1.
  400: '#5c657a',
  500: '#6f788d',
  600: '#8590a3',
  700: '#9aa5b1',
  800: '#b3bdc7',
  900: '#cbd4dc',
  950: '#e3e8ed',
  975: '#f2f5f7',
  1000: '#ffffff',
} as const;

/** Brand scale (#ea377a at 500). Low numbers are dark tints for subtle backgrounds (unread = 25). */
export const primary = {
  25: '#1f1418',
  50: '#2a1520',
  100: '#3d1a2b',
  200: '#5c1f3c',
  300: '#8a2752',
  400: '#bb2f67',
  500: '#ea377a',
  600: '#ee5a90',
  700: '#f27ea7',
  800: '#f6a3be',
  900: '#f9c7d6',
  950: '#fce3eb',
  975: '#fef1f5',
} as const;

export const positive500 = '#09B35E';
export const negative500 = '#E91646';
export const negative400 = '#F65A7F';

/**
 * Semantic colors come first; the "Legacy" block keeps the pre-design-system names rendering
 * the same colors until the call sites are migrated (Task 6 deletes it).
 */
export const colors = {
  // Semantic
  bg: contrast[0],
  textHigh: contrast[900],
  textMedium: contrast[700],
  textLow: contrast[400],
  borderLow: contrast[100],
  borderMedium: contrast[200],
  bgContrast25: contrast[25],
  bgContrast50: contrast[50],
  primary: primary[500],
  onPrimary: '#ffffff',
  like: primary[500],
  repost: positive500,

  // Legacy (same rendered colors as before the design system)
  /** Body grey (contrast[900]), deliberately not contrast[1000] to avoid a global color jump. */
  text: contrast[900],
  chrome: contrast[25],
  surface: contrast[50],
  /** Pre-design-system tone with no scale equivalent, so the old value is kept. */
  raised: '#2b303b',
  border: contrast[100],
  borderStrong: contrast[200],
  active: '#3f4b64',
  textMuted: contrast[700],
  /** Pre-design-system value (contrast[975]); pure-white text is not wired in yet. */
  textStrong: contrast[975],
  accent: primary[500],
  onAccent: '#ffffff',
  /** Light red that reads at 4.5:1 on every tone; negative500/400 do not on dark surfaces. */
  danger: '#ff7a7a',

  status: {
    playing: '#5cb8ff',
    completed: '#4ad497',
    backlog: '#a6abbb',
    dropped: '#ff8e80',
  } satisfies Record<GameStatus, string>,
} as const;

/**
 * The new scale uses `_`-prefixed keys where a bare name would collide with a legacy key of a
 * different value: `_xl` (20) is the new `xl`, while legacy `xl` (24) and `xxl` (32) stay until
 * Task 6 rewrites usages explicitly. `xs`, `sm`, `md` and `lg` are identical in both scales.
 */
export const space = {
  _2xs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  _xl: 20,
  _2xl: 24,
  _3xl: 28,
  _4xl: 32,
  _5xl: 40,
  // Legacy
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
  // Legacy
  cover: 6,
  card: 12,
  control: 12,
} as const;

/** Legacy sizes (xs12 sm14 md16 lg20 xl24); the new scale lives in `type.size`. */
export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
} as const;

export const type = {
  size: {
    xs: 11.3,
    sm: 13.1,
    md: 15,
    lg: 16.9,
    xl: 18.8,
    _2xl: 20.6,
    _3xl: 24.3,
    _4xl: 30,
  },
  weight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  leading: {
    tight: 1.15,
    snug: 1.3,
    relaxed: 1.5,
  },
} as const;

/** Line height in px for a font size and a `type.leading` multiplier. */
export function lineHeight(size: number, leading: keyof typeof type.leading): number {
  return Math.round(size * type.leading[leading]);
}

export const hairline = StyleSheet.hairlineWidth;
export const threadLine = 2;
