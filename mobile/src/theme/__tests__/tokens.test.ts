import { colors } from '../tokens';
import { contrastRatio } from '../contrast';

test('palette values match the spec', () => {
  expect(colors).toMatchObject({
    bg: '#16181c',
    surface: '#272c37',
    border: '#2a2d3c',
    active: '#3f4b64',
    text: '#cbd4dc',
    accent: '#ea377a',
  });
});

test('contrastRatio follows WCAG', () => {
  expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
  expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
});

test.each(['text', 'textMuted', 'textStrong', 'danger'] as const)(
  '%s reads at 4.5:1 on bg and surface',
  (key) => {
    expect(contrastRatio(colors[key], colors.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors[key], colors.surface)).toBeGreaterThanOrEqual(4.5);
  },
);

test.each(['playing', 'completed', 'backlog', 'dropped'] as const)(
  'status %s reads at 4.5:1 on bg and surface',
  (s) => {
    expect(contrastRatio(colors.status[s], colors.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.status[s], colors.surface)).toBeGreaterThanOrEqual(4.5);
  },
);

test('accent buttons reach the large-text minimum', () => {
  expect(contrastRatio(colors.onAccent, colors.accent)).toBeGreaterThanOrEqual(3);
});
