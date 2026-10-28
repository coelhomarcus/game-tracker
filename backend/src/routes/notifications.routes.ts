import { Router } from 'express';
import { listHandler, markAllReadHandler, unreadCountHandler } from '../controllers/notifications.controller';
import { requireAuth } from '../middlewares/auth';
import { validateQuery } from '../middlewares/validate';
import { notificationsQuerySchema } from '../schemas/notifications.schema';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get('/', validateQuery(notificationsQuerySchema), listHandler);
notificationsRouter.get('/unread-count', unreadCountHandler);
notificationsRouter.post('/read-all', markAllReadHandler);
