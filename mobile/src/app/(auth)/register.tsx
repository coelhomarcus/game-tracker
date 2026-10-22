import { Screen } from '@/components';
import { RegisterForm } from '@/features/auth/RegisterForm';

export default function RegisterScreen() {
  return (
    <Screen scroll>
      <RegisterForm />
    </Screen>
  );
}
