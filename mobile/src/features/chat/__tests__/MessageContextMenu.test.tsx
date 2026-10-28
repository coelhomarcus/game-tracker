import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '@/theme/tokens';

import type { BubbleMessage } from '../MessageBubble';
import {
  MessageContextMenu,
  MORE_REACTIONS,
  QUICK_REACTIONS,
  type MessageMenuTarget,
} from '../MessageContextMenu';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const bubble: BubbleMessage = {
  content: 'Bora jogar?',
  createdAt: new Date(2026, 9, 27, 9, 5),
  mine: false,
  senderName: 'Ana',
  status: 'sent',
  reactions: [
    { emoji: '😂', userId: 'u1' },
    { emoji: '🔥', userId: 'me' },
  ],
};

async function renderMenu(target: MessageMenuTarget | null) {
  const props = { onReact: jest.fn(), onAction: jest.fn(), onClose: jest.fn() };
  const view = await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <MessageContextMenu target={target} selfId="me" {...props} />
    </SafeAreaProvider>,
  );
  return { ...props, view };
}

const actionLabels = () =>
  ['Responder', 'Copiar texto', 'Apagar para mim', 'Descartar'].filter((label) =>
    screen.queryByRole('button', { name: label }),
  );

describe('MessageContextMenu', () => {
  it('shows nothing without a message', async () => {
    await renderMenu(null);
    expect(screen.queryByTestId('message-menu')).not.toBeOnTheScreen();
  });

  it('shows the message, the quick reactions and the actions of a confirmed message', async () => {
    await renderMenu({ message: bubble, sent: true });

    expect(screen.getByTestId('message-menu-preview')).toHaveTextContent('Bora jogar?');
    expect(QUICK_REACTIONS).toEqual(['😂', '❤️', '👍', '😮', '😢', '🔥']);
    for (const emoji of QUICK_REACTIONS.filter((item) => item !== '🔥')) {
      expect(screen.getByRole('button', { name: `Reagir com ${emoji}` })).toBeOnTheScreen();
    }
    // Mine is marked, and choosing it takes it back.
    const mine = screen.getByRole('button', { name: 'Remover reação 🔥' });
    expect(mine).toBeSelected();
    expect(screen.getByRole('button', { name: 'Mais reações' })).toBeOnTheScreen();
    expect(actionLabels()).toEqual(['Responder', 'Copiar texto', 'Apagar para mim']);
  });

  it('offers only Copiar texto and Descartar, without reactions, for a pending or failed message', async () => {
    for (const status of ['sending', 'uncertain', 'failed'] as const) {
      const { view } = await renderMenu({ message: { ...bubble, mine: true, status, reactions: [] }, sent: false });
      expect(actionLabels()).toEqual(['Copiar texto', 'Descartar']);
      expect(screen.queryByTestId('message-menu-reactions')).not.toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Mais reações' })).not.toBeOnTheScreen();
      await view.unmount();
    }
  });

  it('reacts with a quick emoji and closes', async () => {
    const { onReact, onClose } = await renderMenu({ message: bubble, sent: true });
    await fireEvent.press(screen.getByRole('button', { name: 'Reagir com ❤️' }));
    expect(onReact).toHaveBeenCalledWith('❤️');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens a grid of more emoji on +', async () => {
    const { onReact, onClose } = await renderMenu({ message: bubble, sent: true });
    await fireEvent.press(screen.getByRole('button', { name: 'Mais reações' }));

    expect(screen.getByTestId('message-menu-emoji-grid')).toBeOnTheScreen();
    expect(MORE_REACTIONS.length).toBe(30);
    expect(new Set([...QUICK_REACTIONS, ...MORE_REACTIONS]).size).toBe(36);
    expect(screen.getByRole('button', { name: 'Reagir com 🎮' })).toBeOnTheScreen();
    // The actions give way to the grid.
    expect(actionLabels()).toEqual([]);

    await fireEvent.press(screen.getByRole('button', { name: 'Reagir com 🎮' }));
    expect(onReact).toHaveBeenCalledWith('🎮');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('runs an action and closes', async () => {
    for (const [label, action] of [
      ['Responder', 'reply'],
      ['Copiar texto', 'copy'],
      ['Apagar para mim', 'hide'],
    ] as const) {
      const { onAction, onClose, view } = await renderMenu({ message: bubble, sent: true });
      await fireEvent.press(screen.getByRole('button', { name: label }));
      expect(onAction).toHaveBeenCalledWith(action);
      expect(onClose).toHaveBeenCalledTimes(1);
      await view.unmount();
    }
    const { onAction } = await renderMenu({ message: { ...bubble, status: 'failed' }, sent: false });
    await fireEvent.press(screen.getByRole('button', { name: 'Descartar' }));
    expect(onAction).toHaveBeenCalledWith('discard');
  });

  it('closes on the backdrop', async () => {
    const { onClose, onAction, onReact } = await renderMenu({ message: bubble, sent: true });
    const backdrop = screen.getByTestId('message-menu-backdrop', { includeHiddenElements: true });
    // The shared backdrop token: `bg` at 60%.
    expect(StyleSheet.flatten(screen.getByTestId('message-menu-scrim', { includeHiddenElements: true }).props.style)).toMatchObject({
      backgroundColor: colors.backdrop,
    });
    expect(colors.backdrop).toBe(`${colors.bg}99`);
    await fireEvent.press(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAction).not.toHaveBeenCalled();
    expect(onReact).not.toHaveBeenCalled();
  });

  it('opens on the quick row again after closing from the grid', async () => {
    const props = { onReact: jest.fn(), onAction: jest.fn(), onClose: jest.fn() };
    const tree = (target: MessageMenuTarget | null) => (
      <SafeAreaProvider initialMetrics={metrics}>
        <MessageContextMenu target={target} selfId="me" {...props} />
      </SafeAreaProvider>
    );
    const view = await render(tree({ message: bubble, sent: true }));
    await fireEvent.press(screen.getByRole('button', { name: 'Mais reações' }));
    // A reaction arriving while open keeps the grid.
    await view.rerender(tree({ message: { ...bubble, reactions: [] }, sent: true }));
    expect(screen.getByTestId('message-menu-emoji-grid')).toBeOnTheScreen();

    await view.rerender(tree(null));
    await view.rerender(tree({ message: bubble, sent: true }));
    expect(screen.getByTestId('message-menu-reactions')).toBeOnTheScreen();
  });
});
