import { z } from 'zod';

const postImageSchema = z.object({
  url: z.string().url().max(500),
  // O servidor guarda o tamanho real do arquivo; aqui só se recusa lixo.
  width: z.number().int().positive().max(20000),
  height: z.number().int().positive().max(20000),
  alt: z.string().max(1000).optional(),
});

export const createPostSchema = z.object({
  // Aparado antes de medir. Pode ficar vazio só quando o post tem imagem (veja o refine abaixo).
  content: z.string().trim().max(500).default(''),
  gameEntryId: z.string().uuid().optional(),
  // Vínculo livre a qualquer jogo do catálogo, sem exigir um playthrough
  // trackeado. Se gameEntryId também vier, o service deriva o gameId dali
  // e ignora este campo.
  gameId: z.string().uuid().optional(),
  type: z.enum(['status', 'review', 'activity']).optional().default('status'),
  // Legado: aceito por compatibilidade, mas só vale uma imagem emitida por POST /posts/images
  // (o service a trata como `images[0]`).
  imageUrl: z.string().url().max(500).optional(),
  // Imagens enviadas por POST /posts/images, na ordem de exibição (a primeira vira o `imageUrl`).
  images: z.array(postImageSchema).max(4).optional(),
  quotedPostId: z.string().uuid().optional(),
}).refine((post) => !(post.imageUrl && post.images?.length), {
  message: 'Use imageUrl ou images, não os dois',
  path: ['images'],
}).refine((post) => post.content.length > 0 || Boolean(post.imageUrl) || (post.images?.length ?? 0) > 0, {
  // Só o texto ou uma imagem sustentam um post; citar sozinho não.
  message: 'Escreva algo ou anexe uma imagem',
  path: ['content'],
});

export const bookmarksQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export const searchPostsQuerySchema = z.object({
  // Aparado antes de medir: só espaços não é uma busca.
  q: z.string().trim().min(2).max(100),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export const feedQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  scope: z.enum(['following', 'general']).optional().default('following'),
});

export const createCommentSchema = z.object({
  content: z.string().min(1).max(500),
  parentCommentId: z.string().uuid().optional(),
});

export const commentsQuerySchema = z.object({
  sort: z.enum(['top', 'oldest', 'newest']).optional().default('oldest'),
});
