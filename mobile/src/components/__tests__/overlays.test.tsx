import { Ionicons } from '@expo/vector-icons';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ChoiceChip, ConfirmDialog, OptionSheet, ToastHost } from '..';
import { hideToast, showToast } from '@/lib/toast';
import { colors } from '@/theme/tokens';

const metrics = {
  frame: { x: 0, y: 0, width: 360, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 20 },
};

function withInsets(ui: React.ReactElement) {
  return <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;
}

function iconCount(name: keyof typeof Ionicons.glyphMap): number {
  return screen.queryAllByText(String.fromCodePoint(Number(Ionicons.glyphMap[name])), {
    includeHiddenElements: true,
  }).length;
}

describe('Toast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(async () => {
    await act(() => hideToast());
    jest.useRealTimers();
  });

  it('announces the message to the screen reader', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    await act(() => showToast('Status alterado'));
    expect(announce).toHaveBeenCalledWith('Status alterado');
    announce.mockRestore();
  });

  it('shows the message and hides it after 3 seconds', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ToastHost />
      </SafeAreaProvider>,
    );
    expect(screen.queryByText('Registro criado')).toBeNull();

    await act(() => showToast('Registro criado'));
    expect(screen.getByText('Registro criado')).toBeOnTheScreen();
    expect(screen.getByTestId('toast-host').props.accessibilityLiveRegion).toBe('polite');

    await act(() => {
      jest.advanceTimersByTime(2999);
    });
    expect(screen.getByText('Registro criado')).toBeOnTheScreen();

    await act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Registro criado')).toBeNull();
  });

  it('replaces the current message and restarts the timer', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ToastHost />
      </SafeAreaProvider>,
    );
    await act(() => showToast('Primeiro'));
    await act(() => {
      jest.advanceTimersByTime(2000);
    });
    await act(() => showToast('Segundo'));
    expect(screen.queryByText('Primeiro')).toBeNull();
    await act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByText('Segundo')).toBeOnTheScreen();
    await act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.queryByText('Segundo')).toBeNull();
  });

  it('floats above the tab bar without blocking touches', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ToastHost />
      </SafeAreaProvider>,
    );
    await act(() => showToast('Oi'));
    const host = screen.getByTestId('toast-host');
    const style = StyleSheet.flatten(host.props.style);
    expect(style.position).toBe('absolute');
    expect(style.bottom).toBe(92);
    expect(host.props.pointerEvents).toBe('none');
  });
});

describe('ConfirmDialog', () => {
  it('reports confirm and cancel presses', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await render(
      <ConfirmDialog
        visible
        title="Remover registro?"
        message="Isso não pode ser desfeito."
        confirmLabel="Remover"
        cancelLabel="Cancelar"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText('Remover registro?')).toBeOnTheScreen();
    expect(screen.getByText('Isso não pode ser desfeito.')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Remover' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('confirm-backdrop', { includeHiddenElements: true }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('styles a destructive confirm label with the danger color', async () => {
    await render(
      <ConfirmDialog
        visible
        title="Remover?"
        confirmLabel="Remover"
        cancelLabel="Cancelar"
        destructive
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    const label = StyleSheet.flatten(screen.getByText('Remover').props.style);
    expect(label.color).toBe(colors.danger);
    const button = screen.getByRole('button', { name: 'Remover' });
    expect(StyleSheet.flatten(button.props.style).minHeight).toBe(48);
  });

  it('renders nothing when not visible', async () => {
    await render(
      <ConfirmDialog
        visible={false}
        title="Oculto"
        confirmLabel="Ok"
        cancelLabel="Não"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(screen.queryByText('Oculto')).toBeNull();
  });
});

describe('OptionSheet', () => {
  const options = [
    { value: 'recent', label: 'Recentes', icon: 'time-outline' as const },
    { value: 'name', label: 'Nome' },
  ];

  it('marks the selected option and reports a press', async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    await render(withInsets(
      <OptionSheet
        visible
        title="Ordenar por"
        options={options}
        selected="recent"
        onSelect={onSelect}
        onClose={onClose}
      />),
    );
    expect(screen.getByText('Ordenar por')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Recentes' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Nome' })).not.toBeSelected();
    expect(iconCount('time-outline')).toBe(1);
    expect(iconCount('checkmark')).toBe(1);

    await fireEvent.press(screen.getByRole('button', { name: 'Nome' }));
    expect(onSelect).toHaveBeenCalledWith('name');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from the backdrop without selecting', async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    await render(withInsets(<OptionSheet visible title="Ordenar" options={options} onSelect={onSelect} onClose={onClose} />));
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { includeHiddenElements: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
    expect(iconCount('checkmark')).toBe(0);
  });
});

describe('ChoiceChip', () => {
  it('exposes the selected state and a 48 px touch target', async () => {
    const onPress = jest.fn();
    await render(<ChoiceChip label="Jogando" selected onPress={onPress} icon="play-circle-outline" />);
    const chip = screen.getByRole('button', { name: 'Jogando' });
    expect(chip).toBeSelected();
    const style = StyleSheet.flatten(chip.props.style);
    expect(style.minHeight).toBe(48);
    expect(style.minWidth).toBe(48);
    expect(style.backgroundColor).toBe(colors.selected);
    expect(StyleSheet.flatten(screen.getByText('Jogando').props.style).color).toBe(colors.textEmphasis);
    expect(StyleSheet.flatten(screen.getByText('Jogando').props.style).textAlign).toBe('center');
    await fireEvent.press(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('uses the control fill and custom accessibility label when unselected', async () => {
    await render(<ChoiceChip label="Todos" selected={false} onPress={jest.fn()} accessibilityLabel="Todos os jogos" />);
    const chip = screen.getByRole('button', { name: 'Todos os jogos' });
    expect(chip).not.toBeSelected();
    expect(StyleSheet.flatten(chip.props.style).backgroundColor).toBe(colors.bgContrast50);
    expect(StyleSheet.flatten(screen.getByText('Todos').props.style).color).toBe(colors.text);
  });
});
