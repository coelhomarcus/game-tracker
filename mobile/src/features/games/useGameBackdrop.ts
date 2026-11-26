import { useState } from 'react';

import { resolveImageUrl } from '@/lib/imageUrl';

import type { Game } from './types';

export function useGameBackdrop({ screenshots, coverUrl }: Pick<Game, 'screenshots' | 'coverUrl'>) {
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const screenshot = screenshots
    .map((url) => resolveImageUrl(url))
    .find((uri) => uri !== null && !failedImages.includes(uri));
  const cover = resolveImageUrl(coverUrl);
  const uri = screenshot ?? (cover !== null && !failedImages.includes(cover) ? cover : null);

  function onError() {
    if (uri !== null) {
      setFailedImages((images) => (images.includes(uri) ? images : [...images, uri]));
    }
  }

  return { uri, isScreenshot: screenshot != null, onError };
}
