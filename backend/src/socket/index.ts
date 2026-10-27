import type { Server as HttpServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server } from 'socket.io';
import { parseCorsOrigins } from '../lib/corsOptions';
import { createRedisClient } from '../lib/redis';
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

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('unauthorized'));

    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    registerChatHandlers(io, socket);
  });

  // As rotas REST (apagar para mim, reações) avisam pelo mesmo servidor.
  setRealtimeServer(io);

  return io;
}
