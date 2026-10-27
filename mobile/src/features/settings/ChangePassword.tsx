import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, Text, TextField, type TextFieldInput } from '@/components';
import { accountApi, authErrorMessage } from '@/features/auth';
import {
  validateChangePassword,
  type ChangePasswordInput,
} from '@/features/auth/validation';
import { ApiError } from '@/lib/http/errors';
import { showToast } from '@/lib/toast';
import { space } from '@/theme/tokens';

type Field = keyof ChangePasswordInput;

const WRONG_PASSWORD = 'Senha atual incorreta.';

/** Configurações → Conta → Trocar senha. Every other session ends; this one stays signed in. */
export function ChangePassword() {
  const router = useRouter();
  const nextRef = useRef<TextFieldInput>(null);
  const confirmRef = useRef<TextFieldInput>(null);
  const [values, setValues] = useState<ChangePasswordInput>({ current: '', next: '', confirm: '' });
  // A field's rule shows once the user has left it, and then follows the typing.
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [wrongPassword, setWrongPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const errors = validateChangePassword(values);
  const valid = Object.keys(errors).length === 0;
  const shown = (field: Field) => (touched[field] ? errors[field] : undefined);

  function edit(field: Field) {
    return (text: string) => {
      setValues((current) => ({ ...current, [field]: text }));
      if (field === 'current') setWrongPassword(false);
      setServerError(null);
    };
  }

  const leave = (field: Field) => () => setTouched((current) => ({ ...current, [field]: true }));

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setServerError(null);
    try {
      await accountApi.changePassword(values.current, values.next);
    } catch (error) {
      setSaving(false);
      if (error instanceof ApiError && error.code === 'invalid_password') {
        setWrongPassword(true);
      } else {
        setServerError(authErrorMessage(error));
      }
      return;
    }
    showToast('Senha alterada');
    router.back();
  }

  return (
    <Screen scroll>
      <View style={styles.form}>
        <TextField
          label="Senha atual"
          value={values.current}
          onChangeText={edit('current')}
          onBlur={leave('current')}
          error={wrongPassword ? WRONG_PASSWORD : shown('current')}
          secureTextEntry
          editable={!saving}
          autoComplete="current-password"
          returnKeyType="next"
          onSubmitEditing={() => nextRef.current?.focus()}
        />
        <TextField
          label="Nova senha"
          inputRef={nextRef}
          value={values.next}
          onChangeText={edit('next')}
          onBlur={leave('next')}
          error={shown('next')}
          helper="Use de 8 a 72 caracteres."
          secureTextEntry
          editable={!saving}
          autoComplete="new-password"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
        />
        <TextField
          label="Confirmar nova senha"
          inputRef={confirmRef}
          value={values.confirm}
          onChangeText={edit('confirm')}
          onBlur={leave('confirm')}
          error={shown('confirm')}
          secureTextEntry
          editable={!saving}
          autoComplete="new-password"
          returnKeyType="done"
          onSubmitEditing={() => void save()}
        />
        {serverError ? (
          <Text accessibilityLiveRegion="polite" size="sm" tone="danger">
            {serverError}
          </Text>
        ) : null}
        <Text size="sm" tone="medium">
          Você continua conectado neste aparelho. Nos outros, será preciso entrar de novo.
        </Text>
        <Button label="Salvar" onPress={() => void save()} disabled={!valid} loading={saving} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.lg, padding: space.xl },
});
