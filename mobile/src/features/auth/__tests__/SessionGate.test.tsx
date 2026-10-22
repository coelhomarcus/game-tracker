import { act, render } from '@testing-library/react-native';

import { useSession } from '../session';
import { SessionGate } from '../SessionGate';

const mockStart = jest.fn();
const mockStop = jest.fn();
jest.mock('@/lib/realtime/chatSocket', () => ({
  chatSocket: { start: () => mockStart(), stop: () => mockStop() },
}));
const mockBridgeStart = jest.fn();
const mockBridgeStop = jest.fn();
jest.mock('@/features/chat/realtimeBridge', () => ({
  realtimeBridge: { start: () => mockBridgeStart(), stop: () => mockBridgeStop() },
}));

const mockPushStart = jest.fn();
const mockPushStop = jest.fn();
jest.mock('@/features/push/pushController', () => ({
  pushController: { start: () => mockPushStart(), stop: () => mockPushStop() },
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
  mockBridgeStart.mockClear();
  mockBridgeStop.mockClear();
  mockPushStart.mockClear();
  mockPushStop.mockClear();
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

  it('runs the realtime bridge alongside the connection', async () => {
    const { unmount } = await render(<SessionGate />);
    expect(mockBridgeStart).not.toHaveBeenCalled();

    await setStatus('signedIn');
    expect(mockBridgeStart).toHaveBeenCalledTimes(1);

    await setStatus('signedOut');
    expect(mockBridgeStop).toHaveBeenCalledTimes(1);

    await setStatus('signedIn');
    mockBridgeStop.mockClear();
    await unmount();
    expect(mockBridgeStop).toHaveBeenCalledTimes(1);
  });

  it('runs the push controller while signed in', async () => {
    const { unmount } = await render(<SessionGate />);
    expect(mockPushStart).not.toHaveBeenCalled();

    await setStatus('signedIn');
    expect(mockPushStart).toHaveBeenCalledTimes(1);

    await setStatus('signedOut');
    expect(mockPushStop).toHaveBeenCalledTimes(1);

    await setStatus('signedIn');
    mockPushStop.mockClear();
    await unmount();
    expect(mockPushStop).toHaveBeenCalledTimes(1);
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
