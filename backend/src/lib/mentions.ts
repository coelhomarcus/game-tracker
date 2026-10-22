/**
 * `@usuario` no texto: precedido de início de texto ou de algo que não seja letra, número, `_`,
 * `@` ou `.` (assim `fulano@example.com`, `abc@def` e `@@x` não contam) e seguido de 3 a 30 letras,
 * números ou `_`, que é o formato dos nomes de usuário.
 */
const MENTION = /(^|[^\w@.])@([A-Za-z0-9_]{3,30})\b/g;

/** Os nomes mencionados no texto, em minúsculas, sem repetição e na ordem em que aparecem. */
export function extractMentions(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(MENTION)) found.add(match[2]!.toLowerCase());
  return [...found];
}
