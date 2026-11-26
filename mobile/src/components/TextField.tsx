import { Ionicons } from '@expo/vector-icons';
import { useState, type ComponentRef, type Ref } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import type { IoniconName } from '@/features/library/status';
import { colors, lineHeight, primary, radii, type } from '@/theme/tokens';
import { fontFamily, Text } from './Text';

const FONT_SIZE = type.size.md;
const LINE_HEIGHT = lineHeight(FONT_SIZE, 'snug');
const VERTICAL_PADDING = 13;
const BORDER_WIDTH = 1;

export type TextFieldInput = ComponentRef<typeof TextInput>;

export type TextFieldProps = {
  label: string;
  /** Keeps the label for screen readers only, for compact fields that carry a placeholder. */
  hideLabel?: boolean;
  leadingIcon?: IoniconName;
  /** Shows a clear button while the field contains text. */
  clear?: { label: string; onPress: () => void };
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  /** Hint shown under the field while there is no error. */
  helper?: string;
  placeholder?: string;
  maxLength?: number;
  /** With `maxLength`: shows an `n/max` character counter under the field. */
  showCounter?: boolean;
  multiline?: boolean;
  /** With `multiline`: starts at one line and grows up to this many, then scrolls. */
  maxLines?: number;
  /** With `multiline` and no `maxLines`: the field's height before it grows (120 by default). */
  minHeight?: number;
  secureTextEntry?: boolean;
  /** False while the value must not change, e.g. while it is being saved. */
  editable?: boolean;
  autoComplete?: TextInputProps['autoComplete'];
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoCorrect?: TextInputProps['autoCorrect'];
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
  onBlur?: () => void;
  inputRef?: Ref<TextFieldInput>;
};

export function TextField({
  label,
  hideLabel,
  leadingIcon,
  clear,
  error,
  helper,
  showCounter,
  multiline,
  maxLines,
  minHeight,
  inputRef,
  onBlur,
  ...inputProps
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const { maxLength, value } = inputProps;
  const canClear = clear !== undefined && value.length > 0 && inputProps.editable !== false;
  const multilineStyle = multiline
    ? maxLines
      ? [styles.inputGrowing, { maxHeight: LINE_HEIGHT * maxLines + (VERTICAL_PADDING + BORDER_WIDTH) * 2 }]
      : [styles.inputMultiline, minHeight === undefined ? null : { minHeight }]
    : null;
  const count = showCounter && maxLength !== undefined ? Array.from(value).length : null;
  const note = error ? (
    <Text accessibilityLiveRegion="polite" size="sm" tone="danger" style={styles.noteText}>
      {error}
    </Text>
  ) : helper ? (
    <Text size="sm" tone="medium" style={styles.noteText}>
      {helper}
    </Text>
  ) : null;
  return (
    <View style={styles.container}>
      {hideLabel ? null : (
        <Text size="sm" weight="medium" tone="medium">
          {label}
        </Text>
      )}
      <View>
        <TextInput
          {...inputProps}
          ref={inputRef}
          multiline={multiline}
          accessibilityLabel={label}
          accessibilityHint={error}
          placeholderTextColor={colors.textMedium}
          selectionColor={primary[500]}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          style={[
            styles.input,
            multilineStyle,
            leadingIcon && styles.inputWithIcon,
            canClear && styles.inputWithClear,
            focused && styles.inputFocused,
            error && styles.inputError,
          ]}
        />
        {leadingIcon ? (
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.icon}>
            <Ionicons name={leadingIcon} size={18} color={focused ? colors.primary : colors.textMedium} />
          </View>
        ) : null}
        {canClear ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={clear.label}
            onPress={clear.onPress}
            style={({ pressed }) => [styles.clear, pressed && styles.clearPressed]}
          >
            <Ionicons name="close-circle" size={18} color={colors.textMedium} />
          </Pressable>
        ) : null}
      </View>
      {note || count !== null ? (
        <View style={styles.noteRow}>
          {note}
          {count !== null && maxLength !== undefined ? (
            <Text size="xs" tone={count > maxLength ? 'danger' : 'medium'} style={styles.counter}>
              {`${count}/${maxLength}`}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  input: {
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: VERTICAL_PADDING,
    borderRadius: 10,
    borderWidth: BORDER_WIDTH,
    borderColor: colors.borderLow,
    backgroundColor: colors.bgContrast50,
    color: colors.text,
    fontFamily: fontFamily.normal,
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
  },
  inputMultiline: { minHeight: 120, textAlignVertical: 'top' },
  inputWithIcon: { paddingStart: 40 },
  inputWithClear: { paddingEnd: 48 },
  icon: { position: 'absolute', start: 13, top: 0, height: 48, justifyContent: 'center' },
  clear: {
    position: 'absolute', end: 1, top: 0, width: 48, height: 48, borderRadius: radii.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  clearPressed: { backgroundColor: colors.bgContrast25 },
  inputGrowing: { textAlignVertical: 'center' },
  inputFocused: { borderColor: primary[500] },
  inputError: { borderColor: colors.danger },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  noteText: { flex: 1 },
  counter: { marginStart: 'auto' },
});
