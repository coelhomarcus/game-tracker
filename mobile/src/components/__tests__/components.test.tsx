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

  it('can speak a different name than its visible label', async () => {
    await render(<Button label="Hoje" accessibilityLabel="Preencher início com hoje" onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Preencher início com hoje' })).toBeOnTheScreen();
    expect(screen.getByText('Hoje')).toBeOnTheScreen();
  });

  it('uses the primary background and onPrimary label by default', async () => {
    await render(<Button label="Entrar" onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Entrar' })).toHaveStyle({
      backgroundColor: colors.primary,
    });
    expect(screen.getByText('Entrar')).toHaveStyle({
      color: colors.onPrimary,
      fontFamily: 'Inter_500Medium',
      fontSize: 15,
    });
  });

  it('renders the secondary color and the ghost variant', async () => {
    await render(
      <>
        <Button label="Cancelar" onPress={() => {}} color="secondary" />
        <Button label="Voltar" onPress={() => {}} variant="ghost" />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveStyle({ backgroundColor: colors.bgContrast50 });
    expect(screen.getByText('Voltar')).toHaveStyle({ color: colors.primary });
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

  it('shows a helper until there is an error, and passes input props through', async () => {
    const { rerender } = await render(
      <TextField label="Notas" value="" onChangeText={() => {}} helper="Só você vê." placeholder="Ex.: PC" maxLength={9} multiline />,
    );
    expect(screen.getByText('Só você vê.')).toBeOnTheScreen();
    const input = screen.getByLabelText('Notas');
    expect(input.props).toMatchObject({ placeholder: 'Ex.: PC', maxLength: 9, multiline: true });

    await rerender(<TextField label="Notas" value="" onChangeText={() => {}} helper="Só você vê." error="Muito longo" />);
    expect(screen.queryByText('Só você vê.')).toBeNull();
    expect(screen.getByText('Muito longo')).toBeOnTheScreen();
  });

  it('renders the label and reports text changes', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="E-mail" value="" onChangeText={onChangeText} />);
    expect(screen.getByText('E-mail')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('E-mail'), 'ana@example.com');
    expect(onChangeText).toHaveBeenCalledWith('ana@example.com');
  });

  it('keeps a hidden label for screen readers only', async () => {
    await render(<TextField label="Comentário" hideLabel value="" onChangeText={() => {}} />);
    expect(screen.queryByText('Comentário')).toBeNull();
    expect(screen.getByLabelText('Comentário')).toBeOnTheScreen();
  });

  it('starts a multiline field at the given height', async () => {
    const { rerender } = await render(<TextField label="Bio" multiline value="" onChangeText={() => {}} />);
    expect(screen.getByLabelText('Bio')).toHaveStyle({ minHeight: 120 });

    await rerender(<TextField label="Bio" multiline minHeight={80} value="" onChangeText={() => {}} />);
    expect(screen.getByLabelText('Bio')).toHaveStyle({ minHeight: 80 });
  });
});

describe('Pill', () => {
  it('renders its children', async () => {
    await render(<Pill tone="accent">Jogando</Pill>);
    expect(screen.getByText('Jogando')).toBeOnTheScreen();
  });

  it('keeps accent tone contrast: selected fill, primary border, emphasis label', async () => {
    await render(<Pill tone="accent">Jogando</Pill>);
    const label = screen.getByText('Jogando');
    expect(label).toHaveStyle({ color: colors.textEmphasis, fontFamily: 'Inter_700Bold' });
    const container = label.parent!;
    expect(container).toHaveStyle({
      backgroundColor: colors.selected,
      borderWidth: 1,
      borderColor: colors.primary,
    });
    expect(container).not.toHaveStyle({ backgroundColor: colors.primary });
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

  it('never renders muted text on the selected background', async () => {
    await render(<Tabs items={[...items]} selected="following" onSelect={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Seguindo' })).toHaveStyle({
      backgroundColor: colors.selected,
    });
    expect(screen.getByText('Seguindo')).toHaveStyle({ color: colors.textEmphasis });
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
