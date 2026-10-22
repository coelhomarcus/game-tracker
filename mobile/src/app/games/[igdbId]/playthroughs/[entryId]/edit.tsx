import { Stack } from 'expo-router';

import { RecordForm } from '@/features/library/RecordForm';

export default function EditPlaythroughScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Editar registro' }} />
      <RecordForm />
    </>
  );
}
