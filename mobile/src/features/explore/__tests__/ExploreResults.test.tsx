import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSession } from '@/features/auth';
import { feedApi } from '@/features/feed/api';
import { gamesApi } from '@/features/games/api';
import { libraryApi } from '@/features/library/api';
import { profilesApi } from '@/features/profiles/api';

import { ExploreResults, type ResultTab } from '../ExploreResults';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useNavigation: () => ({ addListener: () => () => undefined, isFocused: () => true }),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

let client: QueryClient;

function Harness({ term }: { term: string }) {
  const [tab, setTab] = useState<ResultTab>('games');
  return (
    <ExploreResults
      term={term}
      tab={tab}
      onChangeTab={setTab}
      onOpenGame={jest.fn()}
      onOpenPerson={jest.fn()}
      onOpenPost={jest.fn()}
    />
  );
}

const tree = (term: string) => (
  <QueryClientProvider client={client}>
    <SafeAreaProvider initialMetrics={metrics}>
      <Harness term={term} />
    </SafeAreaProvider>
  </QueryClientProvider>
);

/** Past the 300 ms debounce, with the answers in. */
async function settle(ms = 400) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  jest.spyOn(gamesApi, 'search').mockResolvedValue([]);
  jest.spyOn(profilesApi, 'search').mockResolvedValue([]);
  jest.spyOn(feedApi, 'searchPosts').mockResolvedValue({ items: [], nextCursor: null });
  jest.spyOn(libraryApi, 'listMine').mockResolvedValue([]);
  useSession.setState({
    status: 'signedIn',
    user: { id: 'me' } as ReturnType<typeof useSession.getState>['user'],
  });
});

afterEach(() => {
  client.clear();
  jest.useRealTimers();
  jest.restoreAllMocks();
  useSession.setState({ status: 'signedOut', user: null });
});

describe('ExploreResults', () => {
  it('asks each tab once per term, and not again when coming back to it', async () => {
    await render(tree('hades'));
    await settle();
    expect(gamesApi.search).toHaveBeenCalledTimes(1);
    expect(profilesApi.search).not.toHaveBeenCalled();
    expect(feedApi.searchPosts).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('tab', { name: 'Pessoas' }));
    await settle();
    await fireEvent.press(screen.getByRole('tab', { name: 'Posts' }));
    await settle();
    expect(profilesApi.search).toHaveBeenCalledTimes(1);
    expect(feedApi.searchPosts).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole('tab', { name: 'Jogos' }));
    await settle();
    await fireEvent.press(screen.getByRole('tab', { name: 'Pessoas' }));
    await settle();
    await fireEvent.press(screen.getByRole('tab', { name: 'Posts' }));
    await settle();
    expect(gamesApi.search).toHaveBeenCalledTimes(1);
    expect(profilesApi.search).toHaveBeenCalledTimes(1);
    expect(feedApi.searchPosts).toHaveBeenCalledTimes(1);
    expect(feedApi.searchPosts).toHaveBeenCalledWith('hades', undefined);
  });

  it('debounces typing into one request for the last term', async () => {
    await render(tree('ha'));
    await settle();
    expect(gamesApi.search).toHaveBeenLastCalledWith('ha', expect.anything());

    await screen.rerender(tree('had'));
    await settle(100);
    await screen.rerender(tree('hade'));
    await settle(100);
    await screen.rerender(tree('hades'));
    await settle(400);

    expect(jest.mocked(gamesApi.search).mock.calls.map(([term]) => term)).toEqual(['ha', 'hades']);
  });
});
