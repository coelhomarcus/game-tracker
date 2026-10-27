import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSession } from '@/features/auth';
import { useLibrary } from '@/features/library/queries';
import { usePreferences } from '@/lib/preferences';
import { showToast } from '@/lib/toast';

import { feedApi, type UploadedPostImage } from '../../api';
import { useCreatePost } from '../../queries';
import { AltTextSheet } from '../AltTextSheet';
import { Composer } from '../Composer';
import { useComposerDrafts } from '../composerDraft';

jest.mock('../../queries', () => ({ useCreatePost: jest.fn(), usePost: jest.fn() }));
jest.mock('../../api', () => ({ feedApi: { uploadPostImage: jest.fn() } }));
jest.mock('@/features/games/queries', () => ({ useGame: jest.fn(), useGameSearch: jest.fn() }));
jest.mock('@/features/library/queries', () => ({ useLibrary: jest.fn() }));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  usePreventRemove: () => jest.fn(),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const MISSING = 'Adicione uma descrição a todas as imagens.';
const upload = jest.mocked(feedApi.uploadPostImage);
const library = jest.mocked(ImagePicker.launchImageLibraryAsync);
const mockCreate = jest.fn();

function asset(name: string) {
  return {
    uri: `file:///${name}.jpg`,
    width: 800,
    height: 600,
    mimeType: 'image/jpeg',
    fileName: `${name}.jpg`,
  };
}

function uploaded(name: string): UploadedPostImage {
  return { url: `https://cdn.test/${name}.jpg`, width: 640, height: 480 };
}

async function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <Composer />
    </SafeAreaProvider>,
  );
}

async function press(name: string) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

async function addImages(...names: string[]) {
  library.mockResolvedValueOnce({
    canceled: false,
    assets: names.map(asset),
  } as unknown as ImagePicker.ImagePickerResult);
  await press('Adicionar imagens');
}

const sheet = () => within(screen.getByTestId('alt-sheet'));

/** Opens the sheet of an image that has no description, types one and saves it. */
async function describeImage(number: number, text: string) {
  await press(`Adicionar descrição à imagem ${number}`);
  await fireEvent.changeText(sheet().getByLabelText('Descrição'), text);
  await fireEvent.press(sheet().getByRole('button', { name: 'Salvar' }));
}

beforeEach(async () => {
  jest.clearAllMocks();
  usePreferences.setState({ requireAltText: false });
  mockCreate.mockResolvedValue(undefined);
  jest.mocked(useCreatePost).mockReturnValue({
    mutateAsync: mockCreate,
  } as unknown as ReturnType<typeof useCreatePost>);
  jest.mocked(useLibrary).mockReturnValue({ data: [] } as unknown as ReturnType<typeof useLibrary>);
  jest
    .mocked(ImagePicker.requestMediaLibraryPermissionsAsync)
    .mockResolvedValue({ granted: true } as ImagePicker.MediaLibraryPermissionResponse);
  upload.mockImplementation(async ({ fileName }) => uploaded(fileName.replace('.jpg', '')));
  useSession.setState({
    status: 'signedIn',
    user: {
      id: 'me',
      username: 'eu',
      name: 'Eu Mesmo',
      email: 'eu@x.com',
      avatarUrl: null,
      bannerUrl: null,
      bio: null,
    },
  });
  await AsyncStorage.clear();
  useComposerDrafts.setState({ drafts: {} });
  await useComposerDrafts.persist.rehydrate();
});

afterEach(() => {
  useSession.setState({ status: 'signedOut', user: null });
});

describe('AltTextSheet', () => {
  const onSave = jest.fn();
  const onCancel = jest.fn();

  async function renderSheet(initialAlt = '') {
    return render(
      <SafeAreaProvider initialMetrics={metrics}>
        <AltTextSheet
          visible
          imageUri="file:///a.jpg"
          initialAlt={initialAlt}
          onSave={onSave}
          onCancel={onCancel}
        />
      </SafeAreaProvider>,
    );
  }

  it('starts from the saved description and saves it trimmed', async () => {
    await renderSheet('  Tela inicial ');

    const field = screen.getByLabelText('Descrição');
    expect(field.props.value).toBe('  Tela inicial ');
    await fireEvent.changeText(field, '  Menu principal do jogo  ');
    await press('Salvar');

    expect(onSave).toHaveBeenCalledWith('Menu principal do jogo');
  });

  it('saves an empty text as no description', async () => {
    await renderSheet('Antiga');

    await fireEvent.changeText(screen.getByLabelText('Descrição'), '   ');
    await press('Salvar');

    expect(onSave).toHaveBeenCalledWith('');
  });

  it('cancels without saving', async () => {
    await renderSheet();

    await fireEvent.changeText(screen.getByLabelText('Descrição'), 'Algo');
    await press('Cancelar');

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('limits the text to 1000 characters and counts them', async () => {
    await renderSheet('a'.repeat(998));

    expect(screen.getByLabelText('Descrição').props.maxLength).toBe(1000);
    expect(screen.getByText('998/1000')).toBeOnTheScreen();
  });

  it('cancels from the backdrop and from Android back, never saving', async () => {
    await renderSheet();
    await fireEvent.changeText(screen.getByLabelText('Descrição'), 'Algo');

    await fireEvent.press(screen.getByTestId('alt-backdrop', { includeHiddenElements: true }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await fireEvent(screen.getByTestId('alt-modal'), 'requestClose');

    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows the notice inside the sheet and announces it, only when there is one', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    const { unmount } = await renderSheet();
    expect(screen.queryByTestId('alt-notice')).toBeNull();
    expect(announce).not.toHaveBeenCalled();
    await unmount();

    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <AltTextSheet
          visible
          imageUri="file:///a.jpg"
          initialAlt=""
          notice={MISSING}
          onSave={onSave}
          onCancel={onCancel}
        />
      </SafeAreaProvider>,
    );

    expect(screen.getByTestId('alt-notice')).toHaveTextContent(MISSING);
    expect(announce).toHaveBeenCalledWith(MISSING);
    announce.mockRestore();
  });

  it('shows the image with a contained preview at most 240 high', async () => {
    await renderSheet();

    const preview = screen.getByLabelText('Imagem sendo descrita');
    expect(preview.props.resizeMode).toBe('contain');
    expect(preview).toHaveStyle({ height: 240 });
  });
});

describe('Composer image descriptions', () => {
  it('shows the ALT pill only once the image is uploaded, in a real 48 dp box', async () => {
    let finish!: (image: UploadedPostImage) => void;
    upload.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    await renderScreen();
    await addImages('a');

    expect(screen.queryByRole('button', { name: /descrição à imagem 1/ })).toBeNull();
    await act(async () => finish(uploaded('a')));

    const pill = screen.getByRole('button', { name: 'Adicionar descrição à imagem 1' });
    expect(pill).toHaveStyle({ top: 0, left: 0, right: 48, height: 48 });
    expect(screen.getByText('ALT')).toBeOnTheScreen();
  });

  it('marks the pill once the image has a description', async () => {
    await renderScreen();
    await addImages('a', 'b');

    await describeImage(2, '  Segunda  ');

    expect(screen.getByRole('button', { name: 'Adicionar descrição à imagem 1' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Editar descrição da imagem 2' })).toBeOnTheScreen();
    expect(screen.getByTestId('composer-image-2-alt-set')).toBeOnTheScreen();
    expect(screen.queryByTestId('composer-image-1-alt-set')).toBeNull();
  });

  it('opens the sheet with the saved description, and removes it when cleared', async () => {
    await renderScreen();
    await addImages('a');
    await describeImage(1, 'Capa');

    await press('Editar descrição da imagem 1');
    expect(sheet().getByLabelText('Descrição').props.value).toBe('Capa');
    await fireEvent.changeText(sheet().getByLabelText('Descrição'), '');
    await fireEvent.press(sheet().getByRole('button', { name: 'Salvar' }));

    expect(screen.getByRole('button', { name: 'Adicionar descrição à imagem 1' })).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Escrever post'), 'Oi');
    await press('Publicar');
    expect(mockCreate).toHaveBeenCalledWith({ content: 'Oi', images: [uploaded('a')] });
  });

  it('has no notice when the sheet is opened from the ALT pill', async () => {
    await renderScreen();
    await addImages('a');

    await press('Adicionar descrição à imagem 1');

    expect(screen.getByTestId('alt-sheet')).toBeOnTheScreen();
    expect(screen.queryByTestId('alt-notice')).toBeNull();
  });

  it('takes the description of a removed image with it', async () => {
    await renderScreen();
    await addImages('a', 'b');
    await describeImage(1, 'Primeira');
    await describeImage(2, 'Segunda');

    await press('Remover imagem 1');

    expect(screen.getByRole('button', { name: 'Editar descrição da imagem 1' })).toBeOnTheScreen();
    await addImages('c');
    expect(screen.getByRole('button', { name: 'Adicionar descrição à imagem 2' })).toBeOnTheScreen();
    await press('Publicar');
    expect(mockCreate).toHaveBeenCalledWith({
      content: '',
      images: [{ ...uploaded('b'), alt: 'Segunda' }, uploaded('c')],
    });
  });

  it('keeps the old description when the sheet is cancelled', async () => {
    await renderScreen();
    await addImages('a');
    await describeImage(1, 'Capa');

    await press('Editar descrição da imagem 1');
    await fireEvent.changeText(sheet().getByLabelText('Descrição'), 'Outra');
    await fireEvent.press(sheet().getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByTestId('alt-sheet')).toBeNull();
    await press('Editar descrição da imagem 1');
    expect(sheet().getByLabelText('Descrição').props.value).toBe('Capa');
  });

  it('sends each description with its image, in order', async () => {
    await renderScreen();
    await addImages('a', 'b', 'c');
    await describeImage(1, 'Primeira');
    await describeImage(3, 'Terceira');

    await press('Publicar');

    expect(mockCreate).toHaveBeenCalledWith({
      content: '',
      images: [
        { ...uploaded('a'), alt: 'Primeira' },
        uploaded('b'),
        { ...uploaded('c'), alt: 'Terceira' },
      ],
    });
  });

  describe('when descriptions are required', () => {
    let announce: jest.SpyInstance;

    beforeEach(() => {
      usePreferences.setState({ requireAltText: true });
      announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    });

    afterEach(() => {
      announce.mockRestore();
    });

    it('blocks Publicar with a toast and opens the first image without one', async () => {
      await renderScreen();
      await addImages('a', 'b', 'c');
      await describeImage(1, 'Primeira');

      await press('Publicar');

      expect(showToast).toHaveBeenCalledWith(MISSING);
      expect(mockCreate).not.toHaveBeenCalled();
      expect(screen.getByTestId('alt-sheet')).toBeOnTheScreen();
      // A Modal covers the toast host, so the reason is also written inside the sheet.
      expect(sheet().getByTestId('alt-notice')).toHaveTextContent(MISSING);
      expect(announce).toHaveBeenCalledWith(MISSING);
      expect(sheet().getByLabelText('Descrição').props.value).toBe('');
      // It is image 2, the first one without a description, that is open.
      await fireEvent.changeText(sheet().getByLabelText('Descrição'), 'Segunda');
      await fireEvent.press(sheet().getByRole('button', { name: 'Salvar' }));
      expect(screen.getByRole('button', { name: 'Editar descrição da imagem 2' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Adicionar descrição à imagem 3' })).toBeOnTheScreen();
    });

    it('keeps blocking on every press until all images are described, then publishes', async () => {
      await renderScreen();
      await addImages('a', 'b');
      expect(screen.getByRole('button', { name: 'Publicar' })).toBeEnabled();

      await press('Publicar');
      await fireEvent.press(sheet().getByRole('button', { name: 'Cancelar' }));
      await press('Publicar');
      expect(showToast).toHaveBeenCalledTimes(2);
      expect(mockCreate).not.toHaveBeenCalled();

      await fireEvent.changeText(sheet().getByLabelText('Descrição'), 'Uma');
      await fireEvent.press(sheet().getByRole('button', { name: 'Salvar' }));
      await describeImage(2, 'Duas');
      await press('Publicar');

      expect(mockCreate).toHaveBeenCalledWith({
        content: '',
        images: [
          { ...uploaded('a'), alt: 'Uma' },
          { ...uploaded('b'), alt: 'Duas' },
        ],
      });
    });

    it('asks for nothing when the post has no images', async () => {
      await renderScreen();
      await fireEvent.changeText(screen.getByLabelText('Escrever post'), 'Só texto');

      await press('Publicar');

      expect(showToast).not.toHaveBeenCalledWith(MISSING);
      expect(mockCreate).toHaveBeenCalledWith({ content: 'Só texto' });
    });
  });

  it('publishes images without descriptions when they are not required', async () => {
    await renderScreen();
    await addImages('a');

    await press('Publicar');

    expect(showToast).not.toHaveBeenCalledWith(MISSING);
    expect(mockCreate).toHaveBeenCalledWith({ content: '', images: [uploaded('a')] });
  });

  describe('with drafts', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('saves the descriptions in the draft', async () => {
      await renderScreen();
      await addImages('a');
      await describeImage(1, 'Capa');
      await act(async () => jest.advanceTimersByTime(500));

      expect(useComposerDrafts.getState().drafts.me?.plain?.images).toEqual([
        { ...uploaded('a'), alt: 'Capa' },
      ]);
    });

    it('restores the descriptions and sends them', async () => {
      useComposerDrafts.setState({
        drafts: {
          me: {
            plain: {
              text: 'Com fotos',
              link: null,
              entryId: null,
              quotedPostId: null,
              images: [{ ...uploaded('a'), alt: 'Capa' }, uploaded('b')],
              savedAt: Date.now(),
            },
          },
        },
      });
      await renderScreen();

      expect(screen.getByRole('button', { name: 'Editar descrição da imagem 1' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Adicionar descrição à imagem 2' })).toBeOnTheScreen();
      await press('Publicar');
      expect(mockCreate).toHaveBeenCalledWith({
        content: 'Com fotos',
        images: [{ ...uploaded('a'), alt: 'Capa' }, uploaded('b')],
      });
    });

    it('drops a stored description that is empty, too long or not text', async () => {
      await AsyncStorage.setItem(
        'composer-drafts',
        JSON.stringify({
          state: {
            drafts: {
              me: {
                plain: {
                  text: 'x',
                  link: null,
                  entryId: null,
                  quotedPostId: null,
                  images: [
                    { ...uploaded('a'), alt: '   ' },
                    { ...uploaded('b'), alt: 'a'.repeat(1001) },
                    { ...uploaded('c'), alt: '  ok  ' },
                    { ...uploaded('d'), alt: 5 },
                  ],
                  savedAt: Date.now(),
                },
              },
            },
          },
          version: 0,
        }),
      );
      await useComposerDrafts.persist.rehydrate();

      expect(useComposerDrafts.getState().drafts.me?.plain?.images).toEqual([
        uploaded('a'),
        uploaded('b'),
        { ...uploaded('c'), alt: 'ok' },
        uploaded('d'),
      ]);
    });
  });
});
