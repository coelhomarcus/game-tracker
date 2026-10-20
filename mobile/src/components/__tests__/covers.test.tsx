import { Ionicons } from '@expo/vector-icons';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { CoverFooter, CoverGrid, GameCover, RatingStars, StatusIcon } from '..';
import { gridColumns } from '../CoverGrid';
import { apiOrigin } from '@/lib/env';
import { colors } from '@/theme/tokens';

function iconCount(name: keyof typeof Ionicons.glyphMap): number {
  return screen.queryAllByText(String.fromCodePoint(Number(Ionicons.glyphMap[name])), {
    includeHiddenElements: true,
  }).length;
}

describe('GameCover', () => {
  it('shows the name when there is no url', async () => {
    await render(<GameCover name="Hades" url={null} width={120} />);
    expect(screen.getByText('Hades')).toBeOnTheScreen();
    expect(screen.getByLabelText('Capa de Hades')).toBeOnTheScreen();
    expect(screen.queryByTestId('game-cover-image')).toBeNull();
  });

  it('falls back to the name after the image fails to load', async () => {
    await render(<GameCover name="Celeste" url="https://cdn.example.com/celeste.jpg" width={120} />);
    expect(screen.queryByText('Celeste')).toBeNull();
    await fireEvent(screen.getByTestId('game-cover-image'), 'error');
    expect(screen.getByText('Celeste')).toBeOnTheScreen();
    expect(screen.queryByTestId('game-cover-image')).toBeNull();
  });

  it('rewrites backend image urls onto the api origin', async () => {
    await render(
      <GameCover name="Hades" url="http://localhost:3000/api/images/abc.jpg" width={120} />,
    );
    expect(screen.getByTestId('game-cover-image').props.source).toEqual({
      uri: `${apiOrigin}/api/images/abc.jpg`,
    });
  });

  it('keeps external image urls unchanged', async () => {
    await render(<GameCover name="Hades" url="https://cdn.example.com/hades.jpg" width={120} />);
    expect(screen.getByTestId('game-cover-image').props.source).toEqual({
      uri: 'https://cdn.example.com/hades.jpg',
    });
  });

  it('uses an icon instead of the name when narrower than 80', async () => {
    await render(<GameCover name="Hades" url={null} width={60} />);
    expect(screen.queryByText('Hades')).toBeNull();
    expect(iconCount('game-controller-outline')).toBe(1);
    expect(screen.getByLabelText('Capa de Hades')).toBeOnTheScreen();
  });

  it('keeps the 3:4 box with the cover border', async () => {
    await render(<GameCover name="Hades" url={null} width={120} />);
    const style = StyleSheet.flatten(screen.getByLabelText('Capa de Hades').props.style);
    expect(style).toMatchObject({
      width: 120,
      aspectRatio: 3 / 4,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 6,
    });
  });
});

describe('RatingStars', () => {
  it('renders 7/10 as 3 full, 1 half and 1 empty star', async () => {
    await render(<RatingStars rating={7} />);
    expect(iconCount('star')).toBe(3);
    expect(iconCount('star-half')).toBe(1);
    expect(iconCount('star-outline')).toBe(1);
    expect(screen.getByLabelText('Nota 7 de 10')).toBeOnTheScreen();
  });

  it('renders 10/10 as five full stars and 0 as five empty ones', async () => {
    const { unmount } = await render(<RatingStars rating={10} />);
    expect(iconCount('star')).toBe(5);
    expect(iconCount('star-outline')).toBe(0);
    await unmount();
    await render(<RatingStars rating={0} />);
    expect(iconCount('star')).toBe(0);
    expect(iconCount('star-outline')).toBe(5);
  });
});

describe('StatusIcon', () => {
  it('renders the playing icon', async () => {
    await render(<StatusIcon status="playing" />);
    expect(iconCount('play-circle-outline')).toBe(1);
  });

  it('renders the layers icon when there is no status', async () => {
    await render(<StatusIcon status={null} />);
    expect(iconCount('layers-outline')).toBe(1);
  });
});

describe('CoverFooter', () => {
  it('renders text children scaled to fit on one line', async () => {
    await render(<CoverFooter>12 h</CoverFooter>);
    const text = screen.getByText('12 h');
    expect(text.props.numberOfLines).toBe(1);
    expect(text.props.adjustsFontSizeToFit).toBe(true);
  });

  it('renders element children as they are', async () => {
    await render(
      <CoverFooter>
        <RatingStars rating={5} />
      </CoverFooter>,
    );
    expect(screen.getByLabelText('Nota 5 de 10')).toBeOnTheScreen();
  });
});

describe('gridColumns', () => {
  it('gives 4 columns on a 390 px screen with 16 px page padding', () => {
    const { columns, itemWidth } = gridColumns(358);
    expect(columns).toBe(4);
    expect(itemWidth).toBe((358 - 3 * 8) / 4);
  });

  it('honours a larger minItemWidth', () => {
    expect(gridColumns(358, 110).columns).toBe(3);
  });

  it('never goes below 2 columns', () => {
    expect(gridColumns(120).columns).toBe(2);
  });

  it('caps at 8 columns', () => {
    expect(gridColumns(2000).columns).toBe(8);
  });
});

describe('CoverGrid', () => {
  const items = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));

  async function layout(width: number) {
    await fireEvent(screen.getByTestId('cover-grid'), 'layout', {
      nativeEvent: { layout: { width, height: 800 } },
    });
    // FlashList flags itself as loaded from a zero-delay timer; let it settle inside act.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  it('renders nothing until it is measured', async () => {
    const renderItem = jest.fn(() => <Text>item</Text>);
    await render(<CoverGrid data={items} keyExtractor={(i) => i.id} renderItem={renderItem} />);
    expect(renderItem).not.toHaveBeenCalled();
  });

  it('hands 4-column item widths to renderItem in a 358 px container', async () => {
    const widths: number[] = [];
    await render(
      <CoverGrid
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={(item, width) => {
          widths.push(width);
          return <Text>{`item ${item.id}`}</Text>;
        }}
      />,
    );
    await layout(358);
    expect(await screen.findByText('item a')).toBeOnTheScreen();
    expect(new Set(widths)).toEqual(new Set([(358 - 3 * 8) / 4]));
  });

  it('uses minItemWidth for the column count', async () => {
    const widths: number[] = [];
    await render(
      <CoverGrid
        data={items}
        minItemWidth={110}
        keyExtractor={(i) => i.id}
        renderItem={(item, width) => {
          widths.push(width);
          return <Text>{`item ${item.id}`}</Text>;
        }}
      />,
    );
    await layout(358);
    await screen.findByText('item a');
    expect(new Set(widths)).toEqual(new Set([(358 - 2 * 8) / 3]));
  });

  /** Horizontal margin of the closest ancestor of `node` that has one. */
  function slotMargin(node: ReturnType<typeof screen.getByText>): number | undefined {
    for (let current = node.parent; current; current = current.parent) {
      const margin = StyleSheet.flatten(current.props.style)?.marginHorizontal;
      if (margin !== undefined) return margin;
    }
    return undefined;
  }

  it('keeps header and empty slots aligned with the page edges', async () => {
    await render(
      <CoverGrid
        data={[] as { id: string }[]}
        keyExtractor={(i) => i.id}
        renderItem={() => <Text>item</Text>}
        ListHeaderComponent={<Text>Cabecalho</Text>}
        ListEmptyComponent={<Text>Nada aqui</Text>}
      />,
    );
    await layout(358);
    expect(slotMargin(await screen.findByText('Cabecalho'))).toBe(4);
    expect(slotMargin(await screen.findByText('Nada aqui'))).toBe(4);
  });

  it('widens the list by the gap and pads each cell for the gutters', async () => {
    await render(
      <CoverGrid data={items} keyExtractor={(i) => i.id} renderItem={() => <Text>item</Text>} />,
    );
    await layout(358);
    const list = StyleSheet.flatten((await screen.findByTestId('cover-grid-list')).props.style);
    expect(list.marginHorizontal).toBe(-4);
    const cell = StyleSheet.flatten(screen.getAllByTestId('cover-grid-cell')[0].props.style);
    expect(cell.paddingHorizontal).toBe(4);
    expect(cell.paddingBottom).toBe(8);
  });

  it('renders the empty component when there is no data', async () => {
    await render(
      <CoverGrid
        data={[] as { id: string }[]}
        keyExtractor={(i) => i.id}
        renderItem={() => <Text>item</Text>}
        ListEmptyComponent={<Text>Nada aqui</Text>}
      />,
    );
    await layout(358);
    expect(await screen.findByText('Nada aqui')).toBeOnTheScreen();
  });
});
