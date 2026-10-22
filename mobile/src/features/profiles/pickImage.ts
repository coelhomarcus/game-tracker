import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import type { ImageKind, PickedImage } from './types';

const ASPECT: Record<ImageKind, [number, number]> = { avatar: [1, 1], banner: [3, 1] };
const QUALITY = 0.85;

/**
 * Opens the system gallery for one image and lets the user crop it. Resolves to null when the
 * user cancels or denies access to the photos; `onPermissionDenied` is called in the latter case.
 * Android's photo picker needs no permission (on API 30-32 asking would request storage access
 * and may report a denial), so only the other platforms ask.
 */
export async function pickImage(
  kind: ImageKind,
  onPermissionDenied?: () => void,
): Promise<PickedImage | null> {
  if (Platform.OS !== 'android') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      onPermissionDenied?.();
      return null;
    }
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: ASPECT[kind],
    quality: QUALITY,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (asset === undefined) return null;
  return {
    uri: asset.uri,
    mimeType: asset.mimeType ?? 'image/jpeg',
    fileName: asset.fileName ?? 'image.jpg',
    size: asset.fileSize ?? null,
  };
}
