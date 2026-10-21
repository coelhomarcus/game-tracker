import { useSession } from '@/features/auth';
import { ProfileScreen } from '@/features/profiles/ProfileScreen';

export default function ProfileTab() {
  const userId = useSession((state) => state.user?.id);
  if (userId === undefined) return null;
  return <ProfileScreen userId={userId} tabRoot />;
}
