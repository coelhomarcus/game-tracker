import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { Platform, StyleSheet } from 'react-native';

import { Screen, SettingsList, Text } from '@/components';
import { showToast } from '@/lib/toast';
import { space } from '@/theme/tokens';

/** `2.4.0 (123)`; either part may be missing from the app config (`—` stands in for the version). */
export function versionLabel(): string {
  const config = Constants.expoConfig;
  const version = config?.version || '—';
  const build = config?.android?.versionCode;
  return build === undefined || build === null ? version : `${version} (${build})`;
}

/** What to paste into a bug report: app version and build, and the Android release it runs on. */
export function buildInfo(): string {
  if (Platform.OS !== 'android') return `GameTracker ${versionLabel()}`;
  const release = Platform.constants?.Release ?? Platform.Version;
  return `GameTracker ${versionLabel()} · Android ${release}`;
}

export function AboutSettings() {
  const version = versionLabel();

  async function copyBuildInfo() {
    try {
      await Clipboard.setStringAsync(buildInfo());
      showToast('Informações copiadas');
    } catch {
      showToast('Não foi possível copiar.');
    }
  }

  return (
    <Screen scroll>
      <SettingsList.Container>
        <SettingsList.Item style={styles.title}>
          <Text size="xl" weight="bold" tone="high">
            GameTracker
          </Text>
          <Text size="sm" tone="medium">
            Registre o que você joga, acompanhe sua biblioteca e converse com outros jogadores.
          </Text>
        </SettingsList.Item>
        <SettingsList.PressableItem
          label={`Versão ${version}`}
          accessibilityHint="Copia as informações da versão"
          onPress={() => void copyBuildInfo()}
        >
          <SettingsList.ItemText>Versão</SettingsList.ItemText>
          <SettingsList.ItemValue>{version}</SettingsList.ItemValue>
        </SettingsList.PressableItem>
      </SettingsList.Container>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { flexDirection: 'column', alignItems: 'flex-start', gap: space.xs, paddingVertical: space.md },
});
