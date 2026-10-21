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
};

/**
 * Opens a person's profile. Cards render it beside, not inside, their own pressable body, so a
 * tap on the avatar or the name never also opens the post.
 */
export function ProfileLink({ user, children, hitSlop, style }: ProfileLinkProps) {
  const router = useRouter();
  return (
    <Pressable
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
