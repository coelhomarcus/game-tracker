/**
 * Cursor opaco pra paginação keyset: codifica (createdAt, id) num token único.
 * Evita um round-trip extra pra recuperar o createdAt do cursor e não quebra se a
 * linha referenciada pelo cursor for deletada entre páginas (diferente do cursor do Prisma).
 */
export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}_${id}`).toString('base64url');
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf-8');
  const separatorIndex = decoded.lastIndexOf('_');
  const createdAt = new Date(decoded.slice(0, separatorIndex));
  const id = decoded.slice(separatorIndex + 1);
  return { createdAt, id };
}

/** Um item de linha do tempo é um post original ou o repost de alguém. */
export type TimelineKind = 'post' | 'repost';

/**
 * Cursor das linhas do tempo (feed, posts de um usuário, posts de um jogo). `at` é a hora da
 * atividade em ISO UTC com microssegundos (a precisão do Postgres): com milissegundos, dois itens
 * no mesmo milissegundo podiam ser pulados entre páginas. `id` é o id do post ou do repost.
 */
export interface TimelineCursor {
  at: string;
  id: string;
  kind: TimelineKind;
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeTimelineCursor(cursor: TimelineCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

/**
 * Devolve `null` se o token não for um cursor válido. Aceita o formato antigo (`createdAt_id`,
 * de `encodeCursor`) como um post, pra quem estava no meio de uma rolagem durante o deploy.
 */
export function decodeTimelineCursor(token: string): TimelineCursor | null {
  const raw = Buffer.from(token, 'base64url').toString('utf-8');
  let candidate: Partial<Record<keyof TimelineCursor, unknown>>;
  try {
    candidate = JSON.parse(raw);
  } catch {
    const separatorIndex = raw.lastIndexOf('_');
    candidate = { at: raw.slice(0, separatorIndex), id: raw.slice(separatorIndex + 1), kind: 'post' };
  }
  if (typeof candidate !== 'object' || candidate === null) return null;
  const { at, id, kind } = candidate;
  if (typeof at !== 'string' || !ISO_UTC.test(at) || Number.isNaN(Date.parse(at))) return null;
  if (typeof id !== 'string' || !UUID.test(id)) return null;
  if (kind !== 'post' && kind !== 'repost') return null;
  return { at, id, kind };
}
