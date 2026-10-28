import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastHost } from '@/components';
import { queryClient } from '@/features/auth';
import { SessionGate } from '@/features/auth/SessionGate';
import { colors } from '@/theme/tokens';

// Keep the native splash up until the fonts are ready; the layout hides it once.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  // A font error must not block the app: it renders with the system font instead.
  const ready = fontsLoaded || fontError != null;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        {/* The app always draws edge-to-edge (Android 16). Without these flags the keyboard
            controller cannot always detect it and pads the content under the system bars. */}
        <KeyboardProvider statusBarTranslucent navigationBarTranslucent preserveEdgeToEdge>
          {/* Swipeable rows (the conversation list) need the gesture handler's root. */}
          <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
            <StatusBar style="light" />
            <SessionGate />
            <ToastHost />
          </GestureHandlerRootView>
        </KeyboardProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
