import { fireEvent, render, screen } from '@testing-library/react-native';

import { Divider } from '../Divider';
import { PressableScale } from '../PressableScale';
import { Skeleton } from '../Skeleton';
import { Text } from '../Text';

describe('PressableScale', () => {
  it('forwards press events and props', async () => {
    const onPress = jest.fn();
    await render(
      <PressableScale accessibilityRole="button" accessibilityLabel="Abrir" onPress={onPress}>
        <Text>Abrir</Text>
      </PressableScale>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Abrir' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('calls the caller press-in and press-out handlers', async () => {
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    await render(
      <PressableScale accessibilityRole="button" accessibilityLabel="Abrir" onPressIn={onPressIn} onPressOut={onPressOut}>
        <Text>Abrir</Text>
      </PressableScale>,
    );
    const button = screen.getByRole('button', { name: 'Abrir' });
    await fireEvent(button, 'pressIn');
    await fireEvent(button, 'pressOut');
    expect(onPressIn).toHaveBeenCalledTimes(1);
    expect(onPressOut).toHaveBeenCalledTimes(1);
  });

  it('does not press when disabled', async () => {
    const onPress = jest.fn();
    await render(
      <PressableScale disabled accessibilityRole="button" accessibilityLabel="Abrir" onPress={onPress}>
        <Text>Abrir</Text>
      </PressableScale>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Abrir' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Divider', () => {
  it('draws a hairline in the low border color with an optional inset', async () => {
    await render(<Divider testID="divider" inset={16} />);
    expect(screen.getByTestId('divider', { includeHiddenElements: true })).toHaveStyle({
      borderTopColor: '#2a2d3c',
      marginHorizontal: 16,
    });
  });
});

describe('Skeleton', () => {
  const get = (id: string) => screen.getByTestId(id, { includeHiddenElements: true });

  it('keeps the plain block API', async () => {
    await render(<Skeleton testID="block" width={100} height={20} radius={4} />);
    expect(get('block')).toHaveStyle({ width: 100, height: 20, borderRadius: 4, backgroundColor: '#22262f' });
  });

  it('sizes a text line from its line height', async () => {
    // md = 15px, snug 1.3 => 20px line height => 14px bar
    await render(<Skeleton.Text testID="text" />);
    expect(get('text')).toHaveStyle({ height: 14, borderRadius: 12 });
  });

  it('draws a circle and a golden-ratio pill', async () => {
    await render(
      <>
        <Skeleton.Circle testID="circle" size={40} />
        <Skeleton.Pill testID="pill" size={20} />
        <Skeleton.Block testID="aliased" height={8} />
      </>,
    );
    expect(get('circle')).toHaveStyle({ width: 40, height: 40, borderRadius: 20 });
    expect(get('pill')).toHaveStyle({ width: 32.36, height: 20, borderRadius: 10 });
    expect(get('aliased')).toHaveStyle({ width: '100%', height: 8 });
  });
});
