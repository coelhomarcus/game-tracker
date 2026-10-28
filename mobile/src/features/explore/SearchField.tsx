import { Ionicons } from '@expo/vector-icons';
import { useState, type Ref } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, type TextFieldInput } from '@/components';
import { fontFamily } from '@/components/Text';
import { colors, lineHeight, primary, space, type } from '@/theme/tokens';

export const SEARCH_PLACEHOLDER = 'Buscar jogos, pessoas e posts';
/** The longest term the searches take (posts and games; people search sends the first 50). */
export const SEARCH_MAX_LENGTH = 100;

const FIELD_HEIGHT = 48;
const FIELD_RADIUS = 10;
const ICON_SIZE = 18;
/** Real touch box of the clear button, inside the field. */
const CLEAR_BOX = 48;

export type SearchFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  onFocus: () => void;
  onBlur?: () => void;
  onSubmit: () => void;
  /** The "x" inside the field: empties it and keeps the keyboard up. */
  onClear: () => void;
  /** Shows "Cancelar" beside the field (focus mode). */
  showCancel: boolean;
  onCancel: () => void;
  inputRef?: Ref<TextFieldInput>;
};

/**
 * Explorar's search bar after the design reference: a filled field with a leading magnifier, a
 * clear "x" while it holds text, and "Cancelar" beside it in focus mode.
 */
export function SearchField({
  value,
  onChangeText,
  onFocus,
  onBlur,
  onSubmit,
  onClear,
  showCancel,
  onCancel,
  inputRef,
}: SearchFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View testID="search-bar" style={styles.bar}>
      <View style={styles.field}>
        <Ionicons
          name="search"
          size={ICON_SIZE}
          color={focused ? colors.primary : colors.textLow}
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={styles.icon}
        />
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          accessibilityLabel="Buscar"
          placeholder={SEARCH_PLACEHOLDER}
          placeholderTextColor={colors.textMedium}
          selectionColor={primary[500]}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={SEARCH_MAX_LENGTH}
          onFocus={() => {
            setFocused(true);
            onFocus();
          }}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          onSubmitEditing={onSubmit}
          style={styles.input}
        />
        {value.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Limpar busca"
            onPress={onClear}
            style={styles.clear}
          >
            <Ionicons name="close-circle" size={ICON_SIZE} color={colors.textMedium} />
          </Pressable>
        ) : null}
      </View>
      {showCancel ? (
        <Button label="Cancelar" variant="ghost" color="secondary" size="small" onPress={onCancel} />
      ) : null}
    </View>
  );
}

const FONT_SIZE = type.size.md;

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.bg,
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: FIELD_HEIGHT,
    borderRadius: FIELD_RADIUS,
    backgroundColor: colors.bgContrast50,
    paddingLeft: space.md,
  },
  icon: { marginRight: space.sm },
  input: {
    flex: 1,
    height: FIELD_HEIGHT,
    paddingVertical: 0,
    color: colors.text,
    fontFamily: fontFamily.normal,
    fontSize: FONT_SIZE,
    lineHeight: lineHeight(FONT_SIZE, 'snug'),
  },
  clear: {
    width: CLEAR_BOX,
    height: CLEAR_BOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
