import { newUuid } from '../uuid';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

function stubCrypto(value: unknown) {
  Object.defineProperty(globalThis, 'crypto', { value, configurable: true, writable: true });
}

afterEach(() => {
  if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
  else delete (globalThis as { crypto?: unknown }).crypto;
  jest.restoreAllMocks();
});

describe('newUuid', () => {
  it('returns a v4 uuid and is unique over 1000 calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const id = newUuid();
      expect(id).toMatch(UUID_V4);
      seen.add(id);
    }
    expect(seen.size).toBe(1000);
  });

  it('uses crypto.randomUUID when available', () => {
    const randomUUID = jest.fn(() => '11111111-2222-4333-8444-555555555555');
    stubCrypto({ randomUUID });

    expect(newUuid()).toBe('11111111-2222-4333-8444-555555555555');
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('falls back to crypto.getRandomValues and sets the version and variant bits', () => {
    const getRandomValues = jest.fn((bytes: Uint8Array) => {
      bytes.fill(0xff);
      return bytes;
    });
    stubCrypto({ getRandomValues });

    expect(newUuid()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(getRandomValues).toHaveBeenCalledTimes(1);

    getRandomValues.mockImplementation((bytes: Uint8Array) => {
      bytes.fill(0);
      return bytes;
    });
    expect(newUuid()).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('falls back to Math.random when there is no crypto', () => {
    stubCrypto(undefined);
    const random = jest.spyOn(Math, 'random');

    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const id = newUuid();
      expect(id).toMatch(UUID_V4);
      ids.add(id);
    }
    expect(random).toHaveBeenCalled();
    expect(ids.size).toBe(200);

    random.mockReturnValue(0.999999);
    expect(newUuid()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    random.mockReturnValue(0);
    expect(newUuid()).toBe('00000000-0000-4000-8000-000000000000');
  });
});
