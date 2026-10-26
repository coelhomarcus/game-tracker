import { StyleSheet, View } from 'react-native';

import { Avatar, PressableScale, Text } from '@/components';
import { useSession } from '@/features/auth';
import { haptic } from '@/lib/haptics';
import { resolveImageUrl } from '@/lib/imageUrl';
import { colors, hairline, radii, space } from '@/theme/tokens';

import { displayName } from '../types';

const AVATAR_SIZE = 24;
const PROMPT = 'Escreva sua resposta';
/** The page fades into the background over these bands, from the faintest to the strongest. */
const FADE_OPACITIES = [0.2, 0.4, 0.6, 0.8] as const;
const FADE_BAND = 6;

export type ThreadReplyPromptProps = {
  /** Opens the composer to answer the post. */
  onPress: () => void;
};

/**
 * The design reference's reply prompt: a pill pinned under the thread that stands in for the
 * composer until the user asks to write. The page fades out behind it.
 */
export function ThreadReplyPrompt({ onPress }: ThreadReplyPromptProps) {
  const user = useSession((state) => state.user);

  return (
    <View testID="thread-reply-prompt" style={styles.container}>
      {/* A short fade (the background from 0 to 1) so the comments do not stop at a hard edge. */}
      <View pointerEvents="none" style={styles.fade}>
        {FADE_OPACITIES.map((opacity) => (
          <View key={opacity} testID="reply-prompt-fade" style={[styles.band, { opacity }]} />
        ))}
      </View>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={PROMPT}
        onPress={() => {
          haptic('tap');
          onPress();
        }}
        style={styles.pill}
      >
        <Avatar
          uri={resolveImageUrl(user?.avatarUrl)}
          name={user ? displayName(user) : '?'}
          size={AVATAR_SIZE}
        />
        <Text size="md" tone="medium">
          {PROMPT}
        </Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '100%',
  },
  band: { height: FADE_BAND, backgroundColor: colors.bg },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 48,
    padding: space.sm,
    borderRadius: radii.full,
    borderWidth: hairline,
    borderColor: colors.borderLow,
    backgroundColor: colors.bgContrast25,
  },
});
