import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, TextField } from '@/components';
import { colors, fontSize, space } from '@/theme/tokens';

import { authErrorMessage } from './messages';
import { useSession } from './session';
import { validateLogin, type LoginErrors } from './validation';

export function LoginForm() {
  const router = useRouter();
  const signIn = useSession((state) => state.signIn);
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
      <Text accessibilityRole="header" style={styles.title}>
        GameTracker
      </Text>
      <TextField
        label="E-mail ou username"
        value={identifier}
        onChangeText={edit(setIdentifier)}
        error={errors.identifier}
        autoCapitalize="none"
        autoComplete="username"
      />
      <TextField
        label="Senha"
        value={password}
        onChangeText={edit(setPassword)}
        error={errors.password}
        secureTextEntry
        autoComplete="current-password"
      />
      {serverError ? (
        <Text accessibilityLiveRegion="polite" style={styles.serverError}>
          {serverError}
        </Text>
      ) : null}
      <Button label="Entrar" onPress={() => void submit()} loading={submitting} />
      <Button label="Criar conta" variant="text" onPress={() => router.replace('/register')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', gap: space.lg, padding: space.xl },
  title: { color: colors.textStrong, fontSize: fontSize.xl, fontWeight: 'bold' },
  serverError: { color: colors.danger, fontSize: fontSize.sm },
});
