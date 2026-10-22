import { Router } from 'express';
import {
  addCommentHandler,
  bookmarkHandler,
  createHandler,
  deleteHandler,
  getByIdHandler,
  likeHandler,
  listCommentsHandler,
  repostHandler,
  unbookmarkHandler,
  unlikeHandler,
  unrepostHandler,
  uploadImageHandler,
} from '../controllers/posts.controller';
import { AppError } from '../lib/errors';
import { postImageUpload } from '../lib/uploads';
import { isUuid } from '../lib/uuid';
import { requireAuth } from '../middlewares/auth';
import { validateBody } from '../middlewares/validate';
import { createCommentSchema, createPostSchema } from '../schemas/posts.schema';

export const postsRouter = Router();

postsRouter.use(requireAuth);

// Um id que nem é uuid não existe: 404, em vez de o Postgres recusar a consulta (500).
postsRouter.param('id', (_req, _res, next, id) => {
  if (!isUuid(id)) throw new AppError(404, 'not_found', 'Post não encontrado');
  next();
});

postsRouter.post('/', validateBody(createPostSchema), createHandler);
postsRouter.post('/images', postImageUpload.single('image'), uploadImageHandler);
postsRouter.get('/:id', getByIdHandler);
postsRouter.delete('/:id', deleteHandler);
postsRouter.post('/:id/repost', repostHandler);
postsRouter.delete('/:id/repost', unrepostHandler);
postsRouter.post('/:id/bookmark', bookmarkHandler);
postsRouter.delete('/:id/bookmark', unbookmarkHandler);
postsRouter.post('/:id/like', likeHandler);
postsRouter.delete('/:id/like', unlikeHandler);
postsRouter.post('/:id/comments', validateBody(createCommentSchema), addCommentHandler);
postsRouter.get('/:id/comments', listCommentsHandler);
