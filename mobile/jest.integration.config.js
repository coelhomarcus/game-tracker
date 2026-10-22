// The integration suites: the app's real API layer against the disposable test API at
// GT_BACKEND (see integration/backend.ts). Without GT_BACKEND every suite is skipped.
const base = require('./jest.config');

// Jest does not list the tests of a fully skipped file, so say once why everything is skipped.
if (!process.env.GT_BACKEND?.trim()) {
  process.stdout.write(
    'GT_BACKEND is not set: the integration suites are skipped. To run them, start the test API ' +
      '(in backend/: `npm run test:seed` and `npm run dev:test`), then run ' +
      '`GT_BACKEND=http://localhost:3100 npm run test:integration` here.\n',
  );
}

module.exports = {
  ...base,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/integration/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  // Appended to the preset's setup files; no UI setup (jest.setup.ts) is needed here.
  setupFiles: ['<rootDir>/integration/setup.ts'],
  // A shared afterEach that signs the app out and clears the secure store after every test.
  setupFilesAfterEnv: ['<rootDir>/integration/reset.ts'],
  // One shared test database: suites that count rows (game stats) must not interleave.
  maxWorkers: 1,
  testTimeout: 30_000,
};
