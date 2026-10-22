import { colors } from '../tokens';
import { contrastRatio } from '../contrast';

test('palette values match the spec', () => {
  expect(colors).toMatchObject({
    bg: '#16181c',
    chrome: '#1c1f26',
    surface: '#22262f',
    raised: '#2b303b',
    border: '#2a2d3c',
    borderStrong: '#3a4050',
    active: '#3f4b64',
    text: '#cbd4dc',
    accent: '#ea377a',
  });
});

test('tone levels get lighter as they come forward', () => {
  const levels = [colors.bg, colors.chrome, colors.surface, colors.raised, colors.active];
  const luminance = levels.map((c) => contrastRatio(c, '#000000'));
  luminance.slice(1).forEach((value, i) => expect(value).toBeGreaterThan(luminance[i]));
});

test('contrastRatio follows WCAG', () => {
  expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
  expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
});

test.each(['text', 'textMuted', 'textStrong', 'danger'] as const)(
  '%s reads at 4.5:1 on every background tone',
  (key) => {
    for (const tone of [colors.bg, colors.chrome, colors.surface, colors.raised]) {
      expect(contrastRatio(colors[key], tone)).toBeGreaterThanOrEqual(4.5);
    }
  },
);

test.each(['playing', 'completed', 'backlog', 'dropped'] as const)(
  'status %s reads at 4.5:1 on every background tone',
  (s) => {
    for (const tone of [colors.bg, colors.chrome, colors.surface, colors.raised]) {
      expect(contrastRatio(colors.status[s], tone)).toBeGreaterThanOrEqual(4.5);
    }
  },
);

test('accent buttons reach the large-text minimum', () => {
  expect(contrastRatio(colors.onAccent, colors.accent)).toBeGreaterThanOrEqual(3);
});
