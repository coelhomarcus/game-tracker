import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors } from '@/theme/tokens';

import { PILL_OVERLAP, ReactionsPill, summarizeReactions } from '../ReactionsPill';
import type { Reaction } from '../types';

const r = (emoji: string, userId: string): Reaction => ({ emoji, userId });

describe('summarizeReactions', () => {
  it('shows up to 3 different emoji, the most used first and ties in the order they came', () => {
    const summary = summarizeReactions(
      [r('😂', 'u1'), r('🔥', 'u2'), r('🔥', 'u3'), r('❤️', 'u1'), r('👍', 'u4'), r('👍', 'u5')],
      'me',
    );
    expect(summary).toEqual({ emoji: ['🔥', '👍', '😂'], total: 6, mine: false, myFirst: null });
  });

  it('knows my first reaction', () => {
    const summary = summarizeReactions([r('😂', 'u1'), r('❤️', 'me'), r('🔥', 'me')], 'me');
    expect(summary.mine).toBe(true);
    expect(summary.myFirst).toBe('❤️');
  });
});

describe('ReactionsPill', () => {
  async function renderPill(reactions: Reaction[], alignRight = false) {
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    await render(
      <ReactionsPill
        reactions={reactions}
        selfId="me"
        alignRight={alignRight}
        onPress={onPress}
        onLongPress={onLongPress}
      />,
    );
    return { onPress, onLongPress };
  }
  const body = () => StyleSheet.flatten(screen.getByTestId('reactions-pill-body').props.style);
  const touch = () => StyleSheet.flatten(screen.getByTestId('reactions-pill').props.style);

  it('renders nothing without reactions', async () => {
    await renderPill([]);
    expect(screen.queryByTestId('reactions-pill')).not.toBeOnTheScreen();
  });

  it('shows one emoji without a count', async () => {
    await renderPill([r('😂', 'u1')]);
    expect(screen.getByText('😂')).toBeOnTheScreen();
    expect(screen.queryByTestId('reactions-count')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Reações: 😂 1' })).toBeOnTheScreen();
  });

  it('shows up to 3 emoji and the total over 1, in a pill outlined in the background colour', async () => {
    await renderPill([r('😂', 'u1'), r('🔥', 'u1'), r('❤️', 'u1'), r('👍', 'u1'), r('😂', 'u2')]);
    expect(screen.getByTestId('reactions-count')).toHaveTextContent('5');
    expect(screen.queryByText('👍')).not.toBeOnTheScreen();
    expect(body()).toMatchObject({
      backgroundColor: colors.bgContrast50,
      borderColor: colors.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 999,
    });
  });

  it('outlines the pill in primary when one of them is mine', async () => {
    await renderPill([r('😂', 'u1'), r('🔥', 'me')]);
    expect(body().borderColor).toBe(colors.primary);
    expect(screen.getByRole('button', { name: 'Reações: 😂 1, 🔥 1. Inclui as suas' })).toBeOnTheScreen();
  });

  it('hangs on the sender side, 8 over the bubble, in a real 48 touch box', async () => {
    await renderPill([r('😂', 'u1')], true);
    expect(touch()).toMatchObject({ minWidth: 48, minHeight: 48, alignSelf: 'flex-end' });
    // Centred in the box: the 24 high pill's top is 8 above the box's natural top.
    expect(touch().marginTop).toBe(-(PILL_OVERLAP + (48 - 24) / 2));
    expect(PILL_OVERLAP).toBe(8);
  });

  it('passes taps and long presses on', async () => {
    const { onPress, onLongPress } = await renderPill([r('😂', 'u1')]);
    await fireEvent.press(screen.getByTestId('reactions-pill'));
    await fireEvent(screen.getByTestId('reactions-pill'), 'longPress');
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });
});
