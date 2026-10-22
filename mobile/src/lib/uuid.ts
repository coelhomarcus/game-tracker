type CryptoLike = {
  randomUUID?: () => string;
  getRandomValues?: <T extends ArrayBufferView>(array: T) => T;
};

function randomBytes(): Uint8Array {
  const bytes = new Uint8Array(16);
  const crypto = (globalThis as { crypto?: CryptoLike }).crypto;
  if (typeof crypto?.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

/** A random RFC 4122 version 4 UUID, used to identify a message send idempotently. */
export function newUuid(): string {
  const crypto = (globalThis as { crypto?: CryptoLike }).crypto;
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();

  const bytes = randomBytes();
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const parts = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20)];
  return `${parts.join('-')}-${hex.slice(20)}`;
}
