import { and, count, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { favorites, follows, gameEntries, gameEntryStatusEnum, games, posts } from '../db/schema';
import { AppError } from '../lib/errors';
import * as igdb from '../lib/igdb';
import * as moderationService from './moderation.service';

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

/** O resumo de um jogo nas listas: os campos da busca, mais o id local. */
function gameSummary(game: typeof games.$inferSelect) {
  return {
    id: game.id,
    igdbId: game.igdbId,
    name: game.name,
    summary: game.summary,
    coverUrl: game.coverUrl,
    screenshots: game.screenshots,
    platforms: game.platforms,
    genres: game.genres,
  };
}

const TRENDING_WINDOW = '7 days';

/**
 * "Em alta": os jogos com mais registros criados ou atualizados nos últimos 7 dias; no empate, o
 * de atividade mais recente. `game_entries` não tem `updated_at`: a atualização que conta é a de
 * status, que gera o post de atividade do registro (`posts.game_entry_id`, tipo `activity`). Cada
 * registro conta uma vez. Os registros de quem tem bloqueio com quem vê, ou foi silenciado por
 * ele, não contam.
 */
export async function getTrending(viewerId: string, limit: number) {
  const hidden = moderationService.hiddenAuthorsSql(viewerId, true);
  const result = await db.execute<{ game_id: string; entry_count: number }>(sql`
    with activity as (
      select ge.game_id, ge.id as entry_id, ge.created_at as at
      from ${gameEntries} ge
      where ge.created_at >= now() - ${TRENDING_WINDOW}::interval
        and ge.user_id not in ${hidden}
      union all
      select ge.game_id, ge.id as entry_id, p.created_at as at
      from ${posts} p
      join ${gameEntries} ge on ge.id = p.game_entry_id
      where p.type = 'activity'
        and p.created_at >= now() - ${TRENDING_WINDOW}::interval
        and ge.user_id not in ${hidden}
    )
    select game_id, count(distinct entry_id)::int as entry_count
    from activity
    group by game_id
    order by count(distinct entry_id) desc, max(at) desc, game_id
    limit ${limit}
  `);

  const ranked = result.rows;
  if (ranked.length === 0) return [];
  const rows = await db.query.games.findMany({ where: inArray(games.id, ranked.map((row) => row.game_id)) });
  const byId = new Map(rows.map((game) => [game.id, game]));
  return ranked.flatMap((row) => {
    const game = byId.get(row.game_id);
    return game ? [{ game: gameSummary(game), entryCount: Number(row.entry_count) }] : [];
  });
}

/**
 * "Quem está jogando" / "seus amigos estão jogando" — prévia limitada, sem
 * paginação. `scope: 'following'` lê os `followingId` da tabela `follows` e filtra os jogadores
 * com `inArray` (o feed de `posts.service.ts` usa uma subconsulta SQL no lugar disso). Quem tem
 * bloqueio com quem vê (em qualquer sentido) não aparece.
 */
export async function getPlayers(
  gameId: string,
  viewerId: string,
  status: GameEntryStatus,
  scope: 'all' | 'following',
  limit: number,
) {
  const conditions = [
    eq(gameEntries.gameId, gameId),
    eq(gameEntries.status, status),
    notInArray(gameEntries.userId, moderationService.blockedEitherWaySql(viewerId)),
  ];

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
