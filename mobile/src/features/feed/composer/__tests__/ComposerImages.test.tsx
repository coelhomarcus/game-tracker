import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSession } from '@/features/auth';
import { useLibrary } from '@/features/library/queries';
import { ApiError, NetworkError } from '@/lib/http/errors';
import { showToast } from '@/lib/toast';

import { feedApi, type UploadedPostImage } from '../../api';
import { useCreatePost } from '../../queries';
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

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => ({}),
  usePreventRemove: () => jest.fn(),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const upload = jest.mocked(feedApi.uploadPostImage);
const library = jest.mocked(ImagePicker.launchImageLibraryAsync);
const camera = jest.mocked(ImagePicker.launchCameraAsync);
const mockCreate = jest.fn();

type Asset = { uri: string; width: number; height: number; mimeType?: string; fileName?: string };

function asset(name: string, width = 800, height = 600): Asset {
  return {
    uri: `file:///${name}.jpg`,
    width,
    height,
    mimeType: 'image/jpeg',
    fileName: `${name}.jpg`,
  };
}

function picked(...assets: Asset[]) {
  return { canceled: false, assets } as unknown as ImagePicker.ImagePickerResult;
}

function uploaded(name: string): UploadedPostImage {
  return { url: `https://cdn.test/${name}.jpg`, width: 640, height: 480 };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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

async function typeText(text: string) {
  await fireEvent.changeText(screen.getByLabelText('Escrever post'), text);
}

/** Picks images from the gallery and lets the picker and the uploads settle. */
async function addFromGallery(...assets: Asset[]) {
  library.mockResolvedValueOnce(picked(...assets));
  await press('Adicionar imagens');
}

const drafts = () => useComposerDrafts.getState().drafts;

beforeEach(async () => {
  jest.clearAllMocks();
  mockCreate.mockResolvedValue(undefined);
  jest.mocked(useCreatePost).mockReturnValue({
    mutateAsync: mockCreate,
  } as unknown as ReturnType<typeof useCreatePost>);
  jest.mocked(useLibrary).mockReturnValue({ data: [] } as unknown as ReturnType<typeof useLibrary>);
  jest
    .mocked(ImagePicker.requestMediaLibraryPermissionsAsync)
    .mockResolvedValue({ granted: true } as ImagePicker.MediaLibraryPermissionResponse);
  jest
    .mocked(ImagePicker.requestCameraPermissionsAsync)
    .mockResolvedValue({ granted: true } as ImagePicker.CameraPermissionResponse);
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

describe('Composer image picking', () => {
  it('opens the gallery for the slots that are left', async () => {
    await renderScreen();

    await addFromGallery(asset('a'));
    expect(library).toHaveBeenLastCalledWith({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 4,
      quality: 0.85,
    });

    await addFromGallery(asset('b'));
    expect(library).toHaveBeenLastCalledWith(expect.objectContaining({ selectionLimit: 3 }));

    await addFromGallery(asset('c'), asset('d'));
    expect(screen.getAllByLabelText(/^Imagem \d$/)).toHaveLength(4);
  });

  it('turns both media buttons off at four images', async () => {
    await renderScreen();

    await addFromGallery(asset('a'), asset('b'), asset('c'), asset('d'));

    expect(screen.getByRole('button', { name: 'Adicionar imagens' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tirar foto' })).toBeDisabled();

    await press('Remover imagem 4');
    expect(screen.getByRole('button', { name: 'Adicionar imagens' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Tirar foto' })).toBeEnabled();
  });

  it('keeps only as many images as there is room for when the picker returns more', async () => {
    await renderScreen();
    await addFromGallery(asset('a'), asset('b'), asset('c'));

    await addFromGallery(asset('d'), asset('e'), asset('f'));

    expect(screen.getAllByLabelText(/^Imagem \d$/)).toHaveLength(4);
    expect(upload).toHaveBeenCalledTimes(4);
  });

  it('adds nothing when the picker is cancelled', async () => {
    await renderScreen();
    library.mockResolvedValueOnce({ canceled: true, assets: null });

    await press('Adicionar imagens');

    expect(screen.queryByTestId('composer-gallery')).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });

  it('tells how to allow the photos when the permission is denied', async () => {
    jest
      .mocked(ImagePicker.requestMediaLibraryPermissionsAsync)
      .mockResolvedValue({ granted: false } as ImagePicker.MediaLibraryPermissionResponse);
    await renderScreen();

    await press('Adicionar imagens');

    expect(showToast).toHaveBeenCalledWith('Permita o acesso às fotos nas configurações');
    expect(library).not.toHaveBeenCalled();
  });

  it('takes a photo with the camera and uploads it', async () => {
    camera.mockResolvedValueOnce(picked(asset('foto')));
    await renderScreen();

    await press('Tirar foto');

    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(camera).toHaveBeenCalledWith({ mediaTypes: ['images'], quality: 0.85 });
    expect(upload).toHaveBeenCalledWith({
      uri: 'file:///foto.jpg',
      mimeType: 'image/jpeg',
      fileName: 'foto.jpg',
    });
    expect(screen.getByLabelText('Imagem 1')).toBeOnTheScreen();
  });

  it('tells how to allow the camera when the permission is denied', async () => {
    jest
      .mocked(ImagePicker.requestCameraPermissionsAsync)
      .mockResolvedValue({ granted: false } as ImagePicker.CameraPermissionResponse);
    await renderScreen();

    await press('Tirar foto');

    expect(showToast).toHaveBeenCalledWith('Permita o acesso à câmera nas configurações');
    expect(camera).not.toHaveBeenCalled();
  });

  it('falls back to a JPEG name and type when the picker gives none', async () => {
    await renderScreen();

    await addFromGallery({ uri: 'file:///x', width: 10, height: 10 });

    expect(upload).toHaveBeenCalledWith({
      uri: 'file:///x',
      mimeType: 'image/jpeg',
      fileName: 'image.jpg',
    });
  });

  it('says so when the picker fails', async () => {
    library.mockRejectedValueOnce(new Error('boom'));
    await renderScreen();

    await press('Adicionar imagens');

    expect(showToast).toHaveBeenCalledWith('Não foi possível abrir as imagens. Tente de novo.');
    await press('Adicionar imagens');
    expect(library).toHaveBeenCalledTimes(2);
  });

  it('ignores a second tap while the picker is open', async () => {
    const pending = deferred<ImagePicker.ImagePickerResult>();
    library.mockReturnValueOnce(pending.promise);
    await renderScreen();

    await press('Adicionar imagens');
    await press('Adicionar imagens');
    await press('Tirar foto');

    expect(library).toHaveBeenCalledTimes(1);
    expect(camera).not.toHaveBeenCalled();
    await act(async () => pending.resolve(picked(asset('a'))));
    expect(screen.getByLabelText('Imagem 1')).toBeOnTheScreen();
  });
});

describe('Composer image uploads', () => {
  it('uploads each image at once, with a spinner until it ends', async () => {
    const first = deferred<UploadedPostImage>();
    upload.mockReturnValueOnce(first.promise);
    await renderScreen();

    await addFromGallery(asset('a'));

    expect(screen.getByTestId('composer-image-1-uploading')).toBeOnTheScreen();
    expect(screen.getByLabelText('Enviando imagem 1')).toBeOnTheScreen();

    await act(async () => first.resolve(uploaded('a')));
    expect(screen.queryByTestId('composer-image-1-uploading')).toBeNull();
    expect(screen.queryByText('Tentar de novo')).toBeNull();
  });

  it('shows a retry on the image when the upload fails, and uploads it again', async () => {
    upload.mockRejectedValueOnce(new NetworkError());
    await renderScreen();
    await addFromGallery(asset('a'));

    expect(screen.getByText('Tentar de novo')).toBeOnTheScreen();
    expect(screen.queryByTestId('composer-image-1-uploading')).toBeNull();

    await press('Tentar de novo enviar a imagem 1');

    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenLastCalledWith({
      uri: 'file:///a.jpg',
      mimeType: 'image/jpeg',
      fileName: 'a.jpg',
    });
    expect(screen.queryByText('Tentar de novo')).toBeNull();

    await typeText('Oi');
    await press('Publicar');
    expect(mockCreate).toHaveBeenCalledWith({ content: 'Oi', images: [uploaded('a')] });
  });

  it('explains the upload rate limit', async () => {
    upload.mockRejectedValueOnce(new ApiError(429, 'rate_limited', 'Muitos envios de imagem'));
    await renderScreen();

    await addFromGallery(asset('a'));

    expect(showToast).toHaveBeenCalledWith(
      'Muitas imagens em pouco tempo, tente de novo em alguns minutos',
    );
    expect(screen.getByText('Tentar de novo')).toBeOnTheScreen();
  });

  it('does not show the rate limit toast for other failures', async () => {
    upload.mockRejectedValueOnce(new ApiError(413, 'too_large', 'Grande demais'));
    await renderScreen();

    await addFromGallery(asset('a'));

    expect(showToast).not.toHaveBeenCalled();
    expect(screen.getByText('Tentar de novo')).toBeOnTheScreen();
  });

  it('ignores the answer of an upload whose image was removed', async () => {
    const pending = deferred<UploadedPostImage>();
    upload.mockReturnValueOnce(pending.promise);
    await renderScreen();
    await addFromGallery(asset('a'));
    await typeText('Oi');

    await press('Remover imagem 1');
    await act(async () => pending.resolve(uploaded('a')));

    expect(screen.queryByTestId('composer-gallery')).toBeNull();
    await press('Publicar');
    expect(mockCreate).toHaveBeenCalledWith({ content: 'Oi' });
  });

  it('ignores the failure of an upload whose image was removed', async () => {
    const pending = deferred<UploadedPostImage>();
    upload.mockReturnValueOnce(pending.promise);
    await renderScreen();
    await addFromGallery(asset('a'));

    await press('Remover imagem 1');
    await act(async () => pending.reject(new ApiError(429, 'rate_limited', 'x')));

    expect(showToast).not.toHaveBeenCalled();
    expect(screen.queryByText('Tentar de novo')).toBeNull();
  });
});

describe('Composer publishing with images', () => {
  it('sends the uploaded images in the order they were added', async () => {
    const slow = deferred<UploadedPostImage>();
    upload.mockImplementation(async ({ fileName }) => {
      if (fileName === 'a.jpg') return slow.promise;
      return uploaded(fileName.replace('.jpg', ''));
    });
    await renderScreen();
    await addFromGallery(asset('a'), asset('b'));
    await addFromGallery(asset('c'));
    await act(async () => slow.resolve(uploaded('a')));
    await typeText('Três fotos');

    await press('Publicar');

    expect(mockCreate).toHaveBeenCalledWith({
      content: 'Três fotos',
      images: [uploaded('a'), uploaded('b'), uploaded('c')],
    });
  });

  it('sends no images key without images', async () => {
    await renderScreen();
    await typeText('Só texto');

    await press('Publicar');

    expect(mockCreate).toHaveBeenCalledWith({ content: 'Só texto' });
  });

  it('does not publish while an image is uploading, and says why', async () => {
    const pending = deferred<UploadedPostImage>();
    upload.mockReturnValueOnce(pending.promise);
    await renderScreen();
    await addFromGallery(asset('a'));
    await typeText('Oi');

    await press('Publicar');

    expect(mockCreate).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('Aguarde o envio das imagens');

    await act(async () => pending.resolve(uploaded('a')));
    await press('Publicar');
    expect(mockCreate).toHaveBeenCalledWith({ content: 'Oi', images: [uploaded('a')] });
  });

  it('does not publish while an image failed, and says why', async () => {
    upload.mockRejectedValueOnce(new NetworkError());
    await renderScreen();
    await addFromGallery(asset('a'), asset('b'));
    await typeText('Oi');

    await press('Publicar');

    expect(mockCreate).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('Remova ou tente de novo as imagens que falharam');

    await press('Remover imagem 1');
    await press('Publicar');
    expect(mockCreate).toHaveBeenCalledWith({ content: 'Oi', images: [uploaded('b')] });
  });

  it('still needs text to publish', async () => {
    await renderScreen();

    await addFromGallery(asset('a'));

    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
  });
});

describe('Composer gallery layout', () => {
  it('shows one image full width with its own shape, at most 300 high', async () => {
    await renderScreen();

    await addFromGallery(asset('a', 800, 400));

    expect(screen.getByTestId('composer-image-1')).toHaveStyle({
      width: '100%',
      aspectRatio: 2,
      maxHeight: 300,
      borderRadius: 12,
    });
  });

  it('shows two to four images as squares in a row with an 8 dp gap', async () => {
    await renderScreen();

    await addFromGallery(asset('a'), asset('b'));
    expect(screen.getByTestId('composer-gallery')).toHaveStyle({ flexDirection: 'row', gap: 8 });
    for (const id of ['composer-image-1', 'composer-image-2']) {
      expect(screen.getByTestId(id)).toHaveStyle({ flex: 1, aspectRatio: 1, borderRadius: 12 });
    }

    await addFromGallery(asset('c'), asset('d'));
    expect(screen.getByTestId('composer-image-4')).toHaveStyle({ flex: 1, aspectRatio: 1 });
  });

  it('removes with a 32 dp round x inside a real 48 dp box', async () => {
    await renderScreen();
    await addFromGallery(asset('a'));

    const remove = screen.getByRole('button', { name: 'Remover imagem 1' });

    expect(remove).toHaveStyle({ width: 48, height: 48 });
    expect(remove.children[0]).toHaveStyle({ width: 32, height: 32, borderRadius: 16 });
    await fireEvent.press(remove);
    expect(screen.queryByTestId('composer-gallery')).toBeNull();
  });
});

describe('Composer images and drafts', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('saves only the images that finished uploading', async () => {
    const pending = deferred<UploadedPostImage>();
    upload.mockImplementation(async ({ fileName }) => {
      if (fileName === 'slow.jpg') return pending.promise;
      if (fileName === 'bad.jpg') throw new NetworkError();
      return uploaded('ok');
    });
    await renderScreen();

    await addFromGallery(asset('ok'), asset('slow'), asset('bad'));
    await act(async () => jest.advanceTimersByTime(500));

    expect(drafts().plain?.images).toEqual([uploaded('ok')]);
  });

  it('restores the images of a draft, ready to send', async () => {
    useComposerDrafts.setState({
      drafts: {
        plain: {
          text: 'Com fotos',
          link: null,
          entryId: null,
          quotedPostId: null,
          images: [uploaded('a'), uploaded('b')],
          savedAt: 1,
        },
      },
    });
    await renderScreen();

    expect(screen.getAllByLabelText(/^Imagem \d$/)).toHaveLength(2);
    expect(screen.queryByTestId('composer-image-1-uploading')).toBeNull();
    expect(upload).not.toHaveBeenCalled();
    await press('Publicar');
    expect(mockCreate).toHaveBeenCalledWith({
      content: 'Com fotos',
      images: [uploaded('a'), uploaded('b')],
    });
  });

  it('restores a draft that holds only images, and counts the room left', async () => {
    useComposerDrafts.setState({
      drafts: {
        plain: {
          text: '',
          link: null,
          entryId: null,
          quotedPostId: null,
          images: [uploaded('a'), uploaded('b'), uploaded('c')],
          savedAt: 1,
        },
      },
    });
    await renderScreen();

    await addFromGallery(asset('d'));

    expect(library).toHaveBeenLastCalledWith(expect.objectContaining({ selectionLimit: 1 }));
    expect(screen.getByRole('button', { name: 'Adicionar imagens' })).toBeDisabled();
  });
});
