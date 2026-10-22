import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { NativeStackHeaderProps } from 'expo-router/native-stack';
import type { BottomTabHeaderProps } from 'expo-router/tabs';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/lib/haptics';
import { colors, hairline, radii } from '@/theme/tokens';
import { Text } from '../Text';

/** Width of a header slot: a small round button. */
export const HEADER_SLOT_SIZE = 33;
/** Bar height below the status bar; the bottom padding is part of it. */
const BAR_MIN_HEIGHT = 48;
/** Pulls icon buttons out by their transparent padding so the icon lines up with the content gutter. */
const BUTTON_VISUAL_ALIGNMENT_OFFSET = 3;
const HEADER_BUTTON_HITSLOP = { top: 30, bottom: 10, left: 30, right: 30 };

export type OuterProps = { children: ReactNode; noBottomBorder?: boolean };

/**
 * The header row. The app draws edge-to-edge, so the header pads the status bar itself and the
 * screen below it adds no top inset (see `Screen`).
 */
export function Outer({ children, noBottomBorder = false }: OuterProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="app-header"
      style={[
        styles.outer,
        { paddingTop: insets.top, minHeight: BAR_MIN_HEIGHT + insets.top },
        !noBottomBorder && styles.border,
      ]}
    >
      {children}
    </View>
  );
}

/** The middle column holding the title; it takes the room the slots leave. */
export function Content({ children }: { children?: ReactNode }) {
  return <View style={styles.content}>{children}</View>;
}

/** A fixed-width column for one header button (or an empty one to balance the row). */
export function Slot({ children }: { children?: ReactNode }) {
  return <View style={styles.slot}>{children}</View>;
}

type BackNavigation = { canGoBack(): boolean; goBack(): void };

export type BackButtonProps = {
  /** The navigation of the screen the header belongs to (the `navigation` the navigator passes to `header`). */
  navigation: BackNavigation;
};

export function BackButton({ navigation }: BackButtonProps) {
  function goBack() {
    haptic('tap');
    // A screen opened from a link or a notification may have nothing below it.
    if (navigation.canGoBack()) navigation.goBack();
    else router.navigate('/');
  }

  return (
    <Slot>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Voltar"
        hitSlop={HEADER_BUTTON_HITSLOP}
        onPress={goBack}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <Ionicons name="arrow-back" size={22} color={colors.textHigh} />
      </Pressable>
    </Slot>
  );
}

export function TitleText({ children }: { children: string }) {
  return (
    <Text
      accessibilityRole="header"
      size="lg"
      weight="semibold"
      leading="tight"
      tone="high"
      numberOfLines={2}
      maxFontSizeMultiplier={2}
    >
      {children}
    </Text>
  );
}

export function SubtitleText({ children }: { children: string }) {
  return (
    <Text size="sm" tone="medium" numberOfLines={1}>
      {children}
    </Text>
  );
}

type HeaderItemProps = { tintColor?: string; canGoBack: boolean };

/** The navigator options the header reads; both the native stack and the bottom tabs provide them. */
export type AppHeaderOptions = {
  title?: string;
  /** A string replaces `title`; a function renders its own title node (for example avatar + name). */
  headerTitle?: string | ((props: { children: string; tintColor?: string }) => ReactNode);
  /** Replaces the back button. */
  headerLeft?: (props: HeaderItemProps) => ReactNode;
  headerRight?: (props: HeaderItemProps) => ReactNode;
  headerBackVisible?: boolean;
};

export type AppHeaderProps = {
  options: AppHeaderOptions;
  navigation: BackNavigation;
  /** Stack screens lead with a back button; tab roots do not. */
  backButton?: boolean;
};

/** The one header of every navigator: back button or `headerLeft`, the title, then `headerRight`. */
export function AppHeader({ options, navigation, backButton = false }: AppHeaderProps) {
  const { headerTitle, headerLeft, headerRight } = options;
  const title = typeof headerTitle === 'string' ? headerTitle : (options.title ?? '');
  const itemProps: HeaderItemProps = { tintColor: colors.textHigh, canGoBack: navigation.canGoBack() };

  let left: ReactNode = null;
  if (headerLeft) left = <View style={styles.side}>{headerLeft(itemProps)}</View>;
  else if (backButton && options.headerBackVisible !== false) left = <BackButton navigation={navigation} />;

  return (
    <Outer>
      {left}
      <Content>
        {typeof headerTitle === 'function' ? (
          headerTitle({ children: title, tintColor: colors.textHigh })
        ) : title ? (
          <TitleText>{title}</TitleText>
        ) : null}
      </Content>
      {headerRight ? <View style={[styles.side, styles.right]}>{headerRight(itemProps)}</View> : null}
    </Outer>
  );
}

/** `header` option for the native stacks. */
export function renderStackHeader(props: NativeStackHeaderProps) {
  return <AppHeader options={props.options} navigation={props.navigation} backButton />;
}

/** `header` option for the bottom tabs. */
export function renderTabHeader(props: BottomTabHeaderProps) {
  return <AppHeader options={props.options} navigation={props.navigation} />;
}

const styles = StyleSheet.create({
  outer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 4,
    backgroundColor: colors.bg,
  },
  border: { borderBottomWidth: hairline, borderBottomColor: colors.borderLow },
  content: { flex: 1, justifyContent: 'center', alignItems: 'flex-start', minHeight: HEADER_SLOT_SIZE },
  slot: { width: HEADER_SLOT_SIZE, zIndex: 50 },
  side: { flexDirection: 'row', alignItems: 'center', minWidth: HEADER_SLOT_SIZE },
  /**
   * Header-right buttons are 44 dp boxes around 24 dp icons; pulling the row out lines their icons
   * up with the back arrow's distance from the opposite edge.
   */
  right: { marginRight: -(10 - BUTTON_VISUAL_ALIGNMENT_OFFSET) },
  backButton: {
    width: HEADER_SLOT_SIZE,
    height: HEADER_SLOT_SIZE,
    marginLeft: -BUTTON_VISUAL_ALIGNMENT_OFFSET,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: colors.bgContrast25 },
});
