// Volume: 500 library entries and 1000 messages in one conversation. The numbers are test load,
// not observed platform volume.
import { chatApi } from '@/features/chat/api';
import { libraryApi } from '@/features/library/api';
import { STATUSES } from '@/features/library/status';

import {
  closeSockets,
  connectSocket,
  describeBackend,
  emitWithAck,
  eventually,
  FIXTURE_GAME_ONE,
  signUpFresh,
} from './backend';

describeBackend('volume against the test API', () => {
  afterEach(() => {
    closeSockets();
  });

  it('500 entries: all return, without repeats, with hours and notes unchanged', async () => {
    await signUpFresh('vol');

    for (let i = 0; i < 500; i += 10) {
      await Promise.all(
        Array.from({ length: 10 }, (_, k) => {
          const j = i + k;
          return libraryApi.create(FIXTURE_GAME_ONE, {
            platform: 'PC',
            status: STATUSES[j % STATUSES.length],
            startedAt: null,
            finishedAt: null,
            hoursPlayed: j / 2,
            rating: 1 + (j % 10),
            notes: `registro ${j}`,
          });
        }),
      );
    }

    const listStarted = Date.now();
    const entries = await libraryApi.listMine();
    const listMs = Date.now() - listStarted;

    expect(entries).toHaveLength(500);
    expect(new Set(entries.map((e) => e.id)).size).toBe(500);
    const numbers: number[] = [];
    for (const entry of entries) {
      const n = Number(entry.notes?.slice('registro '.length));
      numbers.push(n);
      expect([entry.notes, entry.hoursPlayed, entry.rating]).toEqual([
        `registro ${n}`,
        n / 2,
        1 + (n % 10),
      ]);
    }
    // Every record came back exactly once.
    expect(numbers.sort((x, y) => x - y)).toEqual(Array.from({ length: 500 }, (_, k) => k));
    // Listing 500 records must stay fast.
    expect(listMs).toBeLessThan(3000);
  }, 180_000);

  it('1000 messages: complete paginated history, ordered, without repeats', async () => {
    const b = await signUpFresh('cb');
    // Signed in last: the app's `api` client pages the history as `a`.
    const a = await signUpFresh('ca');
    const conversationId = await chatApi.create(b.user.id);

    const socketA = await connectSocket(a.accessToken);
    const socketB = await connectSocket(b.accessToken);
    let receivedA = 0;
    let receivedB = 0;
    socketA.on('message:receive', () => {
      receivedA += 1;
    });
    socketB.on('message:receive', () => {
      receivedB += 1;
    });
    expect(await emitWithAck(socketA, 'conversation:join', { conversationId })).toEqual({
      ok: true,
    });
    expect(await emitWithAck(socketB, 'conversation:join', { conversationId })).toEqual({
      ok: true,
    });

    for (let i = 0; i < 1000; i += 1) {
      const ack = await emitWithAck<{ message?: unknown; error?: string }>(
        i % 2 === 0 ? socketA : socketB,
        'message:send',
        { conversationId, content: `mensagem ${i}` },
      );
      if (!ack.message) throw new Error(`ACK of message ${i}: ${JSON.stringify(ack)}`);
    }

    const ids: string[] = [];
    const contents: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await chatApi.messages(conversationId, cursor);
      for (const message of page.items) {
        ids.push(message.id);
        contents.push(message.content);
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(ids).toHaveLength(1000);
    // No message repeated across pages.
    expect(new Set(ids).size).toBe(1000);
    // History order: newest first.
    expect(contents).toEqual(Array.from({ length: 1000 }, (_, k) => `mensagem ${999 - k}`));
    await eventually(() => receivedA >= 500 && receivedB >= 500, {
      reason: () => `realtime events did not reach both sides (a: ${receivedA}, b: ${receivedB})`,
    });
  }, 300_000);
});
