import { fireEvent, render, screen } from '@testing-library/react-native';
import type { BottomTabBarProps } from 'expo-router/tabs';

import { useSession } from '@/features/auth';
import { haptic } from '@/lib/haptics';
import { colors, hairline, primary } from '@/theme/tokens';

import { BottomBar } from '../BottomBar';
import { CountBadge, NewDot } from '../CountBadge';

jest.mock('@/lib/haptics', () => ({ haptic: jest.fn() }));

jest.mock('@/features/auth', () => {
  const { create } = jest.requireActual('zustand');
  return { useSession: create(() => ({ user: null })) };
});

const routes = [
  { key: 'index-1', name: 'index' },
  { key: 'library-1', name: 'library' },
  { key: 'explore-1', name: 'explore' },
  { key: 'messages-1', name: 'messages' },
  { key: 'profile-1', name: 'profile' },
];
const titles: Record<string, string> = {
  index: 'Início',
  library: 'Biblioteca',
  explore: 'Explorar',
  messages: 'Mensagens',
  profile: 'Perfil',
};

type Options = Record<string, Record<string, unknown>>;
type SetupOptions = { index?: number; options?: Options; defaultPrevented?: boolean; bottom?: number };

function setup({ index = 0, options = {}, defaultPrevented = false, bottom = 0 }: SetupOptions = {}) {
  const emit = jest.fn(() => ({ defaultPrevented }));
  const navigateToTab = jest.fn();
  const descriptors = Object.fromEntries(
    routes.map((route) => [route.key, { options: { title: titles[route.name], ...options[route.name] } }]),
  );
  const props = {
    state: { index, routes },
    descriptors,
    emitter: { emit },
    navigateToTab,
    insets: { top: 0, left: 0, right: 0, bottom },
  } as unknown as BottomTabBarProps;
  return { emit, navigateToTab, element: <BottomBar {...props} /> };
}

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ user: null } as never);
});

describe('BottomBar', () => {
  it('renders the five tabs in order with the selected one marked', async () => {
    await render(setup({ index: 2 }).element);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.props.accessibilityLabel)).toEqual([
      'Início',
      'Biblioteca',
      'Explorar',
      'Mensagens',
      'Perfil',
    ]);
    expect(screen.getByRole('tab', { name: 'Explorar', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Início', selected: false })).toBeOnTheScreen();
    expect(screen.queryByText('Início')).toBeNull();
  });

  it('draws the bar on the background with a hairline and the safe bottom padding', async () => {
    await render(setup({ bottom: 34 }).element);
    expect(screen.getByTestId('bottom-bar')).toHaveStyle({
      flexDirection: 'row',
      paddingHorizontal: 8,
      paddingBottom: 34,
      backgroundColor: colors.bg,
      borderTopWidth: hairline,
      borderTopColor: colors.borderLow,
    });
  });

  it('clamps the bottom padding between 15 and 60', async () => {
    await render(setup({ bottom: 0 }).element);
    expect(screen.getByTestId('bottom-bar')).toHaveStyle({ paddingBottom: 15 });
    await screen.unmount();
    await render(setup({ bottom: 90 }).element);
    expect(screen.getByTestId('bottom-bar')).toHaveStyle({ paddingBottom: 60 });
  });

  it('gives each tab a real 48dp box', async () => {
    await render(setup().element);
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveStyle({ flex: 1, minHeight: 48, paddingTop: 13, paddingBottom: 4 });
    }
  });

  it('emits tabPress and navigates when it is not prevented', async () => {
    const { emit, navigateToTab, element } = setup();
    await render(element);
    await fireEvent.press(screen.getByRole('tab', { name: 'Biblioteca' }));
    expect(emit).toHaveBeenCalledWith({ type: 'tabPress', target: 'library-1', canPreventDefault: true });
    expect(navigateToTab).toHaveBeenCalledWith('library-1');
    expect(haptic).toHaveBeenCalledWith('tap');
  });

  it('skips the navigation when a listener prevents the press', async () => {
    const { emit, navigateToTab, element } = setup({ defaultPrevented: true });
    await render(element);
    await fireEvent.press(screen.getByRole('tab', { name: 'Biblioteca' }));
    expect(emit).toHaveBeenCalledTimes(1);
    expect(navigateToTab).not.toHaveBeenCalled();
  });

  it('emits tabPress for the focused tab (scroll to top) without navigating', async () => {
    const { emit, navigateToTab, element } = setup({ index: 0 });
    await render(element);
    await fireEvent.press(screen.getByRole('tab', { name: 'Início' }));
    expect(emit).toHaveBeenCalledWith({ type: 'tabPress', target: 'index-1', canPreventDefault: true });
    expect(navigateToTab).not.toHaveBeenCalled();
  });

  it('emits tabLongPress on a long press', async () => {
    const { emit, element } = setup();
    await render(element);
    await fireEvent(screen.getByRole('tab', { name: 'Explorar' }), 'longPress');
    expect(emit).toHaveBeenCalledWith({ type: 'tabLongPress', target: 'explore-1' });
  });

  it('uses the route accessibility label and shows the badge count', async () => {
    const { element } = setup({
      options: { messages: { tabBarAccessibilityLabel: 'Mensagens, 3 não lidas', tabBarBadge: 3 } },
    });
    await render(element);
    expect(screen.getByRole('tab', { name: 'Mensagens, 3 não lidas' })).toBeOnTheScreen();
    expect(screen.getByText('3')).toBeOnTheScreen();
    expect(screen.getAllByTestId('count-badge')).toHaveLength(1);
  });

  it('shows no badge without a count', async () => {
    await render(setup().element);
    expect(screen.queryByTestId('count-badge')).toBeNull();
  });

  it('shows the signed-in user avatar on the Perfil tab, ringed when active', async () => {
    useSession.setState({ user: { name: 'Ana Souza', username: 'ana', avatarUrl: 'https://x/a.png' } } as never);
    await render(setup({ index: 4 }).element);
    expect(screen.getByRole('tab', { name: 'Perfil', selected: true })).toBeOnTheScreen();
    expect(screen.getByLabelText('Ana Souza')).toHaveStyle({ width: 25, height: 25 });
    expect(screen.getByTestId('profile-avatar-ring')).toHaveStyle({ borderColor: colors.text, borderWidth: 1 });
  });

  it('has a transparent ring when Perfil is not active and falls back to the initial', async () => {
    useSession.setState({ user: { name: 'Ana Souza', username: 'ana', avatarUrl: null } } as never);
    await render(setup({ index: 0 }).element);
    expect(screen.getByTestId('profile-avatar-ring')).toHaveStyle({ borderColor: 'transparent' });
    expect(screen.getByText('A')).toBeOnTheScreen();
  });
});

describe('CountBadge', () => {
  it('renders nothing for 0', async () => {
    await render(<CountBadge count={0} />);
    expect(screen.queryByTestId('count-badge')).toBeNull();
  });

  it('shows the count on a pill', async () => {
    await render(<CountBadge count={3} />);
    expect(screen.getByText('3')).toBeOnTheScreen();
    expect(screen.getByTestId('count-badge')).toHaveStyle({
      position: 'absolute',
      left: '52%',
      top: 8,
      paddingHorizontal: 5,
      backgroundColor: primary[500],
    });
  });

  it('caps at 99+', async () => {
    await render(<CountBadge count={150} />);
    expect(screen.getByText('99+')).toBeOnTheScreen();
    await screen.unmount();
    await render(<CountBadge count={99} />);
    expect(screen.getByText('99')).toBeOnTheScreen();
  });

  it('honours a custom max', async () => {
    await render(<CountBadge count={10} max={9} />);
    expect(screen.getByText('9+')).toBeOnTheScreen();
  });
});

describe('NewDot', () => {
  it('is an 8x8 brand dot', async () => {
    await render(<NewDot />);
    expect(screen.getByTestId('new-dot')).toHaveStyle({ width: 8, height: 8, backgroundColor: primary[500] });
  });
});
