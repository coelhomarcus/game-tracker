import { act, render } from '@testing-library/react-native';

import { useSession } from '../session';
import { SessionGate } from '../SessionGate';

const mockStart = jest.fn();
const mockStop = jest.fn();
jest.mock('@/lib/realtime/chatSocket', () => ({
  chatSocket: { start: () => mockStart(), stop: () => mockStop() },
}));

jest.mock('expo-router', () => {
  function Stack({ children }: { children?: unknown }) {
    return children ?? null;
  }
  Stack.Protected = function Protected({ children }: { children?: unknown }) {
    return children ?? null;
  };
  Stack.Screen = function Screen() {
    return null;
  };
  return { Stack };
});

async function setStatus(status: 'restoring' | 'signedOut' | 'signedIn' | 'unreachable') {
  await act(async () => {
    useSession.setState({ status });
  });
}

beforeEach(() => {
  mockStart.mockClear();
  mockStop.mockClear();
  useSession.setState({ status: 'signedOut', user: null, bootstrap: jest.fn() });
});

describe('SessionGate chat connection', () => {
  it('starts the connection when the user signs in and stops it on sign-out', async () => {
    await render(<SessionGate />);
    expect(mockStart).not.toHaveBeenCalled();

    await setStatus('signedIn');
    expect(mockStart).toHaveBeenCalledTimes(1);

    await setStatus('signedOut');
    expect(mockStop).toHaveBeenCalled();
  });

  it('starts right away when the session is restored as signed in', async () => {
    useSession.setState({ status: 'signedIn' });
    await render(<SessionGate />);

    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('stops the connection when the session becomes unreachable', async () => {
    useSession.setState({ status: 'signedIn' });
    await render(<SessionGate />);
    mockStop.mockClear();

    await setStatus('unreachable');
    expect(mockStop).toHaveBeenCalled();
  });
});
