import { fireEvent, render, screen } from '@testing-library/react-native';

import { useUnreadCount } from '@/features/notifications/queries';
import { primary } from '@/theme/tokens';

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
  expect(screen.queryByTestId('count-badge')).toBeNull();
  expect(screen.queryByText('0')).toBeNull();
});

test('shows the unread count on the bell', async () => {
  await renderBell(5);
  expect(screen.getByRole('button', { name: 'Notificações, 5 não lidas' })).toBeOnTheScreen();
  expect(screen.getByText('5')).toBeOnTheScreen();
});

test('uses the singular for one unread notification', async () => {
  await renderBell(1);
  expect(screen.getByRole('button', { name: 'Notificações, 1 não lida' })).toBeOnTheScreen();
});

test('caps the badge at 30+ but labels the real count', async () => {
  await renderBell(30);
  expect(screen.getByText('30')).toBeOnTheScreen();
  await screen.unmount();
  await renderBell(45);
  expect(screen.getByText('30+')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Notificações, 45 não lidas' })).toBeOnTheScreen();
});

test('the badge is a primary pill on the icon corner, not the tab-bar position', async () => {
  await renderBell(2);
  const badge = screen.getByTestId('count-badge');
  expect(badge).toHaveStyle({ backgroundColor: primary[500], position: 'absolute', right: 2, top: 4 });
  expect(badge).not.toHaveStyle({ left: '52%' });
});

test('still opens notifications', async () => {
  await renderBell(4);
  expect(screen.getByRole('button', { name: 'Notificações, 4 não lidas' })).toHaveStyle({ minWidth: 48, minHeight: 48 });
  await fireEvent.press(screen.getByRole('button', { name: 'Notificações, 4 não lidas' }));
  expect(mockNavigate).toHaveBeenCalledWith('/notifications');
});
