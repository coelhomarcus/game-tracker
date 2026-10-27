import bcrypt from 'bcrypt';
import { and, eq, gt, isNull, ne, or } from 'drizzle-orm';
import { db } from '../db';
import { refreshTokens, users } from '../db/schema';
import { parseDurationMs } from '../lib/duration';
import { AppError } from '../lib/errors';
import { isUuid } from '../lib/uuid';
import {
  generateRefreshTokenSecret,
  hashRefreshTokenSecret,
  parseRefreshToken,
  signAccessToken,
} from '../lib/tokens';

const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? '30d';

interface Session {
  accessToken: string;
  refreshToken: string;
}

function toPublicUser(user: {
  id: string;
  username: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
  dmPolicy: string;
}) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    bannerUrl: user.bannerUrl,
    bio: user.bio,
    dmPolicy: user.dmPolicy,
  };
}

async function issueSession(userId: string): Promise<Session> {
  const accessToken = signAccessToken(userId);
  const { secret, hash } = generateRefreshTokenSecret();
  const expiresAt = new Date(Date.now() + parseDurationMs(REFRESH_EXPIRES_IN));

  const [record] = await db.insert(refreshTokens).values({ userId, tokenHash: hash, expiresAt }).returning();

  return { accessToken, refreshToken: `${record!.id}.${secret}` };
}

export async function register(username: string, name: string, email: string, password: string) {
  const existing = await db.query.users.findFirst({ where: or(eq(users.username, username), eq(users.email, email)) });
  if (existing) {
    throw new AppError(409, 'conflict', 'Username ou email já cadastrado');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(users).values({ username, name, email, passwordHash }).returning();
  const session = await issueSession(user!.id);

  return { user: toPublicUser(user!), ...session };
}

export async function login(identifier: string, password: string) {
  const user = await db.query.users.findFirst({
    where: or(eq(users.email, identifier), eq(users.username, identifier)),
  });
  if (!user) {
    throw new AppError(401, 'invalid_credentials', 'Credenciais inválidas');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, 'invalid_credentials', 'Credenciais inválidas');
  }

  const session = await issueSession(user.id);
  return { user: toPublicUser(user), ...session };
}

export async function refresh(rawRefreshToken: string) {
  const parsed = parseRefreshToken(rawRefreshToken);
  if (!parsed) {
    throw new AppError(401, 'invalid_refresh_token', 'Refresh token inválido');
  }

  // Validação e revogação num único UPDATE condicional: com SELECT + UPDATE separados,
  // várias requisições simultâneas com o mesmo token passavam na checagem e cada uma
  // emitia uma sessão nova. Só a que efetivamente revoga o registro recebe a sessão.
  const [revoked] = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.id, parsed.id),
        eq(refreshTokens.tokenHash, hashRefreshTokenSecret(parsed.secret)),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: refreshTokens.userId });

  if (!revoked) {
    throw new AppError(401, 'invalid_refresh_token', 'Refresh token inválido ou expirado');
  }

  return issueSession(revoked.userId);
}

export async function me(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) {
    throw new AppError(404, 'not_found', 'Usuário não encontrado');
  }
  return toPublicUser(user);
}

/**
 * Confere a senha de quem está logado. Senha errada é 400 (`invalid_password`) e não 401: o
 * cliente usa o 401 para renovar a sessão, e aqui a sessão está certa.
 */
export async function assertPassword(userId: string, password: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { passwordHash: true } });
  if (!user) throw new AppError(404, 'not_found', 'Usuário não encontrado');
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError(400, 'invalid_password', 'Senha atual incorreta');
  }
}

/**
 * Troca a senha e encerra todas as outras sessões. `keepRefreshToken` é a sessão de quem trocou: só
 * continua valendo se for um token ativo deste usuário; qualquer outro valor encerra todas.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  keepRefreshToken: string,
) {
  await assertPassword(userId, currentPassword);
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const kept = parseRefreshToken(keepRefreshToken);

  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, userId));

    let keepId: string | null = null;
    if (kept && isUuid(kept.id)) {
      const [own] = await tx
        .select({ id: refreshTokens.id })
        .from(refreshTokens)
        .where(
          and(
            eq(refreshTokens.userId, userId),
            eq(refreshTokens.id, kept.id),
            eq(refreshTokens.tokenHash, hashRefreshTokenSecret(kept.secret)),
            isNull(refreshTokens.revokedAt),
            gt(refreshTokens.expiresAt, new Date()),
          ),
        );
      keepId = own?.id ?? null;
    }

    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.userId, userId),
          isNull(refreshTokens.revokedAt),
          keepId ? ne(refreshTokens.id, keepId) : undefined,
        ),
      );
  });
}

export async function logout(rawRefreshToken: string) {
  const parsed = parseRefreshToken(rawRefreshToken);
  if (!parsed) return;

  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.id, parsed.id), isNull(refreshTokens.revokedAt)));
}
