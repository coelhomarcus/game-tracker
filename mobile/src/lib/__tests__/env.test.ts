import { resolveApiBaseUrl as r } from '../env';

test('appends /api to the configured URL', () => {
  expect(r('https://gt.marcuscoelho.com', 'android')).toBe('https://gt.marcuscoelho.com/api');
});

test('tolerates a trailing slash or an /api suffix', () => {
  expect(r('https://gt.marcuscoelho.com/', 'web')).toBe('https://gt.marcuscoelho.com/api');
  expect(r('https://gt.marcuscoelho.com/api', 'web')).toBe('https://gt.marcuscoelho.com/api');
  expect(r('  https://gt.marcuscoelho.com/api/  ', 'ios')).toBe('https://gt.marcuscoelho.com/api');
});

test('defaults per platform when unset or blank', () => {
  expect(r(undefined, 'android')).toBe('http://10.0.2.2:3000/api');
  expect(r('  ', 'web')).toBe('http://localhost:3000/api');
  expect(r(undefined, 'ios')).toBe('http://localhost:3000/api');
});

test('apiOrigin is the API base URL without /api', () => {
  const { apiBaseUrl, apiOrigin } = jest.requireActual<typeof import('../env')>('../env');
  expect(apiBaseUrl.endsWith('/api')).toBe(true);
  expect(apiOrigin).toBe(apiBaseUrl.slice(0, -'/api'.length));
});
