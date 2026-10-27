import { useRouter, type Href } from 'expo-router';

import { Screen, SettingsList } from '@/components';
import { useSession } from '@/features/auth';

const EDIT_PROFILE = '/me/edit' as Href;
const CHANGE_PASSWORD = '/settings/password' as Href;
const DELETE_ACCOUNT = '/settings/delete-account' as Href;

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
        <SettingsList.PressableItem label="Trocar senha" onPress={() => router.push(CHANGE_PASSWORD)}>
          <SettingsList.ItemText>Trocar senha</SettingsList.ItemText>
          <SettingsList.Chevron />
        </SettingsList.PressableItem>

        <SettingsList.Divider />

        <SettingsList.PressableItem label="Excluir conta" onPress={() => router.push(DELETE_ACCOUNT)}>
          <SettingsList.ItemIcon name="trash-outline" tone="danger" />
          <SettingsList.ItemText tone="danger">Excluir conta</SettingsList.ItemText>
          <SettingsList.Chevron />
        </SettingsList.PressableItem>
      </SettingsList.Container>
    </Screen>
  );
}
