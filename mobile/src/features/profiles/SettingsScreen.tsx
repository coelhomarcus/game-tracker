import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, ChoiceChip, ConfirmDialog, Screen, Text } from '@/components';
import { useSession } from '@/features/auth';
import { useChatStore } from '@/features/chat/chatStore';
import { SORT_OPTIONS, useLibraryPrefs } from '@/features/library/prefsStore';
import { usePush, type PushStatus } from '@/features/push/pushController';
import { colors, space } from '@/theme/tokens';

const EDIT_PROFILE = '/me/edit' as Href;
const NOTIFICATIONS = '/notifications' as Href;

/** What signing out would lose: unsent chat drafts and messages still waiting to be sent. */
function unsentWarning(count: number): string | undefined {
  if (count === 0) return undefined;
  if (count === 1) return 'Você tem uma mensagem escrita e não enviada. Ela será descartada.';
  return `Você tem ${count} mensagens escritas e não enviadas. Elas serão descartadas.`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" size="xl" weight="bold" tone="high">
        {title}
      </Text>
      {children}
    </View>
  );
}

type RowProps = { label: string; onPress: () => void; danger?: boolean };

function Row({ label, onPress, danger = false }: RowProps) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.row}>
      <Text weight={danger ? 'semibold' : 'normal'} tone={danger ? 'danger' : 'default'}>
        {label}
      </Text>
      {danger ? null : <Ionicons name="chevron-forward" size={20} color={colors.textMedium} />}
    </Pressable>
  );
}

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

function PushSettings() {
  const status = usePush((state) => state.status);
  const enable = usePush((state) => state.enable);
  const { message, action } = PUSH_COPY[status];
  return (
    <>
      <Text>{message}</Text>
      {action ? <Button label={action} onPress={() => void enable()} /> : null}
    </>
  );
}

export function SettingsScreen() {
  const router = useRouter();
  const sort = useLibraryPrefs((state) => state.sort);
  // null while closed; the count is taken when the dialog opens.
  const [unsent, setUnsent] = useState<number | null>(null);
  const version = Constants.expoConfig?.version ?? '—';

  return (
    <Screen scroll>
      <View style={styles.content}>
        <Section title="Conta">
          <Row label="Editar perfil" onPress={() => router.push(EDIT_PROFILE)} />
          <Row
            label="Sair"
            danger
            onPress={() => setUnsent(useChatStore.getState().draftCount())}
          />
        </Section>

        <Section title="Notificações">
          <PushSettings />
          <Button
            label="Abrir central de notificações"
            color="secondary"
            onPress={() => router.push(NOTIFICATIONS)}
          />
        </Section>

        <Section title="Biblioteca">
          <Text size="sm" tone="medium">
            Ordenar por
          </Text>
          <View style={styles.chips}>
            {SORT_OPTIONS.map((option) => (
              <ChoiceChip
                key={option.value}
                label={option.label}
                selected={option.value === sort}
                onPress={() => useLibraryPrefs.getState().setSort(option.value)}
              />
            ))}
          </View>
        </Section>

        <Section title="Sobre">
          <Text>GameTracker</Text>
          <Text size="sm" tone="medium">{`Versão ${version}`}</Text>
        </Section>
      </View>

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
  content: { padding: space.lg, gap: space._2xl },
  section: { gap: space.sm },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
