import { Router } from 'express';
import { deleteCommentHandler, likeCommentHandler, unlikeCommentHandler } from '../controllers/comments.controller';
import { AppError } from '../lib/errors';
import { isUuid } from '../lib/uuid';
import { requireAuth } from '../middlewares/auth';

export const commentsRouter = Router();

commentsRouter.use(requireAuth);

// Um id que nem é uuid não existe: 404, em vez de o Postgres recusar a consulta (500).
commentsRouter.param('id', (_req, _res, next, id) => {
  if (!isUuid(id)) throw new AppError(404, 'not_found', 'Comentário não encontrado');
  next();
});

commentsRouter.delete('/:id', deleteCommentHandler);

commentsRouter.post('/:id/like', likeCommentHandler);
commentsRouter.delete('/:id/like', unlikeCommentHandler);
