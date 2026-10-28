import { z } from 'zod';

export const searchGamesQuerySchema = z.object({
  q: z.string().min(1).max(100),
});

export const trendingGamesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).optional().default(10),
});

export const gamePlayersQuerySchema = z.object({
  status: z.enum(['backlog', 'playing', 'completed', 'dropped']).optional().default('playing'),
  scope: z.enum(['all', 'following']).optional().default('all'),
  limit: z.coerce.number().int().min(1).max(20).optional().default(10),
});

export const gamePostsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});
