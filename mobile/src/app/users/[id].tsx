import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useSession } from '@/features/auth';
import { displayName } from '@/features/feed/types';
import { ProfileScreen } from '@/features/profiles/ProfileScreen';
import { useProfile } from '@/features/profiles/queries';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function UserRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = firstParam(params.id);
  const isMe = useSession((state) => id !== undefined && state.user?.id === id);

  // The own profile lives in the Perfil tab; this address only forwards there.
  useEffect(() => {
    if (isMe) router.replace('/profile');
  }, [isMe, router]);

  if (id === undefined || isMe) return null;
  return <PublicProfile id={id} />;
}

function PublicProfile({ id }: { id: string }) {
  // Same query as the screen's, so the title costs no extra request.
  const { data } = useProfile(id);
  return (
    <>
      <Stack.Screen options={{ title: data ? displayName(data) : '' }} />
      <ProfileScreen userId={id} />
    </>
  );
}
