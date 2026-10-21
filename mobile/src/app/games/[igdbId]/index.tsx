import { Stack } from 'expo-router';

import { GameScreen } from '@/features/games/GameScreen';

export default function GameRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Jogo' }} />
      <GameScreen />
    </>
  );
}
