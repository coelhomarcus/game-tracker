import type { PagerScrollProps } from '@/components';

import { ProfilePostFeed } from './ProfilePosts';
import type { Refetch } from './profileList';
import { useUserPosts } from './queries';

export type ProfileMediaProps = {
  userId: string;
  scroll: PagerScrollProps;
  refetchProfile: Refetch;
};

/** The Mídia tab: the user's own posts that carry an image (no reposts). */
export function ProfileMedia({ userId, scroll, refetchProfile }: ProfileMediaProps) {
  const query = useUserPosts(userId, 'media');
  return (
    <ProfilePostFeed
      query={query}
      scroll={scroll}
      refetchProfile={refetchProfile}
      copy={{ empty: 'Nenhuma mídia ainda', error: 'Não foi possível carregar a mídia' }}
    />
  );
}
