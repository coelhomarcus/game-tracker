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

/** Visual width of a header slot: a small round button. */
export const HEADER_SLOT_SIZE = 33;
/** Minimum touch target; header buttons get real boxes this size (hitSlop past the parent is lost on Android). */
export const HEADER_TOUCH_SIZE = 48;
/** Bar height below the status bar; the bottom padding is part of it. */
const BAR_MIN_HEIGHT = 48;
const BAR_BOTTOM_PADDING = 4;
/** Pulls icon buttons out by their transparent padding so the icon lines up with the content gutter. */
const BUTTON_VISUAL_ALIGNMENT_OFFSET = 3;
/** A 48 dp box around a 33 dp slot overhangs it by this much on each side. */
const SLOT_OVERHANG = (HEADER_TOUCH_SIZE - HEADER_SLOT_SIZE) / 2;
/**
 * Header-left items are 48 dp boxes around a 32 dp avatar: pulled out by their padding, the avatar
 * sits on the 16 dp gutter.
 */
const LEFT_ITEM_OFFSET = -(HEADER_TOUCH_SIZE - 32) / 2;
/**
 * Header-right items are 48 dp boxes around 24 dp icons: pulled out so the icons sit as far from
 * the right edge as the back arrow from the left one.
 */
const RIGHT_ITEM_OFFSET = -((HEADER_TOUCH_SIZE - 24) / 2 - BUTTON_VISUAL_ALIGNMENT_OFFSET);

export type OuterProps = { children: ReactNode; noBottomBorder?: boolean };

/**
 * The header row. The app draws edge-to-edge, so the header pads the status bar itself and the
 * screen below it adds no top inset (see `Screen`). Its columns stretch over the bottom padding
 * too, so a 48 dp touch target fits inside them (Android drops touches outside a parent's bounds).
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
  return <View style={[styles.column, styles.content]}>{children}</View>;
}

export type SlotProps = {
  children?: ReactNode;
  /** Horizontal shift of the slot's contents, in dp (negative moves left). */
  offset?: number;
};

/**
 * A column for one header button (or an empty one to balance the row). It takes 33 dp in the row
 * but spans a full 48 dp box, so the button inside can be a real 48 dp target.
 */
export function Slot({ children, offset = 0 }: SlotProps) {
  return (
    <View
      style={[
        styles.column,
        styles.slot,
        { marginLeft: offset - SLOT_OVERHANG, marginRight: -offset - SLOT_OVERHANG },
      ]}
    >
      {children}
    </View>
  );
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
    <Slot offset={-BUTTON_VISUAL_ALIGNMENT_OFFSET}>
      <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={goBack} style={styles.touch}>
        {({ pressed }) => (
          <View style={[styles.circle, pressed && styles.pressed]}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </View>
        )}
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
type HeaderTitleProps = { children: string; tintColor?: string };

/** The navigator options the header reads; both the native stack and the bottom tabs provide them. */
export type AppHeaderOptions = {
  title?: string;
  /** A string replaces `title`; a function renders its own title node (for example avatar + name). */
  headerTitle?: string | ((props: HeaderTitleProps) => ReactNode);
  /** Replaces the back button. */
  headerLeft?: (props: HeaderItemProps) => ReactNode;
  headerRight?: (props: HeaderItemProps) => ReactNode;
  headerBackVisible?: boolean;
};

/**
 * Renders a header option in its own component, so hooks of a component passed as the option
 * (for example `headerLeft: HomeHeaderLeft`) belong to this item and not to the header.
 */
function HeaderItem<P>({ render, props }: { render: (props: P) => ReactNode; props: P }) {
  return render(props);
}

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
  const itemProps: HeaderItemProps = { tintColor: colors.text, canGoBack: navigation.canGoBack() };

  let left: ReactNode = null;
  if (headerLeft) {
    left = (
      <View style={[styles.column, styles.side, styles.left]}>
        <HeaderItem render={headerLeft} props={itemProps} />
      </View>
    );
  } else if (backButton && options.headerBackVisible !== false) {
    left = <BackButton navigation={navigation} />;
  }

  return (
    <Outer>
      {left}
      <Content>
        {typeof headerTitle === 'function' ? (
          <HeaderItem render={headerTitle} props={{ children: title, tintColor: colors.text }} />
        ) : title ? (
          <TitleText>{title}</TitleText>
        ) : null}
      </Content>
      {headerRight ? (
        <View style={[styles.column, styles.side, styles.right]}>
          <HeaderItem render={headerRight} props={itemProps} />
        </View>
      ) : null}
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
    alignItems: 'stretch',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: BAR_BOTTOM_PADDING,
    backgroundColor: colors.bg,
  },
  border: { borderBottomWidth: hairline, borderBottomColor: colors.borderLow },
  /** Every column reaches over the bottom padding: 44 + 4 = a 48 dp tall box inside the header. */
  column: { marginBottom: -BAR_BOTTOM_PADDING, justifyContent: 'center' },
  content: { flex: 1, alignItems: 'flex-start' },
  slot: { width: HEADER_TOUCH_SIZE, alignItems: 'center', zIndex: 50 },
  side: { flexDirection: 'row', alignItems: 'center' },
  left: { marginLeft: LEFT_ITEM_OFFSET },
  right: { marginRight: RIGHT_ITEM_OFFSET },
  touch: { width: HEADER_TOUCH_SIZE, height: HEADER_TOUCH_SIZE, alignItems: 'center', justifyContent: 'center' },
  circle: {
    width: HEADER_SLOT_SIZE,
    height: HEADER_SLOT_SIZE,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: colors.bgContrast25 },
});
