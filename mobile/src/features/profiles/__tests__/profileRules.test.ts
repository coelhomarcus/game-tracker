import { MAX_IMAGE_BYTES, exceedsImageLimit, profileChanges, validateProfile } from '../profileRules';

const valid = { name: 'Ana Souza', username: 'ana_s', bio: '' };

describe('validateProfile', () => {
  it('accepts valid values', () => {
    expect(validateProfile(valid)).toEqual({});
  });

  it('asks for a name', () => {
    expect(validateProfile({ ...valid, name: '   ' }).name).toBe('Informe seu nome');
  });

  it('limits the name to 50 characters after trimming', () => {
    expect(validateProfile({ ...valid, name: ` ${'a'.repeat(50)} ` }).name).toBeUndefined();
    expect(validateProfile({ ...valid, name: 'a'.repeat(51) }).name).toBe(
      'Use no máximo 50 caracteres',
    );
  });

  it('applies the registration username rules', () => {
    expect(validateProfile({ ...valid, username: 'ab' }).username).toBe(
      'Use pelo menos 3 caracteres',
    );
    expect(validateProfile({ ...valid, username: 'ana-s' }).username).toBe(
      'Use apenas letras, números e _',
    );
    expect(validateProfile({ ...valid, username: 'a'.repeat(31) }).username).toBe(
      'Use no máximo 30 caracteres',
    );
  });

  it('limits the bio to 280 characters', () => {
    expect(validateProfile({ ...valid, bio: 'a'.repeat(280) }).bio).toBeUndefined();
    expect(validateProfile({ ...valid, bio: 'a'.repeat(281) }).bio).toBe(
      'Use no máximo 280 caracteres',
    );
  });
});

describe('profileChanges', () => {
  const initial = { name: 'Ana Souza', username: 'ana', bio: 'Oi' };

  it('is empty when nothing differs after trimming', () => {
    expect(profileChanges(initial, { name: ' Ana Souza ', username: 'ana ', bio: 'Oi\n' })).toEqual(
      {},
    );
  });

  it('returns only the changed fields, trimmed', () => {
    expect(profileChanges(initial, { name: 'Ana', username: 'ana', bio: 'Oi' })).toEqual({
      name: 'Ana',
    });
  });

  it('sends a blank bio as an empty string', () => {
    expect(profileChanges(initial, { ...initial, bio: '  ' })).toEqual({ bio: '' });
  });

  it('treats a missing bio as blank', () => {
    expect(profileChanges({ ...initial, bio: '' }, { ...initial, bio: '   ' })).toEqual({});
  });
});

describe('exceedsImageLimit', () => {
  it('refuses only known sizes over 8 MB', () => {
    expect(MAX_IMAGE_BYTES).toBe(8 * 1024 * 1024);
    expect(exceedsImageLimit(MAX_IMAGE_BYTES)).toBe(false);
    expect(exceedsImageLimit(MAX_IMAGE_BYTES + 1)).toBe(true);
    expect(exceedsImageLimit(null)).toBe(false);
  });
});
