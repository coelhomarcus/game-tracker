import { and, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db';
import { blocks, follows, mutes, users } from '../db/schema';
import { decodeTimelineCursor, encodeTimelineCursor } from '../lib/cursor';
import { AppError } from '../lib/errors';
import { isUuid } from '../lib/uuid';

/**
 * Silenciar e bloquear.
 *
 * - Bloqueio vale para os dois lados no conteúdo: nenhum dos dois vê posts, reposts, comentários e
 *   notificações do outro, e nenhum dos dois pode seguir o outro (os follows somem ao bloquear).
 * - Silenciar é de um lado só: quem silencia deixa de ver os posts e reposts da pessoa nos feeds
 *   e de receber as notificações dela. O perfil e os links diretos continuam funcionando.
 */

// As subconsultas abaixo citam as colunas pelo alias, em texto: dentro do `where` de uma consulta
// relacional do Drizzle (db.query.*) toda coluna do schema é reescrita para a tabela principal.
const blockedByViewer = (viewerId: string) =>
  sql`select mb_out.blocked_id from ${blocks} mb_out where mb_out.blocker_id = ${viewerId}`;
const blockersOfViewer = (viewerId: string) =>
  sql`select mb_in.blocker_id from ${blocks} mb_in where mb_in.blocked_id = ${viewerId}`;
const mutedByViewer = (viewerId: string) => sql`select mm.muted_id from ${mutes} mm where mm.muter_id = ${viewerId}`;

/** Subconsulta (entre parênteses) com os ids de quem bloqueou `viewerId` ou foi bloqueado por ele. */
export function blockedEitherWaySql(viewerId: string): SQL {
  return sql`(${blockedByViewer(viewerId)} union all ${blockersOfViewer(viewerId)})`;
}

/** Subconsulta (entre parênteses) com os ids que `viewerId` silenciou. */
export function mutedByMeSql(viewerId: string): SQL {
  return sql`(${mutedByViewer(viewerId)})`;
}

/**
 * Subconsulta (entre parênteses) com quem some dos feeds de `viewerId`: bloqueados nos dois
 * sentidos e, com `includeMuted`, também os silenciados.
 */
export function hiddenAuthorsSql(viewerId: string, includeMuted: boolean): SQL {
  if (!includeMuted) return blockedEitherWaySql(viewerId);
  return sql`(${blockedByViewer(viewerId)} union all ${blockersOfViewer(viewerId)} union all ${mutedByViewer(viewerId)})`;
}

/** Existe bloqueio entre `a` e `b`, em qualquer sentido. Usado também pelas mensagens diretas. */
export async function isBlockedEitherWay(a: string, b: string): Promise<boolean> {
  if (a === b || !isUuid(a) || !isUuid(b)) return false;
  const rows = await db
    .select({ id: blocks.id })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.blockerId, a), eq(blocks.blockedId, b)),
        and(eq(blocks.blockerId, b), eq(blocks.blockedId, a)),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Entre `userIds`, quem tem bloqueio com `viewerId` em qualquer sentido. */
export async function blockedAmong(viewerId: string, userIds: string[]): Promise<Set<string>> {
  const others = [...new Set(userIds)].filter((id) => id !== viewerId);
  if (others.length === 0) return new Set();
  const rows = await db
    .select({ blockerId: blocks.blockerId, blockedId: blocks.blockedId })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.blockerId, viewerId), inArray(blocks.blockedId, others)),
        and(eq(blocks.blockedId, viewerId), inArray(blocks.blockerId, others)),
      ),
    );
  return new Set(rows.map((row) => (row.blockerId === viewerId ? row.blockedId : row.blockerId)));
}

/** A relação de moderação de quem vê com a pessoa do perfil. Tudo falso no próprio perfil. */
export async function relationFlags(viewerId: string, targetId: string) {
  if (viewerId === targetId) return { isMutedByMe: false, isBlockedByMe: false, blocksMe: false };
  const result = await db.execute<{ muted: boolean; blocked: boolean; blocks_me: boolean }>(sql`
    select
      exists(select 1 from ${mutes} where ${mutes.muterId} = ${viewerId} and ${mutes.mutedId} = ${targetId}) as muted,
      exists(select 1 from ${blocks} where ${blocks.blockerId} = ${viewerId} and ${blocks.blockedId} = ${targetId}) as blocked,
      exists(select 1 from ${blocks} where ${blocks.blockerId} = ${targetId} and ${blocks.blockedId} = ${viewerId}) as blocks_me
  `);
  const row = result.rows[0];
  return {
    isMutedByMe: row?.muted === true,
    isBlockedByMe: row?.blocked === true,
    blocksMe: row?.blocks_me === true,
  };
}

/** A pessoa alvo existe e não é quem age; senão 400 (si mesmo) ou 404. */
async function assertTarget(actorId: string, targetId: string, selfMessage: string) {
  if (actorId === targetId) throw new AppError(400, 'invalid_operation', selfMessage);
  if (!isUuid(targetId) || !(await db.query.users.findFirst({ where: eq(users.id, targetId), columns: { id: true } }))) {
    throw new AppError(404, 'not_found', 'Usuário não encontrado');
  }
}

/** Silenciar de novo não faz nada. */
export async function mute(muterId: string, mutedId: string) {
  await assertTarget(muterId, mutedId, 'Não é possível silenciar a si mesmo');
  await db.insert(mutes).values({ muterId, mutedId }).onConflictDoNothing({ target: [mutes.muterId, mutes.mutedId] });
}

export async function unmute(muterId: string, mutedId: string) {
  await assertTarget(muterId, mutedId, 'Não é possível silenciar a si mesmo');
  await db.delete(mutes).where(and(eq(mutes.muterId, muterId), eq(mutes.mutedId, mutedId)));
}

/** Bloquear desfaz os follows nos dois sentidos, na mesma transação. Bloquear de novo não faz nada. */
export async function block(blockerId: string, blockedId: string) {
  await assertTarget(blockerId, blockedId, 'Não é possível bloquear a si mesmo');
  await db.transaction(async (tx) => {
    await tx
      .insert(blocks)
      .values({ blockerId, blockedId })
      .onConflictDoNothing({ target: [blocks.blockerId, blocks.blockedId] });
    await tx
      .delete(follows)
      .where(
        or(
          and(eq(follows.followerId, blockerId), eq(follows.followingId, blockedId)),
          and(eq(follows.followerId, blockedId), eq(follows.followingId, blockerId)),
        ),
      );
  });
}

/** Desbloquear volta a mostrar o conteúdo, mas não refaz os follows desfeitos. */
export async function unblock(blockerId: string, blockedId: string) {
  await assertTarget(blockerId, blockedId, 'Não é possível bloquear a si mesmo');
  await db.delete(blocks).where(and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId)));
}

interface ModerationListRow extends Record<string, unknown> {
  row_id: string;
  at_text: string;
  id: string;
  username: string;
  name: string | null;
  avatar_url: string | null;
}

/**
 * Quem eu silenciei ou bloqueei, o mais recente primeiro. Paginação keyset por (created_at, id) da
 * linha de silêncio/bloqueio, com microssegundos como nas linhas do tempo.
 */
async function listModerated(kind: 'mutes' | 'blocks', ownerId: string, cursor: string | undefined, limit: number) {
  const decoded = cursor === undefined ? null : decodeTimelineCursor(cursor);
  if (cursor !== undefined && !decoded) throw new AppError(400, 'validation_error', 'Cursor inválido');

  const table = kind === 'mutes' ? mutes : blocks;
  const [ownerColumn, personColumn] = kind === 'mutes' ? [mutes.muterId, mutes.mutedId] : [blocks.blockerId, blocks.blockedId];
  const cut = decoded
    ? sql`and (${table.createdAt}, ${table.id}) < (${decoded.at}::timestamptz, ${decoded.id}::uuid)`
    : sql``;

  const result = await db.execute<ModerationListRow>(sql`
    select ${table.id} as row_id,
      to_char(${table.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at_text,
      u.id, u.username, u.name, u.avatar_url
    from ${table}
    join ${users} u on u.id = ${personColumn}
    where ${ownerColumn} = ${ownerId} ${cut}
    order by ${table.createdAt} desc, ${table.id} desc
    limit ${limit + 1}
  `);

  const rows = result.rows;
  const page = rows.slice(0, limit);
  const items = page.map((row) => ({ id: row.id, username: row.username, name: row.name, avatarUrl: row.avatar_url }));
  const last = page[page.length - 1];
  const nextCursor =
    rows.length > limit && last ? encodeTimelineCursor({ at: last.at_text, id: last.row_id, kind: 'post' }) : null;
  return { items, nextCursor };
}

export function listMutes(userId: string, cursor: string | undefined, limit: number) {
  return listModerated('mutes', userId, cursor, limit);
}

export function listBlocks(userId: string, cursor: string | undefined, limit: number) {
  return listModerated('blocks', userId, cursor, limit);
}

/**
 * A notificação de `actorId` para `userId` não deve existir: há bloqueio entre os dois ou o
 * destinatário silenciou quem agiu.
 */
export async function suppressesNotification(userId: string, actorId: string): Promise<boolean> {
  const result = await db.execute<{ hidden: boolean }>(sql`
    select ${actorId}::uuid in ${hiddenAuthorsSql(userId, true)} as hidden
  `);
  return result.rows[0]?.hidden === true;
}
