import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState, Screen } from '@/components';
import { colors } from '@/theme/tokens';

/** Shown for an address that is not a game id, or a game the API does not know. */
export function GameNotFound() {
  const router = useRouter();
  return (
    <Screen>
      <View style={styles.center}>
        <EmptyState
          title="Jogo não encontrado"
          message="O endereço deste jogo não é válido."
          action={{ label: 'Ir para a Biblioteca', onPress: () => router.replace('/library') }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
