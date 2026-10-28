// The Explorar discovery endpoints through the app's API layer: trending games and follow suggestions.
import type { EntryDraft } from '@/features/library/types';

import { describeBackend, FIXTURE_GAME_TWO, signUpAccount } from './backend';

function draft(status: EntryDraft['status']): EntryDraft {
  return {
    platform: 'PC',
    status,
    startedAt: null,
    finishedAt: null,
    hoursPlayed: null,
    rating: null,
    notes: null,
  };
}

describeBackend('discovery against the test API', () => {
  it('a new entry counts in the trending games, which come ordered by entries', async () => {
    const ana = await signUpAccount('ta');
    const countOf = async () =>
      (await ana.games.trending(20)).find((item) => item.game.igdbId === FIXTURE_GAME_TWO)?.entryCount ?? 0;
    const before = await countOf();

    await ana.library.create(FIXTURE_GAME_TWO, draft('playing'));

    const trending = await ana.games.trending(20);
    const fixture = trending.find((item) => item.game.igdbId === FIXTURE_GAME_TWO);
    expect(fixture?.entryCount).toBe(before + 1);
    expect(fixture?.game).toMatchObject({ igdbId: FIXTURE_GAME_TWO, name: expect.any(String) });
    expect(typeof fixture?.game.id).toBe('string');
    const counts = trending.map((item) => item.entryCount);
    expect(counts).toEqual([...counts].sort((x, y) => y - x));
    expect((await ana.games.trending(1)).length).toBeLessThanOrEqual(1);
  });

  it('suggests whom my follows follow, never muted or blocked people', async () => {
    const me = await signUpAccount('sm');
    const friend = await signUpAccount('sf');
    const target = await signUpAccount('st');
    const muted = await signUpAccount('su');
    const blocker = await signUpAccount('sb');

    await me.profiles.setFollow(friend.user.id, true);
    for (const person of [target, muted, blocker]) await friend.profiles.setFollow(person.user.id, true);
    await target.profiles.setFollow(me.user.id, true);
    await me.profiles.setMute(muted.user.id, true);
    await blocker.profiles.setBlock(me.user.id, true);

    const people = await me.profiles.suggestions(20);

    expect(people[0]).toMatchObject({
      id: target.user.id,
      followedByCount: 1,
      followsMe: true,
      isFollowedByMe: false,
    });
    const ids = people.map((person) => person.id);
    for (const hidden of [me, friend, muted, blocker]) expect(ids).not.toContain(hidden.user.id);
    expect(people.length).toBeLessThanOrEqual(20);
  });
});
