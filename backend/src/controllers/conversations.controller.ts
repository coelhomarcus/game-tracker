import type { Request, Response } from 'express';
import * as conversationsService from '../services/conversations.service';

export async function listHandler(req: Request, res: Response) {
  const conversations = await conversationsService.listMine(req.user!.id);
  res.json(conversations);
}

export async function createHandler(req: Request, res: Response) {
  const conversation = await conversationsService.findOrCreateWithUser(req.user!.id, req.body.userId);
  res.status(201).json(conversation);
}

export async function messagesHandler(req: Request, res: Response) {
  const { cursor, limit } = res.locals.query as { cursor?: string; limit: number };
  const result = await conversationsService.getMessages(req.user!.id, req.params.id as string, cursor, limit);
  res.json(result);
}

export async function markReadHandler(req: Request, res: Response) {
  await conversationsService.markRead(req.user!.id, req.params.id as string);
  res.status(204).send();
}

export async function markAllReadHandler(req: Request, res: Response) {
  await conversationsService.markAllRead(req.user!.id);
  res.status(204).send();
}

export async function muteHandler(req: Request, res: Response) {
  await conversationsService.setMuted(req.user!.id, req.params.id as string, true);
  res.status(204).send();
}

export async function unmuteHandler(req: Request, res: Response) {
  await conversationsService.setMuted(req.user!.id, req.params.id as string, false);
  res.status(204).send();
}

export async function leaveHandler(req: Request, res: Response) {
  await conversationsService.leave(req.user!.id, req.params.id as string);
  res.status(204).send();
}

export async function hideMessageHandler(req: Request, res: Response) {
  await conversationsService.hideMessage(req.user!.id, req.params.id as string, req.params.messageId as string);
  res.status(204).send();
}

export async function addReactionHandler(req: Request, res: Response) {
  const { emoji } = req.body as { emoji: string };
  await conversationsService.addReaction(req.user!.id, req.params.id as string, req.params.messageId as string, emoji);
  res.status(204).send();
}

export async function removeReactionHandler(req: Request, res: Response) {
  await conversationsService.removeReaction(
    req.user!.id,
    req.params.id as string,
    req.params.messageId as string,
    req.params.emoji as string,
  );
  res.status(204).send();
}
