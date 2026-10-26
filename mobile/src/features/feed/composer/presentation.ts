/**
 * The composer opens as a full-screen modal with its own top bar. Android has no modal transition
 * for stack screens, so it slides up from the bottom like one.
 */
export const COMPOSER_SCREEN_OPTIONS = {
  presentation: 'fullScreenModal',
  animation: 'slide_from_bottom',
  headerShown: false,
} as const;

/**
 * For the root stack's `posts` screen while the composer is the focused screen inside it: opening
 * the composer from outside (the home feed, a game page) pushes the whole posts stack, so that
 * push takes the composer's transition. Only the animation changes, so switching it while the
 * screen is up is harmless.
 */
export const COMPOSER_STACK_OPTIONS = {
  animation: 'slide_from_bottom',
  headerShown: false,
} as const;

/** The name of the composer's route inside the `posts` stack. */
export const COMPOSER_ROUTE = 'new';
