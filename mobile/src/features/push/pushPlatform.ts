import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type PushPermission = 'granted' | 'denied' | 'notDetermined';

/** The data payload of a push (`type`, `recipientId`, ids). Untrusted: read it defensively. */
export type PushData = Record<string, unknown>;

/** A tapped notification. */
export type PushTap = {
  /** The notification's id: the same tap delivered twice carries the same one. */
  id: string | null;
  data: PushData;
  /** When the notification was posted (epoch ms), if known. */
  postedAt: number | null;
};

type Unsubscribe = () => void;

export type PushPlatform = {
  /** Remote push works only on Android builds that carry the FCM configuration. */
  readonly supported: boolean;
  permission(): Promise<PushPermission>;
  requestPermission(): Promise<PushPermission>;
  /** This device's FCM token. */
  token(): Promise<string>;
  onTokenRefresh(handler: (token: string) => void): Unsubscribe;
  /** The user tapped a notification while the app was running. */
  onOpened(handler: (tap: PushTap) => void): Unsubscribe;
  /** The notification whose tap launched the app, if any; it is read once and then forgotten. */
  initialMessage(): Promise<PushTap | null>;
};

type Notifications = typeof import('expo-notifications');

/**
 * Loaded on first use and only where push is supported, so the web bundle and builds without
 * the FCM configuration never evaluate the native module.
 */
function notifications(): Notifications {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-notifications') as Notifications;
}

const CHANNEL_ID = 'default';

/** Android 13+ shows the permission prompt only once a channel exists. */
async function ensureChannel(): Promise<void> {
  const module = notifications();
  await module.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Notificações',
    importance: module.AndroidImportance.HIGH,
  });
}

type PermissionAnswer = { status: string; granted: boolean; canAskAgain: boolean };

function toPermission(answer: PermissionAnswer): PushPermission {
  if (answer.granted) return 'granted';
  // Android reports "denied" before the first prompt; only a refusal that cannot be asked again
  // is a block the user has to lift in the system settings.
  if (answer.status === 'undetermined' || answer.canAskAgain) return 'notDetermined';
  return 'denied';
}

type RawNotification = { date?: unknown; request?: Record<string, unknown> };

function tapOf(response: unknown): PushTap {
  const notification = (response as { notification?: RawNotification } | null)?.notification;
  const request = notification?.request;
  const content = (request?.content as { data?: unknown } | undefined)?.data;
  const remote = (request?.trigger as { remoteMessage?: { data?: unknown } } | undefined)
    ?.remoteMessage?.data;
  const asRecord = (value: unknown) =>
    typeof value === 'object' && value !== null ? (value as PushData) : {};
  const id = request?.identifier;
  const date = notification?.date;
  return {
    id: typeof id === 'string' && id !== '' ? id : null,
    data: { ...asRecord(remote), ...asRecord(content) },
    postedAt: typeof date === 'number' && Number.isFinite(date) && date > 0 ? date : null,
  };
}

export const pushPlatform: PushPlatform = {
  get supported() {
    return Platform.OS === 'android' && Boolean(Constants.expoConfig?.android?.googleServicesFile);
  },

  async permission() {
    return toPermission(await notifications().getPermissionsAsync());
  },

  async requestPermission() {
    await ensureChannel();
    return toPermission(await notifications().requestPermissionsAsync());
  },

  async token() {
    await ensureChannel();
    const { data } = await notifications().getDevicePushTokenAsync();
    if (typeof data !== 'string' || data === '') throw new Error('No push token');
    return data;
  },

  onTokenRefresh(handler) {
    const subscription = notifications().addPushTokenListener(({ data }) => {
      if (typeof data === 'string' && data !== '') handler(data);
    });
    return () => subscription.remove();
  },

  onOpened(handler) {
    const subscription = notifications().addNotificationResponseReceivedListener((response) =>
      handler(tapOf(response)),
    );
    return () => subscription.remove();
  },

  async initialMessage() {
    const module = notifications();
    const response = module.getLastNotificationResponse();
    if (!response) return null;
    try {
      // Read once: a later read (another sign-in, a reload) must not open it again.
      module.clearLastNotificationResponse();
    } catch {
      // Unavailable: the tap's id still keeps it from opening twice in this run.
    }
    return tapOf(response);
  },
};
