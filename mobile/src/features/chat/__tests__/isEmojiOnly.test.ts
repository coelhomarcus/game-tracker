import { isEmojiOnly } from '../isEmojiOnly';

describe('isEmojiOnly', () => {
  it.each([
    ['one emoji', '😀'],
    ['two emoji', '😀🎮'],
    ['three emoji', '🔥🔥🔥'],
    ['emoji with spaces around and between', ' 👍 🎉 '],
    ['a ZWJ family', '👨‍👩‍👧‍👦'],
    ['a ZWJ profession with a skin tone', '👩🏽‍💻'],
    ['three ZWJ sequences', '🏳️‍🌈🧑‍🚀❤️‍🔥'],
    ['a skin tone', '👍🏿'],
    ['a flag', '🇧🇷'],
    ['three flags', '🇧🇷🇵🇹🇯🇵'],
    ['a subdivision flag', '🏴󠁧󠁢󠁳󠁣󠁴󠁿'],
    ['a keycap', '1️⃣'],
    ['a text-style symbol with the emoji selector', '❤️'],
    ['the heart without the selector, kept on purpose', '❤'],
    ['a text-style symbol made emoji by the selector', '©️'],
    ['an arrow made emoji by the selector', '↔️'],
  ])('is true for %s', (_name, text) => {
    expect(isEmojiOnly(text)).toBe(true);
  });

  it.each([
    ['empty text', ''],
    ['spaces only', '   '],
    ['plain text', 'oi'],
    ['text with an emoji', 'oi 😀'],
    ['an emoji with text after it', '😀!'],
    ['a digit', '1'],
    ['punctuation', '#'],
    ['four emoji', '😀😀😀😀'],
    ['four flags', '🇧🇷🇧🇷🇧🇷🇧🇷'],
    ['a lone regional indicator', '🇧'],
    ['a lone skin tone', '🏽'],
    ['a lone joiner', '‍'],
    ['emoji on two lines with text', '😀\nok'],
    ['the copyright sign', '©'],
    ['the trade mark sign', '™'],
    ['the registered sign', '®'],
    ['an arrow', '↔'],
    ['a card suit', '♠'],
    ['a smiley forced to text', '☺︎'],
  ])('is false for %s', (_name, text) => {
    expect(isEmojiOnly(text)).toBe(false);
  });
});
