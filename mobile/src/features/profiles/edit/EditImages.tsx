import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Avatar } from '@/components';
import { colors } from '@/theme/tokens';

import type { ImageKind } from '../types';

export const BANNER_HEIGHT = 150;
const AVATAR_SIZE = 80;
const AVATAR_RING = 84;
const AVATAR_TOP = 80;
const AVATAR_LEFT = 20;
const BADGE_SIZE = 24;
const BADGE_ICON = 14;

export type EditImagesProps = {
  bannerUri: string | null;
  avatarUri: string | null;
  /** For the avatar's initial when there is no picture. */
  name: string;
  disabled: boolean;
  onEdit: (kind: ImageKind) => void;
};

/** The camera seal that marks an image as editable. */
function CameraBadge({ style }: { style: StyleProp<ViewStyle> }) {
  return (
    <View testID="camera-badge" style={[styles.badge, style]}>
      <Ionicons name="camera" size={BADGE_ICON} color={colors.textEmphasis} />
    </View>
  );
}

/**
 * The banner and, over its lower edge, the avatar: each is one pressable that opens its edit
 * menu. The block is as tall as the avatar's bottom, which hangs below the banner.
 */
export function EditImages({ bannerUri, avatarUri, name, disabled, onEdit }: EditImagesProps) {
  return (
    <View style={styles.block}>
      <Pressable
        testID="edit-banner"
        accessibilityRole="button"
        accessibilityLabel="Alterar capa"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => onEdit('banner')}
        style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
      >
        {bannerUri ? (
          <Image testID="edit-banner-image" source={{ uri: bannerUri }} style={styles.fill} />
        ) : null}
        <CameraBadge style={styles.bannerBadge} />
      </Pressable>
      <Pressable
        testID="edit-avatar"
        accessibilityRole="button"
        accessibilityLabel="Alterar foto"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => onEdit('avatar')}
        style={({ pressed }) => [styles.ring, pressed && styles.pressed]}
      >
        <Avatar uri={avatarUri} name={name} size={AVATAR_SIZE} />
        <CameraBadge style={styles.avatarBadge} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { height: AVATAR_TOP + AVATAR_RING },
  banner: {
    width: '100%',
    height: BANNER_HEIGHT,
    backgroundColor: colors.bgContrast25,
    overflow: 'hidden',
  },
  fill: { width: '100%', height: '100%' },
  pressed: { opacity: 0.8 },
  ring: {
    position: 'absolute',
    top: AVATAR_TOP,
    left: AVATAR_LEFT,
    width: AVATAR_RING,
    height: AVATAR_RING,
    borderRadius: AVATAR_RING / 2,
    borderWidth: (AVATAR_RING - AVATAR_SIZE) / 2,
    borderColor: colors.bg,
    backgroundColor: colors.bg,
  },
  badge: {
    position: 'absolute',
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgContrast50,
  },
  bannerBadge: { bottom: 8, right: 24 },
  avatarBadge: { bottom: 0, right: 0 },
});
