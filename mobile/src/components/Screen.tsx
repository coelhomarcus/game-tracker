import { BottomTabBarHeightContext } from 'expo-router/tabs';
import { useContext, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, space } from '@/theme/tokens';

export type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  /**
   * Pads the content below the status bar. Only screens without a navigation header need it:
   * the header already covers the status bar, so padding again leaves a gap under it.
   */
  topInset?: boolean;
};

/**
 * The screen's safe-area edges. The top belongs to the header (unless there is none), and the
 * bottom belongs to the tab bar inside the tabs, which already extends under the gesture bar.
 */
function screenEdges(topInset: boolean, insideTabs: boolean): Edge[] {
  const edges: Edge[] = ['left', 'right'];
  if (topInset) edges.push('top');
  if (!insideTabs) edges.push('bottom');
  return edges;
}

export function Screen({ children, scroll = false, topInset = false }: ScreenProps) {
  const insideTabs = useContext(BottomTabBarHeightContext) !== undefined;
  return (
    <SafeAreaView style={styles.safe} edges={screenEdges(topInset, insideTabs)}>
      {scroll ? (
        // Scrolls the focused field above the keyboard (Android draws edge-to-edge, so the
        // window no longer shrinks when the keyboard opens).
        <KeyboardAwareScrollView
          bottomOffset={space.lg}
          style={styles.fill}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </KeyboardAwareScrollView>
      ) : (
        <View style={styles.fill}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  scrollContent: { flexGrow: 1 },
});
