import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components';
import { colors, radii, space, threadLine } from '@/theme/tokens';

export type ReplyPreviewProps = {
  /** Who wrote the message being replied to ("você" for my own). */
  name: string;
  content: string;
  onCancel: () => void;
};

/** Above the composer while replying: whom and what it answers, with an "x" to stop replying. */
export function ReplyPreview({ name, content, onCancel }: ReplyPreviewProps) {
  return (
    <View testID="reply-preview" style={styles.container}>
      <View style={styles.bar} />
      <View style={styles.text}>
        <Text size="sm" weight="semibold" tone="high" numberOfLines={1}>
          {`Respondendo a ${name}`}
        </Text>
        <Text size="sm" tone="medium" numberOfLines={1}>
          {content}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancelar resposta"
        onPress={onCancel}
        style={styles.close}
      >
        <Ionicons name="close" size={20} color={colors.textMedium} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginTop: space.xs,
    paddingLeft: space.md,
    borderRadius: radii.sm,
    backgroundColor: colors.bgContrast25,
    overflow: 'hidden',
  },
  bar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: threadLine,
    backgroundColor: colors.primary,
  },
  text: { flex: 1, paddingVertical: space.sm },
  close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
