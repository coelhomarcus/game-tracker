import { z } from 'zod';

export const createConversationSchema = z.object({
  userId: z.string().uuid(),
});

export const messagesQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});

// Um emoji só: uma sequência RGI (com tom de pele, ZWJ, bandeira) ou um pictograma isolado,
// com ou sem o seletor de variação (o "❤" sem o FE0F que alguns teclados mandam).
// Construída em tempo de execução: a flag `v` não passa pelo alvo de compilação do TypeScript.
const SINGLE_EMOJI = new RegExp(String.raw`^(?:\p{RGI_Emoji}|\p{Extended_Pictographic}\uFE0F?)$`, 'v');

/** Até 16 pontos de código: o tamanho da coluna `message_reactions.emoji`. */
export const REACTION_MAX_CODE_POINTS = 16;

export function isReactionEmoji(value: string): boolean {
  return [...value].length <= REACTION_MAX_CODE_POINTS && SINGLE_EMOJI.test(value);
}

export const reactionSchema = z.object({
  emoji: z.string().refine(isReactionEmoji, { message: 'Emoji inválido' }),
});
