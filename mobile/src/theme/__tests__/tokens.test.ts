import {
  colors,
  contrast,
  hairline,
  lineHeight,
  negative400,
  negative500,
  positive500,
  primary,
  radii,
  space,
  threadLine,
  type,
} from '../tokens';
import { contrastRatio } from '../contrast';

test('palette values match the spec', () => {
  expect(colors).toMatchObject({
    bg: '#16181c',
    bgContrast25: '#1c1f26',
    bgContrast50: '#22262f',
    borderLow: '#2a2d3c',
    borderMedium: '#3a4050',
    selected: '#3f4b64',
    text: '#cbd4dc',
    textEmphasis: '#f2f5f7',
    primary: '#ea377a',
    danger: '#ff7a7a',
  });
});

/** Every fill text can sit on: the screen and bars, cards and sheets, controls. */
const fills = [colors.bg, colors.bgContrast25, colors.bgContrast50];

test('tone levels get lighter as they come forward', () => {
  const levels = [colors.bg, colors.bgContrast25, colors.bgContrast50, colors.selected];
  const luminance = levels.map((c) => contrastRatio(c, '#000000'));
  luminance.slice(1).forEach((value, i) => expect(value).toBeGreaterThan(luminance[i]));
});

test('contrastRatio follows WCAG', () => {
  expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
  expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
});

test.each(['text', 'textEmphasis', 'textMedium', 'danger'] as const)(
  '%s reads at 4.5:1 on every background tone',
  (key) => {
    for (const tone of fills) {
      expect(contrastRatio(colors[key], tone)).toBeGreaterThanOrEqual(4.5);
    }
  },
);

test.each(['text', 'textEmphasis'] as const)('%s reads at 4.5:1 on the selected fill', (key) => {
  expect(contrastRatio(colors[key], colors.selected)).toBeGreaterThanOrEqual(4.5);
});

test.each(['playing', 'completed', 'backlog', 'dropped'] as const)(
  'status %s reads at 4.5:1 on every background tone',
  (s) => {
    for (const tone of fills) {
      expect(contrastRatio(colors.status[s], tone)).toBeGreaterThanOrEqual(4.5);
    }
  },
);

test('primary buttons reach the large-text minimum', () => {
  expect(contrastRatio(colors.onPrimary, colors.primary)).toBeGreaterThanOrEqual(3);
});

describe('contrast-scale design tokens', () => {
  const steps = Object.keys(contrast)
    .map(Number)
    .sort((a, b) => a - b) as (keyof typeof contrast)[];

  test('contrast scale gets strictly lighter from 0 to 1000', () => {
    expect(steps[0]).toBe(0);
    expect(steps[steps.length - 1]).toBe(1000);
    const luminance = steps.map((s) => contrastRatio(contrast[s], '#000000'));
    luminance.slice(1).forEach((value, i) => expect(value).toBeGreaterThan(luminance[i]));
  });

  test.each(['text', 'textEmphasis', 'textMedium'] as const)(
    '%s reads at 4.5:1 on contrast 0, 25 and 50',
    (key) => {
      for (const tone of [contrast[0], contrast[25], contrast[50]]) {
        expect(contrastRatio(colors[key], tone)).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  test('textLow reads at 3:1 on the screen background', () => {
    expect(contrastRatio(colors.textLow, contrast[0])).toBeGreaterThanOrEqual(3);
  });

  test('onPrimary reads at 3:1 on primary[500]', () => {
    expect(contrastRatio(colors.onPrimary, primary[500])).toBeGreaterThanOrEqual(3);
  });

  test('semantic colors map onto the scales', () => {
    expect(colors).toMatchObject({
      bg: contrast[0],
      text: contrast[900],
      textEmphasis: contrast[975],
      textMedium: contrast[700],
      textLow: contrast[400],
      borderLow: contrast[100],
      borderMedium: contrast[200],
      bgContrast25: contrast[25],
      bgContrast50: contrast[50],
      primary: primary[500],
      like: primary[500],
      repost: positive500,
    });
    expect(negative500).toBe('#E91646');
    expect(negative400).toBe('#F65A7F');
  });

  test('no pre-design-system names are left', () => {
    for (const legacy of ['chrome', 'surface', 'raised', 'border', 'borderStrong', 'active', 'textMuted', 'textStrong', 'accent', 'onAccent', 'textHigh']) {
      expect(colors).not.toHaveProperty(legacy);
    }
    expect(Object.keys(space)).not.toContain('xxl');
    expect(Object.keys(radii)).toEqual(['xs', 'sm', 'md', 'lg', 'xl', 'full']);
  });

  test('spacing, radii and type scales', () => {
    expect(space).toEqual({ _2xs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, _2xl: 24, _3xl: 28, _4xl: 32, _5xl: 40 });
    expect(radii).toEqual({ xs: 4, sm: 8, md: 12, lg: 16, xl: 20, full: 999 });
    expect(type.size).toEqual({
      xs: 11.3,
      sm: 13.1,
      md: 15,
      lg: 16.9,
      xl: 18.8,
      _2xl: 20.6,
      _3xl: 24.3,
      _4xl: 30,
    });
    expect(type.weight.semibold).toBe('600');
    expect(threadLine).toBe(2);
    expect(hairline).toBeGreaterThan(0);
  });

  test('lineHeight rounds size times leading', () => {
    expect(lineHeight(15, 'snug')).toBe(20);
    expect(lineHeight(15, 'tight')).toBe(17);
    expect(lineHeight(15, 'relaxed')).toBe(23);
  });
});
