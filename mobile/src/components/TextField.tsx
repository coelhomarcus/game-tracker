import { type ComponentRef, type Ref } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, fontSize, radii, space } from '@/theme/tokens';

export type TextFieldInput = ComponentRef<typeof TextInput>;

export type TextFieldProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  /** Hint shown under the field while there is no error. */
  helper?: string;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
  secureTextEntry?: boolean;
  autoComplete?: TextInputProps['autoComplete'];
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
  inputRef?: Ref<TextFieldInput>;
};

export function TextField({ label, error, helper, multiline, inputRef, ...inputProps }: TextFieldProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...inputProps}
        ref={inputRef}
        multiline={multiline}
        accessibilityLabel={label}
        accessibilityHint={error}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, multiline ? styles.inputMultiline : null, error ? styles.inputError : null]}
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
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: fontSize.md,
  },
  inputMultiline: { minHeight: 120, paddingVertical: space.md, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  helper: { color: colors.textMuted, fontSize: fontSize.sm },
  error: { color: colors.danger, fontSize: fontSize.sm },
});
