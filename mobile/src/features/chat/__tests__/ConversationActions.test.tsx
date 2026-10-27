import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import {
  createGestureController,
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';

import { haptic } from '@/lib/haptics';

import {
  crossedFurther,
  LEAVE_DISTANCE,
  MARK_READ_DISTANCE,
  SwipeableConversation,
  swipeActionAt,
  swipePreviewAt,
} from '../ConversationActions';
import type { Conversation } from '../types';

jest.mock('@/lib/haptics', () => ({ haptic: jest.fn() }));

const unread: Conversation = { id: 'c1', otherUser: null, lastMessage: null, unread: true, muted: false };
const read: Conversation = { ...unread, unread: false };

beforeEach(() => {
  jest.mocked(haptic).mockReset();
});

describe('swipe thresholds', () => {
  it('marks read from 120 and leaves from 225; nothing below', () => {
    expect(MARK_READ_DISTANCE).toBe(120);
    expect(LEAVE_DISTANCE).toBe(225);
    expect(swipeActionAt(0, true)).toBe('none');
    expect(swipeActionAt(-119, true)).toBe('none');
    expect(swipeActionAt(-120, true)).toBe('read');
    expect(swipeActionAt(-224, true)).toBe('read');
    expect(swipeActionAt(-225, true)).toBe('leave');
    expect(swipeActionAt(-400, true)).toBe('leave');
  });

  it('only leaves a conversation with nothing to mark read', () => {
    expect(swipeActionAt(-130, false)).toBe('none');
    expect(swipeActionAt(-225, false)).toBe('leave');
  });

  it('previews the next action the drag can reach', () => {
    expect(swipePreviewAt(0, true)).toBe('none');
    expect(swipePreviewAt(20, true)).toBe('none');
    expect(swipePreviewAt(-10, true)).toBe('read');
    expect(swipePreviewAt(-225, true)).toBe('leave');
    expect(swipePreviewAt(-10, false)).toBe('leave');
  });

  it('counts a crossing only towards a further action', () => {
    expect(crossedFurther('none', 'read')).toBe(true);
    expect(crossedFurther('read', 'leave')).toBe(true);
    expect(crossedFurther('none', 'leave')).toBe(true);
    expect(crossedFurther('leave', 'read')).toBe(false);
    expect(crossedFurther('read', 'none')).toBe(false);
    expect(crossedFurther('read', 'read')).toBe(false);
  });
});

describe('SwipeableConversation', () => {
  async function renderRow(conversation: Conversation) {
    const onAction = jest.fn();
    await render(
      <GestureHandlerRootView>
        <SwipeableConversation conversation={conversation} onAction={onAction}>
          <Text>row</Text>
        </SwipeableConversation>
      </GestureHandlerRootView>,
    );
    return onAction;
  }

  /** Drags the row through `path` (translationX values) and releases at the last one. */
  async function drag(path: number[], end: 'end' | 'cancel' = 'end') {
    const last = path[path.length - 1];
    await act(async () => {
      fireGestureHandler(getByGestureTestId('conversation-swipe-c1'), [
        { state: State.BEGAN, translationX: 0 },
        { state: State.ACTIVE, translationX: path[0] },
        ...path.slice(1).map((translationX) => ({ translationX })),
        { state: end === 'end' ? State.END : State.CANCELLED, translationX: last },
      ]);
    });
  }

  it('marks read on release past 120, with one haptic', async () => {
    const onAction = await renderRow(unread);
    await drag([-20, -100, -125, -140, -150]);

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith('read');
    expect(haptic).toHaveBeenCalledTimes(1);
  });

  it('leaves on release past 225, with one haptic per threshold', async () => {
    const onAction = await renderRow(unread);
    await drag([-20, -130, -160, -230, -260]);

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith('leave');
    expect(haptic).toHaveBeenCalledTimes(2);
  });

  it('does what the release point says after going back', async () => {
    const onAction = await renderRow(unread);
    await drag([-20, -240, -180]);

    expect(onAction).toHaveBeenCalledWith('read');
    // Going back under 225 plays nothing; the one haptic is from reaching it.
    expect(haptic).toHaveBeenCalledTimes(1);
  });

  it('does nothing on release below 120', async () => {
    const onAction = await renderRow(unread);
    await drag([-20, -80, -119]);

    expect(onAction).not.toHaveBeenCalled();
    expect(haptic).not.toHaveBeenCalled();
  });

  it('does nothing when the gesture is cancelled (the system took the touch)', async () => {
    const onAction = await renderRow(unread);
    await drag([-20, -240], 'cancel');

    expect(onAction).not.toHaveBeenCalled();
  });

  it('has no mark-read stop on a read conversation', async () => {
    const onAction = await renderRow(read);
    await drag([-20, -150]);
    expect(onAction).not.toHaveBeenCalled();
    expect(haptic).not.toHaveBeenCalled();

    await drag([-20, -150, -230]);
    expect(onAction).toHaveBeenCalledWith('leave');
    expect(haptic).toHaveBeenCalledTimes(1);
  });

  it('shows the icon of the action the drag reaches', async () => {
    await renderRow(unread);
    const pan = createGestureController<{ translationX: number }>('conversation-swipe-c1');
    await act(async () => {
      pan.begin({ translationX: 0 });
      pan.activate({ translationX: -15 });
      pan.update({ translationX: -40 });
    });
    expect(screen.getByTestId('swipe-read-icon', { includeHiddenElements: true })).toBeOnTheScreen();

    await act(async () => pan.update({ translationX: -230 }));
    expect(screen.getByTestId('swipe-leave-icon', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.queryByTestId('swipe-read-icon', { includeHiddenElements: true })).not.toBeOnTheScreen();
  });
});
