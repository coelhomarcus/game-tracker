import { useContext } from 'react';
import { HeaderHeightContext } from 'expo-router/react-navigation';

/**
 * Height of the stack header above the current screen, status bar included on Android (the app
 * draws edge-to-edge). Keyboard-avoiding views use it as their offset. Outside a navigator (tests)
 * it is 0 instead of throwing like `useHeaderHeight`.
 */
export function useHeaderHeight(): number {
  return useContext(HeaderHeightContext) ?? 0;
}
