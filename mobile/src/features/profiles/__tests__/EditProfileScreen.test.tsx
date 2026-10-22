import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { authErrorMessage, useSession } from '@/features/auth';
import { ApiError, NetworkError } from '@/lib/http/errors';
import { showToast } from '@/lib/toast';

import { EditProfileScreen } from '../EditProfileScreen';
import { pickImage } from '../pickImage';
import { useProfile, useUpdateProfile, useUploadImage } from '../queries';
import type { PickedImage, UserProfile } from '../types';

jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('../pickImage', () => ({ pickImage: jest.fn() }));
jest.mock('../queries', () => ({
  useProfile: jest.fn(),
  useUpdateProfile: jest.fn(),
  useUploadImage: jest.fn(),
}));

const mockBack = jest.fn();
const mockDisablePrevention = jest.fn();
const mockPrevent: {
  active: boolean;
  callback?: (options: { data: { action: unknown }; repeat: () => void }) => void;
} = { active: false };

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  usePreventRemove: (active: boolean, callback: typeof mockPrevent.callback) => {
    mockPrevent.active = active;
    mockPrevent.callback = callback;
    return mockDisablePrevention;
  },
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
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
};

const photo: PickedImage = {
  uri: 'file:///tmp/photo.jpg',
  mimeType: 'image/jpeg',
  fileName: 'photo.jpg',
  size: 1024,
};

const mockUpdate = jest.fn();
const mockUpload = jest.fn();
let mockProfileData: UserProfile | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  mockPrevent.active = false;
  mockProfileData = profile;
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
  mockUpdate.mockResolvedValue(undefined);
  mockUpload.mockResolvedValue('https://img.example.com/new.jpg');
  jest.mocked(useProfile).mockImplementation(() => ({ data: mockProfileData }) as never);
  jest.mocked(useUpdateProfile).mockReturnValue({ mutateAsync: mockUpdate } as never);
  jest.mocked(useUploadImage).mockReturnValue({ mutateAsync: mockUpload } as never);
});

async function renderScreen() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <EditProfileScreen />
    </SafeAreaProvider>,
  );
}

async function press(name: string) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

describe('EditProfileScreen form', () => {
  it('starts with the profile values and the exact copy', async () => {
    await renderScreen();

    expect(screen.getByText('Fotos')).toBeOnTheScreen();
    expect(screen.getByText('Salvas ao confirmar o recorte.')).toBeOnTheScreen();
    expect(screen.getByText('Informações')).toBeOnTheScreen();
    expect(screen.getByText('Salvas no botão Salvar alterações.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Nome').props.value).toBe('Ana Souza');
    expect(screen.getByLabelText('Username').props.value).toBe('ana');
    expect(screen.getByLabelText('Bio').props.value).toBe('Gosto de RPG');
    expect(screen.getByText('Letras, números e _')).toBeOnTheScreen();
    expect(screen.getByText('12/280')).toBeOnTheScreen();
  });

  it('falls back to the session user while the profile is not loaded', async () => {
    mockProfileData = undefined;
    await renderScreen();

    expect(screen.getByLabelText('Nome').props.value).toBe('Ana Souza');
    expect(screen.getByLabelText('Username').props.value).toBe('ana');
  });

  it('sends only the changed fields, trimmed, then confirms and goes back', async () => {
    await renderScreen();

    await fireEvent.changeText(screen.getByLabelText('Nome'), '  Ana Maria  ');
    await press('Salvar alterações');

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({ name: 'Ana Maria' });
    expect(showToast).toHaveBeenCalledWith('Perfil atualizado');
    expect(mockDisablePrevention).toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('sends a blank bio as an empty string', async () => {
    await renderScreen();

    await fireEvent.changeText(screen.getByLabelText('Bio'), '   ');
    await press('Salvar alterações');

    expect(mockUpdate).toHaveBeenCalledWith({ bio: '' });
  });

  it('goes back without a request when nothing changed', async () => {
    await renderScreen();

    await fireEvent.changeText(screen.getByLabelText('Username'), 'ana ');
    await press('Salvar alterações');

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('shows validation messages without a request', async () => {
    await renderScreen();

    await fireEvent.changeText(screen.getByLabelText('Nome'), '   ');
    await fireEvent.changeText(screen.getByLabelText('Username'), 'a-b');
    await press('Salvar alterações');

    expect(screen.getByText('Informe seu nome')).toBeOnTheScreen();
    expect(screen.getByText('Use apenas letras, números e _')).toBeOnTheScreen();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('maps a 409 to the username field and stays on the screen', async () => {
    mockUpdate.mockRejectedValue(new ApiError(409, 'conflict', 'taken'));
    await renderScreen();

    await fireEvent.changeText(screen.getByLabelText('Username'), 'ana2');
    await press('Salvar alterações');

    expect(await screen.findByText('Esse username já está em uso')).toBeOnTheScreen();
    expect(mockBack).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('shows other save errors above the button', async () => {
    const error = new NetworkError();
    mockUpdate.mockRejectedValue(error);
    await renderScreen();

    await fireEvent.changeText(screen.getByLabelText('Nome'), 'Outro');
    await press('Salvar alterações');

    expect(await screen.findByText(authErrorMessage(error))).toBeOnTheScreen();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('tells the user to wait when saving during an upload', async () => {
    jest.mocked(pickImage).mockResolvedValue(photo);
    mockUpload.mockReturnValue(new Promise(() => {}));
    await renderScreen();

    await fireEvent.changeText(screen.getByLabelText('Nome'), 'Outro');
    await press('Alterar foto');
    await press('Salvar alterações');

    expect(screen.getByText('Aguarde o envio da imagem terminar.')).toBeOnTheScreen();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });
});

describe('EditProfileScreen photos', () => {
  it('uploads the avatar right after picking and shows the new picture', async () => {
    jest.mocked(pickImage).mockResolvedValue(photo);
    await renderScreen();

    await press('Alterar foto');

    expect(pickImage).toHaveBeenCalledWith('avatar', expect.any(Function));
    expect(mockUpload).toHaveBeenCalledWith({ kind: 'avatar', image: photo });
    expect(showToast).toHaveBeenCalledWith('Foto atualizada');
    expect(screen.getByLabelText('Ana Souza').props.source).toEqual({
      uri: 'https://img.example.com/new.jpg',
    });
  });

  it('uploads the banner and shows the new cover', async () => {
    jest.mocked(pickImage).mockResolvedValue(photo);
    await renderScreen();

    await press('Alterar capa');

    expect(pickImage).toHaveBeenCalledWith('banner', expect.any(Function));
    expect(mockUpload).toHaveBeenCalledWith({ kind: 'banner', image: photo });
    expect(showToast).toHaveBeenCalledWith('Capa atualizada');
    expect(screen.getByLabelText('Capa').props.source).toEqual({
      uri: 'https://img.example.com/new.jpg',
    });
  });

  it('does nothing when the picker is cancelled', async () => {
    jest.mocked(pickImage).mockResolvedValue(null);
    await renderScreen();

    await press('Alterar foto');

    expect(mockUpload).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('shows progress over the preview and disables both buttons while uploading', async () => {
    jest.mocked(pickImage).mockResolvedValue(photo);
    let finish: (url: string) => void = () => {};
    mockUpload.mockReturnValue(new Promise<string>((resolve) => (finish = resolve)));
    await renderScreen();

    await press('Alterar capa');

    expect(screen.getByText('Enviando imagem…')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Alterar capa' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Alterar foto' })).toBeDisabled();

    await act(async () => finish('https://img.example.com/new.jpg'));

    expect(screen.queryByText('Enviando imagem…')).toBeNull();
    expect(screen.getByRole('button', { name: 'Alterar capa' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Alterar foto' })).toBeEnabled();
  });

  it('refuses a 9 MB image without uploading', async () => {
    jest.mocked(pickImage).mockResolvedValue({ ...photo, size: 9 * 1024 * 1024 });
    await renderScreen();

    await press('Alterar foto');

    expect(screen.getByText('A imagem passa de 8 MB. Escolha uma menor.')).toBeOnTheScreen();
    expect(mockUpload).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('uploads an image whose size is unknown', async () => {
    jest.mocked(pickImage).mockResolvedValue({ ...photo, size: null });
    await renderScreen();

    await press('Alterar foto');

    expect(mockUpload).toHaveBeenCalledTimes(1);
  });

  it('shows the failure and retries the same image', async () => {
    const error = new NetworkError();
    mockProfileData = { ...profile, avatarUrl: 'https://img.example.com/old.jpg' };
    jest.mocked(pickImage).mockResolvedValue(photo);
    mockUpload.mockRejectedValueOnce(error);
    await renderScreen();

    await press('Alterar foto');

    expect(screen.getByText(authErrorMessage(error))).toBeOnTheScreen();
    expect(showToast).not.toHaveBeenCalled();
    // The failed upload leaves the picture the profile already had.
    expect(screen.getByLabelText('Ana Souza').props.source).toEqual({
      uri: 'https://img.example.com/old.jpg',
    });

    await press('Tentar de novo');

    expect(pickImage).toHaveBeenCalledTimes(1);
    expect(mockUpload).toHaveBeenCalledTimes(2);
    expect(mockUpload).toHaveBeenLastCalledWith({ kind: 'avatar', image: photo });
    expect(showToast).toHaveBeenCalledWith('Foto atualizada');
    expect(screen.getByLabelText('Ana Souza').props.source).toEqual({
      uri: 'https://img.example.com/new.jpg',
    });
    expect(screen.queryByText(authErrorMessage(error))).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull();
  });

  it('explains how to allow access when the permission is denied', async () => {
    jest.mocked(pickImage).mockImplementation(async (_kind, onDenied) => {
      onDenied?.();
      return null;
    });
    await renderScreen();

    await press('Alterar foto');

    expect(screen.getByText('Permita o acesso às fotos para escolher uma imagem.')).toBeOnTheScreen();
    expect(mockUpload).not.toHaveBeenCalled();
  });
});

describe('EditProfileScreen discard guard', () => {
  it('is inactive until a text field differs from the initial value', async () => {
    await renderScreen();
    expect(mockPrevent.active).toBe(false);

    await fireEvent.changeText(screen.getByLabelText('Bio'), 'Outra bio');
    expect(mockPrevent.active).toBe(true);

    await fireEvent.changeText(screen.getByLabelText('Bio'), 'Gosto de RPG');
    expect(mockPrevent.active).toBe(false);
  });

  it('does not count uploads', async () => {
    jest.mocked(pickImage).mockResolvedValue(photo);
    await renderScreen();

    await press('Alterar foto');

    expect(mockPrevent.active).toBe(false);
  });

  it('asks before discarding and leaves on confirmation', async () => {
    const repeat = jest.fn();
    await renderScreen();
    await fireEvent.changeText(screen.getByLabelText('Nome'), 'Outro');

    await act(async () => mockPrevent.callback?.({ data: { action: {} }, repeat }));

    expect(screen.getByText('Descartar alterações?')).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Nome, username e bio não foram salvos. Fotos que você já enviou continuam salvas.',
      ),
    ).toBeOnTheScreen();

    await press('Descartar');
    expect(repeat).toHaveBeenCalledTimes(1);
  });

  it('keeps editing when the dialog is dismissed', async () => {
    const repeat = jest.fn();
    await renderScreen();
    await fireEvent.changeText(screen.getByLabelText('Nome'), 'Outro');
    await act(async () => mockPrevent.callback?.({ data: { action: {} }, repeat }));

    await press('Continuar editando');

    expect(repeat).not.toHaveBeenCalled();
    expect(screen.queryByText('Descartar alterações?')).toBeNull();
    expect(screen.getByLabelText('Nome').props.value).toBe('Outro');
  });

  it('is inactive once the save succeeded', async () => {
    await renderScreen();
    await fireEvent.changeText(screen.getByLabelText('Nome'), 'Outro');
    await press('Salvar alterações');

    expect(mockPrevent.active).toBe(false);
  });
});
