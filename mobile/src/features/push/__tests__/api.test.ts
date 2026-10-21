/** @jest-environment node */
import '@/test-utils/nodeFetch';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { apiBaseUrl } from '@/lib/env';

import { pushApi } from '../api';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const INSTALLATION = '11111111-2222-4333-8444-555555555555';

describe('pushApi', () => {
  it('registers the installation with the FCM token', async () => {
    let body: unknown;
    server.use(
      http.put(`${apiBaseUrl}/push/installations/${INSTALLATION}`, async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await pushApi.register(INSTALLATION, 'fcm-token');

    expect(body).toEqual({ provider: 'fcm', platform: 'android', token: 'fcm-token' });
  });

  it('revokes the installation', async () => {
    let called = false;
    server.use(
      http.delete(`${apiBaseUrl}/push/installations/${INSTALLATION}`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await pushApi.revoke(INSTALLATION);

    expect(called).toBe(true);
  });

  it('rejects when the server refuses the registration', async () => {
    server.use(
      http.put(`${apiBaseUrl}/push/installations/${INSTALLATION}`, () =>
        HttpResponse.json({ error: 'validation_error', message: 'x' }, { status: 400 }),
      ),
    );

    await expect(pushApi.register(INSTALLATION, 'fcm-token')).rejects.toThrow();
  });
});
