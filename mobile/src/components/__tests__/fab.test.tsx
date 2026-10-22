import { fireEvent, render, screen } from '@testing-library/react-native';

import { haptic } from '@/lib/haptics';
import { primary } from '@/theme/tokens';

import { Fab } from '../Fab';

jest.mock('@/lib/haptics', () => ({ haptic: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

test('is a labelled 56dp primary circle pinned bottom-right', async () => {
  await render(<Fab accessibilityLabel="Publicar" onPress={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Publicar' })).toHaveStyle({
    position: 'absolute',
    right: 24,
    bottom: 15,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: primary[500],
    elevation: 4,
  });
});

test('presses through and taps haptically on press-in', async () => {
  const onPress = jest.fn();
  await render(<Fab accessibilityLabel="Publicar" onPress={onPress} />);
  const fab = screen.getByRole('button', { name: 'Publicar' });
  await fireEvent(fab, 'pressIn');
  expect(haptic).toHaveBeenCalledWith('tap');
  await fireEvent.press(fab);
  expect(onPress).toHaveBeenCalledTimes(1);
});
