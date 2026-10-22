import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractMentions, MAX_MENTIONS } from './mentions';

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

  it('treats accented letters and URL paths as part of the surrounding word, not as a boundary', () => {
    assert.deepEqual(extractMentions('café@bar.com'), []);
    assert.deepEqual(extractMentions('olá@ana_b'), []);
    assert.deepEqual(extractMentions('site.com/@user12'), []);
    assert.deepEqual(extractMentions('oi @ana_b!'), ['ana_b']);
    assert.deepEqual(extractMentions('@abcé'), []);
    assert.deepEqual(extractMentions('é @abc'), ['abc']);
    assert.deepEqual(extractMentions('(@abc)'), ['abc']);
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

  const handles = (count: number) => Array.from({ length: count }, (_, i) => `name${String(i).padStart(2, '0')}`);
  const asText = (names: string[]) => names.map((n) => `@${n}`).join(' ');

  it('caps at 10 distinct mentions: the first ten, in order', () => {
    assert.equal(MAX_MENTIONS, 10);
    assert.deepEqual(extractMentions(asText(handles(15))), handles(10));
    assert.deepEqual(extractMentions(asText(handles(11))), handles(10));
    assert.equal(extractMentions(asText(handles(10))).length, 10);
    assert.equal(extractMentions(asText(handles(9))).length, 9);
  });

  it('counts only distinct valid mentions toward the cap', () => {
    const text = ['@name00 @NAME00 a@zzz1 e@x.com', ...handles(12).map((n) => `@${n} @${n.toUpperCase()}`)].join(' ');
    assert.deepEqual(extractMentions(text), handles(10));
  });
});
