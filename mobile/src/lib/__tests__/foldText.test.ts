import { foldText } from '../foldText';

describe('foldText', () => {
  it('lowercases, strips accents and collapses whitespace', () => {
    expect(foldText('  Pokémon   Ônix ')).toBe('pokemon onix');
  });

  it('maps special letters', () => {
    expect(foldText('Straße')).toBe('strasse');
    expect(foldText('Æon Œuvre Øl Łódź')).toBe('aeon oeuvre ol lodz');
  });
});
