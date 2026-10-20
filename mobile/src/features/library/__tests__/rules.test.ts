import type { Game } from '@/features/games/types';
import type { DateOnly } from '@/lib/dateOnly';

import { initialValues, isDirty, toDraft, validate, type FormValues } from '../rules';
import type { GameEntry } from '../types';

const today: DateOnly = { year: 2026, month: 10, day: 20 };

function game(platforms: string[]): Game {
  return {
    id: 'g1',
    igdbId: 1,
    name: 'Celeste',
    coverUrl: null,
    summary: null,
    screenshots: [],
    platforms,
    genres: [],
    isFavoritedByMe: false,
  };
}

function values(overrides: Partial<FormValues> = {}): FormValues {
  return {
    status: 'backlog',
    platform: 'PC',
    startedAt: '',
    finishedAt: '',
    hours: '',
    rating: null,
    notes: '',
    ...overrides,
  };
}

describe('initialValues', () => {
  it('starts a new record in the backlog with the only platform of the game', () => {
    expect(initialValues(game(['PC']))).toEqual(values({ platform: 'PC' }));
  });

  it('leaves the platform empty when the game has several or none', () => {
    expect(initialValues(game(['PC', 'Switch'])).platform).toBe('');
    expect(initialValues(game([])).platform).toBe('');
  });

  it('fills the form from an existing entry', () => {
    const entry: GameEntry = {
      id: 'e1',
      platform: 'Switch',
      status: 'completed',
      startedAt: { year: 2026, month: 1, day: 5 },
      finishedAt: { year: 2026, month: 2, day: 9 },
      hoursPlayed: 12.5,
      rating: 4,
      notes: 'Ótimo',
      createdAt: new Date('2026-01-05T00:00:00Z'),
      game: game(['PC', 'Switch']),
    };
    expect(initialValues(entry.game, entry)).toEqual({
      status: 'completed',
      platform: 'Switch',
      startedAt: '05/01/2026',
      finishedAt: '09/02/2026',
      hours: '12,5',
      rating: 4,
      notes: 'Ótimo',
    });
  });

  it('shows empty text for missing optional values of an entry', () => {
    const entry: GameEntry = {
      id: 'e1',
      platform: 'PC',
      status: 'playing',
      startedAt: null,
      finishedAt: null,
      hoursPlayed: 20,
      rating: null,
      notes: null,
      createdAt: new Date('2026-01-05T00:00:00Z'),
      game: game(['PC']),
    };
    expect(initialValues(entry.game, entry)).toEqual(values({ status: 'playing', hours: '20' }));
  });
});

describe('validate', () => {
  it('accepts a minimal record', () => {
    expect(validate(values(), today)).toEqual({});
  });

  it('requires a platform', () => {
    expect(validate(values({ platform: '   ' }), today)).toEqual({
      platform: 'Informe a plataforma',
    });
  });

  it('rejects dates that are not dd/mm/aaaa', () => {
    const errors = validate(values({ startedAt: '2026-01-01', finishedAt: '31/02/2026' }), today);
    expect(errors.startedAt).toBe('Use o formato dd/mm/aaaa.');
    expect(errors.finishedAt).toBe('Use o formato dd/mm/aaaa.');
  });

  it('allows a finish date without a start date', () => {
    expect(validate(values({ finishedAt: '02/01/2026' }), today)).toEqual({});
  });

  it('rejects a finish before the start, on the finish field', () => {
    expect(validate(values({ startedAt: '10/01/2026', finishedAt: '09/01/2026' }), today)).toEqual({
      finishedAt: 'O fim não pode ser antes do início.',
    });
  });

  it('does not report a period error when a date has a format error', () => {
    const errors = validate(values({ startedAt: '10/01/2026', finishedAt: 'ontem' }), today);
    expect(errors).toEqual({ finishedAt: 'Use o formato dd/mm/aaaa.' });
  });

  it.each(['12', '12,5', '12.5', ' 12 '])('accepts hours %p', (hours) => {
    expect(validate(values({ hours }), today)).toEqual({});
  });

  it.each(['12h', 'abc', '-1', '1,2,3'])('rejects hours %p', (hours) => {
    expect(validate(values({ hours }), today).hours).toBe('Use só números, como 12 ou 12,5.');
  });

  it('rejects hours above the maximum', () => {
    expect(validate(values({ hours: '100000' }), today).hours).toBe('O máximo é 99999,0 horas.');
  });

  it('rejects hours that do not fit between start and finish', () => {
    const errors = validate(
      values({ startedAt: '01/01/2026', finishedAt: '02/01/2026', hours: '49' }),
      today,
    );
    expect(errors.hours).toBe('Isso passa das 48 h possíveis entre início e fim. Confira as datas.');
  });

  it('accepts hours exactly at the ceiling', () => {
    const errors = validate(
      values({ startedAt: '01/01/2026', finishedAt: '02/01/2026', hours: '48' }),
      today,
    );
    expect(errors).toEqual({});
  });

  it('uses today as the end when there is no finish date', () => {
    const errors = validate(values({ startedAt: '20/10/2026', hours: '25' }), today);
    expect(errors.hours).toBe(
      'Isso passa das 24 h possíveis entre o início e hoje. Confira as datas.',
    );
  });

  it('skips the plausibility check when the finish date has a format error', () => {
    const errors = validate(
      values({ startedAt: '01/01/2026', finishedAt: 'x', hours: '9999' }),
      today,
    );
    expect(errors).toEqual({ finishedAt: 'Use o formato dd/mm/aaaa.' });
  });

  it('skips the plausibility check when the start date has a format error', () => {
    const errors = validate(
      values({ startedAt: 'x', finishedAt: '02/01/2026', hours: '9999' }),
      today,
    );
    expect(errors).toEqual({ startedAt: 'Use o formato dd/mm/aaaa.' });
  });

  it('limits notes to 2000 characters', () => {
    expect(validate(values({ notes: 'a'.repeat(2000) }), today)).toEqual({});
    expect(validate(values({ notes: 'a'.repeat(2001) }), today).notes).toBe(
      'Use no máximo 2000 caracteres.',
    );
  });
});

describe('toDraft', () => {
  it('builds the payload with parsed dates and hours', () => {
    expect(
      toDraft(
        values({
          status: 'completed',
          platform: ' Switch ',
          startedAt: '05/01/2026',
          finishedAt: '09/02/2026',
          hours: '12,5',
          rating: 5,
          notes: '  Ótimo  ',
        }),
      ),
    ).toEqual({
      platform: 'Switch',
      status: 'completed',
      startedAt: { year: 2026, month: 1, day: 5 },
      finishedAt: { year: 2026, month: 2, day: 9 },
      hoursPlayed: 12.5,
      rating: 5,
      notes: 'Ótimo',
    });
  });

  it('parses both decimal separators', () => {
    expect(toDraft(values({ hours: '12.5' })).hoursPlayed).toBe(12.5);
    expect(toDraft(values({ hours: '12,5' })).hoursPlayed).toBe(12.5);
  });

  it('turns blank optional values into null', () => {
    expect(toDraft(values({ hours: '  ', notes: '   ' }))).toEqual({
      platform: 'PC',
      status: 'backlog',
      startedAt: null,
      finishedAt: null,
      hoursPlayed: null,
      rating: null,
      notes: null,
    });
  });
});

describe('isDirty', () => {
  it('is false for identical values', () => {
    expect(isDirty(values(), values())).toBe(false);
  });

  it('ignores surrounding whitespace in text fields', () => {
    expect(isDirty(values({ notes: 'a' }), values({ notes: ' a ' }))).toBe(false);
  });

  it.each<Partial<FormValues>>([
    { status: 'playing' },
    { platform: 'Switch' },
    { startedAt: '01/01/2026' },
    { finishedAt: '01/01/2026' },
    { hours: '3' },
    { rating: 3 },
    { notes: 'x' },
  ])('is true when %p changes', (change) => {
    expect(isDirty(values(), values(change))).toBe(true);
  });
});
