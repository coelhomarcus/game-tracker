import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withoutNotes } from './users.controller';

describe('withoutNotes', () => {
  it('removes annotations and keeps the rest without mutating the original', () => {
    const entry = { id: 'e1', status: 'completed', hoursPlayed: '12.5', rating: 9, notes: 'segredo', game: { name: 'X' } };
    const publicEntry = withoutNotes(entry);
    assert.equal('notes' in publicEntry, false);
    assert.deepEqual(publicEntry, { id: 'e1', status: 'completed', hoursPlayed: '12.5', rating: 9, game: { name: 'X' } });
    assert.equal(entry.notes, 'segredo');
  });
  it('entry without annotations stays unchanged', () => {
    assert.deepEqual(withoutNotes({ id: 'e2', notes: null }), { id: 'e2' });
  });
});
