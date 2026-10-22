import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { getAnimatedStyle } from 'react-native-reanimated';

import { colors } from '@/theme/tokens';

import { indicatorFrame, TabBar } from '../TabBar';

const ITEMS = [
  { value: 'a', label: 'Para você' },
  { value: 'b', label: 'Seguindo' },
] as const;

type Value = (typeof ITEMS)[number]['value'];

async function renderBar(selected: Value = 'a') {
  const onSelect = jest.fn();
  const onReselect = jest.fn();
  await render(
    <TabBar items={[...ITEMS]} selected={selected} onSelect={onSelect} onReselect={onReselect} />,
  );
  return { onSelect, onReselect };
}

describe('TabBar', () => {
  it('is a tab list with the selected tab marked', async () => {
    await renderBar('b');

    // The row is a container for the screen reader, not a focusable element of its own.
    expect(screen.getByTestId('tab-bar')).toHaveProp('accessibilityRole', 'tablist');
    expect(screen.getByRole('tab', { name: 'Para você', selected: false })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Seguindo', selected: true })).toBeOnTheScreen();
  });

  it('selects another tab', async () => {
    const { onSelect, onReselect } = await renderBar('a');

    await fireEvent.press(screen.getByRole('tab', { name: 'Seguindo' }));

    expect(onSelect).toHaveBeenCalledWith('b');
    expect(onReselect).not.toHaveBeenCalled();
  });

  it('reports a tap on the tab that is already selected', async () => {
    const { onSelect, onReselect } = await renderBar('a');

    await fireEvent.press(screen.getByRole('tab', { name: 'Para você' }));

    expect(onReselect).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('dims the tabs that are not selected', async () => {
    await renderBar('a');

    expect(screen.getByTestId('tab-label-a')).toHaveStyle({ opacity: 1 });
    expect(screen.getByTestId('tab-label-b')).toHaveStyle({ opacity: 0.7 });
  });

  it('labels the tabs at 15 semibold on a 20 line', async () => {
    await renderBar('a');

    expect(screen.getByText('Seguindo')).toHaveStyle({
      fontSize: 15,
      fontFamily: 'Inter_600SemiBold',
      lineHeight: 20,
    });
  });

  it('gives every tab a real 48 dp target', async () => {
    await renderBar('a');

    const tab = screen.getByRole('tab', { name: 'Seguindo' });
    expect(tab).toHaveStyle({ minHeight: 48, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 10 });
    expect(tab.props.hitSlop).toBeUndefined();
  });

  it('draws one primary underline', async () => {
    await renderBar('a');

    expect(screen.getAllByTestId('tab-bar-indicator')).toHaveLength(1);
    expect(screen.getByTestId('tab-bar-indicator')).toHaveStyle({
      height: 2,
      backgroundColor: colors.primary,
    });
  });
});

describe('TabBar underline', () => {
  function layout(x: number, width: number) {
    return { nativeEvent: { layout: { x, y: 0, width, height: 48 } } };
  }

  async function measure() {
    await fireEvent(screen.getByRole('tab', { name: 'Para você' }), 'layout', layout(0, 160));
    await fireEvent(screen.getByRole('tab', { name: 'Seguindo' }), 'layout', layout(160, 160));
    await fireEvent(screen.getByText('Para você'), 'layout', layout(0, 70));
    await fireEvent(screen.getByText('Seguindo'), 'layout', layout(0, 66));
  }

  type IndicatorStyle = { opacity?: number; width?: number; transform?: { translateX: number }[] };
  /**
   * The underline's animated style (the host props keep the first frame in jest). The types
   * describe the web stub, which takes no argument; jest runs the native helper.
   */
  const readAnimatedStyle = getAnimatedStyle as unknown as (element: unknown) => IndicatorStyle;
  function indicator() {
    return readAnimatedStyle(screen.getByTestId('tab-bar-indicator'));
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sits under the selected label once the tabs are measured', async () => {
    await renderBar('a');
    expect(indicator()).toMatchObject({ opacity: 0 });

    await measure();

    expect(indicator()).toMatchObject({ opacity: 1, width: 70, transform: [{ translateX: 45 }] });
  });

  it('slides to the newly selected tab', async () => {
    jest.useFakeTimers();
    const props = { items: [...ITEMS], onSelect: jest.fn() };
    await render(<TabBar {...props} selected="a" />);
    await measure();

    await screen.rerender(<TabBar {...props} selected="b" />);
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    const halfway = indicator().transform?.[0].translateX;
    expect(halfway).toBeGreaterThan(45);
    expect(halfway).toBeLessThan(207);

    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(indicator()).toMatchObject({ width: 66, transform: [{ translateX: 207 }] });
  });
});

describe('indicatorFrame', () => {
  it('is as wide as the label, centred under the tab', () => {
    expect(indicatorFrame({ x: 100, width: 120 }, 80)).toEqual({ x: 120, width: 80 });
  });

  it('is at least 45 wide under a short label', () => {
    expect(indicatorFrame({ x: 0, width: 60 }, 20)).toEqual({ x: 7.5, width: 45 });
  });

  it('stays inside the tab', () => {
    expect(indicatorFrame({ x: 0, width: 100 }, 120)).toEqual({ x: 6, width: 88 });
  });
});
