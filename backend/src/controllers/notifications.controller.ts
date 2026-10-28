import type { Request, Response } from 'express';
import * as notificationsService from '../services/notifications.service';

export async function listHandler(req: Request, res: Response) {
  const { cursor, filter, limit } = res.locals.query as {
    cursor?: string;
    filter: notificationsService.NotificationFilter;
    limit: number;
  };
  const result = await notificationsService.list(req.user!.id, { cursor, filter, limit });
  res.json(result);
}

export async function unreadCountHandler(req: Request, res: Response) {
  res.json({ unreadCount: await notificationsService.unreadCount(req.user!.id) });
}

export async function markAllReadHandler(req: Request, res: Response) {
  await notificationsService.markAllRead(req.user!.id);
  res.status(204).send();
}
