import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, ChoiceChip, ConfirmDialog, Screen } from '@/components';
import { useSession } from '@/features/auth';
import { useChatStore } from '@/features/chat/chatStore';
import { SORT_OPTIONS, useLibraryPrefs } from '@/features/library/prefsStore';
import { usePush, type PushStatus } from '@/features/push/pushController';
import { colors, fontSize, space } from '@/theme/tokens';

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
      <Text accessibilityRole="header" style={styles.sectionTitle}>
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
      <Text style={[styles.rowLabel, danger ? styles.danger : null]}>{label}</Text>
      {danger ? null : <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />}
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
      <Text style={styles.body}>{message}</Text>
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
            variant="secondary"
            onPress={() => router.push(NOTIFICATIONS)}
          />
        </Section>

        <Section title="Biblioteca">
          <Text style={styles.label}>Ordenar por</Text>
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
          <Text style={styles.about}>GameTracker</Text>
          <Text style={styles.muted}>{`Versão ${version}`}</Text>
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
  content: { padding: space.lg, gap: space.xl },
  section: { gap: space.sm },
  sectionTitle: { color: colors.textStrong, fontSize: fontSize.lg, fontWeight: 'bold' },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  rowLabel: { color: colors.text, fontSize: fontSize.md },
  danger: { color: colors.danger, fontWeight: '600' },
  label: { color: colors.textMuted, fontSize: fontSize.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  body: { color: colors.text, fontSize: fontSize.md },
  about: { color: colors.text, fontSize: fontSize.md },
  muted: { color: colors.textMuted, fontSize: fontSize.sm },
});
