import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

import { EmptyState, type PagerScrollProps } from '@/components';

import { PROFILE_LIST_BOTTOM_INSET } from './ProfilePosts';
import { refreshAll, type Refetch } from './profileList';
import type { UserProfile } from './types';

const renderNothing = () => null;

export type ProfileBlockedPageProps = {
  profile: Pick<UserProfile, 'username' | 'isBlockedByMe'>;
  scroll: PagerScrollProps;
  refetchProfile: Refetch;
};

/**
 * What the profile's tabs show instead of the lists while there is a block between the two
 * users: the signed-in user blocked the person, or the person blocked them. It is still a pager
 * page, so the header can collapse and the profile can be pulled to refresh.
 */
export function ProfileBlockedPage({ profile, scroll, refetchProfile }: ProfileBlockedPageProps) {
  const { attachList, onScroll, topInset, minContentHeight, initialOffset } = scroll;
  const [pulling, setPulling] = useState(false);
  const handle = `@${profile.username}`;

  const refresh = useCallback(async () => {
    setPulling(true);
    try {
      await refreshAll([refetchProfile]);
    } finally {
      setPulling(false);
    }
  }, [refetchProfile]);

  const empty = profile.isBlockedByMe ? (
    <EmptyState
      icon="ban-outline"
      title={`Você bloqueou ${handle}`}
      message="Desbloqueie para ver os posts."
    />
  ) : (
    <EmptyState icon="ban-outline" title={`${handle} bloqueou você`} />
  );

  return (
    <Animated.FlatList<never>
      ref={attachList}
      testID="profile-blocked"
      data={[]}
      renderItem={renderNothing}
      ListEmptyComponent={empty}
      contentContainerStyle={[
        styles.content,
        { paddingTop: topInset, paddingBottom: PROFILE_LIST_BOTTOM_INSET, minHeight: minContentHeight },
      ]}
      contentOffset={initialOffset ? { x: 0, y: initialOffset } : undefined}
      onScroll={onScroll}
      scrollEventThrottle={16}
      onRefresh={() => void refresh()}
      refreshing={pulling}
      progressViewOffset={topInset > 0 ? topInset : undefined}
    />
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1 },
});
