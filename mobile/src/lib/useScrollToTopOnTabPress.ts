import { useNavigation } from 'expo-router';
import { useEffect, useRef, type RefObject } from 'react';

type Scrollable = { scrollToOffset(params: { offset: number; animated?: boolean }): void };

/** The tab navigator's view of a screen that is a direct child of it. */
type TabScreenNavigation = {
  addListener(event: 'tabPress', listener: () => void): () => void;
  isFocused(): boolean;
};

/**
 * Pressing the tab of the screen that is already showing scrolls its list back to the top.
 * `onScrollToTop` runs first, for example to bring back a header that hid on scroll.
 */
export function useScrollToTopOnTabPress(listRef: RefObject<Scrollable | null>, onScrollToTop?: () => void) {
  const navigation = useNavigation<TabScreenNavigation>();
  // Read at press time, so a new callback does not resubscribe the listener.
  const onScrollToTopRef = useRef(onScrollToTop);
  useEffect(() => {
    onScrollToTopRef.current = onScrollToTop;
  }, [onScrollToTop]);

  useEffect(
    () =>
      navigation.addListener('tabPress', () => {
        if (!navigation.isFocused()) return;
        onScrollToTopRef.current?.();
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      }),
    [navigation, listRef],
  );
}
