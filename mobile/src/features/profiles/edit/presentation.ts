/**
 * "Editar perfil" opens as a full-screen sheet with its own top bar, like the composer. Android
 * has no modal transition for stack screens, so it slides up from the bottom like one.
 */
export const EDIT_PROFILE_SCREEN_OPTIONS = {
  presentation: 'fullScreenModal',
  animation: 'slide_from_bottom',
  headerShown: false,
} as const;

/**
 * For the root stack's `me` screen, whose only route is the sheet: opening it from the profile
 * pushes the whole `me` stack, so that push takes the sheet's transition.
 */
export const EDIT_PROFILE_STACK_OPTIONS = {
  animation: 'slide_from_bottom',
  headerShown: false,
} as const;
