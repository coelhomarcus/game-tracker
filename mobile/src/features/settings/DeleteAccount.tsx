import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, Text, TextField } from '@/components';
import { accountApi, authErrorMessage, useSession } from '@/features/auth';
import { ApiError } from '@/lib/http/errors';
import { showToast } from '@/lib/toast';
import { space } from '@/theme/tokens';

const WRONG_PASSWORD = 'Senha incorreta.';

/**
 * Configurações → Conta → Excluir conta, in two steps: what is lost, then the password. Once the
 * server deleted the account, the app signs out the same way Sair does and lands on the login.
 */
export function DeleteAccount() {
  const router = useRouter();
  const [step, setStep] = useState<'explain' | 'confirm'>('explain');
  const [password, setPassword] = useState('');
  const [wrongPassword, setWrongPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (password.length === 0 || deleting) return;
    setDeleting(true);
    setServerError(null);
    try {
      await accountApi.deleteAccount(password);
    } catch (error) {
      setDeleting(false);
      if (error instanceof ApiError && error.code === 'invalid_password') setWrongPassword(true);
      else setServerError(authErrorMessage(error));
      return;
    }
    // The account is gone: drafts, caches and the stored session go with it, as on Sair.
    await useSession.getState().signOut();
    showToast('Conta excluída');
  }

  if (step === 'explain') {
    return (
      <Screen scroll>
        <View style={styles.content}>
          <Text size="lg" weight="semibold" tone="high">
            Isso apaga seus posts, comentários, mensagens e sua biblioteca. Não pode ser desfeito.
          </Text>
          <Button label="Continuar" color="secondary" onPress={() => setStep('confirm')} />
          <Button label="Cancelar" variant="ghost" color="secondary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.content}>
        <Text tone="medium">Digite sua senha para confirmar.</Text>
        <TextField
          label="Senha"
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            setWrongPassword(false);
            setServerError(null);
          }}
          error={wrongPassword ? WRONG_PASSWORD : undefined}
          secureTextEntry
          editable={!deleting}
          autoComplete="current-password"
          returnKeyType="done"
          onSubmitEditing={() => void remove()}
        />
        {serverError ? (
          <Text accessibilityLiveRegion="polite" size="sm" tone="danger">
            {serverError}
          </Text>
        ) : null}
        <Button
          label="Excluir minha conta"
          color="negative"
          onPress={() => void remove()}
          disabled={password.length === 0}
          loading={deleting}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.lg, padding: space.xl },
});
