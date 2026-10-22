import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { haptic } from '@/lib/haptics';
import { colors, negative400, negative500, primary } from '@/theme/tokens';
import { Button, EmptyState, ErrorState, TextField } from '..';

jest.mock('@/lib/haptics', () => ({ haptic: jest.fn() }));

const flat = (element: { props: { style?: unknown } }) => StyleSheet.flatten(element.props.style as never) as Record<string, unknown>;

const touch = { nativeEvent: { touches: [], changedTouches: [], target: 1, timestamp: 0 }, persist: () => {} };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Button sizes', () => {
  it('defaults to a large 48 dp button with a 12 px radius', async () => {
    await render(<Button label="Entrar" onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Entrar' })).toHaveStyle({
      minHeight: 48,
      paddingVertical: 11,
      paddingHorizontal: 23,
      borderWidth: 1,
      borderRadius: 12,
    });
  });

  it('renders small and tiny as pills padded out to 48 dp with hitSlop', async () => {
    await render(
      <>
        <Button label="Pequeno" size="small" onPress={() => {}} />
        <Button label="Mínimo" size="tiny" onPress={() => {}} />
      </>,
    );
    const small = screen.getByRole('button', { name: 'Pequeno' });
    expect(small).toHaveStyle({ paddingVertical: 7, paddingHorizontal: 13, borderWidth: 1, borderRadius: 999 });
    expect(small.props.hitSlop).toBe(8);
    expect(screen.getByText('Pequeno')).toHaveStyle({ fontSize: 15 });
    const tiny = screen.getByRole('button', { name: 'Mínimo' });
    expect(tiny).toHaveStyle({ paddingVertical: 4, paddingHorizontal: 9, borderWidth: 1, borderRadius: 999 });
    expect(tiny.props.hitSlop).toBe(11);
    expect(screen.getByText('Mínimo')).toHaveStyle({ fontSize: 13.1 });
  });

  it('renders a round icon-only button that keeps its spoken name', async () => {
    await render(
      <>
        <Button shape="round" size="large" icon="add" accessibilityLabel="Grande" onPress={() => {}} />
        <Button shape="round" size="small" icon="add" accessibilityLabel="Adicionar" onPress={() => {}} />
        <Button shape="round" size="tiny" icon="add" accessibilityLabel="Mínimo" onPress={() => {}} />
      </>,
    );
    const button = screen.getByRole('button', { name: 'Adicionar' });
    expect(button.props.hitSlop).toBe(8);
    // 1 dp border + padding + icon: 48 / 33 / 24 dp squares.
    const expected = { Grande: 13, Adicionar: 7, Mínimo: 4 };
    for (const [name, padding] of Object.entries(expected)) {
      const style = flat(screen.getByRole('button', { name }));
      expect(style.paddingHorizontal).toBe(padding);
      expect(style.paddingVertical).toBe(style.paddingHorizontal);
      expect(style.borderRadius).toBe(999);
    }
    const large = flat(screen.getByRole('button', { name: 'Grande' }));
    expect(large.minWidth).toBe(48);
    expect(large.minHeight).toBe(48);
  });
});

describe('Button colors', () => {
  it('maps color and variant to background and label colors', async () => {
    await render(
      <>
        <Button label="Primário" onPress={() => {}} />
        <Button label="Secundário" color="secondary" onPress={() => {}} />
        <Button label="Excluir" color="negative" onPress={() => {}} />
        <Button label="Fantasma" variant="ghost" onPress={() => {}} />
        <Button label="Perigo" variant="ghost" color="negative" onPress={() => {}} />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Primário' })).toHaveStyle({ backgroundColor: primary[500] });
    expect(screen.getByText('Primário')).toHaveStyle({ color: colors.onPrimary });
    expect(screen.getByRole('button', { name: 'Secundário' })).toHaveStyle({
      backgroundColor: colors.bgContrast50,
      borderColor: colors.borderLow,
    });
    expect(screen.getByRole('button', { name: 'Primário' })).toHaveStyle({ borderColor: 'transparent' });
    expect(screen.getByText('Secundário')).toHaveStyle({ color: colors.text });
    expect(screen.getByRole('button', { name: 'Excluir' })).toHaveStyle({ backgroundColor: negative500 });
    expect(screen.getByText('Excluir')).toHaveStyle({ color: '#ffffff' });
    expect(screen.getByRole('button', { name: 'Fantasma' })).toHaveStyle({ backgroundColor: 'transparent' });
    expect(screen.getByText('Fantasma')).toHaveStyle({ color: primary[500] });
    expect(screen.getByText('Perigo')).toHaveStyle({ color: colors.danger });
  });

  it('steps to the pressed shade while held', async () => {
    await render(
      <>
        <Button label="Primário" onPress={() => {}} />
        <Button label="Excluir" color="negative" onPress={() => {}} />
      </>,
    );
    const primaryButton = screen.getByRole('button', { name: 'Primário' });
    await fireEvent(primaryButton, 'responderGrant', touch);
    expect(primaryButton).toHaveStyle({ backgroundColor: primary[400] });
    const negativeButton = screen.getByRole('button', { name: 'Excluir' });
    await fireEvent(negativeButton, 'responderGrant', touch);
    expect(negativeButton).toHaveStyle({ backgroundColor: negative400 });
  });

  it('dims when disabled', async () => {
    await render(<Button label="Salvar" disabled onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Salvar' })).toHaveStyle({ opacity: 0.5 });
  });

  it('keeps the legacy variants rendering as before', async () => {
    await render(
      <>
        <Button label="Um" variant="primary" onPress={() => {}} />
        <Button label="Dois" variant="secondary" onPress={() => {}} />
        <Button label="Três" variant="text" onPress={() => {}} />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Um' })).toHaveStyle({ backgroundColor: primary[500] });
    expect(screen.getByRole('button', { name: 'Dois' })).toHaveStyle({ backgroundColor: colors.bgContrast50 });
    expect(screen.getByRole('button', { name: 'Três' })).toHaveStyle({ backgroundColor: 'transparent' });
    expect(screen.getByText('Três')).toHaveStyle({ color: primary[500] });
  });
});

describe('Button haptics', () => {
  it('taps on press by default', async () => {
    const onPress = jest.fn();
    await render(<Button label="Entrar" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
    expect(haptic).toHaveBeenCalledWith('tap');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('stays silent with haptic={false}', async () => {
    const onPress = jest.fn();
    await render(<Button label="Entrar" haptic={false} onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
    expect(haptic).not.toHaveBeenCalled();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not vibrate while loading', async () => {
    await render(<Button label="Entrar" loading onPress={() => {}} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
    expect(haptic).not.toHaveBeenCalled();
  });
});

describe('TextField design', () => {
  it('uses the contrast fill, a low border and primary on focus', async () => {
    await render(<TextField label="Nome" value="" onChangeText={() => {}} />);
    const input = screen.getByLabelText('Nome');
    expect(input).toHaveStyle({
      backgroundColor: colors.bgContrast50,
      borderColor: colors.borderLow,
      borderRadius: 10,
      borderWidth: 1,
      paddingVertical: 13,
      paddingHorizontal: 12,
      fontSize: 15,
    });
    await fireEvent(input, 'focus');
    expect(input).toHaveStyle({ borderColor: primary[500] });
    await fireEvent(input, 'blur');
    expect(input).toHaveStyle({ borderColor: colors.borderLow });
  });

  it('styles the label and error with the new Text tones', async () => {
    await render(<TextField label="Nome" value="" onChangeText={() => {}} error="Obrigatório" />);
    expect(screen.getByText('Nome')).toHaveStyle({ color: colors.textMedium, fontFamily: 'Inter_500Medium' });
    expect(screen.getByText('Obrigatório')).toHaveStyle({ color: colors.danger });
  });

  it('uses textMedium for the placeholder', async () => {
    await render(<TextField label="Nome" value="" placeholder="Ex." onChangeText={() => {}} />);
    expect(screen.getByLabelText('Nome').props.placeholderTextColor).toBe(colors.textMedium);
  });

  it('shows no counter unless showCounter is set', async () => {
    await render(<TextField label="Nome" value="abc" maxLength={10} onChangeText={() => {}} />);
    expect(screen.queryByText('3/10')).toBeNull();
  });

  it('shows n/max with showCounter and counts code points', async () => {
    const { rerender } = await render(
      <TextField label="Nome" value="a😀b" maxLength={10} showCounter onChangeText={() => {}} />,
    );
    const counter = screen.getByText('3/10');
    expect(counter).toHaveStyle({ color: colors.textMedium, fontSize: 11.3 });
    await rerender(<TextField label="Nome" value="abcdefghijk" maxLength={10} showCounter onChangeText={() => {}} />);
    expect(screen.getByText('11/10')).toHaveStyle({ color: colors.danger });
  });

  it('shows the counter next to the helper', async () => {
    await render(
      <TextField label="Nome" value="" maxLength={5} showCounter helper="Até 5 letras" onChangeText={() => {}} />,
    );
    expect(screen.getByText('Até 5 letras')).toBeOnTheScreen();
    expect(screen.getByText('0/5')).toBeOnTheScreen();
  });

  it('caps a growing multiline field at maxLines', async () => {
    await render(<TextField label="Notas" value="" multiline maxLines={4} onChangeText={() => {}} />);
    expect(screen.getByLabelText('Notas')).toHaveStyle({ maxHeight: 20 * 4 + 28 });
  });
});

describe('EmptyState', () => {
  it('renders an optional icon, header title and a small secondary action', async () => {
    const onPress = jest.fn();
    await render(
      <EmptyState
        title="Nada aqui"
        message="Volte depois"
        icon="game-controller-outline"
        action={{ label: 'Atualizar', onPress }}
      />,
    );
    expect(screen.getByRole('header', { name: 'Nada aqui' })).toHaveStyle({
      fontFamily: 'Inter_600SemiBold',
      fontSize: 16.9,
    });
    expect(screen.getByText('Volte depois')).toHaveStyle({ color: colors.textMedium, maxWidth: 360 });
    const action = screen.getByRole('button', { name: 'Atualizar' });
    expect(action).toHaveStyle({ backgroundColor: colors.bgContrast50, borderColor: colors.borderLow, borderRadius: 999 });
    await fireEvent.press(action);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('works without icon, message or action', async () => {
    await render(<EmptyState title="Vazio" />);
    expect(screen.getByText('Vazio')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('pushes content down with fill', async () => {
    await render(
      <>
        <EmptyState title="Preenchido" fill />
        <EmptyState title="Normal" />
      </>,
    );
    expect(flat(screen.getByText('Preenchido').parent!).paddingTop).toBe('20%');
    expect(flat(screen.getByText('Normal').parent!).padding).toBe(24);
  });
});

describe('ErrorState', () => {
  it('defaults to "Algo deu errado" with a retry button', async () => {
    const onRetry = jest.fn();
    await render(<ErrorState message="Falha de rede" onRetry={onRetry} />);
    expect(screen.getByRole('header', { name: 'Algo deu errado' })).toHaveStyle({
      fontFamily: 'Inter_600SemiBold',
      fontSize: 20.6,
    });
    expect(screen.getByText('Falha de rede')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('accepts a custom title and omits the button without onRetry', async () => {
    await render(<ErrorState title="Sem conexão" />);
    expect(screen.getByText('Sem conexão')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
