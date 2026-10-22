import { countGraphemes, countGraphemesApproximately } from '../graphemes';

const FAMILY = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}'; // woman and man and girl, one emoji
const WAVE_DARK = '\u{1F44B}\u{1F3FF}'; // waving hand with a skin tone
const FLAG_BR = '\u{1F1E7}\u{1F1F7}';
const E_ACUTE_DECOMPOSED = 'e\u0301';

const cases: [string, string, number][] = [
  ['empty text', '', 0],
  ['ASCII', 'hello', 5],
  ['precomposed accents', 'ação', 4],
  ['an accent as a combining mark', E_ACUTE_DECOMPOSED, 1],
  ['an emoji outside the BMP', '\u{1F600}', 1],
  ['an emoji with a skin tone', WAVE_DARK, 1],
  ['a family emoji joined with ZWJ', FAMILY, 1],
  ['a flag from two regional indicators', FLAG_BR, 1],
  ['two flags side by side', FLAG_BR + FLAG_BR, 2],
  ['a heart with a variation selector', '\u2764\uFE0F', 1],
  ['mixed text', `oi ${FAMILY}${WAVE_DARK}!`, 6],
];

describe('countGraphemes', () => {
  it.each(cases)('counts %s', (_name, text, expected) => {
    expect(countGraphemes(text)).toBe(expected);
  });
});

describe('countGraphemesApproximately (no Intl.Segmenter)', () => {
  it.each(cases)('counts %s', (_name, text, expected) => {
    expect(countGraphemesApproximately(text)).toBe(expected);
  });

  it('does not count a pile of combining marks as many characters', () => {
    expect(countGraphemesApproximately('a' + '\u0301'.repeat(40))).toBe(1);
  });
});
