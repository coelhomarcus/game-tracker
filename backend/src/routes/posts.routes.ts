import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  addCommentHandler,
  bookmarkHandler,
  createHandler,
  deleteHandler,
  getByIdHandler,
  likeHandler,
  listCommentsHandler,
  repostHandler,
  searchHandler,
  unbookmarkHandler,
  unlikeHandler,
  unrepostHandler,
  uploadImageHandler,
} from '../controllers/posts.controller';
import { AppError } from '../lib/errors';
import { postImageUpload } from '../lib/uploads';
import { isUuid } from '../lib/uuid';
import { requireAuth } from '../middlewares/auth';
import { validateBody, validateQuery } from '../middlewares/validate';
import { commentsQuerySchema, createCommentSchema, createPostSchema, searchPostsQuerySchema } from '../schemas/posts.schema';

// Cada envio grava um arquivo em disco: 30 por 10 minutos por usuário. `POST_IMAGE_RATE_LIMIT_MAX`
// existe para os testes e é lida a cada requisição. A chave é o usuário (o limitador roda depois
// do `requireAuth`), não o IP, que em redes móveis é compartilhado.
const postImageLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: () => Number(process.env.POST_IMAGE_RATE_LIMIT_MAX) || 30,
  keyGenerator: (req) => req.user!.id,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => next(new AppError(429, 'rate_limited', 'Muitos envios de imagem, tente novamente em alguns minutos')),
});

export const postsRouter = Router();

postsRouter.use(requireAuth);

// Um id que nem é uuid não existe: 404, em vez de o Postgres recusar a consulta (500).
postsRouter.param('id', (_req, _res, next, id) => {
  if (!isUuid(id)) throw new AppError(404, 'not_found', 'Post não encontrado');
  next();
});

postsRouter.post('/', validateBody(createPostSchema), createHandler);
postsRouter.post('/images', postImageLimiter, postImageUpload.single('image'), uploadImageHandler);
// Antes das rotas /:id, senão "search" seria lido como um id.
postsRouter.get('/search', validateQuery(searchPostsQuerySchema), searchHandler);
postsRouter.get('/:id', getByIdHandler);
postsRouter.delete('/:id', deleteHandler);
postsRouter.post('/:id/repost', repostHandler);
postsRouter.delete('/:id/repost', unrepostHandler);
postsRouter.post('/:id/bookmark', bookmarkHandler);
postsRouter.delete('/:id/bookmark', unbookmarkHandler);
postsRouter.post('/:id/like', likeHandler);
postsRouter.delete('/:id/like', unlikeHandler);
postsRouter.post('/:id/comments', validateBody(createCommentSchema), addCommentHandler);
postsRouter.get('/:id/comments', validateQuery(commentsQuerySchema), listCommentsHandler);
