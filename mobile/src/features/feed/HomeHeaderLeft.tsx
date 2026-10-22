import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Avatar } from '@/components';
import { useSession } from '@/features/auth';
import { resolveImageUrl } from '@/lib/imageUrl';
import { space } from '@/theme/tokens';

import { displayName } from './types';

const AVATAR_SIZE = 32;
const PROFILE = '/profile' as Href;

/** The Início tab's header-left: the signed-in user's avatar, a shortcut to the own profile. */
export function HomeHeaderLeft() {
  const router = useRouter();
  const user = useSession((state) => state.user);
  if (user === null) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Seu perfil"
      hitSlop={space.xs}
      onPress={() => router.push(PROFILE)}
      style={styles.button}
    >
      <Avatar
        uri={resolveImageUrl(user.avatarUrl)}
        name={displayName(user)}
        size={AVATAR_SIZE}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Pulled out by the box's padding so the avatar lines up with the header's 16 dp gutter.
  button: {
    width: 44,
    height: 44,
    marginLeft: -(44 - AVATAR_SIZE) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
