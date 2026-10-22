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
        {/* The app always draws edge-to-edge (Android 16). Without these flags the keyboard
            controller cannot always detect it and pads the content under the system bars. */}
        <KeyboardProvider statusBarTranslucent navigationBarTranslucent preserveEdgeToEdge>
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
