import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import type { IoniconName } from '@/features/library/status';
import { haptic } from '@/lib/haptics';
import { colors, hairline, space } from '@/theme/tokens';

import { CharProgress } from './CharProgress';

const ICON_SIZE = 22;
const COUNTER_WIDTH = 65;

export type ComposerFooterProps = {
  /** From `measurePost`. */
  count: number;
  /** The post already holds the most images it can: the media buttons are off. */
  imagesFull: boolean;
  onPickImages: () => void;
  onTakePhoto: () => void;
};

/** Ghost round icon button in the primary color, a real 48 dp box. */
function ToolbarButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: IoniconName;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        haptic('tap');
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Ionicons name={icon} size={ICON_SIZE} color={colors.primary} />
    </Pressable>
  );
}

/** The bar under the editor, kept above the keyboard: media buttons and the character counter. */
export function ComposerFooter({
  count,
  imagesFull,
  onPickImages,
  onTakePhoto,
}: ComposerFooterProps) {
  return (
    <View testID="composer-footer" style={styles.container}>
      <View style={styles.tools}>
        <ToolbarButton
          icon="image-outline"
          label="Adicionar imagens"
          disabled={imagesFull}
          onPress={onPickImages}
        />
        <ToolbarButton
          icon="camera-outline"
          label="Tirar foto"
          disabled={imagesFull}
          onPress={onTakePhoto}
        />
      </View>
      <CharProgress count={count} style={styles.counter} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.xs,
    paddingLeft: 7,
    paddingRight: space.lg,
    borderTopWidth: hairline,
    borderTopColor: colors.borderMedium,
    backgroundColor: colors.bg,
  },
  tools: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  button: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: colors.bgContrast25 },
  disabled: { opacity: 0.5 },
  counter: { width: COUNTER_WIDTH },
});
