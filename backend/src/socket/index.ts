import type { Server as HttpServer } from 'node:http';
import { eq } from 'drizzle-orm';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server } from 'socket.io';
import { parseCorsOrigins } from '../lib/corsOptions';
import { db } from '../db';
import { users } from '../db/schema';
import { createRedisClient } from '../lib/redis';
import { isUuid } from '../lib/uuid';
import { verifyAccessToken } from '../lib/tokens';
import { registerChatHandlers } from './chatHandlers';
import { setRealtimeServer } from './realtime';

export function initSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, { cors: { origin: parseCorsOrigins(process.env.CORS_ORIGINS) } });

  const pubClient = createRedisClient('redis:pub');
  const subClient = pubClient.duplicate();
  // duplicate() não herda os listeners do client original — precisa do próprio handler.
  subClient.on('error', (err: NodeJS.ErrnoException) => {
    console.error(`[redis:sub] erro de conexão: ${err.code ?? err.message}`);
  });
  io.adapter(createAdapter(pubClient, subClient));

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('unauthorized'));

    let userId: string;
    try {
      userId = verifyAccessToken(token).sub;
    } catch {
      return next(new Error('unauthorized'));
    }

    // O token de acesso vale por minutos mesmo depois de a conta ser apagada: sem esta conferência
    // o aparelho reconectaria logo após ser derrubado.
    try {
      const account = isUuid(userId)
        ? await db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true } })
        : undefined;
      if (!account) return next(new Error('unauthorized'));
    } catch (err) {
      console.error('[socket] não foi possível conferir a conta no handshake:', err);
      return next(new Error('server_error'));
    }
    socket.data.userId = userId;
    next();
  });

  io.on('connection', (socket) => {
    registerChatHandlers(io, socket);
  });

  // As rotas REST (apagar para mim, reações) avisam pelo mesmo servidor.
  setRealtimeServer(io);

  return io;
}
