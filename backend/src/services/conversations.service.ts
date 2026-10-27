import { and, asc, desc, eq, exists, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  blocks,
  conversationParticipants,
  conversations,
  type DmPolicy,
  follows,
  messageHides,
  messageReactions,
  messages,
  users,
} from '../db/schema';
import { AppError } from '../lib/errors';
import { decodeCursor, encodeCursor } from '../lib/cursor';
import { isUuid } from '../lib/uuid';
import { conversationRoom, emitToRoom, userRoom } from '../socket/realtime';

const userColumns = { id: true, username: true, name: true, avatarUrl: true } as const;

/** Quantos emojis distintos cada pessoa pode deixar numa mesma mensagem. */
export const MAX_REACTIONS_PER_USER = 5;

export interface Reaction {
  emoji: string;
  userId: string;
}

type Executor = Pick<typeof db, 'execute'>;

/**
 * Por que `senderId` não pode mandar mensagem para `recipientId` agora, ou `null` se pode.
 * Bloqueio (em qualquer sentido, como em `isBlockedEitherWay`) vem antes da política de quem recebe:
 * - `everyone`: qualquer pessoa;
 * - `following`: só quem o destinatário segue;
 * - `nobody`: ninguém.
 * A política vale para cada envio, inclusive em conversas que já existem. Uma consulta só, e aceita
 * a transação de quem chama (a criação da conversa confere já com o lock do par).
 */
async function messagingRefusal(
  senderId: string,
  recipientId: string,
  executor: Executor = db,
): Promise<AppError | null> {
  const result = await executor.execute<{ dm_policy: DmPolicy; blocked: boolean; followed: boolean }>(sql`
    select u.dm_policy,
      exists(
        select 1 from ${blocks} b
        where (b.blocker_id = ${senderId} and b.blocked_id = ${recipientId})
           or (b.blocker_id = ${recipientId} and b.blocked_id = ${senderId})
      ) as blocked,
      exists(
        select 1 from ${follows} f where f.follower_id = ${recipientId} and f.following_id = ${senderId}
      ) as followed
    from ${users} u
    where u.id = ${recipientId}
  `);
  const row = result.rows[0];
  if (!row) return null;
  if (row.blocked) {
    return new AppError(403, 'blocked', 'Não é possível enviar mensagens: há um bloqueio entre vocês');
  }
  if (row.dm_policy === 'nobody') {
    return new AppError(403, 'dm_not_allowed', 'Esta pessoa não recebe mensagens diretas');
  }
  if (row.dm_policy === 'following' && !row.followed) {
    return new AppError(403, 'dm_not_allowed', 'Esta pessoa só recebe mensagens de quem ela segue');
  }
  return null;
}

/** Lança `AppError(403, 'blocked')` ou `AppError(403, 'dm_not_allowed')` quando o envio não é permitido. */
export async function assertCanMessage(senderId: string, recipientId: string, executor: Executor = db): Promise<void> {
  const refusal = await messagingRefusal(senderId, recipientId, executor);
  if (refusal) throw refusal;
}

/** Se `senderId` pode mandar mensagem para `recipientId` agora. Falso para si mesmo. */
export async function canMessage(senderId: string, recipientId: string): Promise<boolean> {
  if (senderId === recipientId) return false;
  return (await messagingRefusal(senderId, recipientId)) === null;
}

/** As reações de cada mensagem, na ordem em que foram feitas. */
async function reactionsByMessage(messageIds: string[]): Promise<Map<string, Reaction[]>> {
  const byMessage = new Map<string, Reaction[]>();
  if (messageIds.length === 0) return byMessage;
  const rows = await db
    .select({ messageId: messageReactions.messageId, emoji: messageReactions.emoji, userId: messageReactions.userId })
    .from(messageReactions)
    .where(inArray(messageReactions.messageId, messageIds))
    .orderBy(asc(messageReactions.createdAt), asc(messageReactions.id));
  for (const row of rows) {
    const list = byMessage.get(row.messageId) ?? [];
    list.push({ emoji: row.emoji, userId: row.userId });
    byMessage.set(row.messageId, list);
  }
  return byMessage;
}

/** Acrescenta `reactions` a cada mensagem. */
export async function withReactions<T extends { id: string }>(items: T[]): Promise<(T & { reactions: Reaction[] })[]> {
  const byMessage = await reactionsByMessage(items.map((m) => m.id));
  return items.map((m) => ({ ...m, reactions: byMessage.get(m.id) ?? [] }));
}

/**
 * Minhas conversas, a mais recente primeiro. A última mensagem é a última que eu vejo: ignora as
 * que apaguei para mim e as anteriores à minha saída. Uma conversa de que saí só volta quando
 * chega uma mensagem nova. `muted` diz se eu a silenciei (ela continua contando como não lida).
 */
export async function listMine(userId: string) {
  const participations = await db.query.conversationParticipants.findMany({
    where: eq(conversationParticipants.userId, userId),
    with: {
      conversation: {
        with: { participants: { with: { user: { columns: userColumns } } } },
      },
    },
  });
  if (participations.length === 0) return [];

  const lastVisible = await db.execute<{ conversation_id: string; message_id: string | null }>(sql`
    select cp.conversation_id, lm.id as message_id
    from ${conversationParticipants} cp
    left join lateral (
      select m.id from ${messages} m
      where m.conversation_id = cp.conversation_id
        and (cp.cleared_at is null or m.created_at > cp.cleared_at)
        and not exists (select 1 from ${messageHides} mh where mh.message_id = m.id and mh.user_id = cp.user_id)
      order by m.created_at desc, m.id desc
      limit 1
    ) lm on true
    where cp.user_id = ${userId}
  `);
  const lastIdByConversation = new Map(lastVisible.rows.map((row) => [row.conversation_id, row.message_id]));
  const lastIds = [...lastIdByConversation.values()].filter((id): id is string => id !== null);
  const lastMessages =
    lastIds.length === 0 ? [] : await db.query.messages.findMany({ where: inArray(messages.id, lastIds) });
  const messageById = new Map(lastMessages.map((m) => [m.id, m]));

  return participations
    .map((p) => {
      const conversation = p.conversation;
      const otherUser = conversation.participants.find((cp) => cp.userId !== userId)?.user ?? null;
      const lastId = lastIdByConversation.get(conversation.id);
      const lastMessage = (lastId && messageById.get(lastId)) || null;
      // Sem o check de senderId, mandar uma mensagem própria já deixava a
      // conversa "não lida": lastMessage.createdAt fica mais novo que o meu
      // lastReadAt (setado antes de eu enviar), então a comparação de data
      // sozinha achava que eu tinha recebido algo — mesmo sendo eu quem mandou.
      const unread = lastMessage
        ? lastMessage.senderId !== userId && (!p.lastReadAt || lastMessage.createdAt > p.lastReadAt)
        : false;

      return { id: conversation.id, otherUser, lastMessage, unread, muted: p.muted, left: p.clearedAt !== null };
    })
    .filter((item) => !(item.left && item.lastMessage === null))
    .map(({ left: _left, ...item }) => item)
    .sort((a, b) => {
      const aTime = a.lastMessage?.createdAt.getTime() ?? 0;
      const bTime = b.lastMessage?.createdAt.getTime() ?? 0;
      return bTime - aTime;
    });
}

type DbOrTx = Pick<typeof db, 'query' | 'select'>;

async function findExistingConversation(executor: DbOrTx, userId: string, otherUserId: string) {
  const candidates = await executor.query.conversations.findMany({
    where: and(
      exists(
        executor
          .select()
          .from(conversationParticipants)
          .where(
            and(eq(conversationParticipants.conversationId, conversations.id), eq(conversationParticipants.userId, userId)),
          ),
      ),
      exists(
        executor
          .select()
          .from(conversationParticipants)
          .where(
            and(
              eq(conversationParticipants.conversationId, conversations.id),
              eq(conversationParticipants.userId, otherUserId),
            ),
          ),
      ),
    ),
    with: { participants: true },
  });

  return candidates.find((c) => c.participants.length === 2) ?? null;
}

export async function findOrCreateWithUser(userId: string, otherUserId: string) {
  if (userId === otherUserId) {
    throw new AppError(400, 'invalid_operation', 'Não é possível iniciar uma conversa consigo mesmo');
  }

  const otherUser = await db.query.users.findFirst({ where: eq(users.id, otherUserId) });
  if (!otherUser) throw new AppError(404, 'not_found', 'Usuário não encontrado');

  return db.transaction(async (tx) => {
    // Duas requisições simultâneas para o mesmo par (inclusive cada pessoa iniciando com a outra)
    // não podem criar duas conversas: o lock é por par, independente da ordem dos ids, e vale até
    // o fim da transação. A checagem de existência acontece já com o lock.
    const [low, high] = [userId, otherUserId].sort();
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`conversation:${low}:${high}`}, 0))`);

    // Bloqueio e política de quem recebe. Vale também para reabrir uma conversa que já existe: a
    // política governa todo envio.
    await assertCanMessage(userId, otherUserId, tx);

    const existing = await findExistingConversation(tx, userId, otherUserId);
    if (existing) return { id: existing.id };

    const [conversation] = await tx.insert(conversations).values({}).returning();
    await tx.insert(conversationParticipants).values([
      { conversationId: conversation!.id, userId },
      { conversationId: conversation!.id, userId: otherUserId },
    ]);
    return { id: conversation!.id };
  });
}

async function requireParticipant(userId: string, conversationId: string) {
  const participant = isUuid(conversationId)
    ? await db.query.conversationParticipants.findFirst({
        where: and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, userId)),
      })
    : undefined;
  if (!participant) throw new AppError(404, 'not_found', 'Conversa não encontrada');
  return participant;
}

const messageNotFound = () => new AppError(404, 'not_found', 'Mensagem não encontrada');

/** A mensagem existe nesta conversa (da qual `userId` participa). */
async function requireMessage(userId: string, conversationId: string, messageId: string) {
  const participant = await requireParticipant(userId, conversationId);
  if (!isUuid(messageId)) throw messageNotFound();
  const message = await db.query.messages.findFirst({
    where: and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)),
    columns: { id: true },
  });
  if (!message) throw messageNotFound();
  return participant;
}

/** Como `requireMessage`, e a mensagem precisa estar visível para mim (não apagada nem anterior à minha saída). */
async function requireVisibleMessage(userId: string, conversationId: string, messageId: string) {
  const participant = await requireParticipant(userId, conversationId);
  if (!isUuid(messageId)) throw messageNotFound();
  const result = await db.execute<{ id: string }>(sql`
    select m.id from ${messages} m
    join ${conversationParticipants} cp on cp.id = ${participant.id}
    where m.id = ${messageId} and m.conversation_id = ${conversationId}
      and (cp.cleared_at is null or m.created_at > cp.cleared_at)
      and not exists (select 1 from ${messageHides} mh where mh.message_id = m.id and mh.user_id = ${userId})
  `);
  if (result.rows.length === 0) throw messageNotFound();
  return participant;
}

/**
 * Histórico da conversa, a mais recente primeiro. Só o que eu vejo: sem as mensagens que apaguei
 * para mim e sem as anteriores à minha saída. Cada mensagem leva as suas reações.
 */
export async function getMessages(userId: string, conversationId: string, cursor: string | undefined, limit: number) {
  const participant = await requireParticipant(userId, conversationId);

  const filters = [
    eq(messages.conversationId, conversationId),
    // Os nomes vão em texto: dentro do `where` de db.query.* as colunas do schema são reescritas
    // para a tabela principal (messages).
    sql`not exists (select 1 from ${messageHides} mh where mh.message_id = ${messages.id} and mh.user_id = ${userId})`,
  ];
  if (participant.clearedAt) {
    // Compara no banco, com microssegundos (o Date do JS só guarda milissegundos).
    filters.push(
      sql`${messages.createdAt} > (select cp_clr.cleared_at from ${conversationParticipants} cp_clr where cp_clr.id = ${participant.id})`,
    );
  }
  if (cursor) {
    const decoded = decodeCursor(cursor);
    filters.push(sql`(${messages.createdAt}, ${messages.id}) < (${decoded.createdAt.toISOString()}, ${decoded.id})`);
  }

  const results = await db.query.messages.findMany({
    where: and(...filters),
    orderBy: [desc(messages.createdAt), desc(messages.id)],
    limit: limit + 1,
    with: { sender: { columns: userColumns } },
  });

  const hasMore = results.length > limit;
  const items = await withReactions(results.slice(0, limit));
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

  return { items, nextCursor };
}

export async function markRead(userId: string, conversationId: string) {
  const participant = await requireParticipant(userId, conversationId);
  await db
    .update(conversationParticipants)
    .set({ lastReadAt: sql`now()` })
    .where(eq(conversationParticipants.id, participant.id));
}

/** Marca como lidas todas as minhas conversas. */
export async function markAllRead(userId: string) {
  await db
    .update(conversationParticipants)
    .set({ lastReadAt: sql`now()` })
    .where(eq(conversationParticipants.userId, userId));
}

/** Silencia (ou reativa) a conversa para mim: sem push enquanto silenciada. */
export async function setMuted(userId: string, conversationId: string, muted: boolean) {
  const participant = await requireParticipant(userId, conversationId);
  await db.update(conversationParticipants).set({ muted }).where(eq(conversationParticipants.id, participant.id));
}

/**
 * Sair da conversa: some da minha lista com todo o histórico, só para mim. A conversa continua
 * existindo; uma mensagem nova a traz de volta, mostrando só o que veio depois.
 */
export async function leave(userId: string, conversationId: string) {
  const participant = await requireParticipant(userId, conversationId);
  await db
    .update(conversationParticipants)
    .set({ clearedAt: sql`now()` })
    .where(eq(conversationParticipants.id, participant.id));
}

/** Apaga a mensagem só para mim; o outro participante continua vendo. Avisa os meus outros sockets. */
export async function hideMessage(userId: string, conversationId: string, messageId: string) {
  await requireMessage(userId, conversationId, messageId);
  const inserted = await db
    .insert(messageHides)
    .values({ messageId, userId })
    .onConflictDoNothing()
    .returning({ id: messageHides.id });
  if (inserted.length > 0) emitToRoom(userRoom(userId), 'message:hidden', { conversationId, messageId });
}

async function otherParticipantIds(userId: string, conversationId: string) {
  const participants = await db.query.conversationParticipants.findMany({
    where: eq(conversationParticipants.conversationId, conversationId),
    columns: { userId: true },
  });
  return participants.map((p) => p.userId).filter((id) => id !== userId);
}

/**
 * Reage a uma mensagem. Idempotente por (mensagem, pessoa, emoji); cada pessoa usa no máximo
 * `MAX_REACTIONS_PER_USER` emojis distintos por mensagem (409 `reaction_limit`). Reagir é um envio:
 * segue o bloqueio e a política de mensagens de quem recebe.
 */
export async function addReaction(userId: string, conversationId: string, messageId: string, emoji: string) {
  await requireVisibleMessage(userId, conversationId, messageId);
  for (const otherId of await otherParticipantIds(userId, conversationId)) await assertCanMessage(userId, otherId);

  if (await insertReaction(messageId, userId, emoji)) {
    emitToRoom(conversationRoom(conversationId), 'message:reaction', {
      conversationId,
      messageId,
      emoji,
      userId,
      action: 'add',
    });
  }
}

/**
 * Grava a reação respeitando o limite por pessoa. `false` se ela já existia; 409 `reaction_limit`
 * se a pessoa já usou os 5 emojis. Exportada para o teste de concorrência.
 */
export async function insertReaction(messageId: string, userId: string, emoji: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Por (mensagem, pessoa): duas reações simultâneas não passam juntas do limite.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`reaction:${messageId}:${userId}`}, 0))`);
    const mine = await tx
      .select({ emoji: messageReactions.emoji })
      .from(messageReactions)
      .where(and(eq(messageReactions.messageId, messageId), eq(messageReactions.userId, userId)));
    if (mine.some((r) => r.emoji === emoji)) return false;
    if (mine.length >= MAX_REACTIONS_PER_USER) {
      throw new AppError(409, 'reaction_limit', `Você pode usar no máximo ${MAX_REACTIONS_PER_USER} reações por mensagem`);
    }
    const inserted = await tx
      .insert(messageReactions)
      .values({ messageId, userId, emoji })
      .onConflictDoNothing()
      .returning({ id: messageReactions.id });
    return inserted.length > 0;
  });
}

/** Remove a minha reação. Idempotente; vale mesmo com bloqueio (é desfazer algo meu). */
export async function removeReaction(userId: string, conversationId: string, messageId: string, emoji: string) {
  await requireMessage(userId, conversationId, messageId);
  const removed = await db
    .delete(messageReactions)
    .where(
      and(
        eq(messageReactions.messageId, messageId),
        eq(messageReactions.userId, userId),
        eq(messageReactions.emoji, emoji),
      ),
    )
    .returning({ id: messageReactions.id });
  if (removed.length > 0) {
    emitToRoom(conversationRoom(conversationId), 'message:reaction', {
      conversationId,
      messageId,
      emoji,
      userId,
      action: 'remove',
    });
  }
}
