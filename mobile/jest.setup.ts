import '@testing-library/react-native';

import { hideToast } from '@/lib/toast';

// Icon fonts are bundled assets that the jest asset registry does not know; skip loading them.
jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  loadAsync: jest.fn().mockResolvedValue(undefined),
  isLoaded: jest.fn().mockReturnValue(true),
}));

// The keyboard controller is native; its official mock renders plain views.
jest.mock('react-native-keyboard-controller', () => require('react-native-keyboard-controller/jest'));

// Node 26 warns when the global `localStorage` getter is touched without --localstorage-file, and
// Zustand's `persist` touches it while building its default storage. Native has no localStorage.
Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true });

// A toast arms a 3 s timer; left pending at the end of a worker's last test file it makes jest
// report "A worker process has failed to exit gracefully".
afterEach(() => {
  hideToast();
});
