import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

test('test environment renders React Native components', async () => {
  await render(<Text>GameTracker</Text>);
  expect(screen.getByText('GameTracker')).toBeOnTheScreen();
});
