import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button, Skeleton, Text } from '@/components';
import { ImageViewer } from '@/features/feed/ImageViewer';
import { displayName, type PostImage } from '@/features/feed/types';
import { resolveImageUrl } from '@/lib/imageUrl';
import { colors, radii, space } from '@/theme/tokens';

import { FollowButton } from './FollowButton';
import { MessageButton } from './MessageButton';
import { ProfileMenu } from './ProfileMenu';
import type { UserProfile } from './types';

const BANNER_HEIGHT = 150;
const AVATAR_SIZE = 90;
const AVATAR_RING = 2;
const AVATAR_TOP = 104;
const AVATAR_LEFT = 10;
const BACK_CIRCLE = 31;
const BACK_TOUCH = 48;
const BACK_TOP = 6;
const BACK_LEFT = 12;
/** Keeps the buttons clear of the avatar that overlaps the body. */
const BUTTONS_INDENT = 90;
const BIO_LINES = 15;

/** The 31 dp scrim circle over the banner, in a real 48 dp box so it is easy to hit. */
export function ProfileBackButton() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const edge = (BACK_TOUCH - BACK_CIRCLE) / 2;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Voltar"
      onPress={() => router.back()}
      style={[
        styles.back,
        { top: Math.max(0, insets.top + BACK_TOP - edge), left: Math.max(0, BACK_LEFT - edge) },
      ]}
    >
      <View style={styles.backCircle}>
        <Ionicons name="arrow-back" size={20} color={colors.onPrimary} />
      </View>
    </Pressable>
  );
}

/** What the header looks like while the profile loads. */
export function ProfileHeaderSkeleton({ showBack }: { showBack: boolean }) {
  return (
    <View>
      <View accessible accessibilityLabel="Carregando" testID="profile-skeleton">
        <Skeleton height={BANNER_HEIGHT} radius={0} />
        <View style={[styles.avatarRing, styles.skeletonAvatar]}>
          <Skeleton.Circle size={AVATAR_SIZE} />
        </View>
        <View style={styles.body}>
          <View style={styles.buttons}>
            <Skeleton width={140} height={34} radius={17} />
          </View>
        </View>
      </View>
      {showBack ? <ProfileBackButton /> : null}
    </View>
  );
}

export type ProfileHeaderProps = {
  profile: UserProfile;
  /** The signed-in user's own profile: edit instead of follow and message, and no back button. */
  own?: boolean;
};

/**
 * The header floats over the profile's lists. Its plain views let touches through
 * (`pointerEvents="box-none"`), so a drag that starts on them scrolls the list below on Android;
 * buttons, links and images still take their taps.
 */
export function ProfileHeader({ profile, own = false }: ProfileHeaderProps) {
  const router = useRouter();
  const [viewing, setViewing] = useState<PostImage | null>(null);
  const name = displayName(profile);
  const bannerUrl = resolveImageUrl(profile.bannerUrl);
  const avatarUrl = resolveImageUrl(profile.avatarUrl);
  const bio = profile.bio?.trim();

  const view = (url: string, alt: string) => setViewing({ url, width: null, height: null, alt });
  const openCount = (kind: 'followers' | 'following') =>
    router.push(`/users/${profile.id}/${kind}` as Href);

  return (
    <View testID="profile-header" pointerEvents="box-none">
      {bannerUrl && profile.bannerUrl ? (
        <Pressable
          accessibilityRole="imagebutton"
          accessibilityLabel={`Capa de ${name}`}
          onPress={() => view(profile.bannerUrl as string, `Capa de ${name}`)}
        >
          <Image source={{ uri: bannerUrl }} style={styles.banner} />
        </Pressable>
      ) : (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel="Sem capa"
          pointerEvents="box-none"
          style={[styles.banner, styles.noBanner]}
        />
      )}
      <View pointerEvents="box-none" style={styles.body}>
        <View testID="profile-actions" pointerEvents="box-none" style={styles.buttons}>
          {own ? (
            <Button
              label="Editar perfil"
              color="secondary"
              size="small"
              onPress={() => router.push('/me/edit' as Href)}
            />
          ) : (
            <>
              <MessageButton userId={profile.id} name={name} />
              <View style={styles.followSlot}>
                <FollowButton
                  userId={profile.id}
                  following={profile.isFollowedByMe}
                  followsMe={profile.followsMe}
                  name={name}
                  size="small"
                  showIcon
                  announce
                />
              </View>
            </>
          )}
          <ProfileMenu username={profile.username} />
        </View>
        <View pointerEvents="box-none" style={styles.identity}>
          <Text size="_3xl" weight="bold" tone="high">
            {name}
          </Text>
          <View pointerEvents="box-none" style={styles.handleRow}>
            {profile.followsMe ? (
              <View pointerEvents="box-none" style={styles.followsYou}>
                <Text size="sm">Segue você</Text>
              </View>
            ) : null}
            <Text tone="medium">{`@${profile.username}`}</Text>
          </View>
        </View>
        <View pointerEvents="box-none" style={styles.counts}>
          <Count
            value={profile.followerCount}
            word={plural(profile.followerCount, 'seguidor')}
            onPress={() => openCount('followers')}
          />
          <Count value={profile.followingCount} word=" seguindo" onPress={() => openCount('following')} />
          <Count value={profile.entryCount} word={plural(profile.entryCount, 'registro')} />
        </View>
        {bio ? (
          <Text testID="profile-bio" selectable numberOfLines={BIO_LINES}>
            {bio}
          </Text>
        ) : null}
      </View>
      {avatarUrl && profile.avatarUrl ? (
        <Pressable
          accessibilityRole="imagebutton"
          accessibilityLabel={`Foto de ${name}`}
          onPress={() => view(profile.avatarUrl as string, `Foto de ${name}`)}
          style={styles.avatarRing}
        >
          <Avatar uri={avatarUrl} name={name} size={AVATAR_SIZE} />
        </Pressable>
      ) : (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel="Sem foto"
          pointerEvents="box-none"
          style={styles.avatarRing}
        >
          <Avatar uri={null} name={name} size={AVATAR_SIZE} />
        </View>
      )}
      {own ? null : <ProfileBackButton />}
      {viewing ? (
        <ImageViewer
          images={[viewing]}
          initialIndex={0}
          label={(image) => image.alt ?? ''}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </View>
  );
}

function plural(value: number, singular: string): string {
  return value === 1 ? ` ${singular}` : ` ${singular}${singular.endsWith('r') ? 'es' : 's'}`;
}

type CountProps = { value: number; word: string; onPress?: () => void };

function Count({ value, word, onPress }: CountProps) {
  const content = (
    <Text>
      <Text weight="semibold" tone="high">
        {value}
      </Text>
      <Text tone="medium">{word}</Text>
    </Text>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${value}${word}`}
      hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }}
      onPress={onPress}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: { width: '100%', height: BANNER_HEIGHT },
  noBanner: { backgroundColor: colors.bgContrast25 },
  back: {
    position: 'absolute',
    width: BACK_TOUCH,
    height: BACK_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backCircle: {
    width: BACK_CIRCLE,
    height: BACK_CIRCLE,
    borderRadius: radii.full,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: {
    position: 'absolute',
    top: AVATAR_TOP,
    left: AVATAR_LEFT,
    padding: AVATAR_RING,
    borderRadius: radii.full,
    backgroundColor: colors.bg,
  },
  skeletonAvatar: { top: 110 },
  body: {
    // The buttons row is 48 dp tall (real hit boxes) and its 34 dp buttons are centred, so the
    // buttons sit 12 dp under the banner once the 7 dp of the row's own padding is counted.
    paddingTop: 5,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    gap: space.sm,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: space.xs,
    paddingLeft: BUTTONS_INDENT,
    minHeight: 48,
  },
  // The follow label shrinks and truncates instead of running under the avatar.
  followSlot: { flexShrink: 1, minWidth: 0 },
  identity: { gap: space._2xs },
  handleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  followsYou: {
    backgroundColor: colors.bgContrast50,
    borderRadius: radii.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  counts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.sm, rowGap: space.xs },
});
