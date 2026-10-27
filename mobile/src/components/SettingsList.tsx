import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  View,
  type AccessibilityState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import type { IoniconName } from '@/features/library/status';
import { haptic } from '@/lib/haptics';
import { colors, hairline, space } from '@/theme/tokens';
import { CountBadge } from './CountBadge';
import { Text } from './Text';

/** Minimum touch target; every row is at least this tall. */
const ROW_MIN_HEIGHT = 48;

/** The column that holds the rows of a settings page. */
export function Container({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.container, style]}>{children}</View>;
}

export type ItemProps = { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string };

/** A row that does nothing when touched (a value, a status, an explanation). */
export function Item({ children, style, testID }: ItemProps) {
  return (
    <View testID={testID} style={[styles.item, style]}>
      {children}
    </View>
  );
}

export type PressableItemProps = {
  children: ReactNode;
  /** Spoken name of the row. */
  label: string;
  onPress: () => void;
  /** `radio` and `switch` rows also carry their state in `accessibilityState`. */
  accessibilityRole?: 'button' | 'switch' | 'radio';
  accessibilityState?: AccessibilityState;
  accessibilityHint?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** A row that reacts to touch. Real 48 dp tall box, with a pressed background. */
export function PressableItem({
  children,
  label,
  onPress,
  accessibilityRole = 'button',
  accessibilityState,
  accessibilityHint,
  disabled = false,
  style,
  testID,
}: PressableItemProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ ...accessibilityState, disabled }}
      disabled={disabled}
      onPress={() => {
        haptic('tap');
        onPress();
      }}
      style={({ pressed }) => [styles.item, pressed && styles.pressed, style]}
    >
      {children}
    </Pressable>
  );
}

export type ItemIconProps = { name: IoniconName; tone?: 'default' | 'danger' };

export function ItemIcon({ name, tone = 'default' }: ItemIconProps) {
  return (
    <Ionicons
      name={name}
      size={24}
      color={tone === 'danger' ? colors.danger : colors.textMedium}
    />
  );
}

export type ItemTextProps = { children: string; tone?: 'default' | 'danger' };

/** The row's label: one line, takes the room the icon and value leave. */
export function ItemText({ children, tone = 'default' }: ItemTextProps) {
  return (
    <Text numberOfLines={1} tone={tone} weight={tone === 'danger' ? 'semibold' : 'normal'} style={styles.fill}>
      {children}
    </Text>
  );
}

/** A value on the right side of the row. */
export function ItemValue({ children }: { children: string }) {
  return (
    <Text size="sm" tone="medium" numberOfLines={1} style={styles.value}>
      {children}
    </Text>
  );
}

/** Marks a row that opens another screen. */
export function Chevron() {
  return <Ionicons name="chevron-forward" size={18} color={colors.textLow} />;
}

/** A count on the right side of the row. */
export function BadgeItem({ count }: { count: number }) {
  return <CountBadge count={count} style={styles.badge} />;
}

/** A hairline between groups of rows. */
export function Divider() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.divider}
    />
  );
}

export type SwitchItemProps = {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** A line below the label that says what the switch does. */
  description?: string;
  testID?: string;
};

/** A row with a switch; touching anywhere on the row toggles it. */
export function SwitchItem({ label, value, onValueChange, description, testID }: SwitchItemProps) {
  return (
    <PressableItem
      testID={testID}
      label={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityHint={description}
      onPress={() => onValueChange(!value)}
    >
      <View style={[styles.fill, styles.texts]}>
        <Text numberOfLines={1}>{label}</Text>
        {description ? (
          <Text size="sm" tone="medium">
            {description}
          </Text>
        ) : null}
      </View>
      {/* Decorative: the row is the control, so the native switch neither takes touches nor speaks. */}
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Switch
          value={value}
          trackColor={{ false: colors.bgContrast50, true: colors.primary }}
          thumbColor={colors.textEmphasis}
        />
      </View>
    </PressableItem>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'column' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingVertical: space.sm,
    minHeight: ROW_MIN_HEIGHT,
  },
  pressed: { backgroundColor: colors.bgContrast25 },
  fill: { flex: 1 },
  texts: { gap: space._2xs },
  value: { flexShrink: 1 },
  badge: { position: 'relative', left: 0, top: 0 },
  divider: {
    borderTopWidth: hairline,
    borderTopColor: colors.borderLow,
    marginVertical: space.sm,
  },
});
