import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { showToast } from '@/lib/toast';

import type { ImageKind, PickedImage } from './types';

/** Where the image comes from: the system gallery or a new photo. */
export type ImageSource = 'library' | 'camera';

const ASPECT: Record<ImageKind, [number, number]> = { avatar: [1, 1], banner: [3, 1] };
const QUALITY = 0.85;

export const CAMERA_DENIED = 'Permita o acesso à câmera nas configurações.';
export const PHOTOS_DENIED = 'Permita o acesso às fotos para escolher uma imagem.';

/** Whether the app may open the source; a denial shows how to allow it. */
async function allowed(source: ImageSource): Promise<boolean> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) showToast(CAMERA_DENIED);
    return permission.granted;
  }
  // Android's photo picker needs no permission (on API 30-32 asking would request storage
  // access and may report a denial), so only the other platforms ask.
  if (Platform.OS === 'android') return true;
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) showToast(PHOTOS_DENIED);
  return permission.granted;
}

/**
 * Opens the system gallery or the camera for one image and lets the user crop it (3:1 for the
 * banner, square for the avatar). Resolves to null when the user cancels or denies access; a
 * denial shows a toast.
 */
export async function pickImage(
  kind: ImageKind,
  source: ImageSource = 'library',
): Promise<PickedImage | null> {
  if (!(await allowed(source))) return null;
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: ASPECT[kind],
    quality: QUALITY,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  if (asset === undefined) return null;
  return {
    uri: asset.uri,
    mimeType: asset.mimeType ?? 'image/jpeg',
    fileName: asset.fileName ?? 'image.jpg',
    size: asset.fileSize ?? null,
  };
}
