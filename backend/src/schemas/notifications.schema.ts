import { z } from 'zod';

export const notificationsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  filter: z.enum(['all', 'replies', 'mentions', 'follows']).optional().default('all'),
  limit: z.coerce.number().int().min(1).max(50).optional().default(30),
});
