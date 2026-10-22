const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Quantos caracteres o usuário enxerga (emoji com tom de pele, "é" decomposto etc. contam como 1). */
export function countGraphemes(text: string): number {
  let total = 0;
  for (const _ of segmenter.segment(text)) total++;
  return total;
}

/** Quantos pontos de código (o que o `varchar(n)` do Postgres conta). */
export function countCodePoints(text: string): number {
  let total = 0;
  for (const _ of text) total++;
  return total;
}
