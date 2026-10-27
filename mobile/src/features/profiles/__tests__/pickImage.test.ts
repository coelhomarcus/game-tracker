import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { showToast } from '@/lib/toast';

import { pickImage } from '../pickImage';

jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));

const permission = jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync);
const cameraPermission = jest.mocked(ImagePicker.requestCameraPermissionsAsync);
const launch = jest.mocked(ImagePicker.launchImageLibraryAsync);
const camera = jest.mocked(ImagePicker.launchCameraAsync);

beforeEach(() => {
  jest.clearAllMocks();
  permission.mockResolvedValue({ granted: true } as never);
  cameraPermission.mockResolvedValue({ granted: true } as never);
});

describe('pickImage', () => {
  it('opens the gallery by default for images only, cropped to a square for the avatar', async () => {
    launch.mockResolvedValue({ canceled: true, assets: null });

    await pickImage('avatar');

    expect(launch).toHaveBeenCalledWith({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    expect(camera).not.toHaveBeenCalled();
  });

  it('crops the banner to 3:1', async () => {
    launch.mockResolvedValue({ canceled: true, assets: null });

    await pickImage('banner', 'library');

    expect(launch).toHaveBeenCalledWith(expect.objectContaining({ aspect: [3, 1] }));
  });

  it('maps the chosen asset', async () => {
    launch.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///a.png', mimeType: 'image/png', fileName: 'a.png', fileSize: 2048 },
      ],
    } as never);

    await expect(pickImage('avatar')).resolves.toEqual({
      uri: 'file:///a.png',
      mimeType: 'image/png',
      fileName: 'a.png',
      size: 2048,
    });
  });

  it('fills in the defaults for missing asset details', async () => {
    launch.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///a' }] } as never);

    await expect(pickImage('avatar')).resolves.toEqual({
      uri: 'file:///a',
      mimeType: 'image/jpeg',
      fileName: 'image.jpg',
      size: null,
    });
  });

  it('returns null when cancelled', async () => {
    launch.mockResolvedValue({ canceled: true, assets: null });

    await expect(pickImage('avatar')).resolves.toBeNull();
  });

  describe('on Android', () => {
    const originalOS = Platform.OS;
    beforeEach(() => {
      Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    });
    afterEach(() => {
      Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
    });

    it('opens the gallery without asking for the media library permission', async () => {
      permission.mockResolvedValue({ granted: false } as never);
      launch.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///a.png', mimeType: 'image/png', fileName: 'a.png' }],
      } as never);

      await expect(pickImage('avatar')).resolves.toMatchObject({ uri: 'file:///a.png' });

      expect(permission).not.toHaveBeenCalled();
      expect(showToast).not.toHaveBeenCalled();
    });

    it('still asks for the camera permission', async () => {
      camera.mockResolvedValue({ canceled: true, assets: null });

      await pickImage('avatar', 'camera');

      expect(cameraPermission).toHaveBeenCalledTimes(1);
    });
  });

  it('explains how to allow the photos and never opens the gallery when denied', async () => {
    permission.mockResolvedValue({ granted: false } as never);

    await expect(pickImage('avatar')).resolves.toBeNull();

    expect(showToast).toHaveBeenCalledWith('Permita o acesso às fotos para escolher uma imagem.');
    expect(launch).not.toHaveBeenCalled();
  });

  it('takes a photo with the camera, cropped like the gallery', async () => {
    camera.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///shot.jpg', mimeType: 'image/jpeg', fileName: 'shot.jpg', fileSize: 10 }],
    } as never);

    await expect(pickImage('banner', 'camera')).resolves.toEqual({
      uri: 'file:///shot.jpg',
      mimeType: 'image/jpeg',
      fileName: 'shot.jpg',
      size: 10,
    });

    expect(cameraPermission).toHaveBeenCalledTimes(1);
    expect(camera).toHaveBeenCalledWith({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 1],
      quality: 0.85,
    });
    expect(launch).not.toHaveBeenCalled();
  });

  it('explains how to allow the camera and never opens it when denied', async () => {
    cameraPermission.mockResolvedValue({ granted: false } as never);

    await expect(pickImage('avatar', 'camera')).resolves.toBeNull();

    expect(showToast).toHaveBeenCalledWith('Permita o acesso à câmera nas configurações.');
    expect(camera).not.toHaveBeenCalled();
  });
});
