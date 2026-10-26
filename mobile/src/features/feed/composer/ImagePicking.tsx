import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { ApiError } from '@/lib/http/errors';
import type { UploadableImage } from '@/lib/imageForm';
import { resolveImageUrl } from '@/lib/imageUrl';
import { showToast } from '@/lib/toast';

import { feedApi, type PostImageInput } from '../api';

/** The server takes at most 4 images in a post. */
export const MAX_IMAGES = 4;
const QUALITY = 0.85;

export const PHOTOS_DENIED = 'Permita o acesso às fotos nas configurações';
export const CAMERA_DENIED = 'Permita o acesso à câmera nas configurações';
export const RATE_LIMITED = 'Muitas imagens em pouco tempo, tente de novo em alguns minutos';

/** An image the system picker returned: what to upload, and its shape for the preview. */
export type PickedAsset = UploadableImage & { width: number; height: number };

function toAssets(result: ImagePicker.ImagePickerResult): PickedAsset[] {
  if (result.canceled) return [];
  return result.assets.map((asset) => ({
    uri: asset.uri,
    mimeType: asset.mimeType ?? 'image/jpeg',
    fileName: asset.fileName ?? 'image.jpg',
    width: asset.width,
    height: asset.height,
  }));
}

/**
 * Opens the system gallery for up to `limit` images. Android's photo picker needs no permission
 * (on API 30-32 asking would request storage access and may report a denial), so only the other
 * platforms ask. A denial shows a toast and resolves to no images, like a cancel.
 */
export async function pickFromGallery(limit: number): Promise<PickedAsset[]> {
  if (limit <= 0) return [];
  if (Platform.OS !== 'android') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showToast(PHOTOS_DENIED);
      return [];
    }
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    quality: QUALITY,
  });
  // Some pickers ignore the selection limit.
  return toAssets(result).slice(0, limit);
}

/** Opens the camera for one photo; a denied permission shows a toast and resolves to nothing. */
export async function takePhoto(): Promise<PickedAsset[]> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    showToast(CAMERA_DENIED);
    return [];
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: QUALITY,
  });
  return toAssets(result).slice(0, 1);
}

export type ImageStatus = 'uploading' | 'done' | 'failed';

/** An image attached to the post being written. */
export type ComposerImage = {
  id: string;
  /** What the thumbnail shows: the local file, or the server's URL for a restored draft. */
  uri: string;
  width: number;
  height: number;
  status: ImageStatus;
  /** Set once uploaded: what `create` takes. */
  image: PostImageInput | null;
  /** What to upload again on retry; a restored image is already uploaded. */
  source: UploadableImage | null;
};

let nextId = 0;

function restored(image: PostImageInput): ComposerImage {
  nextId += 1;
  return {
    id: `restored-${nextId}`,
    uri: resolveImageUrl(image.url) ?? image.url,
    width: image.width,
    height: image.height,
    status: 'done',
    image,
    source: null,
  };
}

function fromAsset(asset: PickedAsset): ComposerImage {
  nextId += 1;
  return {
    id: `picked-${nextId}`,
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    status: 'uploading',
    image: null,
    source: {
      uri: asset.uri,
      mimeType: asset.mimeType,
      fileName: asset.fileName,
    },
  };
}

/**
 * The images of the post being written: each one uploads as soon as it is added, and can fail,
 * be retried or be removed (an upload still in flight is then ignored when it ends).
 */
export function useComposerImages(initial: PostImageInput[]) {
  const [items, setItems] = useState<ComposerImage[]>(() => initial.map(restored));
  // The latest list, so that adding twice before a render still respects the limit.
  const latest = useRef(items);
  // The attempt each in-flight upload belongs to; a missing or newer one makes a result stale.
  const attempts = useRef(new Map<string, number>());
  const counter = useRef(0);

  const commit = useCallback((update: (list: ComposerImage[]) => ComposerImage[]) => {
    latest.current = update(latest.current);
    setItems(latest.current);
  }, []);

  const patch = useCallback(
    (id: string, changes: Partial<ComposerImage>) =>
      commit((list) => list.map((item) => (item.id === id ? { ...item, ...changes } : item))),
    [commit],
  );

  useEffect(() => {
    const pending = attempts.current;
    return () => pending.clear();
  }, []);

  const upload = useCallback(
    async (id: string, source: UploadableImage) => {
      counter.current += 1;
      const attempt = counter.current;
      attempts.current.set(id, attempt);
      patch(id, { status: 'uploading' });
      try {
        const image = await feedApi.uploadPostImage(source);
        if (attempts.current.get(id) !== attempt) return;
        attempts.current.delete(id);
        patch(id, { status: 'done', image });
      } catch (error) {
        if (attempts.current.get(id) !== attempt) return;
        attempts.current.delete(id);
        if (error instanceof ApiError && error.status === 429) showToast(RATE_LIMITED);
        patch(id, { status: 'failed' });
      }
    },
    [patch],
  );

  const add = useCallback(
    (assets: PickedAsset[]) => {
      const room = MAX_IMAGES - latest.current.length;
      const accepted = assets.slice(0, Math.max(room, 0)).map(fromAsset);
      if (accepted.length === 0) return;
      commit((list) => [...list, ...accepted]);
      for (const item of accepted) if (item.source) void upload(item.id, item.source);
    },
    [commit, upload],
  );

  const remove = useCallback(
    (id: string) => {
      attempts.current.delete(id);
      commit((list) => list.filter((item) => item.id !== id));
    },
    [commit],
  );

  const retry = useCallback(
    (id: string) => {
      const item = latest.current.find((candidate) => candidate.id === id);
      if (item?.status === 'failed' && item.source) void upload(id, item.source);
    },
    [upload],
  );

  const uploaded = items.flatMap((item) => (item.image ? [item.image] : []));
  return {
    items,
    /** In order, only those that finished uploading. */
    uploaded,
    uploading: items.some((item) => item.status === 'uploading'),
    failed: items.some((item) => item.status === 'failed'),
    full: items.length >= MAX_IMAGES,
    remaining: MAX_IMAGES - items.length,
    add,
    remove,
    retry,
  };
}
