import { apiOrigin } from '../env';
import { resolveImageUrl } from '../imageUrl';

const origin = 'https://gt.example.com';

describe('resolveImageUrl', () => {
  it('rewrites API image URLs onto the configured origin', () => {
    expect(resolveImageUrl('http://localhost:3000/api/images/cover?id=1', origin)).toBe(
      'https://gt.example.com/api/images/cover?id=1',
    );
  });

  it('rewrites upload URLs onto the configured origin', () => {
    expect(resolveImageUrl('http://localhost:3000/uploads/a.png', origin)).toBe(
      'https://gt.example.com/uploads/a.png',
    );
  });

  it('leaves third-party URLs unchanged', () => {
    expect(resolveImageUrl('https://images.igdb.com/x.jpg', origin)).toBe(
      'https://images.igdb.com/x.jpg',
    );
  });

  it('returns null for empty values', () => {
    expect(resolveImageUrl(null, origin)).toBeNull();
    expect(resolveImageUrl(undefined, origin)).toBeNull();
    expect(resolveImageUrl('', origin)).toBeNull();
  });

  it('leaves URLs without a scheme unchanged', () => {
    expect(resolveImageUrl('relative/path.png', origin)).toBe('relative/path.png');
  });

  it('defaults to the API origin from the environment', () => {
    expect(resolveImageUrl('http://other.test/uploads/a.png')).toBe(`${apiOrigin}/uploads/a.png`);
  });

  it('tolerates an origin with a trailing slash', () => {
    expect(resolveImageUrl('http://localhost:3000/uploads/a.png', 'https://gt.example.com/')).toBe(
      'https://gt.example.com/uploads/a.png',
    );
  });
});
