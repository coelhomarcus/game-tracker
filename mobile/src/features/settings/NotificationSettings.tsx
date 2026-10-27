import { useRouter, type Href } from 'expo-router';
import { StyleSheet } from 'react-native';

import { Button, Screen, SettingsList, Text } from '@/components';
import { usePush, type PushStatus } from '@/features/push/pushController';
import { space } from '@/theme/tokens';

const NOTIFICATIONS = '/notifications' as Href;

const PUSH_COPY: Record<PushStatus, { message: string; action?: string }> = {
  unsupported: {
    message:
      'As notificações aparecem na central com o app aberto. Avisos com o app fechado não estão disponíveis nesta versão.',
  },
  on: { message: 'Ativadas neste aparelho.' },
  registering: { message: 'Ativando…' },
  off: { message: 'Desativadas neste aparelho.', action: 'Ativar' },
  denied: {
    message: 'Bloqueadas nas configurações do sistema. Libere por lá para receber avisos.',
    action: 'Tentar de novo',
  },
  failed: { message: 'Não foi possível ativar agora. Tente de novo.', action: 'Tentar de novo' },
};

function PushStatusRows() {
  const status = usePush((state) => state.status);
  const enable = usePush((state) => state.enable);
  const { message, action } = PUSH_COPY[status];
  return (
    <>
      <SettingsList.Item style={styles.message}>
        <Text style={styles.fill}>{message}</Text>
      </SettingsList.Item>
      {action ? (
        <SettingsList.Item style={styles.action}>
          <Button label={action} onPress={() => void enable()} />
        </SettingsList.Item>
      ) : null}
    </>
  );
}

export function NotificationSettings() {
  const router = useRouter();
  return (
    <Screen scroll>
      <SettingsList.Container>
        <PushStatusRows />
        <SettingsList.Divider />
        <SettingsList.PressableItem
          label="Central de notificações"
          onPress={() => router.push(NOTIFICATIONS)}
        >
          <SettingsList.ItemIcon name="notifications-outline" />
          <SettingsList.ItemText>Central de notificações</SettingsList.ItemText>
          <SettingsList.Chevron />
        </SettingsList.PressableItem>
      </SettingsList.Container>
    </Screen>
  );
}

const styles = StyleSheet.create({
  message: { paddingVertical: space.md },
  action: { justifyContent: 'flex-start', paddingBottom: space.md },
  fill: { flex: 1 },
});
