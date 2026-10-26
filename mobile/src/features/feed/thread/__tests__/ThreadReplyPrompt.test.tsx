import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { useSession } from '@/features/auth';
import { haptic } from '@/lib/haptics';
import { colors, hairline, radii } from '@/theme/tokens';

import { ThreadReplyPrompt } from '../ThreadReplyPrompt';

jest.mock('@/lib/haptics', () => ({ haptic: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({
    status: 'signedIn',
    user: { id: 'u9', username: 'zed', name: 'Zed Lima', avatarUrl: null } as ReturnType<
      typeof useSession.getState
    >['user'],
  });
});

afterEach(() => {
  useSession.setState({ status: 'signedOut', user: null });
});

describe('ThreadReplyPrompt', () => {
  it('is a pill with the design reference box: full radius, padding 8, gap 8, hairline border', async () => {
    await render(<ThreadReplyPrompt onPress={() => {}} />);

    const pill = screen.getByRole('button', { name: 'Escreva sua resposta' });
    expect(pill).toHaveStyle({
      flexDirection: 'row',
      alignItems: 'center',
      padding: 8,
      gap: 8,
      borderRadius: radii.full,
      borderWidth: hairline,
      borderColor: colors.borderLow,
      backgroundColor: colors.bgContrast25,
    });
  });

  it('keeps a real 48 dp touch box', async () => {
    await render(<ThreadReplyPrompt onPress={() => {}} />);

    const style = StyleSheet.flatten(
      screen.getByRole('button', { name: 'Escreva sua resposta' }).props.style,
    );
    expect(style.minHeight).toBe(48);
  });

  it('shows the own avatar at 24 dp and the prompt in medium text', async () => {
    await render(<ThreadReplyPrompt onPress={() => {}} />);

    // No picture: the avatar falls back to the initial of the user's name.
    expect(screen.getByText('Z').parent).toHaveStyle({ width: 24, height: 24 });
    expect(screen.getByText('Escreva sua resposta')).toHaveStyle({ color: colors.textMedium });
  });

  it('fades the page into the background above it, growing stronger toward the pill', async () => {
    await render(<ThreadReplyPrompt onPress={() => {}} />);

    const bands = screen.getAllByTestId('reply-prompt-fade');
    const opacities = bands.map((band) => StyleSheet.flatten(band.props.style).opacity as number);
    expect(opacities).toHaveLength(4);
    expect([...opacities].sort((a, b) => a - b)).toEqual(opacities);
    expect(opacities[0]).toBeGreaterThan(0);
    expect(opacities[opacities.length - 1]).toBeLessThan(1);
    for (const band of bands) {
      expect(band).toHaveStyle({ backgroundColor: colors.bg });
    }
  });

  it('presses with a tap haptic', async () => {
    const onPress = jest.fn();
    await render(<ThreadReplyPrompt onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Escreva sua resposta' }));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledWith('tap');
  });
});
