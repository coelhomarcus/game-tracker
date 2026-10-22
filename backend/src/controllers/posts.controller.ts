import type { Request, Response } from 'express';
import { AppError } from '../lib/errors';
import * as postsService from '../services/posts.service';

export async function createHandler(req: Request, res: Response) {
  const post = await postsService.create(req.user!.id, req.body);
  res.status(201).json(post);
}

export async function getByIdHandler(req: Request, res: Response) {
  const post = await postsService.getById(req.params.id as string, req.user!.id);
  res.json(post);
}

export async function feedHandler(req: Request, res: Response) {
  const { cursor, limit, scope } = res.locals.query as {
    cursor?: string;
    limit: number;
    scope: 'following' | 'general';
  };
  const result = await postsService.getFeed(req.user!.id, cursor, limit, scope);
  res.json(result);
}

export async function likeHandler(req: Request, res: Response) {
  await postsService.like(req.user!.id, req.params.id as string);
  res.status(204).send();
}

export async function unlikeHandler(req: Request, res: Response) {
  await postsService.unlike(req.user!.id, req.params.id as string);
  res.status(204).send();
}

export async function repostHandler(req: Request, res: Response) {
  await postsService.repost(req.user!.id, req.params.id as string);
  res.status(204).send();
}

export async function unrepostHandler(req: Request, res: Response) {
  await postsService.unrepost(req.user!.id, req.params.id as string);
  res.status(204).send();
}

export async function bookmarkHandler(req: Request, res: Response) {
  await postsService.bookmark(req.user!.id, req.params.id as string);
  res.status(204).send();
}

export async function unbookmarkHandler(req: Request, res: Response) {
  await postsService.unbookmark(req.user!.id, req.params.id as string);
  res.status(204).send();
}

export async function deleteHandler(req: Request, res: Response) {
  await postsService.deletePost(req.user!.id, req.params.id as string);
  res.status(204).send();
}

export async function uploadImageHandler(req: Request, res: Response) {
  if (!req.file) {
    throw new AppError(400, 'validation_error', 'Nenhum arquivo enviado');
  }
  res.status(201).json(await postsService.uploadImage(req.file.buffer));
}

export async function addCommentHandler(req: Request, res: Response) {
  const comment = await postsService.addComment(
    req.user!.id,
    req.params.id as string,
    req.body.content,
    req.body.parentCommentId,
  );
  res.status(201).json(comment);
}

export async function listCommentsHandler(req: Request, res: Response) {
  const comments = await postsService.listComments(req.params.id as string, req.user!.id);
  res.json(comments);
}
