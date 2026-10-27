import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';

import { Screen, SettingsList, Text } from '@/components';
import { SORT_OPTIONS, useLibraryPrefs } from '@/features/library/prefsStore';
import { colors, space } from '@/theme/tokens';

export function LibrarySettings() {
  const sort = useLibraryPrefs((state) => state.sort);

  return (
    <Screen scroll>
      <SettingsList.Container>
        <SettingsList.Item style={styles.heading}>
          <Text accessibilityRole="header" weight="semibold" tone="high">
            Ordenar por
          </Text>
        </SettingsList.Item>
        {SORT_OPTIONS.map((option) => {
          const selected = option.value === sort;
          return (
            <SettingsList.PressableItem
              key={option.value}
              label={option.label}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => useLibraryPrefs.getState().setSort(option.value)}
            >
              <SettingsList.ItemText>{option.label}</SettingsList.ItemText>
              {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
            </SettingsList.PressableItem>
          );
        })}
      </SettingsList.Container>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { paddingTop: space.md },
});
