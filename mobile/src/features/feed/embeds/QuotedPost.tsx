import { StyleSheet, View } from 'react-native';

import { Text } from '@/components';
import { colors, hairline, radii, space } from '@/theme/tokens';

import type { QuotedPost as QuotedPostData } from '../types';
import { PostPreview } from './PostPreview';

export type QuotedPostProps = {
  post: QuotedPostData;
  /** Defaults to opening the quoted post; `null` makes it a static card, e.g. in the composer. */
  onPress?: (() => void) | null;
};

/** The original of a quote post, one level deep: a card that opens it. */
export function QuotedPost({ post, onPress }: QuotedPostProps) {
  return <PostPreview post={post} kind="quote" onPress={onPress} testID="quoted-post" />;
}

/** Where the original of a quote post was, once it is deleted. */
export function RemovedQuote() {
  return (
    <View testID="quoted-post-removed" style={styles.removed}>
      <Text size="sm" tone="low">
        Post removido
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  removed: {
    padding: space.md,
    borderRadius: radii.md,
    borderWidth: hairline,
    borderColor: colors.borderLow,
    backgroundColor: colors.bgContrast25,
  },
});
