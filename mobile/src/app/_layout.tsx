import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastHost } from '@/components';
import { queryClient } from '@/features/auth';
import { SessionGate } from '@/features/auth/SessionGate';
import { colors } from '@/theme/tokens';

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <View style={{ flex: 1, backgroundColor: colors.bg }}>
            <StatusBar style="light" />
            <SessionGate />
            <ToastHost />
          </View>
        </KeyboardProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
