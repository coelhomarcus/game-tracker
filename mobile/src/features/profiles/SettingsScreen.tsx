import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChoiceChip, ConfirmDialog, Screen } from '@/components';
import { useSession } from '@/features/auth';
import { SORT_OPTIONS, useLibraryPrefs } from '@/features/library/prefsStore';
import { colors, fontSize, space } from '@/theme/tokens';

const EDIT_PROFILE = '/me/edit' as Href;

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

export function SettingsScreen() {
  const router = useRouter();
  const sort = useLibraryPrefs((state) => state.sort);
  const [confirming, setConfirming] = useState(false);
  const version = Constants.expoConfig?.version ?? '—';

  return (
    <Screen scroll>
      <View style={styles.content}>
        <Section title="Conta">
          <Row label="Editar perfil" onPress={() => router.push(EDIT_PROFILE)} />
          <Row label="Sair" danger onPress={() => setConfirming(true)} />
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
        visible={confirming}
        title="Sair da conta?"
        confirmLabel="Sair"
        cancelLabel="Continuar no app"
        destructive
        onConfirm={() => {
          setConfirming(false);
          void useSession.getState().signOut();
        }}
        onCancel={() => setConfirming(false)}
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
  about: { color: colors.text, fontSize: fontSize.md },
  muted: { color: colors.textMuted, fontSize: fontSize.sm },
});
