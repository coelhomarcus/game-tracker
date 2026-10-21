import { Stack } from 'expo-router';

import { CreatePostScreen } from '@/features/feed/CreatePostScreen';

export default function NewPostScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Nova publicação' }} />
      <CreatePostScreen />
    </>
  );
}
