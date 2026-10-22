/**
 * `@usuario` no texto: precedido de início de texto ou de algo que não seja letra (de qualquer
 * alfabeto, com acento), número, `_`, `@`, `.` ou `/` (assim `fulano@example.com`, `café@bar.com`,
 * `site.com/@user` e `@@x` não contam) e seguido de 3 a 30 letras ASCII, números ou `_` (o formato
 * dos nomes de usuário), sem outra letra ou número logo depois (`@abcé` não conta).
 */
const MENTION = /(^|[^\p{L}\p{N}_@./])@([A-Za-z0-9_]{3,30})(?![\p{L}\p{N}_])/gu;

/** No máximo tantas menções distintas por texto geram notificação (evita spam de notificações). */
export const MAX_MENTIONS = 10;

/**
 * Os nomes mencionados no texto, em minúsculas, sem repetição e na ordem em que aparecem. Só as
 * primeiras `MAX_MENTIONS` menções distintas contam; o resto é ignorado.
 */
export function extractMentions(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(MENTION)) {
    found.add(match[2]!.toLowerCase());
    if (found.size >= MAX_MENTIONS) break;
  }
  return [...found];
}
