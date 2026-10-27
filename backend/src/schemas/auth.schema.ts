import { z } from 'zod';

export const usernameSchema = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[a-zA-Z0-9_]+$/, 'Use apenas letras, números e underscore');

/** Regras da senha nova (cadastro e troca de senha). */
export const passwordSchema = z.string().min(8).max(72);

export const registerSchema = z.object({
  username: usernameSchema,
  name: z.string().min(1).max(50),
  email: z.string().email().max(255),
  password: passwordSchema,
});

export const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
  // A sessão que continua valendo: as outras são encerradas.
  refreshToken: z.string().min(1),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
