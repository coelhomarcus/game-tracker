import AsyncStorage from '@react-native-async-storage/async-storage';
import { waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { sessionManager, useSession, type User } from '@/features/auth';
import { useChatStore } from '@/features/chat/chatStore';

import { pushApi } from '../api';
import { INSTALLATION_ID_KEY, pushController, usePush } from '../pushController';

jest.mock('@/lib/realtime/chatSocket', () => jest.requireActual('@/test-utils/fakeChatSocket'));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../api', () => ({ pushApi: { register: jest.fn(), revoke: jest.fn() } }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (href: unknown) => mockPush(href) } }));

let mockGoogleServicesFile: string | undefined = './google-services.json';
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { android: { googleServicesFile: mockGoogleServicesFile } };
    },
  },
}));

type Listener = (event: unknown) => void;
const mockListeners = { token: new Set<Listener>(), response: new Set<Listener>() };
function mockSubscribe(set: Set<Listener>) {
  return (listener: Listener) => {
    set.add(listener);
    return { remove: () => set.delete(listener) };
  };
}
const mockNotifications = {
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getDevicePushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(),
  addPushTokenListener: jest.fn(mockSubscribe(mockListeners.token)),
  addNotificationResponseReceivedListener: jest.fn(mockSubscribe(mockListeners.response)),
  AndroidImportance: { HIGH: 5 },
};
jest.mock('expo-notifications', () => mockNotifications);

const api = jest.mocked(pushApi);

const ME = 'aaaaaaaa-0000-4000-8000-000000000001';
const CONV = 'cccccccc-0000-4000-8000-000000000001';
const me: User = {
  id: ME,
  username: 'eu',
  name: 'Eu',
  email: 'eu@example.com',
  avatarUrl: null,
  bannerUrl: null,
  bio: null,
};

const granted = { status: 'granted', granted: true, canAskAgain: true };
const undetermined = { status: 'undetermined', granted: false, canAskAgain: true };
const denied = { status: 'denied', granted: false, canAskAgain: false };

function response(data: Record<string, unknown>) {
  return { actionIdentifier: 'default', notification: { request: { content: { data } } } };
}

function tap(data: Record<string, unknown>) {
  for (const listener of [...mockListeners.response]) listener(response(data));
}

function refreshToken(token: string) {
  for (const listener of [...mockListeners.token]) listener({ type: 'android', data: token });
}

/** Lets the controller's chained promises (storage, permission, token, request) settle. */
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

function signIn() {
  useSession.setState({ status: 'signedIn', user: me });
  pushController.start();
}

beforeEach(async () => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
  mockGoogleServicesFile = './google-services.json';
  await AsyncStorage.clear();
  mockNotifications.getPermissionsAsync.mockResolvedValue(granted);
  mockNotifications.requestPermissionsAsync.mockResolvedValue(granted);
  mockNotifications.getDevicePushTokenAsync.mockResolvedValue({ type: 'android', data: 'tok-1' });
  mockNotifications.setNotificationChannelAsync.mockResolvedValue(null);
  mockNotifications.getLastNotificationResponseAsync.mockResolvedValue(null);
  api.register.mockResolvedValue(undefined);
  api.revoke.mockResolvedValue(undefined);
  useChatStore.getState().clear();
});

afterEach(() => {
  pushController.stop();
  pushController.resetForTests();
  useSession.setState({ status: 'signedOut', user: null });
  useChatStore.getState().clear();
});

describe('without push support', () => {
  it('does nothing when the build has no push configuration', async () => {
    mockGoogleServicesFile = undefined;

    signIn();
    await settle();
    await usePush.getState().enable();

    expect(usePush.getState().status).toBe('unsupported');
    expect(mockNotifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockNotifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
    expect(mockNotifications.addPushTokenListener).not.toHaveBeenCalled();
    expect(mockNotifications.addNotificationResponseReceivedListener).not.toHaveBeenCalled();
    expect(mockNotifications.getLastNotificationResponseAsync).not.toHaveBeenCalled();
    expect(api.register).not.toHaveBeenCalled();
  });

  it('does nothing on other platforms', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');

    signIn();
    await settle();

    expect(usePush.getState().status).toBe('unsupported');
    expect(mockNotifications.getPermissionsAsync).not.toHaveBeenCalled();
  });

  it('does not revoke on sign-out', async () => {
    mockGoogleServicesFile = undefined;
    jest.spyOn(sessionManager, 'clear').mockResolvedValue(null);
    signIn();
    await settle();

    await useSession.getState().signOut();

    expect(api.revoke).not.toHaveBeenCalled();
  });
});

describe('registration', () => {
  it('registers silently on sign-in when the permission is already granted', async () => {
    signIn();

    await waitFor(() => expect(usePush.getState().status).toBe('on'));
    const id = await AsyncStorage.getItem(INSTALLATION_ID_KEY);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(api.register).toHaveBeenCalledWith(id, 'tok-1');
    expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('keeps the same installation id across sign-ins', async () => {
    signIn();
    await waitFor(() => expect(usePush.getState().status).toBe('on'));
    pushController.stop();
    signIn();
    await waitFor(() => expect(api.register).toHaveBeenCalledTimes(2));

    const [first, second] = api.register.mock.calls;
    expect(second[0]).toBe(first[0]);
  });

  it('uses an installation id stored earlier', async () => {
    const stored = '99999999-0000-4000-8000-000000000009';
    await AsyncStorage.setItem(INSTALLATION_ID_KEY, stored);

    signIn();

    await waitFor(() => expect(api.register).toHaveBeenCalledWith(stored, 'tok-1'));
  });

  it('stays off without asking when the permission was never asked', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue(undetermined);

    signIn();
    await settle();

    expect(usePush.getState().status).toBe('off');
    expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockNotifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
  });

  it('enable asks for the permission and registers with the stored installation id', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue(undetermined);
    signIn();
    await settle();

    const enabling = usePush.getState().enable();
    expect(usePush.getState().status).toBe('registering');
    await enabling;

    expect(mockNotifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockNotifications.setNotificationChannelAsync).toHaveBeenCalled();
    const id = await AsyncStorage.getItem(INSTALLATION_ID_KEY);
    expect(api.register).toHaveBeenCalledWith(id, 'tok-1');
    expect(usePush.getState().status).toBe('on');
  });

  it('enable ends denied when the user refuses', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue(undetermined);
    mockNotifications.requestPermissionsAsync.mockResolvedValue(denied);
    signIn();
    await settle();

    await usePush.getState().enable();

    expect(usePush.getState().status).toBe('denied');
    expect(mockNotifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
    expect(api.register).not.toHaveBeenCalled();
  });

  it('is denied on sign-in when the system blocks notifications', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue(denied);

    signIn();
    await settle();

    expect(usePush.getState().status).toBe('denied');
  });

  it('asks again when the system still allows asking after a refusal', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ ...denied, canAskAgain: true });
    signIn();
    await settle();
    expect(usePush.getState().status).toBe('off');

    await usePush.getState().enable();

    expect(mockNotifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(usePush.getState().status).toBe('on');
  });

  it('fails when the server refuses and succeeds on retry', async () => {
    api.register.mockRejectedValueOnce(new Error('offline'));
    signIn();
    await waitFor(() => expect(usePush.getState().status).toBe('failed'));

    await usePush.getState().enable();

    expect(usePush.getState().status).toBe('on');
    expect(api.register).toHaveBeenCalledTimes(2);
  });

  it('fails when the device has no token', async () => {
    mockNotifications.getDevicePushTokenAsync.mockRejectedValue(new Error('no services'));

    signIn();

    await waitFor(() => expect(usePush.getState().status).toBe('failed'));
    expect(api.register).not.toHaveBeenCalled();
  });

  it('re-registers when the token changes', async () => {
    signIn();
    await waitFor(() => expect(usePush.getState().status).toBe('on'));

    refreshToken('tok-2');

    await waitFor(() => expect(api.register).toHaveBeenLastCalledWith(expect.any(String), 'tok-2'));
    expect(usePush.getState().status).toBe('on');
  });

  it('ignores answers that arrive after the user signed out', async () => {
    let release: (value: unknown) => void = () => {};
    mockNotifications.getDevicePushTokenAsync.mockReturnValue(
      new Promise((resolve) => (release = resolve)),
    );
    signIn();
    await settle();

    pushController.stop();
    release({ type: 'android', data: 'tok-late' });
    await settle();

    expect(api.register).not.toHaveBeenCalled();
  });

  it('removes its listeners when stopped', async () => {
    signIn();
    await settle();
    expect(mockListeners.token.size).toBe(1);
    expect(mockListeners.response.size).toBe(1);

    pushController.stop();

    expect(mockListeners.token.size).toBe(0);
    expect(mockListeners.response.size).toBe(0);
  });
});

describe('sign-out', () => {
  it('revokes this installation before the session is cleared', async () => {
    const order: string[] = [];
    jest.spyOn(sessionManager, 'clear').mockImplementation(async () => {
      order.push('clear');
      return null;
    });
    api.revoke.mockImplementation(async () => {
      order.push(`revoke while ${useSession.getState().status}`);
    });
    signIn();
    await waitFor(() => expect(usePush.getState().status).toBe('on'));
    const id = await AsyncStorage.getItem(INSTALLATION_ID_KEY);

    await useSession.getState().signOut();

    expect(api.revoke).toHaveBeenCalledWith(id);
    expect(order).toEqual(['revoke while signedIn', 'clear']);
  });

  it('signs out even when the revoke fails', async () => {
    jest.spyOn(sessionManager, 'clear').mockResolvedValue(null);
    api.revoke.mockRejectedValue(new Error('offline'));
    signIn();
    await waitFor(() => expect(usePush.getState().status).toBe('on'));

    await useSession.getState().signOut();

    expect(useSession.getState().status).toBe('signedOut');
  });

  it('no longer revokes once stopped', async () => {
    jest.spyOn(sessionManager, 'clear').mockResolvedValue(null);
    signIn();
    await waitFor(() => expect(usePush.getState().status).toBe('on'));
    pushController.stop();

    await useSession.getState().signOut();

    expect(api.revoke).not.toHaveBeenCalled();
  });
});

describe('opening a notification', () => {
  it('opens the conversation of a message', async () => {
    signIn();
    await settle();

    tap({ type: 'message', recipientId: ME, conversationId: CONV, messageId: 'm1' });

    expect(mockPush).toHaveBeenCalledWith(`/chat/${CONV}`);
  });

  it('does not stack the conversation that is already open', async () => {
    useChatStore.setState({ openConversationId: CONV });
    signIn();
    await settle();

    tap({ type: 'message', recipientId: ME, conversationId: CONV, messageId: 'm1' });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('opens the notification center for any other type', async () => {
    signIn();
    await settle();

    tap({ type: 'like', recipientId: ME, notificationId: 'n1', actorId: 'u2', postId: 'p1' });
    tap({ type: 'message', recipientId: ME });
    tap({ type: 'message', recipientId: ME, conversationId: '../settings' });
    tap({});

    expect(mockPush.mock.calls).toEqual([
      ['/notifications'],
      ['/notifications'],
      ['/notifications'],
      ['/notifications'],
    ]);
  });

  it('opens the notification center for a message sent to another account', async () => {
    signIn();
    await settle();

    tap({ type: 'message', recipientId: 'someone-else', conversationId: CONV });

    expect(mockPush).toHaveBeenCalledWith('/notifications');
  });

  it('opens the notification that launched the app after sign-in, once', async () => {
    mockNotifications.getLastNotificationResponseAsync.mockResolvedValue(
      response({ type: 'message', recipientId: ME, conversationId: CONV }),
    );
    // Signed out: the controller is not running yet, so nothing opens.
    await settle();
    expect(mockPush).not.toHaveBeenCalled();

    signIn();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/chat/${CONV}`));

    pushController.stop();
    signIn();
    await settle();
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockNotifications.getLastNotificationResponseAsync).toHaveBeenCalledTimes(1);
  });

  it('keeps a route that arrives while signed out and opens it after the next sign-in', async () => {
    let release: (value: unknown) => void = () => {};
    mockNotifications.getLastNotificationResponseAsync.mockReturnValue(
      new Promise((resolve) => (release = resolve)),
    );
    signIn();
    await settle();
    pushController.stop();
    useSession.setState({ status: 'signedOut', user: null });

    release(response({ type: 'follow', recipientId: ME, actorId: 'u2' }));
    await settle();
    expect(mockPush).not.toHaveBeenCalled();

    signIn();
    expect(mockPush).toHaveBeenCalledWith('/notifications');
  });

  it('drops a kept route that is too old', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    let release: (value: unknown) => void = () => {};
    mockNotifications.getLastNotificationResponseAsync.mockReturnValue(
      new Promise((resolve) => (release = resolve)),
    );
    signIn();
    await settle();
    pushController.stop();
    release(response({ type: 'follow', recipientId: ME }));
    await settle();

    now.mockReturnValue(1_000_000 + 2 * 60_000 + 1);
    signIn();
    await settle();

    expect(mockPush).not.toHaveBeenCalled();
    now.mockRestore();
  });
});
