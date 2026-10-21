import { Stack } from 'expo-router';

import { EditProfileScreen } from '@/features/profiles/EditProfileScreen';

export default function EditProfileRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Editar perfil' }} />
      <EditProfileScreen />
    </>
  );
}
