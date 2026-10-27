import { Stack } from 'expo-router';

import { Layout } from '@/components';
import { colors } from '@/theme/tokens';

/** A link straight to a sub-screen still has the main screen underneath, so back lands there. */
export const unstable_settings = { initialRouteName: 'index' };

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        header: Layout.Header.renderStackHeader,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Configurações' }} />
      <Stack.Screen name="account" options={{ title: 'Conta' }} />
      <Stack.Screen name="password" options={{ title: 'Trocar senha' }} />
      <Stack.Screen name="delete-account" options={{ title: 'Excluir conta' }} />
      <Stack.Screen name="privacy" options={{ title: 'Privacidade' }} />
      <Stack.Screen name="muted" options={{ title: 'Contas silenciadas' }} />
      <Stack.Screen name="blocked" options={{ title: 'Contas bloqueadas' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notificações' }} />
      <Stack.Screen name="accessibility" options={{ title: 'Acessibilidade' }} />
      <Stack.Screen name="library" options={{ title: 'Biblioteca' }} />
      <Stack.Screen name="about" options={{ title: 'Sobre' }} />
    </Stack>
  );
}
