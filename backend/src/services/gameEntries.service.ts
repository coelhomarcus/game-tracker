import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { gameEntries, gameEntryStatusEnum, games } from '../db/schema';
import { AppError } from '../lib/errors';
import { findOrCacheGameByIgdbId } from './games.service';
import * as postsService from './posts.service';

type GameEntryStatus = (typeof gameEntryStatusEnum.enumValues)[number];

interface CreateInput {
  igdbId: number;
  platform: string;
  status: GameEntryStatus;
  startedAt?: Date;
  finishedAt?: Date;
  hoursPlayed?: number;
  rating?: number;
  notes?: string;
}

/** Por campo: `undefined` mantém, `null` limpa, valor substitui. */
type ClearableFields = 'startedAt' | 'finishedAt' | 'hoursPlayed' | 'rating' | 'notes';
type UpdateInput = Partial<Pick<CreateInput, 'platform' | 'status'>> & {
  [K in ClearableFields]?: CreateInput[K] | null;
};

function getWithGame(id: string) {
  return db.query.gameEntries.findFirst({ where: eq(gameEntries.id, id), with: { game: true } });
}

const ACTIVITY_VERB: Partial<Record<GameEntryStatus, (gameName: string) => string>> = {
  backlog: (name) => `adicionou ${name} ao backlog`,
  playing: (name) => `começou a jogar ${name}`,
  completed: (name) => `zerou ${name}! 🎉`,
  dropped: (name) => `abandonou ${name}`,
};

/** Best-effort: nunca deixa o post automático quebrar o fluxo principal de criar/atualizar o registro. */
async function recordActivity(userId: string, entryId: string, game: { id: string; name: string }, status: GameEntryStatus) {
  const content = ACTIVITY_VERB[status]?.(game.name);
  if (!content) return;

  try {
    // activityStatus é o snapshot imutável do status no momento desta
    // atividade — não pode vir de gameEntry.status, que muda depois.
    await postsService.recordGameActivity({ userId, gameEntryId: entryId, gameId: game.id, activityStatus: status, content });
  } catch (err) {
    console.error('Falha ao gravar atividade automática:', err);
  }
}

async function getOwnedEntry(userId: string, entryId: string) {
  const entry = await db.query.gameEntries.findFirst({ where: eq(gameEntries.id, entryId) });
  if (!entry || entry.userId !== userId) {
    throw new AppError(404, 'not_found', 'Registro não encontrado');
  }
  return entry;
}

export async function create(userId: string, input: CreateInput) {
  const game = await findOrCacheGameByIgdbId(input.igdbId, userId);

  const [created] = await db
    .insert(gameEntries)
    .values({
      userId,
      gameId: game.id,
      platform: input.platform,
      status: input.status,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      hoursPlayed: input.hoursPlayed?.toString(),
      rating: input.rating,
      notes: input.notes,
    })
    .returning();

  await recordActivity(userId, created!.id, game, input.status);

  return getWithGame(created!.id);
}

const SORT_ORDER = {
  recent: desc(gameEntries.createdAt),
  oldest: asc(gameEntries.createdAt),
  // NULLS LAST explícito: por padrão o Postgres põe NULL primeiro em DESC —
  // sem isso, um jogo sem hora nenhuma registrada aparecia como "o mais jogado".
  most_played: sql`${gameEntries.hoursPlayed} DESC NULLS LAST`,
} as const;

export async function listMine(
  userId: string,
  filters: { status?: GameEntryStatus; igdbId?: number; sort?: keyof typeof SORT_ORDER } = {},
) {
  const conditions = [eq(gameEntries.userId, userId)];
  if (filters.status) conditions.push(eq(gameEntries.status, filters.status));
  if (filters.igdbId) {
    conditions.push(
      inArray(
        gameEntries.gameId,
        db.select({ id: games.id }).from(games).where(eq(games.igdbId, filters.igdbId)),
      ),
    );
  }

  return db.query.gameEntries.findMany({
    where: and(...conditions),
    with: { game: true },
    orderBy: SORT_ORDER[filters.sort ?? 'recent'],
  });
}

export async function update(userId: string, entryId: string, input: UpdateInput) {
  const existing = await getOwnedEntry(userId, entryId);

  // Só as chaves presentes entram no SET: `undefined` não toca na coluna e `null` a limpa.
  // hoursPlayed precisa de tratamento próprio — `null?.toString()` viraria `undefined`
  // e a coluna nunca seria limpa.
  const values: Partial<typeof gameEntries.$inferInsert> = {};
  if (input.platform !== undefined) values.platform = input.platform;
  if (input.status !== undefined) values.status = input.status;
  if (input.startedAt !== undefined) values.startedAt = input.startedAt;
  if (input.finishedAt !== undefined) values.finishedAt = input.finishedAt;
  if (input.hoursPlayed !== undefined) {
    values.hoursPlayed = input.hoursPlayed === null ? null : input.hoursPlayed.toString();
  }
  if (input.rating !== undefined) values.rating = input.rating;
  if (input.notes !== undefined) values.notes = input.notes;

  // PATCH vazio é válido (nada a mudar); o Drizzle rejeitaria um SET sem colunas.
  if (Object.keys(values).length > 0) {
    await db.update(gameEntries).set(values).where(eq(gameEntries.id, entryId));
  }

  const result = await getWithGame(entryId);

  if (
    input.status &&
    input.status !== existing.status &&
    result &&
    (input.status === 'playing' || input.status === 'completed' || input.status === 'dropped')
  ) {
    await recordActivity(userId, entryId, result.game, input.status);
  }

  return result;
}

export async function remove(userId: string, entryId: string) {
  await getOwnedEntry(userId, entryId);
  await db.delete(gameEntries).where(eq(gameEntries.id, entryId));
}
