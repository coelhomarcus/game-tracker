import type { Server } from 'socket.io';

/**
 * Acesso ao Socket.IO fora dos handlers do socket (rotas REST que precisam avisar em tempo real).
 * Sem servidor registrado (scripts, testes sem socket) os avisos são ignorados.
 */
let current: Server | null = null;

export function setRealtimeServer(io: Server | null) {
  current = io;
}

/** Sala de uma conversa: quem abriu a conversa no app. */
export const conversationRoom = (conversationId: string) => `conversation:${conversationId}`;

/** Sala de um usuário: todos os sockets dele (vários aparelhos ou abas). */
export const userRoom = (userId: string) => `user:${userId}`;

/**
 * Derruba todos os sockets de um usuário. O adaptador do Redis só repassa o pedido às instâncias
 * pelo Redis; a chamada local garante o efeito imediato nesta instância, mesmo se o Redis atrasar.
 */
export function disconnectUser(userId: string) {
  const room = userRoom(userId);
  current?.local.in(room).disconnectSockets(true);
  current?.in(room).disconnectSockets(true);
}

export function emitToRoom(room: string, event: string, payload: unknown) {
  current?.to(room).emit(event, payload);
}
