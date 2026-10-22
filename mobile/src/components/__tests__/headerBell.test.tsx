import { fireEvent, render, screen } from '@testing-library/react-native';

import { useUnreadCount } from '@/features/notifications/queries';
import { colors } from '@/theme/tokens';

import { HeaderBell } from '../HeaderBell';

const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ navigate: mockNavigate }) }));
jest.mock('@/features/notifications/queries', () => ({ useUnreadCount: jest.fn() }));

function renderBell(unread: number) {
  jest.mocked(useUnreadCount).mockReturnValue(unread);
  return render(<HeaderBell />);
}

beforeEach(() => jest.clearAllMocks());

test('has no badge when nothing is unread', async () => {
  await renderBell(0);
  expect(screen.getByRole('button', { name: 'Notificações' })).toBeOnTheScreen();
  expect(screen.queryByText('0')).toBeNull();
});

test('shows the unread count on the bell', async () => {
  await renderBell(3);
  expect(screen.getByRole('button', { name: 'Notificações, 3 não lidas' })).toBeOnTheScreen();
  expect(screen.getByText('3')).toBeOnTheScreen();
});

test('uses the singular for one unread notification', async () => {
  await renderBell(1);
  expect(screen.getByRole('button', { name: 'Notificações, 1 não lida' })).toBeOnTheScreen();
});

test('caps the badge at 9+', async () => {
  await renderBell(9);
  expect(screen.getByText('9')).toBeOnTheScreen();
  await screen.unmount();
  await renderBell(10);
  expect(screen.getByText('9+')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Notificações, 10 não lidas' })).toBeOnTheScreen();
});

test('the badge is a primary circle', async () => {
  await renderBell(2);
  const badge = screen.getByText('2').parent;
  expect(badge).toHaveStyle({ backgroundColor: colors.primary, minWidth: 16, height: 16 });
  expect(screen.getByText('2')).toHaveStyle({ color: colors.onPrimary, fontFamily: 'Inter_700Bold' });
});

test('still opens notifications', async () => {
  await renderBell(4);
  expect(screen.getByRole('button', { name: 'Notificações, 4 não lidas' })).toHaveStyle({ minWidth: 48, minHeight: 48 });
  await fireEvent.press(screen.getByRole('button', { name: 'Notificações, 4 não lidas' }));
  expect(mockNavigate).toHaveBeenCalledWith('/notifications');
});
