import type { Request, Response } from 'express';
import type { gameEntryStatusEnum } from '../db/schema';
import { AppError } from '../lib/errors';
import * as gamesService from '../services/games.service';
import * as postsService from '../services/posts.service';

type GameEntryStatus = (typeof gameEntryStatusEnum.enumValues)[number];

export async function searchHandler(_req: Request, res: Response) {
  const { q } = res.locals.query as { q: string };
  const results = await gamesService.searchGames(q);
  res.json(results);
}

export async function trendingHandler(req: Request, res: Response) {
  const { limit } = res.locals.query as { limit: number };
  res.json(await gamesService.getTrending(req.user!.id, limit));
}

export async function getByIdHandler(req: Request, res: Response) {
  const game = await gamesService.getGame(req.params.id as string, req.user!.id);
  res.json(game);
}

export async function getByIgdbIdHandler(req: Request, res: Response) {
  const igdbId = Number(req.params.igdbId);
  if (!Number.isInteger(igdbId) || igdbId <= 0) {
    throw new AppError(400, 'validation_error', 'igdbId inválido');
  }
  const game = await gamesService.findOrCacheGameByIgdbId(igdbId, req.user!.id);
  res.json(game);
}

export async function favoriteHandler(req: Request, res: Response) {
  await gamesService.addFavorite(req.user!.id, req.params.id as string);
  res.status(204).send();
}

export async function unfavoriteHandler(req: Request, res: Response) {
  await gamesService.removeFavorite(req.user!.id, req.params.id as string);
  res.status(204).send();
}

export async function statsHandler(req: Request, res: Response) {
  const stats = await gamesService.getStats(req.params.id as string);
  res.json(stats);
}

export async function playersHandler(req: Request, res: Response) {
  const { status, scope, limit } = res.locals.query as {
    status: GameEntryStatus;
    scope: 'all' | 'following';
    limit: number;
  };
  const players = await gamesService.getPlayers(req.params.id as string, req.user!.id, status, scope, limit);
  res.json(players);
}

export async function gamePostsHandler(req: Request, res: Response) {
  const { cursor, limit } = res.locals.query as { cursor?: string; limit: number };
  const result = await postsService.getGamePosts(req.params.id as string, req.user!.id, cursor, limit);
  res.json(result);
}
