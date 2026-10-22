import { useNavigation } from 'expo-router';
import { useEffect, type RefObject } from 'react';

type Scrollable = { scrollToOffset(params: { offset: number; animated?: boolean }): void };

/** The tab navigator's view of a screen that is a direct child of it. */
type TabScreenNavigation = {
  addListener(event: 'tabPress', listener: () => void): () => void;
  isFocused(): boolean;
};

/** Pressing the tab of the screen that is already showing scrolls its list back to the top. */
export function useScrollToTopOnTabPress(listRef: RefObject<Scrollable | null>) {
  const navigation = useNavigation<TabScreenNavigation>();

  useEffect(
    () =>
      navigation.addListener('tabPress', () => {
        if (navigation.isFocused()) listRef.current?.scrollToOffset({ offset: 0, animated: true });
      }),
    [navigation, listRef],
  );
}
