import { Screen } from '@/components';
import { LoginForm } from '@/features/auth/LoginForm';

export default function LoginScreen() {
  return (
    <Screen scroll topInset>
      <LoginForm />
    </Screen>
  );
}
