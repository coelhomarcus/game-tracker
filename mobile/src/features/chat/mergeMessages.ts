import type { Message, MessagePage } from './types';

function newestFirst(a: Message, b: Message): number {
  const byTime = b.createdAt.getTime() - a.createdAt.getTime();
  if (byTime !== 0) return byTime;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Whether two server messages are the same one, reached by different paths (event, ack, page). */
function sameMessage(a: Message, b: Message): boolean {
  return a.id === b.id || (a.clientMessageId != null && a.clientMessageId === b.clientMessageId);
}

/**
 * Joins messages from an event or an ack to a list without duplicates: the same `id`, or the same
 * `clientMessageId` (the event echo and the ack of one send), is kept once, as the incoming copy.
 * The result is newest first by `createdAt`, then `id`.
 */
export function mergeMessages(server: Message[], incoming: Message[]): Message[] {
  const result: Message[] = [];
  const indexById = new Map<string, number>();
  const indexByClientId = new Map<string, number>();

  const add = (message: Message) => {
    const index =
      indexById.get(message.id) ??
      (message.clientMessageId != null ? indexByClientId.get(message.clientMessageId) : undefined);
    const at = index ?? result.length;
    result[at] = message;
    indexById.set(message.id, at);
    if (message.clientMessageId != null) indexByClientId.set(message.clientMessageId, at);
  };

  server.forEach(add);
  incoming.forEach(add);
  return result.sort(newestFirst);
}

type Pages = { pages: MessagePage[] };

/**
 * Merges into infinite-query pages (newest page first). A message already on some page is
 * replaced where it is; anything new goes into the newest page, so cursors stay valid.
 */
export function mergeIntoPages<T extends Pages>(data: T, incoming: Message[]): T {
  if (incoming.length === 0 || data.pages.length === 0) return data;
  const placed = new Set<Message>();
  const pages = data.pages.map((page, index) => {
    if (index === 0) return page;
    let changed = false;
    const items = page.items.map((item) => {
      const match = incoming.find((message) => sameMessage(message, item));
      if (!match) return item;
      placed.add(match);
      changed = true;
      return match;
    });
    return changed ? { ...page, items } : page;
  });
  const rest = incoming.filter((message) => !placed.has(message));
  if (rest.length > 0) pages[0] = { ...pages[0], items: mergeMessages(pages[0].items, rest) };
  return { ...data, pages };
}
