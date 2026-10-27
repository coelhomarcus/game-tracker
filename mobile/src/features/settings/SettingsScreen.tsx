import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar, ConfirmDialog, Screen, SettingsList, Text } from '@/components';
import { useSession } from '@/features/auth';
import { useChatStore } from '@/features/chat/chatStore';
import type { IoniconName } from '@/features/library/status';
import { space } from '@/theme/tokens';

/** What signing out would lose: unsent chat drafts and messages still waiting to be sent. */
function unsentWarning(count: number): string | undefined {
  if (count === 0) return undefined;
  if (count === 1) return 'Você tem uma mensagem escrita e não enviada. Ela será descartada.';
  return `Você tem ${count} mensagens escritas e não enviadas. Elas serão descartadas.`;
}

const SECTIONS: { label: string; icon: IoniconName; href: Href }[] = [
  { label: 'Conta', icon: 'person-circle-outline', href: '/settings/account' as Href },
  { label: 'Notificações', icon: 'notifications-outline', href: '/settings/notifications' as Href },
  { label: 'Acessibilidade', icon: 'accessibility-outline', href: '/settings/accessibility' as Href },
  { label: 'Biblioteca', icon: 'library-outline', href: '/settings/library' as Href },
  { label: 'Sobre', icon: 'information-circle-outline', href: '/settings/about' as Href },
];

export function SettingsScreen() {
  const router = useRouter();
  const user = useSession((state) => state.user);
  // null while closed; the count is taken when the dialog opens.
  const [unsent, setUnsent] = useState<number | null>(null);

  const username = user?.username ?? '';
  const name = user?.name || username;

  return (
    <Screen scroll>
      <SettingsList.Container>
        <View style={styles.profile}>
          <Avatar uri={user?.avatarUrl} name={name} size={80} />
          <Text size="_3xl" weight="bold" tone="high" numberOfLines={1}>
            {name}
          </Text>
          {username ? (
            <Text tone="medium" numberOfLines={1}>{`@${username}`}</Text>
          ) : null}
        </View>

        {SECTIONS.map((section) => (
          <SettingsList.PressableItem
            key={section.label}
            label={section.label}
            onPress={() => router.push(section.href)}
          >
            <SettingsList.ItemIcon name={section.icon} />
            <SettingsList.ItemText>{section.label}</SettingsList.ItemText>
            <SettingsList.Chevron />
          </SettingsList.PressableItem>
        ))}

        <SettingsList.Divider />

        <SettingsList.PressableItem
          label="Sair"
          onPress={() => setUnsent(useChatStore.getState().draftCount())}
        >
          <SettingsList.ItemIcon name="log-out-outline" tone="danger" />
          <SettingsList.ItemText tone="danger">Sair</SettingsList.ItemText>
        </SettingsList.PressableItem>
      </SettingsList.Container>

      <ConfirmDialog
        visible={unsent !== null}
        title="Sair da conta?"
        message={unsent === null ? undefined : unsentWarning(unsent)}
        confirmLabel="Sair"
        cancelLabel="Continuar no app"
        destructive
        onConfirm={() => {
          setUnsent(null);
          void useSession.getState().signOut();
        }}
        onCancel={() => setUnsent(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { alignItems: 'center', paddingVertical: space.lg, gap: space.xs },
});
