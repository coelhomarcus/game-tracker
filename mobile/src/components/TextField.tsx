import { useState, type ComponentRef, type Ref } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, fontSize, radii, space } from '@/theme/tokens';

/** The growing multiline field: 16 px text, one line fills the 48 dp minimum height. */
const LINE_HEIGHT = 22;
const GROWING_PADDING = 13;

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
  multiline,
  maxLines,
  inputRef,
  ...inputProps
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const multilineStyle = multiline
    ? maxLines
      ? [styles.inputGrowing, { maxHeight: LINE_HEIGHT * maxLines + GROWING_PADDING * 2 }]
      : styles.inputMultiline
    : null;
  return (
    <View style={styles.container}>
      {hideLabel ? null : <Text style={styles.label}>{label}</Text>}
      <TextInput
        {...inputProps}
        ref={inputRef}
        multiline={multiline}
        accessibilityLabel={label}
        accessibilityHint={error}
        placeholderTextColor={colors.textMuted}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          multilineStyle,
          focused ? styles.inputFocused : null,
          error ? styles.inputError : null,
        ]}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : helper ? (
        <Text style={styles.helper}>{helper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.xs },
  label: { color: colors.text, fontSize: fontSize.sm },
  input: {
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.raised,
    color: colors.text,
    fontSize: fontSize.md,
  },
  inputMultiline: { minHeight: 120, paddingVertical: space.md, textAlignVertical: 'top' },
  inputGrowing: {
    lineHeight: LINE_HEIGHT,
    paddingVertical: GROWING_PADDING,
    textAlignVertical: 'center',
  },
  inputFocused: { borderColor: colors.accent },
  inputError: { borderColor: colors.danger },
  helper: { color: colors.textMuted, fontSize: fontSize.sm },
  error: { color: colors.danger, fontSize: fontSize.sm },
});
