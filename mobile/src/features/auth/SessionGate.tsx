import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, EmptyState } from '@/components';
import { useSession } from '@/features/auth';
import { colors, space } from '@/theme/tokens';

export function SessionGate() {
  const status = useSession((state) => state.status);
  const bootstrap = useSession((state) => state.bootstrap);
  const signOut = useSession((state) => state.signOut);
  const started = useRef(false);
  const retrying = useRef(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    // The ref survives StrictMode's simulated remount, so bootstrap runs once per app start.
    if (started.current) return;
    started.current = true;
    void bootstrap();
  }, [bootstrap]);

  async function retry() {
    if (retrying.current) return;
    retrying.current = true;
    setPending(true);
    try {
      await bootstrap();
    } finally {
      retrying.current = false;
      setPending(false);
    }
  }

  if (status === 'restoring') {
    return (
      <View style={styles.center}>
        <ActivityIndicator accessibilityLabel="Carregando" size="large" color={colors.accent} />
      </View>
    );
  }

  if (status === 'unreachable') {
    return (
      <View style={styles.center}>
        <EmptyState
          title="Não foi possível conectar"
          message="Sua sessão está guardada. Verifique a conexão e tente de novo."
        />
        <Button label="Tentar novamente" variant="secondary" loading={pending} onPress={() => void retry()} />
        <Button label="Sair da conta" variant="secondary" onPress={() => void signOut()} />
      </View>
    );
  }

  const signedIn = status === 'signedIn';
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.textStrong },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ title: '', headerBackButtonDisplayMode: 'minimal' }} />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, backgroundColor: colors.bg },
});
