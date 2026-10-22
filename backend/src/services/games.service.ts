import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { favorites, follows, gameEntries, gameEntryStatusEnum, games } from '../db/schema';
import { AppError } from '../lib/errors';
import * as igdb from '../lib/igdb';

type GameEntryStatus = (typeof gameEntryStatusEnum.enumValues)[number];

const userColumns = { id: true, username: true, name: true, avatarUrl: true } as const;

export async function searchGames(term: string) {
  return igdb.searchGames(term);
}

async function isFavoritedByMe(viewerId: string, gameId: string) {
  const row = await db.query.favorites.findFirst({
    where: and(eq(favorites.userId, viewerId), eq(favorites.gameId, gameId)),
  });
  return row != null;
}

export async function getGame(id: string, viewerId: string) {
  const game = await db.query.games.findFirst({ where: eq(games.id, id) });
  if (!game) throw new AppError(404, 'not_found', 'Jogo não encontrado');
  return { ...game, isFavoritedByMe: await isFavoritedByMe(viewerId, game.id) };
}

/** Busca o jogo no cache local; se ausente, consulta a IGDB e cacheia. */
export async function findOrCacheGameByIgdbId(igdbId: number, viewerId: string) {
  const cached = await db.query.games.findFirst({ where: eq(games.igdbId, igdbId) });
  if (cached) return { ...cached, isFavoritedByMe: await isFavoritedByMe(viewerId, cached.id) };

  const fromIgdb = await igdb.getGameByIgdbId(igdbId);
  if (!fromIgdb) throw new AppError(404, 'not_found', 'Jogo não encontrado na IGDB');

  const [created] = await db
    .insert(games)
    .values({
      igdbId: fromIgdb.igdbId,
      name: fromIgdb.name,
      summary: fromIgdb.summary,
      coverUrl: fromIgdb.coverUrl,
      screenshots: fromIgdb.screenshots,
      platforms: fromIgdb.platforms,
      genres: fromIgdb.genres,
    })
    .returning();

  // Jogo acabado de cachear: nunca foi favoritado por ninguém ainda.
  return { ...created!, isFavoritedByMe: false };
}

/** Favoritar é sobre o jogo, não um playthrough — não exige ter trackeado nada. */
export async function addFavorite(userId: string, gameId: string) {
  const game = await db.query.games.findFirst({ where: eq(games.id, gameId) });
  if (!game) throw new AppError(404, 'not_found', 'Jogo não encontrado');

  await db.insert(favorites).values({ userId, gameId }).onConflictDoNothing({ target: [favorites.userId, favorites.gameId] });
}

export async function removeFavorite(userId: string, gameId: string) {
  await db.delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.gameId, gameId)));
}

/** Jogos favoritos de um perfil — mais recentes primeiro. */
export async function getFavoriteGames(userId: string) {
  const rows = await db.query.favorites.findMany({
    where: eq(favorites.userId, userId),
    orderBy: desc(favorites.createdAt),
    with: { game: true },
  });
  return rows.map((row) => row.game);
}

/** Contagem de playthroughs por status, pra "X jogando · Y zeraram · Z abandonaram". */
export async function getStats(gameId: string) {
  const rows = await db
    .select({ status: gameEntries.status, count: count() })
    .from(gameEntries)
    .where(eq(gameEntries.gameId, gameId))
    .groupBy(gameEntries.status);

  const stats: Record<GameEntryStatus, number> = { backlog: 0, playing: 0, completed: 0, dropped: 0 };
  for (const row of rows) stats[row.status] = row.count;
  return stats;
}

/**
 * "Quem está jogando" / "seus amigos estão jogando" — prévia limitada, sem
 * paginação. `scope: 'following'` lê os `followingId` da tabela `follows` e filtra os jogadores
 * com `inArray` (o feed de `posts.service.ts` usa uma subconsulta SQL no lugar disso).
 */
export async function getPlayers(
  gameId: string,
  viewerId: string,
  status: GameEntryStatus,
  scope: 'all' | 'following',
  limit: number,
) {
  const conditions = [eq(gameEntries.gameId, gameId), eq(gameEntries.status, status)];

  if (scope === 'following') {
    const following = await db
      .select({ followingId: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, viewerId));
    const authorIds = following.map((f) => f.followingId);
    if (authorIds.length === 0) return [];
    conditions.push(inArray(gameEntries.userId, authorIds));
  }

  const rows = await db.query.gameEntries.findMany({
    where: and(...conditions),
    orderBy: desc(gameEntries.createdAt),
    limit,
    with: { user: { columns: userColumns } },
  });

  return rows.map((row) => ({ user: row.user, status: row.status, hoursPlayed: row.hoursPlayed }));
}
