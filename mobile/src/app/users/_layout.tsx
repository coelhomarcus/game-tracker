import { Stack } from 'expo-router';

import { Layout } from '@/components';
import { colors } from '@/theme/tokens';

export default function UsersLayout() {
  return (
    <Stack
      screenOptions={{
        header: Layout.Header.renderStackHeader,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      {/* The profile draws its own back button over the banner. */}
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
      {/* The follows lists keep the normal header; the screens add the "@usuario" subtitle. */}
      <Stack.Screen name="[id]/followers" options={{ title: 'Seguidores' }} />
      <Stack.Screen name="[id]/following" options={{ title: 'Seguindo' }} />
    </Stack>
  );
}
