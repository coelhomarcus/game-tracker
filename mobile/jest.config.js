const preset = require('jest-expo/jest-preset');

// msw, its dependencies and FlashList ship ESM only (some as .mjs); transform them with
// the same babel-jest setup the preset uses for regular sources.
const esmPackages = ['msw', '@mswjs', '@msw', 'until-async', 'rettime', 'headers-polyfill', 'outvariant', 'cookie', 'tough-cookie', '@open-draft', '@shopify/flash-list'];
const sourceTransformKey = Object.keys(preset.transform).find((key) => key.includes('[jt]sx'));

module.exports = {
  preset: 'jest-expo',
  // Reanimated and worklets ship a JS-only build of their native entry points for jest.
  resolver: 'react-native-reanimated/jest/resolver.js',
  // Gesture handler's mocks (concatenated after the preset's setup files) let tests drive gestures.
  setupFiles: ['react-native-gesture-handler/jestSetup.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // The integration suites need a running test API; they run with `npm run test:integration`.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/integration/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '[.]mjs$': preset.transform[sourceTransformKey],
  },
  transformIgnorePatterns: preset.transformIgnorePatterns.map((pattern, index) =>
    index === 0 ? pattern.replace('(?!(', `(?!(${esmPackages.join('|')}|`) : pattern,
  ),
};
