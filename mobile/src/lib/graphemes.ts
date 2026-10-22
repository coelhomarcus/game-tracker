type Segmenter = { segment(text: string): Iterable<unknown> };
type SegmenterConstructor = new (
  locale?: string,
  options?: { granularity: 'grapheme' },
) => Segmenter;

const segmenter: Segmenter | null = (() => {
  // Hermes may not ship Intl.Segmenter.
  const Ctor = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
  return Ctor ? new Ctor(undefined, { granularity: 'grapheme' }) : null;
})();

const isCombining = (cp: number) =>
  (cp >= 0x0300 && cp <= 0x036f) ||
  (cp >= 0x1ab0 && cp <= 0x1aff) ||
  (cp >= 0x1dc0 && cp <= 0x1dff) ||
  (cp >= 0x20d0 && cp <= 0x20ff) ||
  (cp >= 0xfe00 && cp <= 0xfe0f) || // variation selectors
  (cp >= 0xfe20 && cp <= 0xfe2f) ||
  (cp >= 0x1f3fb && cp <= 0x1f3ff) || // skin tones
  (cp >= 0xe0020 && cp <= 0xe007f); // tag characters
const isRegionalIndicator = (cp: number) => cp >= 0x1f1e6 && cp <= 0x1f1ff;
const ZWJ = 0x200d;

/** Approximates grapheme clusters: marks, variation selectors, skin tones, ZWJ sequences, flags. */
function approximateCount(text: string): number {
  let clusters = 0;
  let joined = false;
  let flagHalf = false;
  for (const char of text) {
    const cp = char.codePointAt(0) as number;
    if (joined) {
      joined = false;
      if (cp !== ZWJ) continue;
    }
    if (cp === ZWJ) {
      joined = true;
      continue;
    }
    if (isCombining(cp)) continue;
    if (isRegionalIndicator(cp)) {
      if (flagHalf) {
        flagHalf = false;
        continue;
      }
      flagHalf = true;
    } else {
      flagHalf = false;
    }
    clusters += 1;
  }
  return clusters;
}

/**
 * The number of user-perceived characters, which is how the server measures a profile's name and
 * bio. Uses `Intl.Segmenter` when the runtime has it and an approximation otherwise.
 */
export function countGraphemes(text: string): number {
  if (segmenter) return Array.from(segmenter.segment(text)).length;
  return approximateCount(text);
}

/** The fallback alone, exported so it can be tested where `Intl.Segmenter` exists. */
export const countGraphemesApproximately = approximateCount;
