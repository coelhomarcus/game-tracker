import { z } from 'zod';
import { countCodePoints, countGraphemes } from '../lib/graphemes';
import { usernameSchema } from './auth.schema';

export const NAME_MAX_GRAPHEMES = 64;
export const BIO_MAX_GRAPHEMES = 256;
// Um grafema pode ter muitos pontos de código (sinais combinantes, emoji com ZWJ). O limite visível
// é em grafemas; este teto, 4 vezes maior e igual ao tamanho da coluna, impede que um texto
// "curto" só na aparência estoure o `varchar` (o que viraria 500 em vez de 400).
export const NAME_MAX_CODE_POINTS = NAME_MAX_GRAPHEMES * 4;
export const BIO_MAX_CODE_POINTS = BIO_MAX_GRAPHEMES * 4;

/** Texto de perfil: espaços no fim saem, o limite vale depois disso e em grafemas. */
function profileText(maxGraphemes: number, maxCodePoints: number, label: string) {
  return z
    .string()
    .transform((value) => value.trimEnd())
    .refine((value) => countCodePoints(value) <= maxCodePoints && countGraphemes(value) <= maxGraphemes, {
      message: `${label} deve ter no máximo ${maxGraphemes} caracteres`,
    });
}

export const searchUsersQuerySchema = z.object({
  q: z.string().min(1).max(50),
});

export const updateProfileSchema = z.object({
  username: usernameSchema.optional(),
  // O nome não pode ficar vazio (nem só espaços); a bio vazia limpa o campo.
  name: profileText(NAME_MAX_GRAPHEMES, NAME_MAX_CODE_POINTS, 'O nome')
    .refine((value) => value.trim().length > 0, { message: 'O nome não pode ser vazio' })
    .optional(),
  bio: profileText(BIO_MAX_GRAPHEMES, BIO_MAX_CODE_POINTS, 'A bio').optional(),
});

export const userPostsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  type: z.enum(['activity', 'post']).optional(),
  filter: z.enum(['media']).optional(),
});

export const followListQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});
