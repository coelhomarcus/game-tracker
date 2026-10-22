import type { Request, Response } from 'express';
import * as postsService from '../services/posts.service';

export async function deleteCommentHandler(req: Request, res: Response) {
  await postsService.deleteComment(req.user!.id, req.params.id as string);
  res.status(204).send();
}

export async function likeCommentHandler(req: Request, res: Response) {
  await postsService.likeComment(req.user!.id, req.params.id as string);
  res.status(204).send();
}

export async function unlikeCommentHandler(req: Request, res: Response) {
  await postsService.unlikeComment(req.user!.id, req.params.id as string);
  res.status(204).send();
}
