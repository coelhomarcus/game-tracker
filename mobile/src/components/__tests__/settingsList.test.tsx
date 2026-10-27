import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { Text as RNText } from 'react-native';

import { SettingsList } from '@/components';
import { usePreferences } from '@/lib/preferences';
import { colors } from '@/theme/tokens';

jest.mock('expo-haptics', () => ({
  AndroidHaptics: { Context_Click: 'context-click', Long_Press: 'long-press', Confirm: 'confirm' },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  impactAsync: jest.fn().mockResolvedValue(undefined),
}));
const impact = Haptics.impactAsync as jest.Mock;

const touch = { nativeEvent: { touches: [], changedTouches: [], target: 1, timestamp: 0 }, persist: () => {} };

describe('SettingsList', () => {
  it('lays a row out with the 48 dp minimum and the list gutters', async () => {
    await render(
      <SettingsList.Container>
        <SettingsList.Item testID="row">
          <SettingsList.ItemText>E-mail</SettingsList.ItemText>
          <SettingsList.ItemValue>ana@example.com</SettingsList.ItemValue>
        </SettingsList.Item>
      </SettingsList.Container>,
    );

    expect(screen.getByTestId('row')).toHaveStyle({
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 8,
      minHeight: 48,
    });
    expect(screen.getByText('E-mail')).toHaveProp('numberOfLines', 1);
    expect(screen.getByText('E-mail')).toHaveStyle({ flex: 1, fontSize: 15 });
    expect(screen.getByText('ana@example.com')).toHaveStyle({ color: colors.textMedium });
  });

  it('is a button that presses and shows the pressed background', async () => {
    const onPress = jest.fn();
    await render(
      <SettingsList.PressableItem label="Conta" onPress={onPress} testID="row">
        <SettingsList.ItemText>Conta</SettingsList.ItemText>
        <SettingsList.Chevron />
      </SettingsList.PressableItem>,
    );

    const row = screen.getByRole('button', { name: 'Conta' });
    expect(row).toHaveStyle({ minHeight: 48, paddingHorizontal: 20 });
    expect(row).not.toHaveStyle({ backgroundColor: colors.bgContrast25 });

    await fireEvent(row, 'responderGrant', touch);
    expect(screen.getByTestId('row')).toHaveStyle({ backgroundColor: colors.bgContrast25 });
    await fireEvent(row, 'responderRelease', touch);
    await fireEvent.press(row);

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('can be a radio with its checked state', async () => {
    await render(
      <SettingsList.PressableItem
        label="Nome A–Z"
        accessibilityRole="radio"
        accessibilityState={{ checked: true }}
        onPress={jest.fn()}
      >
        <SettingsList.ItemText>Nome A–Z</SettingsList.ItemText>
      </SettingsList.PressableItem>,
    );

    expect(screen.getByRole('radio', { name: 'Nome A–Z', checked: true })).toBeOnTheScreen();
  });

  it('draws icon and text in the danger tone', async () => {
    await render(
      <SettingsList.Item>
        <SettingsList.ItemIcon name="log-out-outline" tone="danger" />
        <SettingsList.ItemText tone="danger">Sair</SettingsList.ItemText>
      </SettingsList.Item>,
    );

    expect(screen.getByText('Sair')).toHaveStyle({ color: colors.danger });
  });

  it('shows a badge only for a positive count', async () => {
    const { rerender } = await render(<SettingsList.BadgeItem count={3} />);
    expect(screen.getByText('3')).toBeOnTheScreen();

    await rerender(<SettingsList.BadgeItem count={0} />);
    expect(screen.queryByTestId('count-badge')).toBeNull();
  });

  it('hides the divider from screen readers', async () => {
    await render(
      <SettingsList.Container>
        <RNText>antes</RNText>
        <SettingsList.Divider testID="divider" />
        <RNText>depois</RNText>
      </SettingsList.Container>,
    );

    const divider = screen.getByTestId('divider', { includeHiddenElements: true });
    expect(divider).toHaveProp('accessibilityElementsHidden', true);
    expect(divider).toHaveProp('importantForAccessibility', 'no-hide-descendants');
    expect(screen.getByText('antes')).toBeOnTheScreen();
    expect(screen.getByText('depois')).toBeOnTheScreen();
  });

  describe('SwitchItem', () => {
    it('is a switch with its state, and the whole row toggles it', async () => {
      const onValueChange = jest.fn();
      const { rerender } = await render(
        <SettingsList.SwitchItem
          label="Desativar vibração"
          description="Desliga a vibração."
          value={false}
          onValueChange={onValueChange}
        />,
      );

      const row = screen.getByRole('switch', { name: 'Desativar vibração', checked: false });
      expect(row).toHaveStyle({ minHeight: 48 });
      expect(screen.getByText('Desliga a vibração.')).toBeOnTheScreen();

      await fireEvent.press(row);
      expect(onValueChange).toHaveBeenLastCalledWith(true);

      await rerender(
        <SettingsList.SwitchItem label="Desativar vibração" value onValueChange={onValueChange} />,
      );
      await fireEvent.press(screen.getByRole('switch', { name: 'Desativar vibração', checked: true }));
      expect(onValueChange).toHaveBeenLastCalledWith(false);
    });

    it('vibrates after the toggle, so turning vibration off is silent and turning it on is felt', async () => {
      impact.mockClear();
      usePreferences.setState({ hapticsEnabled: true });
      function Wired() {
        const enabled = usePreferences((state) => state.hapticsEnabled);
        return (
          <SettingsList.SwitchItem
            label="Desativar vibração"
            value={!enabled}
            onValueChange={(off) => usePreferences.getState().setHapticsEnabled(!off)}
          />
        );
      }
      await render(<Wired />);

      await fireEvent.press(screen.getByRole('switch', { name: 'Desativar vibração' }));
      expect(usePreferences.getState().hapticsEnabled).toBe(false);
      expect(impact).not.toHaveBeenCalled();

      await fireEvent.press(screen.getByRole('switch', { name: 'Desativar vibração' }));
      expect(usePreferences.getState().hapticsEnabled).toBe(true);
      expect(impact).toHaveBeenCalledTimes(1);
    });

    it('leaves the native switch out of the accessibility tree, so the row is the only control', async () => {
      await render(<SettingsList.SwitchItem label="Opção" value={false} onValueChange={jest.fn()} />);

      expect(screen.getAllByRole('switch')).toHaveLength(1);
    });
  });
});
