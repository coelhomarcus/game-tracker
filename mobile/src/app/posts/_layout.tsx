import { Stack } from 'expo-router';

import { Layout } from '@/components';
import { COMPOSER_ROUTE, COMPOSER_SCREEN_OPTIONS } from '@/features/feed/composer/presentation';
import { colors } from '@/theme/tokens';

export default function PostsLayout() {
  return (
    <Stack
      screenOptions={{
        header: Layout.Header.renderStackHeader,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name={COMPOSER_ROUTE} options={COMPOSER_SCREEN_OPTIONS} />
    </Stack>
  );
}
