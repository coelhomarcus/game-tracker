import { Stack } from 'expo-router';

import { Composer } from '@/features/feed/composer/Composer';
import { COMPOSER_SCREEN_OPTIONS } from '@/features/feed/composer/presentation';

export default function NewPostScreen() {
  return (
    <>
      <Stack.Screen options={COMPOSER_SCREEN_OPTIONS} />
      <Composer />
    </>
  );
}
