import { useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, EmptyState, Screen, Tabs } from '@/components';
import { displayName } from '@/features/feed/types';
import { useSession } from '@/features/auth';
import { ApiError } from '@/lib/http/errors';
import { colors, space } from '@/theme/tokens';

import { FollowButton } from './FollowButton';
import { ProfileGames } from './ProfileGames';
import { ProfileHeader } from './ProfileHeader';
import { ProfilePosts } from './ProfilePosts';
import { useProfile } from './queries';
import type { UserProfile } from './types';

type TabValue = 'games' | 'activity' | 'posts';

const TABS: { value: TabValue; label: string }[] = [
  { value: 'games', label: 'Jogos' },
  { value: 'activity', label: 'Atividade' },
  { value: 'posts', label: 'Posts' },
];

export type ProfileScreenProps = {
  userId: string;
  /** Set on the Perfil tab itself, where pressing its button again scrolls back to the top. */
  tabRoot?: boolean;
};

type TopProps = {
  profile: UserProfile;
  own: boolean;
  tab: TabValue;
  onSelectTab: (tab: TabValue) => void;
};

/**
 * Banner, identity and section tabs. Defined at module scope and rendered as an element, so the
 * lists can use it as their header without it being remounted on every render.
 */
function ProfileTop({ profile, own, tab, onSelectTab }: TopProps) {
  const router = useRouter();
  const actions = own ? (
    <Button
      label="Editar perfil"
      variant="secondary"
      onPress={() => router.push('/me/edit' as Href)}
    />
  ) : (
    <FollowButton
      userId={profile.id}
      following={profile.isFollowedByMe}
      name={displayName(profile)}
    />
  );
  return (
    <View>
      <ProfileHeader profile={profile} actions={actions} />
      <View style={styles.tabs}>
        <Tabs items={TABS} selected={tab} onSelect={onSelectTab} />
      </View>
    </View>
  );
}

/**
 * The profile of a user, own or somebody else's. Each tab is its own list (a grid for Jogos, a
 * post list for the other two) that shares the same header, because a virtualized grid cannot
 * be nested in another scrolling list.
 */
export function ProfileScreen({ userId, tabRoot = false }: ProfileScreenProps) {
  const router = useRouter();
  const profile = useProfile(userId);
  const own = useSession((state) => state.user?.id) === userId;

  // A failed background refetch keeps the previous data, so the loaded profile stays.
  if (profile.data) {
    return (
      <Screen>
        <ProfileBody
          profile={profile.data}
          own={own}
          tabRoot={tabRoot}
          refetchProfile={() => profile.refetch()}
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
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.center}>
        <ActivityIndicator accessibilityLabel="Carregando" size="large" color={colors.accent} />
      </View>
    </Screen>
  );
}

type BodyProps = {
  profile: UserProfile;
  own: boolean;
  tabRoot: boolean;
  refetchProfile: () => Promise<{ isError: boolean }>;
};

function ProfileBody({ profile, own, tabRoot, refetchProfile }: BodyProps) {
  const [tab, setTab] = useState<TabValue>('games');
  const select = useCallback((next: TabValue) => setTab(next), []);
  const top = <ProfileTop profile={profile} own={own} tab={tab} onSelectTab={select} />;

  switch (tab) {
    case 'games':
      return (
        <ProfileGames
          key="games"
          userId={profile.id}
          own={own}
          top={top}
          tabRoot={tabRoot}
          refetchProfile={refetchProfile}
        />
      );
    case 'activity':
      return (
        <ProfilePosts
          key="activity"
          userId={profile.id}
          type="activity"
          top={top}
          tabRoot={tabRoot}
          refetchProfile={refetchProfile}
        />
      );
    case 'posts':
      return (
        <ProfilePosts
          key="posts"
          userId={profile.id}
          type="post"
          top={top}
          tabRoot={tabRoot}
          refetchProfile={refetchProfile}
        />
      );
  }
}

const styles = StyleSheet.create({
  tabs: { paddingVertical: space.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
