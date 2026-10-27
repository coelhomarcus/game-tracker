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

export function emitToRoom(room: string, event: string, payload: unknown) {
  current?.to(room).emit(event, payload);
}
