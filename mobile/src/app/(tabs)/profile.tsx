import { Button, EmptyState, Screen } from '@/components';
import { useSession } from '@/features/auth';

export default function ProfileScreen() {
  const signOut = useSession((state) => state.signOut);
  return (
    <Screen>
      <EmptyState title="Perfil" message="Em construção" />
      <Button label="Sair da conta" variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}
