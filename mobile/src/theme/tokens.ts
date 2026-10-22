export type GameStatus = 'playing' | 'completed' | 'backlog' | 'dropped';

/**
 * Tones go lighter as things come forward: screen (`bg`) < bars (`chrome`) < cards (`surface`)
 * < controls inside them (`raised`) < selected (`active`). Neighbouring levels never share a
 * color, so bars, cards and fields stay apart.
 */
export const colors = {
  bg: '#16181c',
  chrome: '#1c1f26',
  surface: '#22262f',
  raised: '#2b303b',
  border: '#2a2d3c',
  borderStrong: '#3a4050',
  active: '#3f4b64',
  text: '#cbd4dc',
  textMuted: '#9aa5b1',
  textStrong: '#f2f5f7',
  accent: '#ea377a',
  onAccent: '#ffffff',
  danger: '#ff7a7a',
  status: {
    playing: '#5cb8ff',
    completed: '#4ad497',
    backlog: '#a6abbb',
    dropped: '#ff8e80',
  } satisfies Record<GameStatus, string>,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  cover: 6,
  card: 12,
  control: 12,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
} as const;
