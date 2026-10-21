// Runs after every integration test, in that test file's module registry: the next test starts
// signed out with an empty secure store, even when this one failed halfway through.
import { queryClient, sessionManager, useSession } from '@/features/auth';
import { tokenStore } from '@/lib/tokenStore';

afterEach(async () => {
  await sessionManager.clear();
  useSession.setState({ status: 'restoring', user: null });
  queryClient.clear();
  // Also drops what an app instance from `restartApp` or `signUpAccount` stored: the secure
  // store mock is shared by every module registry.
  await tokenStore.clear();
});
