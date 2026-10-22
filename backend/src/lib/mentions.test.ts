import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractMentions } from './mentions';

describe('extractMentions', () => {
  it('finds a mention anywhere in the text, lowercased', () => {
    assert.deepEqual(extractMentions('@Alice'), ['alice']);
    assert.deepEqual(extractMentions('oi @Bob_99, tudo bem?'), ['bob_99']);
    assert.deepEqual(extractMentions('fim @carol'), ['carol']);
    assert.deepEqual(extractMentions('linha um\n@dave\nlinha três'), ['dave']);
  });

  it('keeps the order of first appearance and drops duplicates, ignoring case', () => {
    assert.deepEqual(extractMentions('@bbb @aaa @BBB @aaa'), ['bbb', 'aaa']);
  });

  it('ignores emails and text glued to a word or to another @', () => {
    assert.deepEqual(extractMentions('escreva para fulano@example.com'), []);
    assert.deepEqual(extractMentions('abc@def'), []);
    assert.deepEqual(extractMentions('@@duplo'), []);
    assert.deepEqual(extractMentions('x.@pontuado'), []);
    assert.deepEqual(extractMentions('a@bcd e @efg'), ['efg']);
  });

  it('stops at punctuation, which is not part of the username', () => {
    assert.deepEqual(extractMentions('(@abc) e "@def", @ghi! @jkl? @mno; @pqr.'), ['abc', 'def', 'ghi', 'jkl', 'mno', 'pqr']);
    assert.deepEqual(extractMentions('@abc-def'), ['abc']);
  });

  it('accepts only 3 to 30 characters of letters, digits and underscore', () => {
    assert.deepEqual(extractMentions('@ab'), []);
    assert.deepEqual(extractMentions('@abc'), ['abc']);
    assert.deepEqual(extractMentions(`@${'a'.repeat(30)}`), ['a'.repeat(30)]);
    assert.deepEqual(extractMentions(`@${'a'.repeat(31)}`), []);
    assert.deepEqual(extractMentions('@ação'), []);
    assert.deepEqual(extractMentions('@___'), ['___']);
  });

  it('returns an empty list when there is nothing to find', () => {
    assert.deepEqual(extractMentions(''), []);
    assert.deepEqual(extractMentions('sem menções #tag'), []);
    assert.deepEqual(extractMentions('@ sozinho'), []);
  });

  it('is stateless between calls', () => {
    assert.deepEqual(extractMentions('@abc'), ['abc']);
    assert.deepEqual(extractMentions('@abc'), ['abc']);
  });
});
