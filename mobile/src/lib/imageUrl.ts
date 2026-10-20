import { apiOrigin } from './env';

const ABSOLUTE_URL = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?/;
const BACKEND_PATHS = ['/api/images/', '/uploads/'];

/**
 * Backend image URLs (`/api/images/...`, `/uploads/...`) are built from the server's public URL,
 * which can be `localhost` in development. They are rewritten onto the origin the app actually
 * uses; any other URL is returned unchanged. Parsed with a regular expression because the
 * React Native `URL` polyfill does not implement every getter.
 */
export function resolveImageUrl(
  url: string | null | undefined,
  origin: string = apiOrigin,
): string | null {
  if (!url) return null;
  const match = ABSOLUTE_URL.exec(url);
  if (!match) return url;
  const path = match[3] ?? '';
  if (!BACKEND_PATHS.some((prefix) => path.startsWith(prefix))) return url;
  return `${origin.replace(/\/+$/, '')}${path}${match[4] ?? ''}`;
}
