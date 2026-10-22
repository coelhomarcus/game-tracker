import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Text, TextField, type TextFieldInput } from '@/components';
import { space } from '@/theme/tokens';

import { authErrorMessage } from './messages';
import { useSession } from './session';
import { validateLogin, type LoginErrors } from './validation';

export function LoginForm() {
  const router = useRouter();
  const signIn = useSession((state) => state.signIn);
  const passwordRef = useRef<TextFieldInput>(null);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<LoginErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function edit(setter: (text: string) => void) {
    return (text: string) => {
      setter(text);
      setServerError(null);
    };
  }

  async function submit() {
    if (submitting) return;
    const trimmed = identifier.trim();
    const found = validateLogin({ identifier: trimmed, password });
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setServerError(null);
    setSubmitting(true);
    try {
      await signIn(trimmed, password);
    } catch (error) {
      setServerError(authErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" size="_3xl" weight="bold" tone="high">
        GameTracker
      </Text>
      <TextField
        label="E-mail ou username"
        value={identifier}
        onChangeText={edit(setIdentifier)}
        error={errors.identifier}
        autoCapitalize="none"
        autoComplete="username"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        label="Senha"
        inputRef={passwordRef}
        value={password}
        onChangeText={edit(setPassword)}
        error={errors.password}
        secureTextEntry
        autoComplete="current-password"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />
      {serverError ? (
        <Text accessibilityLiveRegion="polite" size="sm" tone="danger">
          {serverError}
        </Text>
      ) : null}
      <Button label="Entrar" onPress={() => void submit()} loading={submitting} />
      <Button label="Criar conta" variant="ghost" onPress={() => router.replace('/register')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', gap: space.lg, padding: space._2xl },
});
