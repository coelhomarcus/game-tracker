import { Pressable, StyleSheet, View } from 'react-native';

import { HeaderBell, Layout, TabBar } from '@/components';
import { colors } from '@/theme/tokens';

import { HomeHeaderLeft } from './HomeHeaderLeft';
import type { FeedScope } from './types';

export const FEED_SCOPES: { value: FeedScope; label: string }[] = [
  { value: 'general', label: 'Para você' },
  { value: 'following', label: 'Seguindo' },
];

export type HomeHeaderProps = {
  scope: FeedScope;
  onSelectScope: (scope: FeedScope) => void;
  /** The title and the selected scope's tab take the feed back to the top. */
  onScrollToTop: () => void;
};

/**
 * The Início header, drawn by the screen itself so it can hide on scroll: avatar, title and bell
 * over the feed's scope tabs. It pads the status bar like every `Layout.Header`.
 */
export function HomeHeader({ scope, onSelectScope, onScrollToTop }: HomeHeaderProps) {
  return (
    <View testID="home-header" style={styles.header}>
      <Layout.Header.Outer noBottomBorder>
        <Layout.Header.LeftItems>
          <HomeHeaderLeft />
        </Layout.Header.LeftItems>
        <Layout.Header.Content>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Início"
            accessibilityHint="Volta ao topo do feed"
            onPress={onScrollToTop}
            style={styles.title}
          >
            <Layout.Header.TitleText>Início</Layout.Header.TitleText>
          </Pressable>
        </Layout.Header.Content>
        <Layout.Header.RightItems>
          <HeaderBell />
        </Layout.Header.RightItems>
      </Layout.Header.Outer>
      <TabBar items={FEED_SCOPES} selected={scope} onSelect={onSelectScope} onReselect={onScrollToTop} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.bg },
  title: { minHeight: Layout.Header.HEADER_TOUCH_SIZE, justifyContent: 'center' },
});
