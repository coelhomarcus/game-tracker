const UNITS = [
  { value: 1_000_000_000, suffix: 'bi' },
  { value: 1_000_000, suffix: 'mi' },
  { value: 1_000, suffix: 'mil' },
] as const;

/**
 * A post counter in pt-BR compact form: "999", "1,2 mil", "12 mil", "1,5 mi". One decimal below
 * ten of a unit, none from ten on, always truncated: a counter never shows more than it has.
 */
export function formatCount(n: number): string {
  const count = Math.max(0, Math.trunc(n));
  for (const { value, suffix } of UNITS) {
    if (count < value) continue;
    const units = count / value;
    if (units >= 10) return `${Math.trunc(units)} ${suffix}`;
    const tenths = Math.trunc(count / (value / 10));
    const whole = Math.trunc(tenths / 10);
    const decimal = tenths % 10;
    return decimal === 0 ? `${whole} ${suffix}` : `${whole},${decimal} ${suffix}`;
  }
  return String(count);
}
