import { useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { displayName } from '@/features/feed/types';
import type { UserSummary } from '@/features/games/types';

export type ProfileLinkProps = {
  user: UserSummary;
  children: ReactNode;
  hitSlop: PressableProps['hitSlop'];
  style?: StyleProp<ViewStyle>;
  /**
   * Touch-only shortcut for a link that sits right beside another one with the same label (an
   * avatar next to the name): screen readers reach the profile through the other link only.
   */
  touchOnly?: boolean;
  testID?: string;
};

/**
 * Opens a person's profile. Cards render it beside, not inside, their own pressable body, so a
 * tap on the avatar or the name never also opens the post.
 */
export function ProfileLink({
  user,
  children,
  hitSlop,
  style,
  touchOnly = false,
  testID,
}: ProfileLinkProps) {
  const router = useRouter();
  return (
    <Pressable
      testID={testID}
      accessible={touchOnly ? false : undefined}
      importantForAccessibility={touchOnly ? 'no-hide-descendants' : undefined}
      accessibilityRole="button"
      accessibilityLabel={`Perfil de ${displayName(user)}`}
      hitSlop={hitSlop}
      onPress={() => router.push(`/users/${user.id}` as Href)}
      style={style}
    >
      {children}
    </Pressable>
  );
}
