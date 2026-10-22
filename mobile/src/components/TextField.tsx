import { useState, type ComponentRef, type Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, lineHeight, primary, type } from '@/theme/tokens';
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
  secureTextEntry?: boolean;
  autoComplete?: TextInputProps['autoComplete'];
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
  inputRef?: Ref<TextFieldInput>;
};

export function TextField({
  label,
  hideLabel,
  error,
  helper,
  showCounter,
  multiline,
  maxLines,
  inputRef,
  ...inputProps
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const { maxLength, value } = inputProps;
  const multilineStyle = multiline
    ? maxLines
      ? [styles.inputGrowing, { maxHeight: LINE_HEIGHT * maxLines + (VERTICAL_PADDING + BORDER_WIDTH) * 2 }]
      : styles.inputMultiline
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
      <TextInput
        {...inputProps}
        ref={inputRef}
        multiline={multiline}
        accessibilityLabel={label}
        accessibilityHint={error}
        placeholderTextColor={colors.textMedium}
        selectionColor={primary[500]}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          multilineStyle,
          focused ? styles.inputFocused : null,
          error ? styles.inputError : null,
        ]}
      />
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
  inputGrowing: { textAlignVertical: 'center' },
  inputFocused: { borderColor: primary[500] },
  inputError: { borderColor: colors.danger },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  noteText: { flex: 1 },
  counter: { marginStart: 'auto' },
});
