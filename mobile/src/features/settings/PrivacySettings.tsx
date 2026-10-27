import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet } from 'react-native';

import { Screen, SettingsList, Text } from '@/components';
import { useSession, type DmPolicy } from '@/features/auth';
import { colors, space } from '@/theme/tokens';

import { refreshDmPolicy, setDmPolicy } from './dmPolicy';

const DM_OPTIONS: { value: DmPolicy; label: string }[] = [
  { value: 'everyone', label: 'Todos' },
  { value: 'following', label: 'Quem eu sigo' },
  { value: 'nobody', label: 'Ninguém' },
];

const MUTED = '/settings/muted' as Href;
const BLOCKED = '/settings/blocked' as Href;

export function PrivacySettings() {
  const router = useRouter();
  const dmPolicy = useSession((state) => state.user?.dmPolicy ?? 'everyone');

  // The session holds the policy from sign-in; read it again each time the screen opens.
  useFocusEffect(
    useCallback(() => {
      void refreshDmPolicy();
    }, []),
  );

  return (
    <Screen scroll>
      <SettingsList.Container testID="dm-policy" accessibilityRole="radiogroup">
        <SettingsList.Item style={styles.heading}>
          <Text accessibilityRole="header" weight="semibold" tone="high">
            Quem pode te mandar mensagem
          </Text>
        </SettingsList.Item>
        {DM_OPTIONS.map((option) => {
          const selected = option.value === dmPolicy;
          return (
            <SettingsList.PressableItem
              key={option.value}
              label={option.label}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => setDmPolicy(option.value)}
            >
              <SettingsList.ItemText>{option.label}</SettingsList.ItemText>
              {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
            </SettingsList.PressableItem>
          );
        })}
        <SettingsList.Item>
          <Text size="sm" tone="medium" style={styles.fill}>
            Vale também para as conversas que já existem.
          </Text>
        </SettingsList.Item>
      </SettingsList.Container>

      <SettingsList.Container>
        <SettingsList.Divider />
        <SettingsList.PressableItem label="Contas silenciadas" onPress={() => router.push(MUTED)}>
          <SettingsList.ItemIcon name="volume-mute-outline" />
          <SettingsList.ItemText>Contas silenciadas</SettingsList.ItemText>
          <SettingsList.Chevron />
        </SettingsList.PressableItem>
        <SettingsList.PressableItem label="Contas bloqueadas" onPress={() => router.push(BLOCKED)}>
          <SettingsList.ItemIcon name="ban-outline" />
          <SettingsList.ItemText>Contas bloqueadas</SettingsList.ItemText>
          <SettingsList.Chevron />
        </SettingsList.PressableItem>
      </SettingsList.Container>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { paddingTop: space.md },
  fill: { flex: 1 },
});
