import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Game } from '@/features/games/types';
import { socialDefaults } from '@/test-utils/postDefaults';

import { ImageGrid, singleImageAspect } from '../embeds/ImageGrid';
import { QuotedPost } from '../embeds/QuotedPost';
import { MAX_POST_LINES, PostFeedItem, PostFeedItemSkeleton } from '../PostFeedItem';
import type { Post, PostImage, QuotedPost as QuotedPostData } from '../types';

jest.mock('../queries', () =>
  jest.requireActual<typeof import('@/test-utils/postControlHooks')>(
    '@/test-utils/postControlHooks',
  ).postControlHooks(),
);

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const HIDDEN = { includeHiddenElements: true };
const NOW = new Date('2026-10-20T12:00:00.000Z');
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 24, left: 0, right: 0, bottom: 0 },
};

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout'] });
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

const hades: Game = {
  id: 'g1',
  igdbId: 11,
  name: 'Hades',
  coverUrl: null,
  summary: null,
  screenshots: [],
  platforms: [],
  genres: [],
  isFavoritedByMe: false,
};

const ana = { id: 'u1', username: 'ana', name: 'Ana Souza', avatarUrl: null };
const bia = { id: 'u2', username: 'bia', name: 'Bia', avatarUrl: null };

function post(overrides: Partial<Post> = {}): Post {
  return {
    id: 'p1',
    author: ana,
    content: 'Zerei de primeira!',
    type: 'status',
    activityStatus: null,
    createdAt: new Date(NOW.getTime() - 5 * 60 * 1000),
    game: hades,
    entry: null,
    imageUrl: null,
    likeCount: 3,
    commentCount: 2,
    likedByMe: false,
    ...socialDefaults,
    ...overrides,
  };
}

function image(n: number, size: Partial<PostImage> = {}): PostImage {
  return { url: `https://cdn.test/${n}.png`, width: null, height: null, alt: null, ...size };
}

function images(count: number): PostImage[] {
  return Array.from({ length: count }, (_, n) => image(n + 1));
}

function quoted(overrides: Partial<QuotedPostData> = {}): QuotedPostData {
  return {
    id: 'q1',
    author: bia,
    content: 'O chefe final é impossível',
    type: 'status',
    activityStatus: null,
    images: [],
    game: null,
    createdAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000),
    ...overrides,
  };
}

function withSafeArea(element: ReactElement) {
  return <SafeAreaProvider initialMetrics={metrics}>{element}</SafeAreaProvider>;
}

type Node = ReturnType<typeof screen.getByTestId>;

/** The given elements sorted as they appear in the rendered tree. */
function inDocumentOrder(targets: Node[]): Node[] {
  const found: Node[] = [];
  const visit = (node: Node) => {
    if (targets.includes(node)) found.push(node);
    for (const child of node.children) if (typeof child !== 'string') visit(child as Node);
  };
  visit(screen.root as Node);
  return found;
}

function lines(count: number) {
  return { nativeEvent: { lines: Array.from({ length: count }, () => ({ text: 'linha' })) } };
}

describe('PostFeedItem layout', () => {
  it('is a full-width row with a hairline on top, unless it is the first of a list', async () => {
    await render(<PostFeedItem post={post()} />);
    const row = screen.getByTestId('post-feed-item');
    expect(row).toHaveStyle({
      paddingLeft: 10,
      paddingRight: 15,
      borderTopWidth: StyleSheet.hairlineWidth,
    });
    // The controls' 48 dp touch boxes end the row: no padding under them.
    expect(row).not.toHaveStyle({ paddingBottom: 8 });

    await screen.rerender(<PostFeedItem post={post()} hideTopBorder />);
    expect(screen.getByTestId('post-feed-item')).not.toHaveStyle({
      borderTopWidth: StyleSheet.hairlineWidth,
    });
  });

  it('keeps the name to 70% of the line and lets the handle shrink first', async () => {
    await render(<PostFeedItem post={post()} />);

    const name = screen.getByTestId('post-meta-name');
    expect(name).toHaveTextContent('Ana Souza');
    expect(name.props.numberOfLines).toBe(1);
    expect(name).toHaveStyle({ maxWidth: '70%', flexShrink: 0, fontSize: 15 });
    const handle = screen.getByTestId('post-meta-handle');
    expect(handle).toHaveTextContent('@ana', { exact: false });
    expect(handle.props.numberOfLines).toBe(1);
    expect(handle).toHaveStyle({ flexShrink: 10 });
  });

  it('keeps the design reference spacing: avatar and meta 9 dp down, text right under the meta', async () => {
    await render(<PostFeedItem post={post()} />);

    // 6 dp of row padding plus the 3 dp the 48 dp avatar box adds around the 42 dp avatar.
    expect(screen.getByTestId('post-feed-item')).toHaveStyle({ paddingTop: 6 });
    expect(screen.getByTestId('post-content')).toHaveStyle({ paddingTop: 3 });
    const meta = screen.getByTestId('post-meta');
    expect(meta).toHaveStyle({ paddingBottom: 4 });
    expect(meta).not.toHaveStyle({ minHeight: 48 });
  });
});

describe('PostFeedItem row press', () => {
  it('opens the post from anywhere on the row outside its links and buttons', async () => {
    const onPress = jest.fn();
    await render(<PostFeedItem post={post()} onPress={onPress} />);

    await fireEvent.press(screen.getByText('· há 5 min'));
    await fireEvent.press(screen.getByTestId('post-feed-item'));

    expect(onPress).toHaveBeenCalledTimes(2);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('opens a post that has only images, while a tap on an image opens the viewer', async () => {
    const onPress = jest.fn();
    const imageOnly = post({ content: '', images: images(2), game: null });
    await render(withSafeArea(<PostFeedItem post={imageOnly} onPress={onPress} />));

    await fireEvent.press(screen.getByTestId('post-feed-item'));
    expect(onPress).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole('imagebutton', { name: 'Imagem 1 de 2' }));
    expect(screen.getByTestId('image-viewer')).toBeOnTheScreen();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('keeps one summary for screen readers, which counts the images of a post without text', async () => {
    const imageOnly = post({ content: '', images: images(2), game: null });
    await render(withSafeArea(<PostFeedItem post={imageOnly} onPress={jest.fn()} />));

    // The row itself is not a stop: the summary and every link and button are.
    expect(screen.getByTestId('post-feed-item').props.accessible).toBe(false);
    expect(screen.getByRole('button', { name: 'Post de Ana Souza, há 5 min, 2 imagens' })).toBeOnTheScreen();
  });

  it('opens nothing without onPress, e.g. on the post page', async () => {
    await render(<PostFeedItem post={post()} />);

    await fireEvent.press(screen.getByTestId('post-feed-item'));

    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^Post de / })).toBeNull();
  });

  it('does not open the post from its controls', async () => {
    const onPress = jest.fn();
    await render(<PostFeedItem post={post()} onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Curtir post, 3 curtidas' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Compartilhar' }));

    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('PostFeedItem reason', () => {
  const repost = { type: 'repost' as const, by: bia, at: NOW };

  it('says who reposted it and opens their profile without opening the post', async () => {
    const onPress = jest.fn();
    await render(<PostFeedItem post={post({ reason: repost })} onPress={onPress} />);

    expect(screen.getByText('Repostado por Bia')).toBeOnTheScreen();
    const link = screen.getByRole('button', { name: 'Repostado por Bia' });
    // An inline text link, as in the design reference, 8 dp below the row's top edge.
    expect(link).not.toHaveStyle({ minHeight: 48 });
    expect(screen.getByTestId('post-reason')).toHaveStyle({ paddingTop: 8 });
    expect(screen.getByTestId('post-feed-item')).not.toHaveStyle({ paddingTop: 6 });
    await fireEvent.press(link);

    expect(mockPush).toHaveBeenCalledWith('/users/u2');
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows no reason line for the post itself', async () => {
    await render(<PostFeedItem post={post()} />);

    expect(screen.queryByText(/Repostado por/)).toBeNull();
  });
});

describe('PostFeedItem text clamp', () => {
  it('lays the text out with one line more than the clamp to find out if it is longer', async () => {
    await render(<PostFeedItem post={post()} />);

    expect(screen.getByTestId('post-text').props.numberOfLines).toBe(MAX_POST_LINES + 1);
  });

  it('offers "Mostrar mais" only when the text has more than 25 lines', async () => {
    await render(<PostFeedItem post={post()} />);

    await fireEvent(screen.getByTestId('post-text'), 'textLayout', lines(25));
    expect(screen.queryByRole('button', { name: 'Mostrar mais' })).toBeNull();

    await fireEvent(screen.getByTestId('post-text'), 'textLayout', lines(26));
    expect(screen.getByRole('button', { name: 'Mostrar mais' })).toBeOnTheScreen();
    expect(screen.getByTestId('post-text').props.numberOfLines).toBe(25);
  });

  it('stays clamped once the clamped text reports its 25 lines', async () => {
    await render(<PostFeedItem post={post()} />);

    await fireEvent(screen.getByTestId('post-text'), 'textLayout', lines(26));
    await fireEvent(screen.getByTestId('post-text'), 'textLayout', lines(25));

    expect(screen.getByRole('button', { name: 'Mostrar mais' })).toBeOnTheScreen();
  });

  it('expands in place without opening the post', async () => {
    const onPress = jest.fn();
    await render(<PostFeedItem post={post()} onPress={onPress} />);
    await fireEvent(screen.getByTestId('post-text'), 'textLayout', lines(40));

    const showMore = screen.getByRole('button', { name: 'Mostrar mais' });
    expect(showMore).toHaveStyle({ minHeight: 48 });
    await fireEvent.press(showMore);

    expect(screen.getByTestId('post-text').props.numberOfLines).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'Mostrar mais' })).toBeNull();
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('ImageGrid', () => {
  it.each([1, 2, 3, 4])('lays out %i image(s)', async (count) => {
    await render(<ImageGrid images={images(count)} />);

    expect(screen.getByTestId(`image-grid-${count}`)).toBeOnTheScreen();
    expect(screen.getAllByTestId('post-image')).toHaveLength(count);
  });

  it('labels each image with its position, or its description', async () => {
    const described = [image(1), image(2, { alt: 'Tela final' })];
    await render(<ImageGrid images={described} />);

    expect(screen.getByRole('imagebutton', { name: 'Imagem 1 de 2' })).toBeOnTheScreen();
    expect(screen.getByRole('imagebutton', { name: 'Imagem 2 de 2: Tela final' })).toBeOnTheScreen();
  });

  it('puts the second and third of three images in a column beside the first', async () => {
    await render(<ImageGrid images={images(3)} />);

    const stack = screen.getByTestId('image-grid-stack');
    expect(stack).toHaveStyle({ flex: 1, aspectRatio: 1 });
    expect(screen.getAllByTestId('post-image')[0]).toHaveStyle({ flex: 1, aspectRatio: 1 });
  });

  it('shows two images side by side as squares and four as a 2 × 2 grid', async () => {
    await render(<ImageGrid images={images(2)} />);
    for (const cell of screen.getAllByTestId('post-image')) {
      expect(cell).toHaveStyle({ flex: 1, aspectRatio: 1 });
    }

    await screen.rerender(<ImageGrid images={images(4)} />);
    for (const cell of screen.getAllByTestId('post-image')) {
      expect(cell).toHaveStyle({ flex: 1, aspectRatio: 1.5 });
    }
  });

  it('never shows more than four images', async () => {
    await render(<ImageGrid images={images(5)} />);

    expect(screen.getAllByTestId('post-image')).toHaveLength(4);
  });

  it('sizes a lone image by its shape, between 9:16 and its own width', async () => {
    expect(singleImageAspect(image(1, { width: 1600, height: 900 }))).toBeCloseTo(16 / 9);
    expect(singleImageAspect(image(1, { width: 1000, height: 1000 }))).toBe(1);
    expect(singleImageAspect(image(1, { width: 500, height: 2000 }))).toBe(9 / 16);
    expect(singleImageAspect(image(1))).toBeCloseTo(16 / 9);
    expect(singleImageAspect(image(1, { width: 0, height: 100 }))).toBeCloseTo(16 / 9);

    await render(<ImageGrid images={[image(1, { width: 300, height: 400 })]} />);
    expect(screen.getByTestId('post-image')).toHaveStyle({ width: '100%', aspectRatio: 0.75 });
  });

  it('opens the viewer at the tapped image and closes it', async () => {
    await render(withSafeArea(<ImageGrid images={images(3)} />));
    expect(screen.queryByTestId('image-viewer')).toBeNull();

    await fireEvent.press(screen.getByRole('imagebutton', { name: 'Imagem 2 de 3' }));

    expect(screen.getByTestId('image-viewer')).toBeOnTheScreen();
    expect(screen.getByTestId('image-viewer-list').props.initialScrollIndex).toBe(1);
    expect(screen.getByText('2 de 3')).toBeOnTheScreen();
    const close = screen.getByRole('button', { name: 'Fechar' });
    expect(close).toHaveStyle({ width: 48, height: 48 });
    await fireEvent.press(close);

    expect(screen.queryByTestId('image-viewer')).toBeNull();
  });

  it('follows the swipe in the counter and closes on Android back', async () => {
    await render(withSafeArea(<ImageGrid images={images(3)} />));
    await fireEvent.press(screen.getByRole('imagebutton', { name: 'Imagem 1 de 3' }));

    await fireEvent(screen.getByTestId('image-viewer-list'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 2 * 750, y: 0 } },
    });
    // The jest window is 750 wide.
    expect(screen.getByText('3 de 3')).toBeOnTheScreen();

    let node = screen.getByTestId('image-viewer').parent;
    while (node && typeof node.props.onRequestClose !== 'function') node = node.parent;
    const onRequestClose = node?.props.onRequestClose as () => void;
    await act(async () => onRequestClose());

    expect(screen.queryByTestId('image-viewer')).toBeNull();
  });

  it('opens nothing when it is only a preview', async () => {
    await render(withSafeArea(<ImageGrid images={images(1)} interactive={false} />));

    await fireEvent.press(screen.getByTestId('post-image', HIDDEN));

    expect(screen.queryByTestId('image-viewer')).toBeNull();
  });
});

describe('PostFeedItem embeds', () => {
  it('shows the quoted post and opens it', async () => {
    const onPress = jest.fn();
    const quote = post({ quotedPostId: 'q1', quotedPost: quoted() });
    await render(<PostFeedItem post={quote} onPress={onPress} />);

    const card = screen.getByRole('link', {
      name: 'Post citado de Bia, há 2 h: O chefe final é impossível',
    });
    expect(screen.getByText('O chefe final é impossível').props.numberOfLines).toBe(20);
    expect(screen.queryByTestId('quoted-post-removed')).toBeNull();
    await fireEvent.press(card);

    expect(mockPush).toHaveBeenCalledWith('/posts/q1');
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows only the first image of the quoted post, as a preview that opens the quote', async () => {
    const quote = post({ quotedPostId: 'q1', quotedPost: quoted({ images: images(3) }) });
    await render(withSafeArea(<PostFeedItem post={quote} />));

    const previews = screen.getAllByTestId('post-image', HIDDEN);
    expect(previews).toHaveLength(1);
    expect(previews[0]).toHaveStyle({ aspectRatio: 16 / 9 });
    expect(screen.queryByRole('imagebutton')).toBeNull();

    await fireEvent.press(previews[0]);
    expect(mockPush).toHaveBeenCalledWith('/posts/q1');
    expect(screen.queryByTestId('image-viewer')).toBeNull();
  });

  it('shows a muted box when the quoted post was removed', async () => {
    const quote = post({ quotedPostRemoved: true });
    await render(<PostFeedItem post={quote} />);

    expect(screen.getByTestId('quoted-post-removed')).toBeOnTheScreen();
    expect(screen.getByText('Post removido')).toBeOnTheScreen();
    expect(screen.queryByTestId('quoted-post')).toBeNull();
  });

  it('labels a quoted activity with its status', async () => {
    const activity = quoted({ type: 'activity', activityStatus: 'completed', content: 'zerou Hades' });
    await render(<QuotedPost post={activity} />);

    expect(
      screen.getByRole('link', { name: 'Post citado de Bia, há 2 h, Concluído: zerou Hades' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('Concluído')).toBeOnTheScreen();
  });

  it('shows the images, the quoted post and the game in that order', async () => {
    const full = post({ images: images(2), quotedPostId: 'q1', quotedPost: quoted() });
    await render(withSafeArea(<PostFeedItem post={full} />));

    const order = [
      ...screen.getAllByTestId('post-image'),
      screen.getByTestId('quoted-post'),
      screen.getByRole('link', { name: 'Abrir jogo Hades' }),
    ];
    expect(order).toHaveLength(4);
    expect(inDocumentOrder(order)).toEqual(order);
  });

  it('puts the activity status line above the game card', async () => {
    const activity = post({ type: 'activity', activityStatus: 'playing', content: 'começou a jogar Hades' });
    await render(<PostFeedItem post={activity} />);

    const status = screen.getByTestId('activity-status');
    expect(status).toHaveTextContent('Jogando', { exact: false });
    const game = screen.getByRole('link', { name: 'Abrir jogo Hades' });
    expect(inDocumentOrder([game, status])).toEqual([status, game]);
  });
});

describe('PostFeedItemSkeleton', () => {
  it('uses the row geometry with a 42 dp avatar circle', async () => {
    await render(<PostFeedItemSkeleton testID="skeleton" />);

    expect(screen.getByTestId('skeleton')).toHaveStyle({
      paddingLeft: 10,
      paddingRight: 15,
      borderTopWidth: StyleSheet.hairlineWidth,
    });
    expect(screen.getByTestId('post-skeleton-avatar', HIDDEN)).toHaveStyle({ width: 42, height: 42 });
  });
});
