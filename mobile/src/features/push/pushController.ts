import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, type Href } from 'expo-router';
import { create } from 'zustand';

import { registerBeforeSignOut, useSession } from '@/features/auth';
import { useChatStore } from '@/features/chat/chatStore';
import { newUuid } from '@/lib/uuid';

import { pushApi } from './api';
import { pushPlatform, type PushData } from './pushPlatform';

export type PushStatus = 'unsupported' | 'off' | 'registering' | 'on' | 'denied' | 'failed';

export const INSTALLATION_ID_KEY = 'push.installationId';

/** A tapped push is worth opening for a short while only; later it would be a surprise. */
const PENDING_TTL_MS = 2 * 60_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where a tapped push leads. The path is built only from a validated id, never taken from the
 * payload; anything unknown, malformed or meant for another account opens the notification center.
 */
export function pushRoute(data: PushData, userId: string | undefined): string {
  const { type, recipientId, conversationId } = data;
  if (
    type === 'message' &&
    userId !== undefined &&
    recipientId === userId &&
    typeof conversationId === 'string' &&
    UUID.test(conversationId)
  ) {
    return `/chat/${conversationId}`;
  }
  return '/notifications';
}

let loadingInstallationId: Promise<string> | null = null;

/** This installation's stable id: generated once, kept across sign-outs and account switches. */
function installationId(): Promise<string> {
  loadingInstallationId ??= (async () => {
    const saved = await AsyncStorage.getItem(INSTALLATION_ID_KEY);
    if (saved) return saved;
    const id = newUuid();
    await AsyncStorage.setItem(INSTALLATION_ID_KEY, id);
    return id;
  })().finally(() => {
    loadingInstallationId = null;
  });
  return loadingInstallationId;
}

type PushState = {
  status: PushStatus;
  /** Asks for the permission when it was never asked, then registers this device. */
  enable(): Promise<void>;
};

const initialStatus = (): PushStatus => (pushPlatform.supported ? 'off' : 'unsupported');

export const usePush = create<PushState>(() => ({
  status: initialStatus(),
  enable: () => pushController.enable(),
}));

const setStatus = (status: PushStatus) => usePush.setState({ status });

/**
 * Registers this device for push while signed in and opens tapped notifications. Consent belongs
 * to the user: sign-in registers silently only when the permission was already granted; asking
 * starts from the settings. Started and stopped with the session by `SessionGate`.
 */
class PushController {
  private running = false;
  /** Changes on every start/stop so answers to an earlier run's requests are dropped. */
  private generation = 0;
  private subscriptions: (() => void)[] = [];
  private initialChecked = false;
  /** A tapped push waiting for a signed-in, running controller to open it. */
  private pending: { data: PushData; at: number } | null = null;

  start(): void {
    if (this.running) return;
    this.running = true;
    this.generation += 1;
    const run = this.generation;
    if (!pushPlatform.supported) {
      setStatus('unsupported');
      return;
    }
    setStatus('off');
    this.subscriptions = [
      pushPlatform.onOpened((data) => this.hold(data)),
      pushPlatform.onTokenRefresh((token) => {
        const { status } = usePush.getState();
        // Without the permission the token is not ours to register.
        if (status === 'off' || status === 'denied') return;
        void this.register(run, token);
      }),
      registerBeforeSignOut(() => this.revoke()),
    ];
    this.flush();
    void this.checkInitialMessage();
    void this.sync(run, false);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.generation += 1;
    for (const unsubscribe of this.subscriptions) unsubscribe();
    this.subscriptions = [];
  }

  async enable(): Promise<void> {
    if (!this.running || !pushPlatform.supported) return;
    if (usePush.getState().status === 'registering') return;
    await this.sync(this.generation, true);
  }

  /** Test helper: forgets the launch notification check and any kept route. */
  resetForTests(): void {
    this.initialChecked = false;
    this.pending = null;
    usePush.setState({ status: initialStatus() });
  }

  private stale(run: number): boolean {
    return run !== this.generation;
  }

  private async sync(run: number, prompt: boolean): Promise<void> {
    if (prompt) setStatus('registering');
    try {
      let permission = await pushPlatform.permission();
      if (this.stale(run)) return;
      if (permission === 'notDetermined' && prompt) {
        permission = await pushPlatform.requestPermission();
        if (this.stale(run)) return;
      }
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      setStatus('registering');
      const token = await pushPlatform.token();
      if (this.stale(run)) return;
      await this.register(run, token);
    } catch {
      if (!this.stale(run)) setStatus('failed');
    }
  }

  private async register(run: number, token: string): Promise<void> {
    if (this.stale(run)) return;
    try {
      const id = await installationId();
      if (this.stale(run)) return;
      await pushApi.register(id, token);
      if (!this.stale(run)) setStatus('on');
    } catch {
      if (!this.stale(run)) setStatus('failed');
    }
  }

  /** Runs before the session clears (it needs the access token). Best effort. */
  private async revoke(): Promise<void> {
    const id = await AsyncStorage.getItem(INSTALLATION_ID_KEY);
    if (id) await pushApi.revoke(id);
  }

  /** The tap that launched the app is read once per app start. */
  private async checkInitialMessage(): Promise<void> {
    if (this.initialChecked) return;
    this.initialChecked = true;
    try {
      const data = await pushPlatform.initialMessage();
      if (data) this.hold(data);
    } catch {
      // Nothing to open.
    }
  }

  private hold(data: PushData): void {
    this.pending = { data, at: Date.now() };
    this.flush();
  }

  /** Opens the kept tap once signed in; until then it waits (up to `PENDING_TTL_MS`). */
  private flush(): void {
    const pending = this.pending;
    if (!pending) return;
    if (Date.now() - pending.at > PENDING_TTL_MS) {
      this.pending = null;
      return;
    }
    const { status, user } = useSession.getState();
    if (!this.running || status !== 'signedIn' || !user) return;
    this.pending = null;

    const route = pushRoute(pending.data, user.id);
    // Already looking at that conversation: opening it again would stack the same screen.
    const open = useChatStore.getState().openConversationId;
    if (open && route === `/chat/${open}`) return;
    router.push(route as Href);
  }
}

export const pushController = new PushController();
