import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import {
  createGestureController,
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import { getAnimatedStyle } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';

import {
  BACK_GESTURE_EDGE,
  REPLY_SWIPE_MAX,
  REPLY_SWIPE_THRESHOLD,
  replySwipeArmed,
  replySwipeOffset,
  SwipeToReply,
} from '../SwipeToReply';

jest.mock('@/lib/haptics', () => ({ haptic: jest.fn() }));

beforeEach(() => {
  jest.mocked(haptic).mockReset();
});

describe('reply swipe thresholds', () => {
  it('follows the finger to the right only, up to 72', () => {
    expect(REPLY_SWIPE_MAX).toBe(72);
    expect(replySwipeOffset(-30)).toBe(0);
    expect(replySwipeOffset(0)).toBe(0);
    expect(replySwipeOffset(40)).toBe(40);
    expect(replySwipeOffset(72)).toBe(72);
    expect(replySwipeOffset(200)).toBe(72);
  });

  it('replies from 56 on, nothing below', () => {
    expect(REPLY_SWIPE_THRESHOLD).toBe(56);
    expect(replySwipeArmed(0)).toBe(false);
    expect(replySwipeArmed(55)).toBe(false);
    expect(replySwipeArmed(56)).toBe(true);
    expect(replySwipeArmed(300)).toBe(true);
    expect(replySwipeArmed(-80)).toBe(false);
  });
});

describe('SwipeToReply', () => {
  async function renderSwipe() {
    const onReply = jest.fn();
    await render(
      <GestureHandlerRootView>
        <SwipeToReply id="m1" enabled onReply={onReply}>
          <Text>mensagem</Text>
        </SwipeToReply>
      </GestureHandlerRootView>,
    );
    return onReply;
  }

  /** Drags through `path` (translationX values) and releases at the last one. */
  async function drag(path: number[], end: 'end' | 'cancel' = 'end') {
    const last = path[path.length - 1];
    await act(async () => {
      fireGestureHandler(getByGestureTestId('reply-swipe-m1'), [
        { state: State.BEGAN, translationX: 0 },
        { state: State.ACTIVE, translationX: path[0] },
        ...path.slice(1).map((translationX) => ({ translationX })),
        { state: end === 'end' ? State.END : State.CANCELLED, translationX: last },
      ]);
    });
  }

  it('replies on release past 56, with one haptic', async () => {
    const onReply = await renderSwipe();
    await drag([12, 30, 57, 64, 72, 90]);

    expect(onReply).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledTimes(1);
  });

  it('does nothing on release below 56', async () => {
    const onReply = await renderSwipe();
    await drag([12, 30, 55]);

    expect(onReply).not.toHaveBeenCalled();
    expect(haptic).not.toHaveBeenCalled();
  });

  it('does what the release point says after going back under 56', async () => {
    const onReply = await renderSwipe();
    await drag([12, 60, 40]);

    expect(onReply).not.toHaveBeenCalled();
    // The one haptic is from reaching 56; going back plays nothing.
    expect(haptic).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the gesture is cancelled (the system took the touch)', async () => {
    const onReply = await renderSwipe();
    await drag([12, 70], 'cancel');

    expect(onReply).not.toHaveBeenCalled();
  });

  it('starts only 10 to the right, gives way to a vertical scroll and leaves the back-gesture edge alone', async () => {
    await renderSwipe();
    const { config } = getByGestureTestId('reply-swipe-m1') as unknown as { config: Record<string, unknown> };

    expect(config).toMatchObject({
      enabled: true,
      activeOffsetXEnd: 10,
      // Never to the left: a drag that way fails after 10.
      activeOffsetXStart: -10_000,
      failOffsetXStart: -10,
      failOffsetYStart: -10,
      failOffsetYEnd: 10,
      hitSlop: { left: -BACK_GESTURE_EDGE },
    });
    expect(BACK_GESTURE_EDGE).toBe(24);
  });

  it('is off for a message that cannot be replied to yet', async () => {
    await render(
      <GestureHandlerRootView>
        <SwipeToReply id="p1" enabled={false} onReply={jest.fn()}>
          <Text>pendente</Text>
        </SwipeToReply>
      </GestureHandlerRootView>,
    );
    const { config } = getByGestureTestId('reply-swipe-p1') as unknown as { config: Record<string, unknown> };
    expect(config.enabled).toBe(false);
  });

  it('fades the reply arrow in as the bubble follows the finger', async () => {
    await renderSwipe();
    const readStyle = getAnimatedStyle as unknown as (element: unknown) => { opacity?: number };
    const icon = () => readStyle(screen.getByTestId('reply-swipe-icon', { includeHiddenElements: true }));
    expect(icon().opacity).toBe(0);

    const pan = createGestureController<{ translationX: number }>('reply-swipe-m1');
    await act(async () => {
      pan.begin({ translationX: 0 });
      pan.activate({ translationX: 12 });
      pan.update({ translationX: 28 });
    });
    expect(icon().opacity).toBeCloseTo(0.5);

    await act(async () => pan.update({ translationX: 120 }));
    expect(icon().opacity).toBe(1);
  });
});
