import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Avatar, Button, EmptyState, Pill, Screen, Skeleton, Tabs, TextField } from '..';
import { colors } from '@/theme/tokens';

const metrics = {
  frame: { x: 0, y: 0, width: 360, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

describe('Button', () => {
  it('calls onPress', async () => {
    const onPress = jest.fn();
    await render(<Button label="Entrar" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('loading is disabled and keeps its label', async () => {
    const onPress = jest.fn();
    await render(<Button label="Entrar" onPress={onPress} loading />);
    const button = screen.getByRole('button', { name: 'Entrar' });
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.queryByText('Entrar')).toBeNull();
  });

  it('disabled does not call onPress', async () => {
    const onPress = jest.fn();
    await render(<Button label="Salvar" onPress={onPress} disabled />);
    const button = screen.getByRole('button', { name: 'Salvar' });
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('uses accent background and onAccent label for primary', async () => {
    await render(<Button label="Entrar" onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Entrar' })).toHaveStyle({
      backgroundColor: colors.accent,
    });
    expect(screen.getByText('Entrar')).toHaveStyle({
      color: colors.onAccent,
      fontWeight: 'bold',
      fontSize: 16,
    });
  });

  it('renders secondary and text variants', async () => {
    await render(
      <>
        <Button label="Cancelar" onPress={() => {}} variant="secondary" />
        <Button label="Voltar" onPress={() => {}} variant="text" />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveStyle({
      backgroundColor: colors.surface,
      borderColor: colors.border,
    });
    expect(screen.getByText('Voltar')).toHaveStyle({ color: colors.accent });
  });
});

describe('TextField', () => {
  it('shows its error and exposes it to accessibility', async () => {
    await render(
      <TextField
        label="Senha"
        value=""
        onChangeText={() => {}}
        error="Use pelo menos 8 caracteres"
      />,
    );
    expect(screen.getByText('Use pelo menos 8 caracteres')).toBeOnTheScreen();
    const input = screen.getByLabelText('Senha');
    expect(input.props.accessibilityHint).toBe('Use pelo menos 8 caracteres');
    expect(input).toHaveStyle({ borderColor: colors.danger });
  });

  it('renders the label and reports text changes', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="E-mail" value="" onChangeText={onChangeText} />);
    expect(screen.getByText('E-mail')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('E-mail'), 'ana@example.com');
    expect(onChangeText).toHaveBeenCalledWith('ana@example.com');
  });
});

describe('Pill', () => {
  it('renders its children', async () => {
    await render(<Pill tone="accent">Jogando</Pill>);
    expect(screen.getByText('Jogando')).toBeOnTheScreen();
  });
});

describe('Avatar', () => {
  it('falls back to the initial', async () => {
    await render(<Avatar name="ana" />);
    expect(screen.getByText('A')).toBeOnTheScreen();
  });

  it('falls back to a question mark when the name is empty', async () => {
    await render(<Avatar name="" uri={null} />);
    expect(screen.getByText('?')).toBeOnTheScreen();
  });

  it('renders the image when a uri is given', async () => {
    await render(<Avatar name="ana" uri="https://example.com/a.png" />);
    expect(screen.queryByText('A')).toBeNull();
  });
});

describe('Skeleton', () => {
  it('renders a block of the requested size', async () => {
    await render(<Skeleton height={20} width={100} testID="skeleton" />);
    expect(screen.getByTestId('skeleton', { includeHiddenElements: true })).toHaveStyle({ height: 20, width: 100 });
  });
});

describe('Tabs', () => {
  const items = [
    { value: 'following', label: 'Seguindo' },
    { value: 'general', label: 'Para você' },
  ] as const;

  it('marks the selected tab and reports selection', async () => {
    const onSelect = jest.fn();
    await render(
      <Tabs items={[...items]} selected="following" onSelect={onSelect} />,
    );
    expect(screen.getByRole('tab', { name: 'Seguindo', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Para você', selected: false })).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Para você'));
    expect(onSelect).toHaveBeenCalledWith('general');
  });

  it('never renders muted text on the active background', async () => {
    await render(<Tabs items={[...items]} selected="following" onSelect={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Seguindo' })).toHaveStyle({
      backgroundColor: colors.active,
    });
    expect(screen.getByText('Seguindo')).toHaveStyle({ color: colors.textStrong });
  });
});

describe('EmptyState', () => {
  it('renders title, message and action', async () => {
    const onPress = jest.fn();
    await render(
      <EmptyState
        title="Nada por aqui"
        message="Volte mais tarde"
        action={{ label: 'Tentar de novo', onPress }}
      />,
    );
    expect(screen.getByText('Nada por aqui')).toBeOnTheScreen();
    expect(screen.getByText('Volte mais tarde')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Tentar de novo'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Screen', () => {
  it('renders children inside the safe area, with and without scroll', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <Screen>
          <Text>Fixo</Text>
        </Screen>
        <Screen scroll>
          <Text>Rolando</Text>
        </Screen>
      </SafeAreaProvider>,
    );
    expect(screen.getByText('Fixo')).toBeOnTheScreen();
    expect(screen.getByText('Rolando')).toBeOnTheScreen();
  });
});
