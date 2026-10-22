import { Stack } from 'expo-router';

import { colors } from '@/theme/tokens';

export default function MeLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.chrome },
        headerTintColor: colors.textStrong,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
