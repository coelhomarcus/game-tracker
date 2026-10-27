import type { Request, Response } from 'express';
import { AppError } from '../lib/errors';
import * as gameEntriesService from '../services/gameEntries.service';
import * as gamesService from '../services/games.service';
import * as moderationService from '../services/moderation.service';
import * as postsService from '../services/posts.service';
import * as usersService from '../services/users.service';

export async function searchHandler(req: Request, res: Response) {
  const { q } = res.locals.query as { q: string };
  const results = await usersService.search(req.user!.id, q);
  res.json(results);
}

export async function getPublicProfileHandler(req: Request, res: Response) {
  const profile = await usersService.getPublicProfile(req.user!.id, req.params.id as string);
  res.json(profile);
}

export async function getUserPostsHandler(req: Request, res: Response) {
  const { cursor, limit, type, filter } = res.locals.query as {
    cursor?: string;
    limit: number;
    type?: 'activity' | 'post';
    filter?: 'media';
  };
  const result = await postsService.getUserPosts(req.user!.id, req.params.id as string, cursor, limit, type, filter);
  res.json(result);
}

export async function getFollowersHandler(req: Request, res: Response) {
  const { cursor, limit } = res.locals.query as { cursor?: string; limit: number };
  res.json(await usersService.listFollows(req.user!.id, req.params.id as string, 'followers', cursor, limit));
}

export async function getFollowingHandler(req: Request, res: Response) {
  const { cursor, limit } = res.locals.query as { cursor?: string; limit: number };
  res.json(await usersService.listFollows(req.user!.id, req.params.id as string, 'following', cursor, limit));
}

export async function getMyLikesHandler(req: Request, res: Response) {
  const { cursor, limit } = res.locals.query as { cursor?: string; limit: number };
  res.json(await postsService.getLikedPosts(req.user!.id, cursor, limit));
}

export async function getMyBookmarksHandler(req: Request, res: Response) {
  const { cursor, limit } = res.locals.query as { cursor?: string; limit: number };
  res.json(await postsService.getBookmarks(req.user!.id, cursor, limit));
}

export async function getUserCommentsHandler(req: Request, res: Response) {
  const { cursor, limit } = res.locals.query as { cursor?: string; limit: number };
  const result = await postsService.getUserComments(req.user!.id, req.params.id as string, cursor, limit);
  res.json(result);
}

/** Remove as anotações pessoais de um registro antes de mostrá-lo a outra pessoa. */
export function withoutNotes<T extends { notes?: unknown }>(entry: T): Omit<T, 'notes'> {
  const { notes: _notes, ...publicFields } = entry;
  return publicFields;
}

export async function getUserGameEntriesHandler(req: Request, res: Response) {
  const { status } = res.locals.query as { status?: 'backlog' | 'playing' | 'completed' | 'dropped' };
  const ownerId = req.params.id as string;
  // Com bloqueio entre quem vê e o dono, a coleção vem vazia.
  if (await moderationService.isBlockedEitherWay(req.user!.id, ownerId)) {
    res.json([]);
    return;
  }
  const entries = await gameEntriesService.listMine(ownerId, { status });
  // As anotações são pessoais: só quem as escreveu as vê. A coleção de outra pessoa sai sem `notes`.
  res.json(req.user!.id === ownerId ? entries : entries.map(withoutNotes));
}

export async function getUserFavoritesHandler(req: Request, res: Response) {
  const ownerId = req.params.id as string;
  if (await moderationService.isBlockedEitherWay(req.user!.id, ownerId)) {
    res.json([]);
    return;
  }
  const favorites = await gamesService.getFavoriteGames(ownerId);
  res.json(favorites);
}

export async function muteHandler(req: Request, res: Response) {
  await moderationService.mute(req.user!.id, req.params.id as string);
  res.status(204).send();
}

export async function unmuteHandler(req: Request, res: Response) {
  await moderationService.unmute(req.user!.id, req.params.id as string);
  res.status(204).send();
}

export async function blockHandler(req: Request, res: Response) {
  await moderationService.block(req.user!.id, req.params.id as string);
  res.status(204).send();
}

export async function unblockHandler(req: Request, res: Response) {
  await moderationService.unblock(req.user!.id, req.params.id as string);
  res.status(204).send();
}

export async function getMyMutesHandler(req: Request, res: Response) {
  const { cursor, limit } = res.locals.query as { cursor?: string; limit: number };
  res.json(await moderationService.listMutes(req.user!.id, cursor, limit));
}

export async function getMyBlocksHandler(req: Request, res: Response) {
  const { cursor, limit } = res.locals.query as { cursor?: string; limit: number };
  res.json(await moderationService.listBlocks(req.user!.id, cursor, limit));
}

export async function followHandler(req: Request, res: Response) {
  await usersService.follow(req.user!.id, req.params.id as string);
  res.status(204).send();
}

export async function unfollowHandler(req: Request, res: Response) {
  await usersService.unfollow(req.user!.id, req.params.id as string);
  res.status(204).send();
}

export async function deleteAccountHandler(req: Request, res: Response) {
  await usersService.deleteAccount(req.user!.id, req.body.password);
  res.status(204).send();
}

export async function updateProfileHandler(req: Request, res: Response) {
  await usersService.updateProfile(req.user!.id, req.body);
  res.status(204).send();
}

export async function uploadAvatarHandler(req: Request, res: Response) {
  if (!req.file) {
    throw new AppError(400, 'validation_error', 'Nenhum arquivo enviado');
  }
  const avatarUrl = await usersService.updateAvatar(req.user!.id, req.file.buffer);
  res.json({ avatarUrl });
}

export async function uploadBannerHandler(req: Request, res: Response) {
  if (!req.file) {
    throw new AppError(400, 'validation_error', 'Nenhum arquivo enviado');
  }
  const bannerUrl = await usersService.updateBanner(req.user!.id, req.file.buffer);
  res.json({ bannerUrl });
}

export async function removeAvatarHandler(req: Request, res: Response) {
  await usersService.removeAvatar(req.user!.id);
  res.status(204).send();
}

export async function removeBannerHandler(req: Request, res: Response) {
  await usersService.removeBanner(req.user!.id);
  res.status(204).send();
}
