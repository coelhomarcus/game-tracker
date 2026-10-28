// Image helpers for the integration suites that upload pictures.
import { crc32, deflateSync } from 'node:zlib';

import type { PickedImage } from '@/features/profiles/types';

/** A valid 1x1 PNG. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** An RGB gradient PNG of the given size, like a photo the picker cropped. */
export function gradientPng(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const stride = 1 + width * 3;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * stride + 1 + x * 3;
      pixels[at] = Math.floor((x * 255) / width);
      pixels[at + 1] = Math.floor((y * 255) / height);
      pixels[at + 2] = 120;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** The frame size in a JPEG's SOF header. */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('not a JPEG');
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) throw new Error(`bad JPEG segment at ${at}`);
    const marker = bytes[at + 1];
    if (marker === 0xff) {
      at += 1; // fill byte
      continue;
    }
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      return {
        height: (bytes[at + 5] << 8) | bytes[at + 6],
        width: (bytes[at + 7] << 8) | bytes[at + 8],
      };
    }
    at += 2 + ((bytes[at + 2] << 8) | bytes[at + 3]);
  }
  throw new Error('no JPEG frame header');
}

/** A picked image whose uri holds the bytes themselves (a data: URI instead of a file path). */
export function picked(bytes: Uint8Array, fileName: string, mimeType: string): PickedImage {
  return {
    uri: `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`,
    mimeType,
    fileName,
    size: bytes.length,
  };
}

export const tinyPng = () => picked(TINY_PNG, 'eu.png', 'image/png');

/** Fetches an uploaded image the way the app's <Image> does: without credentials. */
export async function served(url: string): Promise<{ type: string | null; bytes: Uint8Array }> {
  const response = await fetch(url);
  expect(response.status).toBe(200);
  return {
    type: response.headers.get('content-type'),
    bytes: new Uint8Array(await response.arrayBuffer()),
  };
}

