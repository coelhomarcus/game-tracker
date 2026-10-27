import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import EditProfileRoute from '@/app/me/edit';
import MeLayout from '@/app/me/_layout';
import { authErrorMessage, useSession } from '@/features/auth';
import { haptic } from '@/lib/haptics';
import { ApiError, NetworkError } from '@/lib/http/errors';
import { showToast } from '@/lib/toast';
import { colors } from '@/theme/tokens';

import { EditProfileScreen } from '../EditProfileScreen';
import { pickImage } from '../pickImage';
import { useProfile, useRemoveImage, useUpdateProfile, useUploadImage } from '../queries';
import type { ImageKind, PickedImage, UserProfile } from '../types';

jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/lib/haptics', () => ({ haptic: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));
// The real picker by default (over the mocked system picker); a test may stub it.
jest.mock('../pickImage', () => {
  const actual = jest.requireActual('../pickImage');
  return { ...actual, pickImage: jest.fn() };
});
jest.mock('../queries', () => ({
  useProfile: jest.fn(),
  useUpdateProfile: jest.fn(),
  useUploadImage: jest.fn(),
  useRemoveImage: jest.fn(),
}));

const mockBack = jest.fn();
const mockRepeat = jest.fn();
const mockDisablePrevention = jest.fn();
const mockPrevent: {
  active: boolean;
  callback?: (options: { data: { action: unknown }; repeat: () => void }) => void;
} = { active: false };
const mockScreenOptions: Record<string, unknown>[] = [];
const mockLayoutScreens: { name?: string; options?: Record<string, unknown> }[] = [];

jest.mock('expo-router', () => {
  function Stack({ children }: { children?: unknown }) {
    return children ?? null;
  }
  Stack.Screen = function Screen(props: { name?: string; options?: Record<string, unknown> }) {
    if (props.name !== undefined) mockLayoutScreens.push(props);
    else if (props.options) mockScreenOptions.push(props.options);
    return null;
  };
  return {
    Stack,
    // Going back from a screen with unsaved changes is blocked, as the real navigator does.
    useRouter: () => ({
      back: () => {
        mockBack();
        if (mockPrevent.active) mockPrevent.callback?.({ data: { action: {} }, repeat: mockRepeat });
      },
    }),
    usePreventRemove: (active: boolean, callback: typeof mockPrevent.callback) => {
      mockPrevent.active = active;
      mockPrevent.callback = callback;
      return mockDisablePrevention;
    },
  };
});

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 24, left: 0, right: 0, bottom: 0 },
};

const profile: UserProfile = {
  id: 'u1',
  username: 'ana',
  name: 'Ana Souza',
  avatarUrl: null,
  bannerUrl: null,
  bio: 'Gosto de RPG',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  followerCount: 0,
  followingCount: 0,
  entryCount: 0,
  isFollowedByMe: false,
  followsMe: false,
};

const photo: PickedImage = {
  uri: 'file:///tmp/photo.jpg',
  mimeType: 'image/jpeg',
  fileName: 'photo.jpg',
  size: 1024,
};

const OLD_AVATAR = 'https://img.example.com/old.jpg';
const NEW_URL = 'https://img.example.com/new.jpg';

const mockUpdate = jest.fn();
const mockUpload = jest.fn();
const mockRemove = jest.fn();
const actualPickImage = jest.requireActual('../pickImage').pickImage as typeof pickImage;
let mockProfileData: UserProfile | undefined;
/** The requests in the order the screen sent them. */
let sent: string[];

/** What the real hooks do on success: the cached profile then holds what the server holds. */
function serverHolds(patch: Partial<UserProfile>) {
  mockProfileData = { ...(mockProfileData ?? profile), ...patch };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrevent.active = false;
  mockScreenOptions.length = 0;
  mockLayoutScreens.length = 0;
  mockProfileData = profile;
  sent = [];
  useSession.setState({
    status: 'signedIn',
    user: {
      id: 'u1',
      username: 'ana',
      name: 'Ana Souza',
      email: 'ana@example.com',
      avatarUrl: null,
      bannerUrl: null,
      bio: 'Gosto de RPG',
    },
  });
  jest.mocked(pickImage).mockImplementation(actualPickImage);
  jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue({ granted: true } as never);
  jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({ granted: true } as never);
  mockUpdate.mockImplementation(async (changes: Partial<UserProfile>) => {
    sent.push(`patch ${JSON.stringify(changes)}`);
    serverHolds(changes);
  });
  mockUpload.mockImplementation(async ({ kind }: { kind: ImageKind }) => {
    sent.push(`upload ${kind}`);
    serverHolds(kind === 'avatar' ? { avatarUrl: NEW_URL } : { bannerUrl: NEW_URL });
    return NEW_URL;
  });
  mockRemove.mockImplementation(async (kind: ImageKind) => {
    sent.push(`remove ${kind}`);
    serverHolds(kind === 'avatar' ? { avatarUrl: null } : { bannerUrl: null });
  });
  jest.mocked(useProfile).mockImplementation(() => ({ data: mockProfileData }) as never);
  jest.mocked(useUpdateProfile).mockReturnValue({ mutateAsync: mockUpdate } as never);
  jest.mocked(useUploadImage).mockReturnValue({ mutateAsync: mockUpload } as never);
  jest.mocked(useRemoveImage).mockReturnValue({ mutateAsync: mockRemove } as never);
});

async function renderScreen() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <EditProfileScreen />
    </SafeAreaProvider>,
  );
}

function button(name: string) {
  return screen.getByRole('button', { name });
}

async function press(name: string) {
  await fireEvent.press(button(name));
}

/** Stubs the picker with `image` and picks it for `kind` from the gallery. */
async function pick(kind: ImageKind, image: PickedImage = photo) {
  jest.mocked(pickImage).mockResolvedValueOnce(image);
  await press(kind === 'avatar' ? 'Alterar foto' : 'Alterar capa');
  await press('Galeria');
}

/** The avatar picture is labelled with the name the sheet shows. */
function avatarSource(name = 'Ana Souza') {
  return screen.getByLabelText(name).props.source;
}

function bannerSource() {
  return screen.queryByTestId('edit-banner-image')?.props.source ?? null;
}

function gestureEnabled() {
  const withGesture = mockScreenOptions.filter((options) => 'gestureEnabled' in options);
  return withGesture.at(-1)?.gestureEnabled;
}

describe('EditProfileScreen form', () => {
  it('starts with the profile values and the exact copy', async () => {
    await renderScreen();

    expect(screen.getByRole('header', { name: 'Editar perfil' })).toBeOnTheScreen();
    expect(button('Cancelar')).toBeEnabled();
    expect(screen.getByText('Nome')).toBeOnTheScreen();
    expect(screen.getByText('Nome de usuário')).toBeOnTheScreen();
    expect(screen.getByText('Bio')).toBeOnTheScreen();
    expect(screen.getByLabelText('Nome').props.value).toBe('Ana Souza');
    expect(screen.getByLabelText('Nome de usuário').props.value).toBe('ana');
    expect(screen.getByLabelText('Bio').props.value).toBe('Gosto de RPG');
    expect(screen.getByText('Letras, números e _')).toBeOnTheScreen();
    expect(screen.getByText('9/64')).toBeOnTheScreen();
    expect(screen.getByText('12/256')).toBeOnTheScreen();
  });

  it('labels the fields in small semibold medium text, with low counters and an 80 dp bio', async () => {
    await renderScreen();

    const label = StyleSheet.flatten(screen.getByText('Nome de usuário').props.style);
    expect(label).toMatchObject({ color: colors.textMedium, fontFamily: 'Inter_600SemiBold' });
    expect(StyleSheet.flatten(screen.getByText('9/64').props.style).color).toBe(colors.textLow);
    expect(StyleSheet.flatten(screen.getByLabelText('Bio').props.style).minHeight).toBe(80);
  });

  it('pads the sheet below the status bar', async () => {
    await renderScreen();

    let safeArea = screen.getByTestId('edit-profile-top-bar').parent;
    while (safeArea && safeArea.props.edges === undefined) safeArea = safeArea.parent;
    expect(safeArea?.props.edges).toEqual(expect.objectContaining({ top: 'additive' }));
  });

  it('counts the fields trimmed and in visible characters, like the validation does', async () => {
    await renderScreen();

    await fireEvent.changeText(screen.getByLabelText('Bio'), '   abc  \n');
    await fireEvent.changeText(screen.getByLabelText('Nome'), '👍🏽 Ana ');

    expect(screen.getByText('3/256')).toBeOnTheScreen();
    expect(screen.getByText('5/64')).toBeOnTheScreen();
  });

  it('falls back to the session user while the profile is not loaded', async () => {
    mockProfileData = undefined;
    await renderScreen();

    expect(screen.getByLabelText('Nome').props.value).toBe('Ana Souza');
    expect(screen.getByLabelText('Nome de usuário').props.value).toBe('ana');
  });

  it('keeps Salvar disabled until something changes, trailing spaces aside', async () => {
    await renderScreen();
    expect(button('Salvar')).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText('Nome de usuário'), 'ana ');
    await fireEvent.changeText(screen.getByLabelText('Bio'), 'Gosto de RPG\n');
    expect(button('Salvar')).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText('Nome'), 'Ana Maria');
    expect(button('Salvar')).toBeEnabled();
  });

  it('shows the counter in red and the limit message over the limit, and disables Salvar', async () => {
    await renderScreen();

    await fireEvent.changeText(screen.getByLabelText('Nome'), 'a'.repeat(65));
    await fireEvent.changeText(screen.getByLabelText('Bio'), 'b'.repeat(257));

    expect(StyleSheet.flatten(screen.getByText('65/64').props.style).color).toBe(colors.danger);
    expect(StyleSheet.flatten(screen.getByText('257/256').props.style).color).toBe(colors.danger);
    expect(screen.getByText('Use no máximo 64 caracteres')).toBeOnTheScreen();
    expect(screen.getByText('Use no máximo 256 caracteres')).toBeOnTheScreen();
    expect(button('Salvar')).toBeDisabled();
  });

  it('shows validation messages and keeps Salvar disabled for invalid fields', async () => {
    await renderScreen();

    await fireEvent.changeText(screen.getByLabelText('Nome'), '   ');
    await fireEvent.changeText(screen.getByLabelText('Nome de usuário'), 'a-b');

    expect(screen.getByText('Informe seu nome')).toBeOnTheScreen();
    expect(screen.getByText('Use apenas letras, números e _')).toBeOnTheScreen();
    expect(button('Salvar')).toBeDisabled();
    await press('Salvar');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('never blocks a save on a field the user did not touch', async () => {
    mockProfileData = { ...profile, name: 'n'.repeat(70) };
    await renderScreen();

    expect(screen.queryByText('Use no máximo 64 caracteres')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Bio'), 'Outra bio');
    await press('Salvar');

    expect(mockUpdate).toHaveBeenCalledWith({ bio: 'Outra bio' });
  });

  it('sends only the changed fields, trimmed, then confirms and closes', async () => {
    await renderScreen();

    await fireEvent.changeText(screen.getByLabelText('Nome'), '  Ana Maria  ');
    await press('Salvar');

    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({ name: 'Ana Maria' });
    expect(haptic).toHaveBeenCalledWith('confirm');
    expect(showToast).toHaveBeenCalledWith('Perfil atualizado');
    expect(mockDisablePrevention).toHaveBeenCalled();
    // Closing after a save never asks to discard.
    expect(mockRepeat).not.toHaveBeenCalled();
    expect(screen.queryByText('Descartar alterações?')).toBeNull();
  });

  it('sends a blank bio as an empty string', async () => {
    await renderScreen();

    await fireEvent.changeText(screen.getByLabelText('Bio'), '   ');
    await press('Salvar');

    expect(mockUpdate).toHaveBeenCalledWith({ bio: '' });
  });

  it('saves once on a double tap and shows a spinner while saving', async () => {
    let finish: () => void = () => {};
    mockUpdate.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    await renderScreen();
    await fireEvent.changeText(screen.getByLabelText('Nome'), 'Outro');

    const save = button('Salvar');
    await fireEvent.press(save);
    await fireEvent.press(save);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(button('Salvar')).toBeDisabled();
    expect(button('Salvar')).toBeBusy();
    expect(button('Cancelar')).toBeDisabled();
    expect(button('Alterar foto')).toBeDisabled();
    expect(screen.getByLabelText('Nome').props.editable).toBe(false);

    await act(async () => finish());
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('maps a 409 to the username field and stays on the sheet', async () => {
    mockUpdate.mockRejectedValue(new ApiError(409, 'conflict', 'taken'));
    await renderScreen();

    await fireEvent.changeText(screen.getByLabelText('Nome de usuário'), 'ana2');
    await press('Salvar');

    expect(await screen.findByText('Esse username já está em uso')).toBeOnTheScreen();
    expect(mockBack).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(button('Salvar')).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText('Nome de usuário'), 'ana3');
    expect(screen.queryByText('Esse username já está em uso')).toBeNull();
    expect(button('Salvar')).toBeEnabled();
  });

  it('shows other save errors under the top bar', async () => {
    const error = new NetworkError();
    mockUpdate.mockRejectedValue(error);
    await renderScreen();

    await fireEvent.changeText(screen.getByLabelText('Nome'), 'Outro');
    await press('Salvar');

    expect(await screen.findByText(authErrorMessage(error))).toBeOnTheScreen();
    expect(mockBack).not.toHaveBeenCalled();
    expect(button('Salvar')).toBeEnabled();
  });
});

describe('EditProfileScreen images', () => {
  it('draws the banner, the avatar ring and their camera badges', async () => {
    await renderScreen();

    const banner = StyleSheet.flatten(screen.getByTestId('edit-banner').props.style);
    expect(banner).toMatchObject({ height: 150, backgroundColor: colors.bgContrast25 });
    const ring = StyleSheet.flatten(screen.getByTestId('edit-avatar').props.style);
    expect(ring).toMatchObject({
      position: 'absolute',
      top: 80,
      left: 20,
      width: 84,
      height: 84,
      borderWidth: 2,
      borderColor: colors.bg,
    });
    const [bannerBadge] = screen.getAllByTestId('camera-badge');
    expect(StyleSheet.flatten(bannerBadge!.props.style)).toMatchObject({
      width: 24,
      height: 24,
      bottom: 8,
      right: 24,
      backgroundColor: colors.bgContrast50,
    });
  });

  it('offers Câmera and Galeria, and Remover only for an image that is set', async () => {
    mockProfileData = { ...profile, avatarUrl: OLD_AVATAR };
    await renderScreen();

    await press('Alterar capa');
    expect(button('Câmera')).toBeOnTheScreen();
    expect(button('Galeria')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Remover capa' })).toBeNull();
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { includeHiddenElements: true }));

    await press('Alterar foto');
    const remove = screen.getByText('Remover foto');
    expect(StyleSheet.flatten(remove.props.style).color).toBe(colors.danger);
  });

  it('offers Remover for a picked image', async () => {
    await renderScreen();
    await pick('banner');

    await press('Alterar capa');

    expect(button('Remover capa')).toBeOnTheScreen();
  });

  it('keeps a picked image on the device until Salvar', async () => {
    await renderScreen();

    await pick('avatar');
    await pick('banner');

    expect(pickImage).toHaveBeenCalledWith('avatar', 'library');
    expect(pickImage).toHaveBeenCalledWith('banner', 'library');
    expect(mockUpload).not.toHaveBeenCalled();
    expect(avatarSource()).toEqual({ uri: photo.uri });
    expect(bannerSource()).toEqual({ uri: photo.uri });
    expect(button('Salvar')).toBeEnabled();
  });

  it('takes a photo with the camera', async () => {
    jest.mocked(pickImage).mockResolvedValueOnce(photo);
    await renderScreen();

    await press('Alterar foto');
    await press('Câmera');

    expect(pickImage).toHaveBeenCalledWith('avatar', 'camera');
    expect(avatarSource()).toEqual({ uri: photo.uri });
  });

  it('does nothing when the picker is cancelled', async () => {
    jest.mocked(pickImage).mockResolvedValueOnce(null);
    await renderScreen();

    await press('Alterar foto');
    await press('Galeria');

    expect(button('Salvar')).toBeDisabled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('refuses a 9 MB image with a message before saving', async () => {
    await renderScreen();

    await pick('avatar', { ...photo, size: 9 * 1024 * 1024 });

    expect(showToast).toHaveBeenCalledWith('A imagem passa de 8 MB. Escolha uma menor.');
    expect(screen.queryByLabelText('Ana Souza')).toBeNull();
    expect(button('Salvar')).toBeDisabled();
  });

  it('takes an image whose size is unknown', async () => {
    await renderScreen();

    await pick('avatar', { ...photo, size: null });
    await press('Salvar');

    expect(mockUpload).toHaveBeenCalledTimes(1);
  });

  it('shows a toast when the camera permission is denied, without crashing', async () => {
    jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({ granted: false } as never);
    await renderScreen();

    await press('Alterar foto');
    await press('Câmera');

    expect(showToast).toHaveBeenCalledWith('Permita o acesso à câmera nas configurações.');
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(button('Salvar')).toBeDisabled();
  });

  it('shows a toast when the photos permission is denied, without crashing', async () => {
    jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue({ granted: false } as never);
    await renderScreen();

    await press('Alterar capa');
    await press('Galeria');

    expect(showToast).toHaveBeenCalledWith('Permita o acesso às fotos para escolher uma imagem.');
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it('crops through the real picker: square for the avatar, 3:1 for the banner', async () => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///crop.jpg', fileSize: 10 }],
    } as never);
    await renderScreen();

    await press('Alterar foto');
    await press('Galeria');
    await press('Alterar capa');
    await press('Galeria');

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ allowsEditing: true, aspect: [1, 1] }),
    );
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ allowsEditing: true, aspect: [3, 1] }),
    );
    expect(avatarSource()).toEqual({ uri: 'file:///crop.jpg' });
  });

  it('shows a toast when the picker cannot open', async () => {
    jest.mocked(pickImage).mockRejectedValueOnce(new Error('no camera'));
    await renderScreen();

    await press('Alterar foto');
    await press('Câmera');

    expect(showToast).toHaveBeenCalledWith('Não foi possível abrir a câmera. Tente de novo.');
    expect(button('Salvar')).toBeDisabled();
  });

  it('restores the saved image when a picked one is removed before saving', async () => {
    mockProfileData = { ...profile, avatarUrl: OLD_AVATAR };
    await renderScreen();

    await pick('avatar');
    expect(avatarSource()).toEqual({ uri: photo.uri });

    await press('Alterar foto');
    await press('Remover foto');

    expect(avatarSource()).toEqual({ uri: OLD_AVATAR });
    expect(button('Salvar')).toBeDisabled();
  });

  it('removes a saved image only on Salvar', async () => {
    mockProfileData = { ...profile, avatarUrl: OLD_AVATAR };
    await renderScreen();

    await press('Alterar foto');
    await press('Remover foto');

    expect(screen.queryByLabelText('Ana Souza')).toBeNull();
    expect(mockRemove).not.toHaveBeenCalled();
    await press('Alterar foto');
    expect(screen.queryByRole('button', { name: 'Remover foto' })).toBeNull();
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { includeHiddenElements: true }));

    await press('Salvar');

    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(sent).toEqual(['remove avatar']);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('sends only the upload after removing and picking again', async () => {
    mockProfileData = { ...profile, avatarUrl: OLD_AVATAR };
    await renderScreen();

    await press('Alterar foto');
    await press('Remover foto');
    await pick('avatar');
    await press('Salvar');

    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(sent).toEqual(['upload avatar']);
    expect(mockUpload).toHaveBeenCalledWith({ kind: 'avatar', image: photo });
  });
});

describe('EditProfileScreen save order and failures', () => {
  it('uploads, then removes, then sends the fields', async () => {
    mockProfileData = { ...profile, avatarUrl: OLD_AVATAR };
    await renderScreen();

    await fireEvent.changeText(screen.getByLabelText('Nome'), 'Ana Maria');
    await press('Alterar foto');
    await press('Remover foto');
    await pick('banner');
    await press('Salvar');

    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(sent).toEqual(['upload banner', 'remove avatar', 'patch {"name":"Ana Maria"}']);
    expect(showToast).toHaveBeenCalledWith('Perfil atualizado');
  });

  it('stays open when the fields fail after the upload, and does not upload again on retry', async () => {
    const error = new NetworkError();
    mockUpdate.mockRejectedValueOnce(error);
    await renderScreen();

    await fireEvent.changeText(screen.getByLabelText('Nome'), 'Outro');
    await pick('avatar');
    await press('Salvar');

    expect(await screen.findByText(authErrorMessage(error))).toBeOnTheScreen();
    expect(mockBack).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    // The avatar is the server's now.
    expect(avatarSource('Outro')).toEqual({ uri: NEW_URL });
    expect(button('Salvar')).toBeEnabled();

    await press('Salvar');

    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenLastCalledWith({ name: 'Outro' });
    expect(showToast).toHaveBeenCalledWith('Perfil atualizado');
  });

  it('stops at a failed upload, keeps the rest, and resumes from it on retry', async () => {
    mockUpload.mockImplementationOnce(async ({ kind }: { kind: ImageKind }) => {
      sent.push(`upload ${kind}`);
      serverHolds({ avatarUrl: NEW_URL });
      return NEW_URL;
    });
    mockUpload.mockRejectedValueOnce(new ApiError(413, 'too_large', 'too large'));
    await renderScreen();

    await fireEvent.changeText(screen.getByLabelText('Bio'), 'Outra');
    await pick('avatar');
    await pick('banner');
    await press('Salvar');

    expect(await screen.findByText('Imagem inválida ou grande demais. Escolha outra.')).toBeOnTheScreen();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
    // The banner is still the picked one, waiting for the retry.
    expect(bannerSource()).toEqual({ uri: photo.uri });

    await press('Salvar');

    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(sent).toEqual(['upload avatar', 'upload banner', 'patch {"bio":"Outra"}']);
    expect(mockUpload).toHaveBeenCalledTimes(3);
    expect(mockUpload).toHaveBeenNthCalledWith(3, { kind: 'banner', image: photo });
  });

  it('stays open when a removal fails', async () => {
    const error = new NetworkError();
    mockRemove.mockRejectedValueOnce(error);
    mockProfileData = { ...profile, avatarUrl: OLD_AVATAR };
    await renderScreen();

    await press('Alterar foto');
    await press('Remover foto');
    await press('Salvar');

    expect(await screen.findByText(authErrorMessage(error))).toBeOnTheScreen();
    expect(mockBack).not.toHaveBeenCalled();
    expect(button('Salvar')).toBeEnabled();
  });
});

describe('EditProfileScreen discard prompt', () => {
  it('leaves at once from Cancelar when nothing changed', async () => {
    await renderScreen();

    await press('Cancelar');

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Descartar alterações?')).toBeNull();
  });

  it('is armed by a field edit and by a picked image, and blocks the closing gesture', async () => {
    await renderScreen();
    expect(mockPrevent.active).toBe(false);
    expect(gestureEnabled()).toBe(true);

    await fireEvent.changeText(screen.getByLabelText('Bio'), 'Outra bio');
    expect(mockPrevent.active).toBe(true);
    expect(gestureEnabled()).toBe(false);

    await fireEvent.changeText(screen.getByLabelText('Bio'), 'Gosto de RPG');
    expect(mockPrevent.active).toBe(false);
    expect(gestureEnabled()).toBe(true);

    await pick('avatar');
    expect(mockPrevent.active).toBe(true);
    expect(gestureEnabled()).toBe(false);
  });

  it('asks from Cancelar and leaves on Descartar', async () => {
    await renderScreen();
    await fireEvent.changeText(screen.getByLabelText('Nome'), 'Outro');

    await press('Cancelar');

    expect(screen.getByText('Descartar alterações?')).toBeOnTheScreen();
    expect(screen.getByText('Suas alterações não serão salvas.')).toBeOnTheScreen();
    expect(StyleSheet.flatten(screen.getByText('Descartar').props.style).color).toBe(colors.danger);

    await press('Descartar');
    expect(mockRepeat).toHaveBeenCalledTimes(1);
    expect(mockPrevent.active).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('asks on Android back and keeps editing on Continuar editando', async () => {
    const repeat = jest.fn();
    await renderScreen();
    await fireEvent.changeText(screen.getByLabelText('Nome'), 'Outro');

    await act(async () => mockPrevent.callback?.({ data: { action: {} }, repeat }));
    expect(screen.getByText('Descartar alterações?')).toBeOnTheScreen();

    await press('Continuar editando');

    expect(repeat).not.toHaveBeenCalled();
    expect(screen.queryByText('Descartar alterações?')).toBeNull();
    expect(screen.getByLabelText('Nome').props.value).toBe('Outro');
  });

  it('does not ask while saving', async () => {
    mockUpdate.mockReturnValue(new Promise<void>(() => {}));
    await renderScreen();
    await fireEvent.changeText(screen.getByLabelText('Nome'), 'Outro');
    await press('Salvar');

    await act(async () => mockPrevent.callback?.({ data: { action: {} }, repeat: jest.fn() }));

    expect(screen.queryByText('Descartar alterações?')).toBeNull();
  });

  it('is inactive once the save succeeded', async () => {
    await renderScreen();
    await fireEvent.changeText(screen.getByLabelText('Nome'), 'Outro');
    await press('Salvar');

    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(mockPrevent.active).toBe(false);
    expect(gestureEnabled()).toBe(true);
  });
});

describe('Editar perfil presentation', () => {
  const sheet = {
    presentation: 'fullScreenModal',
    animation: 'slide_from_bottom',
    headerShown: false,
  };

  it('opens the route as a full-screen sheet from the bottom, without a header', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <EditProfileRoute />
      </SafeAreaProvider>,
    );

    expect(mockScreenOptions).toContainEqual(sheet);
  });

  it('declares the sheet options in the me stack', async () => {
    await render(<MeLayout />);

    expect(mockLayoutScreens).toContainEqual({ name: 'edit', options: sheet });
  });
});
