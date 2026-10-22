import { api } from '@/features/auth';
import { compareDates, toApiDate, type DateOnly } from '@/lib/dateOnly';

import { parseEntry, type EntryDraft, type GameEntry } from './types';

function trimmedNotes(notes: string | null): string | null {
  const text = notes?.trim() ?? '';
  return text === '' ? null : text;
}

/** POST body: fields without a value are omitted (the backend rejects `null` on create). */
export function createBody(igdbId: number, d: EntryDraft): Record<string, unknown> {
  const notes = trimmedNotes(d.notes);
  return {
    igdbId,
    platform: d.platform,
    status: d.status,
    ...(d.startedAt && { startedAt: toApiDate(d.startedAt) }),
    ...(d.finishedAt && { finishedAt: toApiDate(d.finishedAt) }),
    ...(d.hoursPlayed !== null && { hoursPlayed: d.hoursPlayed }),
    ...(d.rating !== null && { rating: d.rating }),
    ...(notes !== null && { notes }),
  };
}

function sameDate(a: DateOnly | null, b: DateOnly | null): boolean {
  if (a === null || b === null) return a === b;
  return compareDates(a, b) === 0;
}

/** PATCH body: omitted keeps, `null` clears, a value replaces. Empty when nothing changed. */
export function updateBody(original: GameEntry, edited: EntryDraft): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (edited.platform.trim() !== original.platform.trim()) body.platform = edited.platform.trim();
  if (edited.status !== original.status) body.status = edited.status;
  if (!sameDate(original.startedAt, edited.startedAt)) {
    body.startedAt = edited.startedAt && toApiDate(edited.startedAt);
  }
  if (!sameDate(original.finishedAt, edited.finishedAt)) {
    body.finishedAt = edited.finishedAt && toApiDate(edited.finishedAt);
  }
  if (edited.hoursPlayed !== original.hoursPlayed) body.hoursPlayed = edited.hoursPlayed;
  if (edited.rating !== original.rating) body.rating = edited.rating;
  const notes = trimmedNotes(edited.notes);
  if (notes !== trimmedNotes(original.notes)) body.notes = notes;
  return body;
}

export const libraryApi = {
  /** The whole collection (the backend does not paginate), most recent first. */
  async listMine(): Promise<GameEntry[]> {
    const json = await api.get<Record<string, unknown>[]>('/game-entries/me', {
      query: { sort: 'recent' },
    });
    return json.map(parseEntry);
  },

  async create(igdbId: number, draft: EntryDraft): Promise<GameEntry> {
    return parseEntry(
      await api.post<Record<string, unknown>>('/game-entries', createBody(igdbId, draft)),
    );
  },

  /** Sends only what changed; with no change it makes no request and returns `original`. */
  async update(original: GameEntry, edited: EntryDraft): Promise<GameEntry> {
    const body = updateBody(original, edited);
    if (Object.keys(body).length === 0) return original;
    return parseEntry(
      await api.patch<Record<string, unknown>>(`/game-entries/${original.id}`, body),
    );
  },

  async remove(entryId: string): Promise<void> {
    await api.delete<void>(`/game-entries/${entryId}`);
  },
};
