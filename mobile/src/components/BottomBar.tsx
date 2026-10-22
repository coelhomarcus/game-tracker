import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/tabs';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { useSession } from '@/features/auth';
import { displayName } from '@/features/feed/types';
import { haptic } from '@/lib/haptics';
import { resolveImageUrl } from '@/lib/imageUrl';
import { colors, hairline } from '@/theme/tokens';
import { Avatar } from './Avatar';
import { CountBadge } from './CountBadge';
import { PressableScale } from './PressableScale';

type IconName = ComponentProps<typeof Ionicons>['name'];

const ICON_SIZE = 28;
const AVATAR_SIZE = 25;
const AVATAR_RING = 1;
const BAR_PADDING_HORIZONTAL = 8;
const MIN_BOTTOM_PADDING = 15;
const MAX_BOTTOM_PADDING = 60;
/** Minimum touch target; the tab is a real box this tall (hitSlop past the parent is lost on Android). */
const TAB_MIN_HEIGHT = 48;
/** Press feedback of a tab, as in the design reference. */
const PRESSED_SCALE = 0.8;

const icons: Record<string, { active: IconName; inactive: IconName }> = {
  index: { active: 'home', inactive: 'home-outline' },
  library: { active: 'library', inactive: 'library-outline' },
  explore: { active: 'search', inactive: 'search-outline' },
  messages: { active: 'chatbubble', inactive: 'chatbubble-outline' },
};

const PROFILE_ROUTE = 'profile';

function ProfileAvatar({ active }: { active: boolean }) {
  const user = useSession((state) => state.user);
  return (
    <View testID="profile-avatar-ring" style={[styles.avatarRing, { borderColor: active ? colors.text : 'transparent' }]}>
      <Avatar
        uri={resolveImageUrl(user?.avatarUrl)}
        name={user ? displayName(user) : 'Perfil'}
        size={AVATAR_SIZE}
      />
    </View>
  );
}

/** The icon-only tab bar: same events and navigation as the default bar, with count badges. */
export function BottomBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const bottomInset = Math.min(Math.max(insets.bottom, MIN_BOTTOM_PADDING), MAX_BOTTOM_PADDING);

  return (
    <View testID="bottom-bar" role="tablist" style={[styles.bar, { paddingBottom: bottomInset }]}>
      {state.routes.map((route, index) => {
        const focused = index === state.index;
        const { options } = descriptors[route.key];
        const label = options.tabBarAccessibilityLabel ?? options.title ?? route.name;
        const badge = typeof options.tabBarBadge === 'number' ? options.tabBarBadge : 0;
        const color = focused ? colors.textEmphasis : colors.textMedium;
        const icon = icons[route.name];

        function onPress() {
          haptic('tap');
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigateToTab(route.key);
        }

        function onLongPress() {
          emitter.emit({ type: 'tabLongPress', target: route.key });
        }

        return (
          // Shrinks while pressed; the 48 dp box at rest is the real touch target.
          <PressableScale
            key={route.key}
            targetScale={PRESSED_SCALE}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            testID={options.tabBarButtonTestID}
            onPress={onPress}
            onLongPress={onLongPress}
            style={styles.tab}
          >
            {route.name === PROFILE_ROUTE ? (
              <ProfileAvatar active={focused} />
            ) : icon ? (
              <Ionicons name={focused ? icon.active : icon.inactive} size={ICON_SIZE} color={color} />
            ) : null}
            <CountBadge count={badge} />
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    paddingHorizontal: BAR_PADDING_HORIZONTAL,
    backgroundColor: colors.bg,
    borderTopWidth: hairline,
    borderTopColor: colors.borderLow,
  },
  tab: {
    flex: 1,
    minHeight: TAB_MIN_HEIGHT,
    alignItems: 'center',
    paddingTop: 13,
    paddingBottom: 4,
  },
  avatarRing: {
    width: AVATAR_SIZE + AVATAR_RING * 2,
    height: AVATAR_SIZE + AVATAR_RING * 2,
    borderRadius: (AVATAR_SIZE + AVATAR_RING * 2) / 2,
    borderWidth: AVATAR_RING,
    alignItems: 'center',
    justifyContent: 'center',
    // Match the icon's box so every tab keeps the same height.
    marginVertical: (ICON_SIZE - (AVATAR_SIZE + AVATAR_RING * 2)) / 2,
  },
});
