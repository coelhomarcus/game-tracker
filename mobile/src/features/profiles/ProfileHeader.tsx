import type { ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components';
import { displayName } from '@/features/feed/types';
import { resolveImageUrl } from '@/lib/imageUrl';
import { colors, fontSize, space } from '@/theme/tokens';

import type { UserProfile } from './types';

const AVATAR_SIZE = 88;
const AVATAR_RING = 3;
const AVATAR_OVERLAP = 44;

export type ProfileHeaderProps = {
  profile: UserProfile;
  /** Rendered at the right of the name row (follow or edit button). */
  actions?: ReactNode;
};

export function ProfileHeader({ profile, actions }: ProfileHeaderProps) {
  const name = displayName(profile);
  const bannerUrl = resolveImageUrl(profile.bannerUrl);
  const avatarUrl = resolveImageUrl(profile.avatarUrl);
  const bio = profile.bio?.trim();

  return (
    <View>
      {bannerUrl ? (
        <Image
          accessibilityRole="image"
          accessibilityLabel={`Capa de ${name}`}
          source={{ uri: bannerUrl }}
          style={styles.banner}
        />
      ) : (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel="Sem capa"
          style={styles.banner}
        />
      )}
      <View style={styles.content}>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={avatarUrl ? `Foto de ${name}` : 'Sem foto'}
          style={styles.avatarRing}
        >
          <Avatar uri={avatarUrl} name={name} size={AVATAR_SIZE} />
        </View>
        <View style={styles.nameRow}>
          <View style={styles.names}>
            <Text style={styles.name}>{name}</Text>
            <Text style={styles.username}>{`@${profile.username}`}</Text>
          </View>
          {actions}
        </View>
        {bio ? <Text style={styles.bio}>{bio}</Text> : null}
        <View style={styles.counts}>
          <Count value={profile.followerCount} word={plural(profile.followerCount, 'seguidor')} />
          <Count value={profile.followingCount} word=" seguindo" />
          <Count value={profile.entryCount} word={plural(profile.entryCount, 'registro')} />
        </View>
      </View>
    </View>
  );
}

function plural(value: number, singular: string): string {
  return value === 1 ? ` ${singular}` : ` ${singular}${singular.endsWith('r') ? 'es' : 's'}`;
}

function Count({ value, word }: { value: number; word: string }) {
  return (
    <Text style={styles.countWord}>
      <Text style={styles.countNumber}>{value}</Text>
      <Text>{word}</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  banner: { width: '100%', aspectRatio: 3, backgroundColor: colors.surface },
  content: {
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    gap: space.sm,
  },
  avatarRing: {
    alignSelf: 'flex-start',
    marginTop: -(AVATAR_OVERLAP + AVATAR_RING),
    padding: AVATAR_RING,
    borderRadius: (AVATAR_SIZE + AVATAR_RING * 2) / 2,
    backgroundColor: colors.bg,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  names: { flex: 1 },
  name: { color: colors.textStrong, fontSize: fontSize.xl, fontWeight: 'bold' },
  username: { color: colors.textMuted, fontSize: fontSize.md },
  bio: { color: colors.text, fontSize: fontSize.md },
  counts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: space.lg,
    rowGap: space.xs,
  },
  countNumber: { color: colors.textStrong, fontWeight: 'bold' },
  countWord: { color: colors.textMuted, fontSize: fontSize.sm },
});
