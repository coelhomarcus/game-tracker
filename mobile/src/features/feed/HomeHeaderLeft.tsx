import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Avatar } from '@/components';
import { useSession } from '@/features/auth';
import { resolveImageUrl } from '@/lib/imageUrl';

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
  // A real 48 dp target; the header's left column lines the avatar up with the 16 dp gutter.
  button: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
