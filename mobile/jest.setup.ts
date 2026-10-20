import '@testing-library/react-native';

// Icon fonts are bundled assets that the jest asset registry does not know; skip loading them.
jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  loadAsync: jest.fn().mockResolvedValue(undefined),
  isLoaded: jest.fn().mockReturnValue(true),
}));

// Node 26 warns when the global `localStorage` getter is touched without --localstorage-file, and
// Zustand's `persist` touches it while building its default storage. Native has no localStorage.
Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true });
