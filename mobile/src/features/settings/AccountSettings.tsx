import { useRouter, type Href } from 'expo-router';

import { Screen, SettingsList } from '@/components';
import { useSession } from '@/features/auth';

const EDIT_PROFILE = '/me/edit' as Href;

export function AccountSettings() {
  const router = useRouter();
  const email = useSession((state) => state.user?.email);

  return (
    <Screen scroll>
      <SettingsList.Container>
        <SettingsList.Item>
          <SettingsList.ItemText>E-mail</SettingsList.ItemText>
          <SettingsList.ItemValue>{email ?? '—'}</SettingsList.ItemValue>
        </SettingsList.Item>
        <SettingsList.PressableItem label="Editar perfil" onPress={() => router.push(EDIT_PROFILE)}>
          <SettingsList.ItemText>Editar perfil</SettingsList.ItemText>
          <SettingsList.Chevron />
        </SettingsList.PressableItem>
      </SettingsList.Container>
    </Screen>
  );
}
