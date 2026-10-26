import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Layout, OptionSheet, type OptionSheetSection } from '@/components';
import { usePreferences, type ThreadSort, type ThreadView } from '@/lib/preferences';
import { colors, radii } from '@/theme/tokens';

type ThreadChoice = ThreadView | ThreadSort;

const VIEWS: ThreadView[] = ['linear', 'tree'];

const VIEW_LABELS: Record<ThreadView, string> = { linear: 'Em linha', tree: 'Em árvore' };
const SORT_LABELS: Record<ThreadSort, string> = {
  top: 'Mais curtidas',
  oldest: 'Mais antigas',
  newest: 'Mais novas',
};

function isView(choice: ThreadChoice): choice is ThreadView {
  return (VIEWS as ThreadChoice[]).includes(choice);
}

export type ThreadMenuProps = {
  /** Runs after the user picked another view or order (not when they picked the current one). */
  onChange?: () => void;
};

/**
 * The "…" of a post page's header: a sheet to show the replies "Em linha" or "Em árvore" and to
 * sort them by most liked, oldest or newest. Both choices are kept in the preferences, so every
 * post opens the way the user last chose.
 */
export function ThreadMenu({ onChange }: ThreadMenuProps) {
  const view = usePreferences((state) => state.threadView);
  const sort = usePreferences((state) => state.threadSort);
  const setView = usePreferences((state) => state.setThreadView);
  const setSort = usePreferences((state) => state.setThreadSort);
  const [open, setOpen] = useState(false);

  const sections: OptionSheetSection<ThreadChoice>[] = [
    {
      title: 'Mostrar respostas como',
      options: VIEWS.map((value) => ({ value, label: VIEW_LABELS[value] })),
      selected: view,
    },
    {
      title: 'Ordenar respostas',
      options: (Object.keys(SORT_LABELS) as ThreadSort[]).map((value) => ({
        value,
        label: SORT_LABELS[value],
      })),
      selected: sort,
    },
  ];

  const choose = (choice: ThreadChoice) => {
    if (choice === view || choice === sort) return;
    if (isView(choice)) setView(choice);
    else setSort(choice);
    onChange?.();
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Opções da conversa"
        onPress={() => setOpen(true)}
        style={styles.touch}
      >
        {({ pressed }) => (
          <View style={[styles.circle, pressed && styles.pressed]}>
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
          </View>
        )}
      </Pressable>
      <OptionSheet<ThreadChoice>
        visible={open}
        title="Opções da conversa"
        sections={sections}
        onSelect={choose}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  touch: {
    width: Layout.Header.HEADER_TOUCH_SIZE,
    height: Layout.Header.HEADER_TOUCH_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: Layout.Header.HEADER_SLOT_SIZE,
    height: Layout.Header.HEADER_SLOT_SIZE,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: colors.bgContrast25 },
});
