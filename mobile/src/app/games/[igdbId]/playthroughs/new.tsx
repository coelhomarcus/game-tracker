import { Stack } from 'expo-router';

import { RecordForm } from '@/features/library/RecordForm';

export default function NewPlaythroughScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Novo registro' }} />
      <RecordForm />
    </>
  );
}
