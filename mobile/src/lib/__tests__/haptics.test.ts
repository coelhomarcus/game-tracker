import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { haptic } from '@/lib/haptics';
import { usePreferences } from '@/lib/preferences';

jest.mock('expo-haptics', () => ({
  AndroidHaptics: { Context_Click: 'context-click', Long_Press: 'long-press', Confirm: 'confirm' },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  performAndroidHapticsAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
}));

const android = Haptics.performAndroidHapticsAsync as jest.Mock;
const impact = Haptics.impactAsync as jest.Mock;
const originalOS = Platform.OS;
const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  Platform.OS = 'android';
  jest.clearAllMocks();
  android.mockResolvedValue(undefined);
  impact.mockResolvedValue(undefined);
  usePreferences.setState({ hapticsEnabled: true });
});

afterEach(() => {
  Platform.OS = originalOS;
});

describe('haptic', () => {
  it('plays the Android effect for each kind', () => {
    haptic('tap');
    haptic('longPress');
    haptic('confirm');
    expect(android.mock.calls.map(([effect]) => effect)).toEqual(['context-click', 'long-press', 'confirm']);
    expect(impact).not.toHaveBeenCalled();
  });

  it('plays a Light, Heavy or Medium impact for each kind off Android', async () => {
    Platform.OS = 'ios';
    haptic('tap');
    haptic('longPress');
    haptic('confirm');
    await flush();
    expect(impact.mock.calls.map(([style]) => style)).toEqual(['light', 'heavy', 'medium']);
    expect(android).not.toHaveBeenCalled();
  });

  it('does nothing on web', async () => {
    Platform.OS = 'web';
    haptic('tap');
    await flush();
    expect(android).not.toHaveBeenCalled();
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
    await flush();
    expect(impact).toHaveBeenCalledWith('heavy');
  });

  it('never throws and swallows the rejection when every call fails', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    try {
      android.mockRejectedValueOnce(new Error('unsupported'));
      impact.mockRejectedValueOnce(new Error('unavailable'));
      expect(() => haptic('tap')).not.toThrow();
      await flush();
      await flush();
      expect(impact).toHaveBeenCalledTimes(1);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});
