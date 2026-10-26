import { render, screen } from '@testing-library/react-native';

import { colors } from '@/theme/tokens';

import { CharProgress, measurePost, remainingLabel } from '../CharProgress';

describe('measurePost', () => {
  it('counts graphemes while the text fits', () => {
    expect(measurePost('')).toEqual({ count: 0, over: false });
    expect(measurePost('olá 👍🏽')).toEqual({ count: 5, over: false });
    // 250 thumbs are 500 UTF-16 units: still fits.
    expect(measurePost('👍'.repeat(250))).toEqual({ count: 250, over: false });
  });

  it('is over when the UTF-16 length passes 500, even with fewer graphemes', () => {
    expect(measurePost('👍'.repeat(251))).toEqual({ count: 502, over: true });
    expect(measurePost('a'.repeat(500))).toEqual({ count: 500, over: false });
    expect(measurePost('a'.repeat(501))).toEqual({ count: 501, over: true });
  });
});

describe('remainingLabel', () => {
  it('reads the remaining or the excess count', () => {
    expect(remainingLabel(500)).toBe('500 caracteres restantes');
    expect(remainingLabel(1)).toBe('1 caractere restante');
    expect(remainingLabel(0)).toBe('0 caracteres restantes');
    expect(remainingLabel(-1)).toBe('1 caractere acima do limite');
    expect(remainingLabel(-12)).toBe('12 caracteres acima do limite');
  });
});

describe('CharProgress', () => {
  it('is a ring without a number far from the limit', async () => {
    await render(<CharProgress count={10} />);

    const counter = screen.getByLabelText('490 caracteres restantes');
    expect(counter).toBeOnTheScreen();
    expect(screen.queryByText('490')).toBeNull();
    expect(screen.getByTestId('char-progress-ring')).toBeOnTheScreen();
    expect(screen.queryByTestId('char-progress-pie')).toBeNull();
  });

  it('draws no arc while empty', async () => {
    await render(<CharProgress count={0} />);

    expect(screen.queryByTestId('char-progress-arc')).toBeNull();
  });

  it('fills the arc in proportion to the length', async () => {
    await render(<CharProgress count={250} />);

    const arc = screen.getByTestId('char-progress-arc');
    const circumference = 2 * Math.PI * arc.props.r;
    // Half the length leaves half of the dash hidden.
    expect(Number(arc.props.strokeDasharray[0])).toBeCloseTo(circumference, 3);
    expect(arc.props.strokeDashoffset).toBeCloseTo(circumference / 2, 3);
  });

  it('shows the remaining count in the last 100 characters', async () => {
    await render(<CharProgress count={400} />);

    expect(screen.getByText('100')).toHaveStyle({ color: colors.textMedium, fontVariant: ['tabular-nums'] });
    expect(screen.getByLabelText('100 caracteres restantes')).toBeOnTheScreen();
  });

  it('turns into a red pie with a negative count past the limit', async () => {
    await render(<CharProgress count={503} />);

    expect(screen.getByText('-3')).toHaveStyle({ color: colors.danger });
    expect(screen.getByLabelText('3 caracteres acima do limite')).toBeOnTheScreen();
    expect(screen.getByTestId('char-progress-pie')).toBeOnTheScreen();
    expect(screen.queryByTestId('char-progress-ring')).toBeNull();
  });
});
