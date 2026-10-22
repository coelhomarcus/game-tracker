import { useContext } from 'react';
import { HeaderHeightContext } from 'expo-router/react-navigation';

/**
 * Height of the header above the current screen, status bar included (the app draws edge-to-edge
 * and `Layout.Header` pads the status bar itself). The native stack and the bottom tabs measure
 * the custom header with onLayout and provide it here. Keyboard-avoiding views use it as their
 * offset. Outside a navigator (tests) it is 0 instead of throwing like `useHeaderHeight`.
 */
export function useHeaderHeight(): number {
  return useContext(HeaderHeightContext) ?? 0;
}
