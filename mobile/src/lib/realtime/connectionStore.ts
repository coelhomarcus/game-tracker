import { create } from 'zustand';

export type ChatConnectionStatus = 'stopped' | 'connecting' | 'connected' | 'waiting';

type ChatConnectionState = {
  status: ChatConnectionStatus;
  /** Consecutive failed attempts (0 while connecting for the first time or connected). */
  attempt: number;
};

export const useChatConnection = create<ChatConnectionState>(() => ({
  status: 'stopped',
  attempt: 0,
}));
