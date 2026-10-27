import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Layout, Text } from '@/components';
import { displayName } from '@/features/feed/types';

import { FollowButton } from './FollowButton';
import type { UserProfile } from './types';

export type ProfileCompactHeaderProps = { profile: UserProfile };

/**
 * The bar that fades in over somebody else's profile once it scrolls: back, name and handle,
 * and a compact Seguir while the user does not follow them yet.
 */
export function ProfileCompactHeader({ profile }: ProfileCompactHeaderProps) {
  const router = useRouter();
  const name = displayName(profile);
  const navigation = useMemo(
    () => ({ canGoBack: () => router.canGoBack(), goBack: () => router.back() }),
    [router],
  );

  return (
    <Layout.Header.Outer>
      <Layout.Header.BackButton navigation={navigation} />
      <Layout.Header.Content>
        <View style={styles.title}>
          <Text accessibilityRole="header" size="lg" weight="bold" tone="high" leading="tight" numberOfLines={1}>
            {name}
          </Text>
          <Layout.Header.SubtitleText>{`@${profile.username}`}</Layout.Header.SubtitleText>
        </View>
      </Layout.Header.Content>
      {profile.isFollowedByMe || profile.isBlockedByMe || profile.blocksMe ? null : (
        <View style={styles.follow}>
          <FollowButton
            userId={profile.id}
            following={false}
            followsMe={profile.followsMe}
            name={name}
            size="small"
            showIcon
            announce
          />
        </View>
      )}
    </Layout.Header.Outer>
  );
}

const styles = StyleSheet.create({
  title: { alignSelf: 'stretch' },
  // A column of the header row: it reaches over the bar's bottom padding like the others.
  follow: { justifyContent: 'center', marginBottom: -4 },
});
