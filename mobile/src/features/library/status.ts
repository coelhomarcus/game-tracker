import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import type { GameStatus } from '@/theme/tokens';

export type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** Display order of the status tabs and pickers. */
export const STATUSES: readonly GameStatus[] = ['playing', 'completed', 'backlog', 'dropped'];

export const statusLabel: Record<GameStatus, string> = {
  backlog: 'Na fila',
  playing: 'Jogando',
  completed: 'Concluído',
  dropped: 'Abandonado',
};

export const statusIcon: Record<GameStatus, IoniconName> = {
  backlog: 'bookmark-outline',
  playing: 'play-circle-outline',
  completed: 'checkmark-circle-outline',
  dropped: 'close-circle-outline',
};

/** Unknown values from the API are treated as `backlog`. */
export function parseStatus(value: string): GameStatus {
  return (STATUSES as readonly string[]).includes(value) ? (value as GameStatus) : 'backlog';
}
