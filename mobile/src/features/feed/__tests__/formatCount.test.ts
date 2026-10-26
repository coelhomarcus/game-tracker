import { formatCount } from '../formatCount';

describe('formatCount', () => {
  it.each([
    [0, '0'],
    [1, '1'],
    [999, '999'],
    [1000, '1 mil'],
    [1099, '1 mil'],
    [1200, '1,2 mil'],
    [1299, '1,2 mil'],
    [9999, '9,9 mil'],
    [10_000, '10 mil'],
    [12_345, '12 mil'],
    [999_999, '999 mil'],
    [1_000_000, '1 mi'],
    [1_500_000, '1,5 mi'],
    [1_599_999, '1,5 mi'],
    [12_900_000, '12 mi'],
    [2_340_000_000, '2,3 bi'],
  ])('formats %d as "%s", truncating', (n, expected) => {
    expect(formatCount(n)).toBe(expected);
  });

  it('never shows a negative or fractional count', () => {
    expect(formatCount(-3)).toBe('0');
    expect(formatCount(4.9)).toBe('4');
  });
});
