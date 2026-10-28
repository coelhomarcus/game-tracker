/**
 * One emoji as people see it: a flag (two regional indicators), a keycap, or a pictograph with
 * its variation selector, skin tone and tag sequence (subdivision flags), joined to more of them
 * by ZWJ (families, professions, the rainbow flag). Hermes supports the `u` flag and
 * `\p{Extended_Pictographic}`, but not `Intl.Segmenter`, so the grapheme rules are spelled out.
 */
const MODIFIERS = '(?:\\uFE0F|[\\u{1F3FB}-\\u{1F3FF}])*(?:[\\u{E0020}-\\u{E007E}]+\\u{E007F})?';
/**
 * A sequence starts with a pictograph drawn as emoji by default (`Emoji_Presentation`), with ❤,
 * or with a text-style pictograph turned into emoji by FE0F, a skin tone or a ZWJ: "©", "™" or
 * "↔" alone stay text. The lookahead intersects the two properties (Hermes has no `\p{}` set operations).
 */
const FIRST =
  '(?:(?=\\p{Emoji_Presentation})\\p{Extended_Pictographic}|\\u2764|\\p{Extended_Pictographic}(?=[\\uFE0F\\u200D\\u{1F3FB}-\\u{1F3FF}]))';
/** After a ZWJ the sequence is emoji already: any pictograph continues it. */
const NEXT = '\\p{Extended_Pictographic}';
const EMOJI = `(?:[\\u{1F1E6}-\\u{1F1FF}]{2}|[0-9#*]\\uFE0F?\\u20E3|${FIRST}${MODIFIERS}(?:\\u200D${NEXT}${MODIFIERS})*)`;
const EMOJI_ONLY = new RegExp(`^\\s*(?:${EMOJI}\\s*){1,3}$`, 'u');

/** Longer than this cannot be 3 emoji (the longest ZWJ and tag sequences are about 14 units each). */
const MAX_LENGTH = 64;

/** 1 to 3 emoji and nothing else but spaces: such a message shows large, without a bubble. */
export function isEmojiOnly(text: string): boolean {
  return text.length <= MAX_LENGTH && EMOJI_ONLY.test(text);
}
