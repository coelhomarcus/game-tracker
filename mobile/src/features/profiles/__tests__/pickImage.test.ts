import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { pickImage } from '../pickImage';

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const permission = jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync);
const launch = jest.mocked(ImagePicker.launchImageLibraryAsync);

beforeEach(() => {
  jest.clearAllMocks();
  permission.mockResolvedValue({ granted: true } as never);
});

describe('pickImage', () => {
  it('opens the picker for images only, cropped to a square for the avatar', async () => {
    launch.mockResolvedValue({ canceled: true, assets: null });

    await pickImage('avatar');

    expect(launch).toHaveBeenCalledWith({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
  });

  it('crops the banner to 3:1', async () => {
    launch.mockResolvedValue({ canceled: true, assets: null });

    await pickImage('banner');

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

    it('opens the picker without asking for the media library permission', async () => {
      permission.mockResolvedValue({ granted: false } as never);
      launch.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///a.png', mimeType: 'image/png', fileName: 'a.png' }],
      } as never);
      const onDenied = jest.fn();

      await expect(pickImage('avatar', onDenied)).resolves.toMatchObject({ uri: 'file:///a.png' });

      expect(permission).not.toHaveBeenCalled();
      expect(onDenied).not.toHaveBeenCalled();
    });
  });

  it('reports a denied permission and never opens the picker', async () => {
    permission.mockResolvedValue({ granted: false } as never);
    const onDenied = jest.fn();

    await expect(pickImage('avatar', onDenied)).resolves.toBeNull();

    expect(onDenied).toHaveBeenCalledTimes(1);
    expect(launch).not.toHaveBeenCalled();
  });
});
