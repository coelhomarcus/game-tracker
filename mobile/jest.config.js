const preset = require('jest-expo/jest-preset');

// msw, its dependencies and FlashList ship ESM only (some as .mjs); transform them with
// the same babel-jest setup the preset uses for regular sources.
const esmPackages = ['msw', '@mswjs', '@msw', 'until-async', 'rettime', 'headers-polyfill', 'outvariant', 'cookie', 'tough-cookie', '@open-draft', '@shopify/flash-list'];
const sourceTransformKey = Object.keys(preset.transform).find((key) => key.includes('[jt]sx'));

module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
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
