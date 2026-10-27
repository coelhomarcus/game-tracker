import { Stack } from 'expo-router';

import { Layout } from '@/components';
import { EDIT_PROFILE_SCREEN_OPTIONS } from '@/features/profiles/edit/presentation';
import { colors } from '@/theme/tokens';

export default function MeLayout() {
  return (
    <Stack
      screenOptions={{
        header: Layout.Header.renderStackHeader,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="edit" options={EDIT_PROFILE_SCREEN_OPTIONS} />
    </Stack>
  );
}
