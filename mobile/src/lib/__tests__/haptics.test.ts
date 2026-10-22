import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { haptic } from '@/lib/haptics';
import { usePreferences } from '@/lib/preferences';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-haptics', () => ({
  AndroidHaptics: { Context_Click: 'context-click', Long_Press: 'long-press', Confirm: 'confirm' },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  performAndroidHapticsAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
}));

const android = Haptics.performAndroidHapticsAsync as jest.Mock;
const impact = Haptics.impactAsync as jest.Mock;

beforeEach(() => {
  Platform.OS = 'android';
  jest.clearAllMocks();
  android.mockResolvedValue(undefined);
  usePreferences.setState({ hapticsEnabled: true });
});

describe('haptic', () => {
  it('plays the Android effect for each kind', () => {
    haptic('tap');
    haptic('longPress');
    haptic('confirm');
    expect(android.mock.calls.map(([effect]) => effect)).toEqual(['context-click', 'long-press', 'confirm']);
    expect(impact).not.toHaveBeenCalled();
  });

  it('does nothing when haptics are disabled', () => {
    usePreferences.setState({ hapticsEnabled: false });
    haptic('tap');
    expect(android).not.toHaveBeenCalled();
    expect(impact).not.toHaveBeenCalled();
  });

  it('falls back to an impact when the Android effect fails', async () => {
    android.mockRejectedValueOnce(new Error('unsupported'));
    haptic('longPress');
    await new Promise((resolve) => setImmediate(resolve));
    expect(impact).toHaveBeenCalledWith('heavy');
  });

  it('never throws, even when every call rejects', async () => {
    android.mockRejectedValueOnce(new Error('unsupported'));
    impact.mockRejectedValueOnce(new Error('unavailable'));
    expect(() => haptic('tap')).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
  });
});
