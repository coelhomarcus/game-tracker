import { Screen, SettingsList } from '@/components';
import { usePreferences } from '@/lib/preferences';

export function AccessibilitySettings() {
  const hapticsEnabled = usePreferences((state) => state.hapticsEnabled);
  const requireAltText = usePreferences((state) => state.requireAltText);

  return (
    <Screen scroll>
      <SettingsList.Container>
        <SettingsList.SwitchItem
          label="Desativar vibração"
          description="Desliga a vibração ao tocar em botões e abas."
          value={!hapticsEnabled}
          onValueChange={(off) => usePreferences.getState().setHapticsEnabled(!off)}
        />
        <SettingsList.SwitchItem
          label="Exigir texto alternativo"
          description="Pede uma descrição antes de publicar posts com imagens."
          value={requireAltText}
          onValueChange={(on) => usePreferences.getState().setRequireAltText(on)}
        />
      </SettingsList.Container>
    </Screen>
  );
}
