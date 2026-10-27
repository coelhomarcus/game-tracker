import { Router } from 'express';
import {
  addReactionHandler,
  createHandler,
  hideMessageHandler,
  leaveHandler,
  listHandler,
  markAllReadHandler,
  markReadHandler,
  messagesHandler,
  muteHandler,
  removeReactionHandler,
  unmuteHandler,
} from '../controllers/conversations.controller';
import { requireAuth } from '../middlewares/auth';
import { validateBody, validateQuery } from '../middlewares/validate';
import { createConversationSchema, messagesQuerySchema, reactionSchema } from '../schemas/conversations.schema';

export const conversationsRouter = Router();

conversationsRouter.use(requireAuth);

conversationsRouter.get('/', listHandler);
conversationsRouter.post('/', validateBody(createConversationSchema), createHandler);
conversationsRouter.post('/read-all', markAllReadHandler);
conversationsRouter.delete('/:id', leaveHandler);
conversationsRouter.get('/:id/messages', validateQuery(messagesQuerySchema), messagesHandler);
conversationsRouter.post('/:id/read', markReadHandler);
conversationsRouter.post('/:id/mute', muteHandler);
conversationsRouter.delete('/:id/mute', unmuteHandler);
conversationsRouter.delete('/:id/messages/:messageId', hideMessageHandler);
conversationsRouter.post('/:id/messages/:messageId/reactions', validateBody(reactionSchema), addReactionHandler);
// O emoji vai codificado na URL; o Express já entrega o parâmetro decodificado.
conversationsRouter.delete('/:id/messages/:messageId/reactions/:emoji', removeReactionHandler);
