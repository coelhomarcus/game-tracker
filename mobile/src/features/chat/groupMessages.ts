import { formatDivider } from './formatDivider';

/** Messages of one sender closer than this make one group (one cluster of bubbles). */
export const GROUP_WINDOW_MS = 5 * 60 * 1000;
/** More than this since the previous message puts a date divider above the next one. */
export const DIVIDER_GAP_MS = 60 * 60 * 1000;

export type GroupableMessage = {
  /** Stable list key of the message. */
  key: string;
  senderId: string;
  createdAt: Date;
  /** A failed message ends its group, so the failure line shows right under it. */
  status?: string;
};

export type GroupedItem<T extends GroupableMessage> =
  | {
      kind: 'message';
      key: string;
      message: T;
      /** The oldest of its group: the top bubble on screen. */
      isFirstInGroup: boolean;
      /** The newest of its group: the bottom bubble on screen, with the time under it. */
      isLastInGroup: boolean;
    }
  | { kind: 'divider'; key: string; label: string };

/** Whether `newer` continues the group of `older` (the message right before it). */
function joins(older: GroupableMessage, newer: GroupableMessage): boolean {
  if (older.senderId !== newer.senderId || older.status === 'failed') return false;
  // A pending message waits below newer confirmed ones, so the gap may be negative.
  return newer.createdAt.getTime() - older.createdAt.getTime() < GROUP_WINDOW_MS;
}

function dividerBetween(older: GroupableMessage | undefined, newer: GroupableMessage): boolean {
  return older === undefined || newer.createdAt.getTime() - older.createdAt.getTime() > DIVIDER_GAP_MS;
}

/**
 * Items for the inverted message list, newest first like `newestFirst`: each message with its
 * place in its group, and a date divider after the message it sits above on screen, both for the
 * oldest loaded message and wherever more than an hour passed since the previous message.
 */
export function groupMessages<T extends GroupableMessage>(newestFirst: T[], now: Date): GroupedItem<T>[] {
  const items: GroupedItem<T>[] = [];
  newestFirst.forEach((message, index) => {
    const newer = newestFirst[index - 1];
    const older = newestFirst[index + 1];
    const dividerAbove = dividerBetween(older, message);
    items.push({
      kind: 'message',
      key: message.key,
      message,
      isFirstInGroup: dividerAbove || older === undefined || !joins(older, message),
      isLastInGroup: newer === undefined || dividerBetween(message, newer) || !joins(message, newer),
    });
    if (dividerAbove) {
      items.push({ kind: 'divider', key: `divider-${message.key}`, label: formatDivider(message.createdAt, now) });
    }
  });
  return items;
}
