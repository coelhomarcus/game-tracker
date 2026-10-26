import type { PagerScrollProps } from '@/components';

import { ProfilePostFeed } from './ProfilePosts';
import type { Refetch } from './profileList';
import { useUserPosts } from './queries';

export type ProfileLikesProps = {
  /** The signed-in user: the tab is only on the own profile. */
  userId: string;
  scroll: PagerScrollProps;
  refetchProfile: Refetch;
};

/** The Curtidas tab of the own profile: the posts the user liked, newest like first. */
export function ProfileLikes({ userId, scroll, refetchProfile }: ProfileLikesProps) {
  const query = useUserPosts(userId, 'likes');
  return (
    <ProfilePostFeed
      query={query}
      scroll={scroll}
      refetchProfile={refetchProfile}
      copy={{ empty: 'Nenhuma curtida ainda', error: 'Não foi possível carregar as curtidas' }}
    />
  );
}
