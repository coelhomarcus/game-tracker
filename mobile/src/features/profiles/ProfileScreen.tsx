import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  EmptyState,
  Fab,
  PagerWithHeader,
  Screen,
  type PagerScrollProps,
  type PagerTab,
  type PagerWithHeaderHandle,
} from '@/components';
import { useSession } from '@/features/auth';
import { ApiError } from '@/lib/http/errors';

import { ProfileCompactHeader } from './ProfileCompactHeader';
import { ProfileGames } from './ProfileGames';
import { ProfileBackButton, ProfileHeader, ProfileHeaderSkeleton } from './ProfileHeader';
import { ProfileLikes } from './ProfileLikes';
import { ProfileMedia } from './ProfileMedia';
import { ProfilePosts } from './ProfilePosts';
import { ProfileReplies } from './ProfileReplies';
import { ScrollToTopOnTabPress, type Refetch } from './profileList';
import { useProfile } from './queries';
import type { UserProfile } from './types';

const COMPOSER = '/posts/new' as Href;

export type ProfileScreenProps = {
  userId: string;
  /** Set on the Perfil tab itself, where pressing its button again scrolls back to the top. */
  tabRoot?: boolean;
};

/**
 * The profile of a user, own or somebody else's: the header over a pager of lists (Jogos, Posts,
 * Respostas, Mídia and, on the own profile, Curtidas). Each page is its own list, because a
 * virtualized grid cannot be nested in another scrolling list; the header moves with the list
 * that shows.
 */
export function ProfileScreen({ userId, tabRoot = false }: ProfileScreenProps) {
  const router = useRouter();
  const profile = useProfile(userId);
  const own = useSession((state) => state.user?.id) === userId;
  const { refetch } = profile;
  const refetchProfile = useCallback(() => refetch(), [refetch]);

  // A failed background refetch keeps the previous data, so the loaded profile stays.
  if (profile.data) {
    return (
      <Screen>
        <ProfileBody
          profile={profile.data}
          own={own}
          tabRoot={tabRoot}
          refetchProfile={refetchProfile}
        />
      </Screen>
    );
  }

  if (profile.isError) {
    const missing = profile.error instanceof ApiError && profile.error.status === 404;
    return (
      <Screen>
        <View style={styles.center}>
          {missing ? (
            <EmptyState
              title="Perfil não encontrado"
              message="Esta conta pode ter sido removida."
              action={{ label: 'Voltar', onPress: () => router.back() }}
            />
          ) : (
            <EmptyState
              title="Não foi possível carregar o perfil"
              action={{ label: 'Tentar de novo', onPress: () => void profile.refetch() }}
            />
          )}
        </View>
        {/* After the filling View, so nothing covers it. */}
        {own || missing ? null : <ProfileBackButton />}
      </Screen>
    );
  }

  return (
    <Screen>
      <ProfileHeaderSkeleton showBack={!own} />
    </Screen>
  );
}

type BodyProps = {
  profile: UserProfile;
  own: boolean;
  tabRoot: boolean;
  refetchProfile: Refetch;
};

function ProfileBody({ profile, own, tabRoot, refetchProfile }: BodyProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<PagerWithHeaderHandle>(null);
  const { id, username, name, avatarUrl } = profile;
  const author = useMemo(() => ({ id, username, name, avatarUrl }), [id, username, name, avatarUrl]);

  const tabs = useMemo<PagerTab[]>(() => {
    const list: PagerTab[] = [
      {
        key: 'games',
        label: 'Jogos',
        render: (scroll: PagerScrollProps) => (
          <ProfileGames userId={id} own={own} scroll={scroll} refetchProfile={refetchProfile} />
        ),
      },
      {
        key: 'posts',
        label: 'Posts',
        render: (scroll) => (
          <ProfilePosts userId={id} own={own} scroll={scroll} refetchProfile={refetchProfile} />
        ),
      },
      {
        key: 'replies',
        label: 'Respostas',
        render: (scroll) => (
          <ProfileReplies author={author} scroll={scroll} refetchProfile={refetchProfile} />
        ),
      },
      {
        key: 'media',
        label: 'Mídia',
        render: (scroll) => (
          <ProfileMedia userId={id} scroll={scroll} refetchProfile={refetchProfile} />
        ),
      },
    ];
    if (own) {
      list.push({
        key: 'likes',
        label: 'Curtidas',
        render: (scroll) => (
          <ProfileLikes userId={id} scroll={scroll} refetchProfile={refetchProfile} />
        ),
      });
    }
    return list;
  }, [author, id, own, refetchProfile]);

  return (
    <View style={styles.body}>
      <PagerWithHeader
        ref={pagerRef}
        header={<ProfileHeader profile={profile} own={own} />}
        tabs={tabs}
        initialTab="games"
        // The own profile sits under the Perfil tab's header, which stays; a pushed profile is
        // edge-to-edge and gets the compact header once it scrolls.
        compactHeader={own ? undefined : <ProfileCompactHeader profile={profile} />}
        statusBarHeight={own ? 0 : insets.top}
      />
      <Fab accessibilityLabel="Publicar" onPress={() => router.push(COMPOSER)} />
      {tabRoot ? <ScrollToTopOnTabPress listRef={pagerRef} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
