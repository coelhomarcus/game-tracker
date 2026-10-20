import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import cors from 'cors';
import express from 'express';
import { buildCorsOptions, parseCorsOrigins } from './corsOptions';

async function request(origins: string | undefined, origin?: string, method = 'GET') {
  const app = express();
  app.use(cors(buildCorsOptions(origins)));
  app.get('/x', (_req, res) => res.json({ ok: true }));
  const server = app.listen(0);
  await once(server, 'listening');
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/x`, {
      method,
      headers: {
        ...(origin ? { origin } : {}),
        ...(method === 'OPTIONS' ? { 'access-control-request-method': 'GET' } : {}),
      },
    });
    return { status: res.status, allow: res.headers.get('access-control-allow-origin') };
  } finally {
    server.close();
  }
}

describe('parseCorsOrigins', () => {
  it('empty, missing or * allow everything', () => {
    assert.equal(parseCorsOrigins(undefined), '*');
    assert.equal(parseCorsOrigins(''), '*');
    assert.equal(parseCorsOrigins('  , '), '*');
    assert.equal(parseCorsOrigins('https://a.test,*'), '*');
  });
  it('list: trims spaces and the trailing slash', () => {
    assert.deepEqual(parseCorsOrigins(' https://a.test/ , https://b.test'), ['https://a.test', 'https://b.test']);
  });
});

describe('CORS', () => {
  it('without configuration keeps the behavior open', async () => {
    assert.equal((await request(undefined, 'https://qualquer.test')).allow, '*');
  });
  it('listed origin is accepted and echoed', async () => {
    const r = await request('https://app.test', 'https://app.test');
    assert.equal(r.status, 200);
    assert.equal(r.allow, 'https://app.test');
  });
  it('origin does not listed does not receive the header (the browser blocks the reading)', async () => {
    const r = await request('https://app.test', 'https://evil.test');
    assert.equal(r.allow, null);
  });
  it('preflight from an unlisted origin is not authorized', async () => {
    const r = await request('https://app.test', 'https://evil.test', 'OPTIONS');
    assert.equal(r.allow, null);
  });
  it('without Origin (app native) continues working', async () => {
    const r = await request('https://app.test');
    assert.equal(r.status, 200);
  });
  it('the subdomain or similar prefix does not pass', async () => {
    assert.equal((await request('https://app.test', 'https://app.test.evil.test')).allow, null);
    assert.equal((await request('https://app.test', 'http://app.test')).allow, null);
  });
});
