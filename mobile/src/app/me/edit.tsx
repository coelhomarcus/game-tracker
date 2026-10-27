import { Stack } from 'expo-router';

import { EditProfileScreen } from '@/features/profiles/EditProfileScreen';
import { EDIT_PROFILE_SCREEN_OPTIONS } from '@/features/profiles/edit/presentation';

export default function EditProfileRoute() {
  return (
    <>
      <Stack.Screen options={EDIT_PROFILE_SCREEN_OPTIONS} />
      <EditProfileScreen />
    </>
  );
}
