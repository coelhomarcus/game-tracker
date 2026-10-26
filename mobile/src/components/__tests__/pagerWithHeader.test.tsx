import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { createRef } from 'react';
import { FlatList, Text, View } from 'react-native';
import Animated, { getAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  compactHeaderShown,
  headerTranslate,
  PagerWithHeader,
  syncedOffset,
  type PagerScrollProps,
  type PagerTab,
  type PagerWithHeaderHandle,
} from '../PagerWithHeader';

const metrics = {
  frame: { x: 0, y: 0, width: 360, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

describe('headerTranslate', () => {
  it('moves the header with the list until only the compact header is left', () => {
    expect(headerTranslate(0, 300, 80)).toBe(0);
    expect(headerTranslate(150, 300, 80)).toBe(-150);
    expect(headerTranslate(220, 300, 80)).toBe(-220);
    expect(headerTranslate(900, 300, 80)).toBe(-220);
  });

  it('collapses the whole header without a compact header', () => {
    expect(headerTranslate(900, 300, 0)).toBe(-300);
  });

  it('ignores the overscroll of a pull and a compact header taller than the header', () => {
    expect(headerTranslate(-40, 300, 80)).toBe(0);
    expect(headerTranslate(100, 60, 80)).toBe(0);
  });
});

describe('syncedOffset', () => {
  // Header 300 tall, compact 80: the header is collapsed from 220 on.
  it('keeps a list where it was while the header is collapsed', () => {
    expect(syncedOffset(400, 1000, 300, 80)).toBe(1000);
    expect(syncedOffset(220, 500, 300, 80)).toBe(500);
  });

  it('never leaves a list above the collapsed offset, where its rows would hide under the header', () => {
    expect(syncedOffset(400, 0, 300, 80)).toBe(220);
    expect(syncedOffset(400, 120, 300, 80)).toBe(220);
  });

  it('follows the focused list while the header is partly open', () => {
    expect(syncedOffset(100, 1000, 300, 80)).toBe(100);
    expect(syncedOffset(100, 0, 300, 80)).toBe(100);
    expect(syncedOffset(-30, 500, 300, 80)).toBe(0);
  });
});

describe('compactHeaderShown', () => {
  it('shows the compact header past 100 of scroll', () => {
    expect(compactHeaderShown(0)).toBe(false);
    expect(compactHeaderShown(100)).toBe(false);
    expect(compactHeaderShown(101)).toBe(true);
  });
});

describe('PagerWithHeader', () => {
  type Style = { opacity?: number; transform?: { translateY: number }[]; pointerEvents?: string };
  // The types describe the web stub, which takes no argument; jest runs the native helper.
  const readAnimatedStyle = getAnimatedStyle as unknown as (element: unknown) => Style;
  const translateY = () =>
    readAnimatedStyle(screen.getByTestId('pager-header')).transform?.[0].translateY ?? 0;

  const received: Record<string, PagerScrollProps> = {};
  const renders: Record<string, number> = {};

  function List({ name, scroll }: { name: string; scroll: PagerScrollProps }) {
    received[name] = scroll;
    renders[name] = (renders[name] ?? 0) + 1;
    const { attachList, onScroll, topInset, minContentHeight, initialOffset } = scroll;
    return (
      <Animated.FlatList
        ref={attachList as (list: FlatList<string> | null) => void}
        testID={`list-${name}`}
        data={[`${name} 1`, `${name} 2`]}
        keyExtractor={(item) => item}
        renderItem={({ item }) => <Text>{item}</Text>}
        onScroll={onScroll}
        contentOffset={{ x: 0, y: initialOffset }}
        contentContainerStyle={{ paddingTop: topInset, minHeight: minContentHeight }}
        progressViewOffset={topInset}
      />
    );
  }

  const tabs: PagerTab[] = [
    { key: 'a', label: 'Primeira', render: (scroll) => <List name="a" scroll={scroll} /> },
    { key: 'b', label: 'Segunda', render: (scroll) => <List name="b" scroll={scroll} /> },
  ];

  function layout(testID: string, height: number, width = 360) {
    return fireEvent(screen.getByTestId(testID), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width, height } },
    });
  }

  async function scroll(name: string, y: number) {
    // The page off screen is hidden from the screen reader, not from the finger.
    await fireEvent.scroll(screen.getByTestId(`list-${name}`, { includeHiddenElements: true }), {
      nativeEvent: { contentOffset: { x: 0, y } },
    });
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
  }

  async function renderPager(
    options: {
      compact?: boolean;
      statusBarHeight?: number;
      ref?: React.Ref<PagerWithHeaderHandle>;
      onCompactHeaderChange?: (shown: boolean) => void;
      measure?: boolean;
    } = {},
  ) {
    const { compact = true, statusBarHeight = 0, ref, onCompactHeaderChange, measure = true } = options;
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <PagerWithHeader
          ref={ref}
          header={
            <View>
              <Text>Cabeçalho</Text>
            </View>
          }
          tabs={tabs}
          initialTab="a"
          compactHeader={compact ? <Text>Compacto</Text> : undefined}
          statusBarHeight={statusBarHeight}
          onCompactHeaderChange={onCompactHeaderChange}
        />
      </SafeAreaProvider>,
    );
    if (!measure) return;
    await layout('pager-header-content', 300);
    await layout('pager-tab-bar', 48);
    if (compact) {
      await fireEvent(screen.getByTestId('pager-compact-header', { includeHiddenElements: true }), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 80 } },
      });
    }
    await fireEvent(screen.getByTestId('pager-root'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 700 } },
    });
  }

  let scrollToOffset: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset');
  });

  afterEach(() => {
    jest.useRealTimers();
    scrollToOffset.mockRestore();
    for (const key of Object.keys(received)) delete received[key];
    for (const key of Object.keys(renders)) delete renders[key];
  });

  it('pads every list by the header and the tab bar and keeps it tall enough to collapse', async () => {
    await renderPager();

    expect(received.a).toMatchObject({ topInset: 348, minContentHeight: 700 + 220, isFocused: true });
    expect(screen.getByTestId('list-a').props.progressViewOffset).toBe(348);
  });

  it('mounts a page only once it is selected', async () => {
    await renderPager();

    expect(screen.queryByTestId('list-b')).toBeNull();
    await fireEvent.press(screen.getByRole('tab', { name: 'Segunda' }));
    expect(screen.getByTestId('list-b')).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Segunda', selected: true })).toBeOnTheScreen();
  });

  it('moves the header with the list and stops with the tab bar under the compact header', async () => {
    await renderPager();

    await scroll('a', 150);
    expect(translateY()).toBeCloseTo(-150);
    await scroll('a', 600);
    expect(translateY()).toBeCloseTo(-220);
    await scroll('a', 0);
    expect(translateY()).toBeCloseTo(0);
  });

  it('collapses the whole header when there is no compact header', async () => {
    await renderPager({ compact: false });

    await scroll('a', 600);
    expect(translateY()).toBeCloseTo(-300);
    expect(screen.queryByTestId('pager-compact-header')).toBeNull();
  });

  it('starts a new page at the collapsed offset when the header is collapsed', async () => {
    await renderPager();
    await scroll('a', 600);

    await fireEvent.press(screen.getByRole('tab', { name: 'Segunda' }));

    expect(received.b?.initialOffset).toBe(220);
    expect(screen.getByTestId('list-b').props.contentOffset).toEqual({ x: 0, y: 220 });
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    expect(translateY()).toBeCloseTo(-220);
  });

  it('keeps each list where it was while the header stays collapsed', async () => {
    await renderPager();
    await scroll('a', 600);
    await fireEvent.press(screen.getByRole('tab', { name: 'Segunda' }));
    await scroll('b', 900);
    scrollToOffset.mockClear();

    await fireEvent.press(screen.getByRole('tab', { name: 'Primeira' }));

    // Both lists are past the collapsed offset: neither is moved.
    expect(scrollToOffset).not.toHaveBeenCalled();
    await scroll('a', 610);
    expect(translateY()).toBeCloseTo(-220);
  });

  it('brings the other lists to the header when it is partly open', async () => {
    await renderPager();
    await scroll('a', 600);
    await fireEvent.press(screen.getByRole('tab', { name: 'Segunda' }));
    await scroll('b', 900);
    await fireEvent.press(screen.getByRole('tab', { name: 'Primeira' }));
    await scroll('a', 50);
    scrollToOffset.mockClear();

    await fireEvent.press(screen.getByRole('tab', { name: 'Segunda' }));

    expect(scrollToOffset).toHaveBeenCalledTimes(1);
    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 50, animated: false });
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    expect(translateY()).toBeCloseTo(-50);
  });

  it('follows the focused list only', async () => {
    await renderPager();
    await fireEvent.press(screen.getByRole('tab', { name: 'Segunda' }));

    await scroll('a', 600);
    expect(translateY()).toBeCloseTo(0);
    await scroll('b', 120);
    expect(translateY()).toBeCloseTo(-120);
  });

  it('fades the compact header in past 100 and out again near the top', async () => {
    await renderPager();
    const compact = () => screen.getByTestId('pager-compact-header', { includeHiddenElements: true });

    expect(readAnimatedStyle(compact()).opacity).toBe(0);
    expect(compact().props.pointerEvents).toBe('none');
    expect(screen.queryByText('Compacto')).toBeNull();

    await scroll('a', 150);
    expect(readAnimatedStyle(compact()).opacity).toBeCloseTo(1);
    expect(compact().props.pointerEvents).toBe('auto');
    expect(screen.getByText('Compacto')).toBeOnTheScreen();

    await scroll('a', 40);
    expect(readAnimatedStyle(compact()).opacity).toBeCloseTo(0);
    expect(screen.queryByText('Compacto')).toBeNull();
  });

  it('turns the status bar strip solid once the content scrolls under it', async () => {
    await renderPager({ statusBarHeight: 24 });
    const strip = () => screen.getByTestId('pager-status-bar', { includeHiddenElements: true });

    expect(readAnimatedStyle(strip()).opacity).toBe(0);
    await scroll('a', 12);
    expect(readAnimatedStyle(strip()).opacity).toBeCloseTo(0.5);
    await scroll('a', 300);
    expect(readAnimatedStyle(strip()).opacity).toBeCloseTo(1);
  });

  it('scrolls the focused list to the top when its tab is pressed again', async () => {
    await renderPager();
    await scroll('a', 600);
    scrollToOffset.mockClear();

    await fireEvent.press(screen.getByRole('tab', { name: 'Primeira' }));

    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: true });
  });

  it('scrolls the focused list through its handle', async () => {
    const ref = createRef<PagerWithHeaderHandle>();
    await renderPager({ ref });
    await fireEvent.press(screen.getByRole('tab', { name: 'Segunda' }));
    scrollToOffset.mockClear();

    await act(async () => {
      ref.current?.scrollToOffset({ offset: 0, animated: true });
    });

    expect(scrollToOffset).toHaveBeenCalledTimes(1);
    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: true });
  });

  it('hides the pages that are off screen from the screen reader', async () => {
    await renderPager();
    await fireEvent.press(screen.getByRole('tab', { name: 'Segunda' }));

    expect(screen.getByText('b 1')).toBeOnTheScreen();
    expect(screen.queryByText('a 1')).toBeNull();
    expect(screen.getByText('a 1', { includeHiddenElements: true })).toBeTruthy();
  });

  it('keeps the pages invisible until the header is measured', async () => {
    await renderPager({ measure: false });
    expect(screen.getByTestId('pager')).toHaveStyle({ opacity: 0 });

    await layout('pager-header-content', 300);
    expect(screen.getByTestId('pager')).not.toHaveStyle({ opacity: 0 });
  });

  it('switches pages with a swipe: the neighbour mounts in place and takes the header', async () => {
    await renderPager();
    await scroll('a', 600);

    // The drag mounts the neighbour at the collapsed offset before it comes into view.
    await fireEvent(screen.getByTestId('pager'), 'scrollBeginDrag', {
      nativeEvent: { contentOffset: { x: 0, y: 0 } },
    });
    expect(received.b?.initialOffset).toBe(220);
    expect(received.b?.isFocused).toBe(false);

    await fireEvent(screen.getByTestId('pager'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 360, y: 0 } },
    });

    expect(screen.getByRole('tab', { name: 'Segunda', selected: true })).toBeOnTheScreen();
    expect(received.b?.isFocused).toBe(true);
    await scroll('b', 120);
    expect(translateY()).toBeCloseTo(-120);
    await scroll('a', 900);
    expect(translateY()).toBeCloseTo(-120);
  });

  it('syncs the neighbour already mounted when a swipe starts with the header partly open', async () => {
    await renderPager();
    await fireEvent.press(screen.getByRole('tab', { name: 'Segunda' }));
    await scroll('b', 900);
    await fireEvent.press(screen.getByRole('tab', { name: 'Primeira' }));
    await scroll('a', 40);
    scrollToOffset.mockClear();

    await fireEvent(screen.getByTestId('pager'), 'scrollBeginDrag', {
      nativeEvent: { contentOffset: { x: 0, y: 0 } },
    });

    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 40, animated: false });
  });

  it('tells the screen when the compact header shows and hides', async () => {
    const onCompactHeaderChange = jest.fn();
    await renderPager({ onCompactHeaderChange });
    expect(onCompactHeaderChange).not.toHaveBeenCalled();

    await scroll('a', 150);
    expect(onCompactHeaderChange).toHaveBeenLastCalledWith(true);
    await scroll('a', 20);
    expect(onCompactHeaderChange).toHaveBeenLastCalledWith(false);
    expect(onCompactHeaderChange).toHaveBeenCalledTimes(2);
  });

  it('does not re-render the lists when the compact header shows', async () => {
    await renderPager();
    const before = renders.a;

    await scroll('a', 150);
    await scroll('a', 20);

    expect(renders.a).toBe(before);
  });
});
