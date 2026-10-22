import { Redirect } from 'expo-router';

import { useSession } from '@/features/auth';

// Guarded routes resolve here (for example `/` while signed out); send the user to
// the entry point that matches the current session.
export default function NotFound() {
  const signedIn = useSession((state) => state.status === 'signedIn');
  return <Redirect href={signedIn ? '/' : '/login'} />;
}
