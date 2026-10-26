import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Text } from '@/components';
import { countGraphemes } from '@/lib/graphemes';
import { colors, space } from '@/theme/tokens';

/** The server stores a post in a varchar(500). */
export const POST_MAX_LENGTH = 500;
/** The remaining count only shows near the end, as in the design reference's counter. */
const SHOW_REMAINING_BELOW = 100;

const SIZE = 30;
const CENTER = SIZE / 2;
const TRACK_WIDTH = 1;
const PROGRESS_WIDTH = 3;
const PIE_BORDER = 4;
/** The progress arc runs just inside the track. */
const PROGRESS_RADIUS = CENTER - TRACK_WIDTH - PROGRESS_WIDTH / 2;
const PROGRESS_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RADIUS;
const PIE_RADIUS = CENTER - PIE_BORDER;

/**
 * How long a post is, as the counter shows it. People count user-perceived characters
 * (graphemes), but the server's column limits the UTF-16 length: once that is over the limit the
 * counter shows the UTF-16 length instead, so the ring is red exactly when the server would
 * refuse the text.
 */
export function measurePost(text: string): { count: number; over: boolean } {
  const graphemes = countGraphemes(text);
  const count = text.length > POST_MAX_LENGTH ? Math.max(graphemes, text.length) : graphemes;
  return { count, over: count > POST_MAX_LENGTH };
}

export function remainingLabel(remaining: number): string {
  if (remaining < 0) {
    const excess = -remaining;
    return `${excess} ${excess === 1 ? 'caractere' : 'caracteres'} acima do limite`;
  }
  return `${remaining} ${remaining === 1 ? 'caractere restante' : 'caracteres restantes'}`;
}

export type CharProgressProps = {
  /** From `measurePost`. */
  count: number;
  max?: number;
  style?: StyleProp<ViewStyle>;
};

/** Pie wedge from 12 o'clock, clockwise, for a fraction in (0, 1). */
function wedgePath(fraction: number): string {
  const angle = 2 * Math.PI * fraction;
  const x = CENTER + PIE_RADIUS * Math.sin(angle);
  const y = CENTER - PIE_RADIUS * Math.cos(angle);
  const largeArc = fraction > 0.5 ? 1 : 0;
  return `M ${CENTER} ${CENTER} L ${CENTER} ${CENTER - PIE_RADIUS} A ${PIE_RADIUS} ${PIE_RADIUS} 0 ${largeArc} 1 ${x} ${y} Z`;
}

/**
 * The composer's character counter: a 30 dp ring that fills toward the limit, the remaining count
 * in the last 100 characters, and a red pie with a negative count past the limit.
 */
export function CharProgress({ count, max = POST_MAX_LENGTH, style }: CharProgressProps) {
  const remaining = max - count;
  const over = remaining < 0;
  const showNumber = remaining <= SHOW_REMAINING_BELOW;
  const overflow = Math.min((count - max) / max, 1);

  return (
    <View
      testID="char-progress"
      accessible
      accessibilityRole="text"
      accessibilityLabel={remainingLabel(remaining)}
      // Only near the limit: announcing every keystroke of a long post would be noise.
      accessibilityLiveRegion={showNumber ? 'polite' : 'none'}
      style={[styles.row, style]}
    >
      {showNumber ? (
        <Text
          size="sm"
          tone={over ? 'danger' : 'medium'}
          maxFontSizeMultiplier={1}
          style={styles.number}
        >
          {String(remaining)}
        </Text>
      ) : (
        <View style={styles.number} />
      )}
      {over ? (
        <Svg testID="char-progress-pie" width={SIZE} height={SIZE}>
          <Circle
            cx={CENTER}
            cy={CENTER}
            r={CENTER - PIE_BORDER / 2}
            stroke={colors.danger}
            strokeWidth={PIE_BORDER}
            fill="none"
          />
          {overflow >= 1 ? (
            <Circle cx={CENTER} cy={CENTER} r={PIE_RADIUS} fill={colors.danger} />
          ) : overflow > 0 ? (
            <Path d={wedgePath(overflow)} fill={colors.danger} />
          ) : null}
        </Svg>
      ) : (
        <Svg testID="char-progress-ring" width={SIZE} height={SIZE}>
          <Circle
            cx={CENTER}
            cy={CENTER}
            r={CENTER - TRACK_WIDTH / 2}
            stroke={colors.borderLow}
            strokeWidth={TRACK_WIDTH}
            fill="none"
          />
          {count > 0 ? (
            <Circle
              testID="char-progress-arc"
              cx={CENTER}
              cy={CENTER}
              r={PROGRESS_RADIUS}
              stroke={colors.primary}
              strokeWidth={PROGRESS_WIDTH}
              fill="none"
              strokeDasharray={`${PROGRESS_CIRCUMFERENCE} ${PROGRESS_CIRCUMFERENCE}`}
              strokeDashoffset={PROGRESS_CIRCUMFERENCE * (1 - count / max)}
              rotation={-90}
              origin={`${CENTER}, ${CENTER}`}
            />
          ) : null}
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  number: { flexGrow: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
