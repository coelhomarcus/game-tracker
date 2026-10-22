import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Text, TextField, type TextFieldInput } from '@/components';
import { space } from '@/theme/tokens';

import { authErrorMessage } from './messages';
import { useSession } from './session';
import { validateRegister, type RegisterErrors } from './validation';

export function RegisterForm() {
  const router = useRouter();
  const signUp = useSession((state) => state.signUp);
  const usernameRef = useRef<TextFieldInput>(null);
  const emailRef = useRef<TextFieldInput>(null);
  const passwordRef = useRef<TextFieldInput>(null);
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
    if (submitting) return;
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
      <Text accessibilityRole="header" size="_3xl" weight="bold" tone="high">
        GameTracker
      </Text>
      <TextField
        label="Nome"
        value={name}
        onChangeText={edit(setName)}
        error={errors.name}
        autoComplete="name"
        returnKeyType="next"
        onSubmitEditing={() => usernameRef.current?.focus()}
      />
      <TextField
        label="Username"
        inputRef={usernameRef}
        value={username}
        onChangeText={edit(setUsername)}
        error={errors.username}
        autoCapitalize="none"
        autoComplete="username-new"
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      <TextField
        label="E-mail"
        inputRef={emailRef}
        value={email}
        onChangeText={edit(setEmail)}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
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
        autoComplete="new-password"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />
      {serverError ? (
        <Text accessibilityLiveRegion="polite" size="sm" tone="danger">
          {serverError}
        </Text>
      ) : null}
      <Button label="Criar conta" onPress={() => void submit()} loading={submitting} />
      <Button label="Já tenho conta" variant="ghost" onPress={() => router.replace('/login')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', gap: space.lg, padding: space._2xl },
});
