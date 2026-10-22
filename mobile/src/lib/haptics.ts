import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { usePreferences } from '@/lib/preferences';

export type HapticKind = 'tap' | 'longPress' | 'confirm';

const androidEffect = {
  tap: Haptics.AndroidHaptics.Context_Click,
  longPress: Haptics.AndroidHaptics.Long_Press,
  confirm: Haptics.AndroidHaptics.Confirm,
} as const satisfies Record<HapticKind, Haptics.AndroidHaptics>;

const impactStyle = {
  tap: Haptics.ImpactFeedbackStyle.Light,
  longPress: Haptics.ImpactFeedbackStyle.Heavy,
  confirm: Haptics.ImpactFeedbackStyle.Medium,
} as const satisfies Record<HapticKind, Haptics.ImpactFeedbackStyle>;

/** Fires a short vibration for a tap, long press or confirmation. Never throws and does nothing on web or when disabled. */
export function haptic(kind: HapticKind): void {
  if (Platform.OS === 'web' || !usePreferences.getState().hapticsEnabled) return;
  void play(kind).catch(() => {});
}

async function play(kind: HapticKind): Promise<void> {
  if (Platform.OS === 'android' && typeof Haptics.performAndroidHapticsAsync === 'function') {
    try {
      await Haptics.performAndroidHapticsAsync(androidEffect[kind]);
      return;
    } catch {
      // The installed native build may predate the effect; fall back to a plain impact.
    }
  }
  await Haptics.impactAsync(impactStyle[kind]);
}
