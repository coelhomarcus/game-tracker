const SPECIAL: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  ł: 'l',
};

/** Lower-cases, strips diacritics and collapses whitespace for accent-insensitive search. */
export function foldText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ßæœøł]/g, (char) => SPECIAL[char] ?? char)
    .trim()
    .replace(/\s+/g, ' ');
}
