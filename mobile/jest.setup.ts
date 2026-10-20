import '@testing-library/react-native';

// Icon fonts are bundled assets that the jest asset registry does not know; skip loading them.
jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  loadAsync: jest.fn().mockResolvedValue(undefined),
  isLoaded: jest.fn().mockReturnValue(true),
}));
