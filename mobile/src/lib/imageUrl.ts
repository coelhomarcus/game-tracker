import { apiOrigin } from './env';

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const BACKEND_PATHS = ['/api/images/', '/uploads/'];

/**
 * Backend image URLs (`/api/images/...`, `/uploads/...`) are built from the server's public URL,
 * which can be `localhost` in development. They are rewritten onto the origin the app actually
 * uses; any other URL is returned unchanged.
 */
export function resolveImageUrl(
  url: string | null | undefined,
  origin: string = apiOrigin,
): string | null {
  if (!url) return null;
  if (!SCHEME.test(url)) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!BACKEND_PATHS.some((prefix) => parsed.pathname.startsWith(prefix))) return url;
  return `${origin.replace(/\/+$/, '')}${parsed.pathname}${parsed.search}`;
}
