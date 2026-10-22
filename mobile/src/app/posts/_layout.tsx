import { Stack } from 'expo-router';

import { Layout } from '@/components';
import { colors } from '@/theme/tokens';

export default function PostsLayout() {
  return (
    <Stack
      screenOptions={{
        header: Layout.Header.renderStackHeader,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
