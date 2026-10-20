import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, TextField } from '@/components';
import { colors, fontSize, space } from '@/theme/tokens';

import { authErrorMessage } from './messages';
import { useSession } from './session';
import { validateRegister, type RegisterErrors } from './validation';

export function RegisterForm() {
  const router = useRouter();
  const signUp = useSession((state) => state.signUp);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function edit(setter: (text: string) => void) {
    return (text: string) => {
      setter(text);
      setServerError(null);
    };
  }

  async function submit() {
    const input = {
      name: name.trim(),
      username: username.trim(),
      email: email.trim(),
      password,
    };
    const found = validateRegister(input);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setServerError(null);
    setSubmitting(true);
    try {
      await signUp(input);
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
        label="Nome"
        value={name}
        onChangeText={edit(setName)}
        error={errors.name}
        autoComplete="name"
      />
      <TextField
        label="Username"
        value={username}
        onChangeText={edit(setUsername)}
        error={errors.username}
        autoCapitalize="none"
        autoComplete="username-new"
      />
      <TextField
        label="E-mail"
        value={email}
        onChangeText={edit(setEmail)}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <TextField
        label="Senha"
        value={password}
        onChangeText={edit(setPassword)}
        error={errors.password}
        secureTextEntry
        autoComplete="new-password"
      />
      {serverError ? (
        <Text accessibilityLiveRegion="polite" style={styles.serverError}>
          {serverError}
        </Text>
      ) : null}
      <Button label="Criar conta" onPress={() => void submit()} loading={submitting} />
      <Button label="Já tenho conta" variant="text" onPress={() => router.replace('/login')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', gap: space.lg, padding: space.xl },
  title: { color: colors.textStrong, fontSize: fontSize.xl, fontWeight: 'bold' },
  serverError: { color: colors.danger, fontSize: fontSize.sm },
});
