import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { whyUnsafeDatabase } from './env';

describe('lock of database of the tests', () => {
  it('accepts local database finished in _test', () => {
    assert.equal(whyUnsafeDatabase('postgresql://u:p@localhost:5434/gametracker_test'), null);
    assert.equal(whyUnsafeDatabase('postgresql://u:p@127.0.0.1:5432/outro_test'), null);
  });
  it('rejects remote host, even with name _test', () => {
    assert.match(whyUnsafeDatabase('postgresql://u:p@db.exemplo.com:5432/gametracker_test')!, /não é local/);
    assert.match(whyUnsafeDatabase('postgresql://u:p@localhost.exemplo.com/x_test')!, /não é local/);
  });
  it('rejects local database without suffix _test (including the of development)', () => {
    assert.match(whyUnsafeDatabase('postgresql://u:p@localhost:5432/gametracker')!, /_test/);
    assert.match(whyUnsafeDatabase('postgresql://u:p@localhost:5433/gametracker_flutter')!, /_test/);
    assert.match(whyUnsafeDatabase('postgresql://u:p@localhost:5432/test_gametracker')!, /_test/);
  });
  it('rejects missing or invalid', () => {
    assert.match(whyUnsafeDatabase(undefined)!, /não está definida/);
    assert.match(whyUnsafeDatabase('isto não é url')!, /não é uma URL/);
  });
  it('the trick of host (user@host) does not fools', () => {
    assert.match(whyUnsafeDatabase('postgresql://localhost:x@db.exemplo.com/x_test')!, /não é local/);
  });
});
