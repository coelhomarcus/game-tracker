import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Text } from '..';
import { colors, contrast, lineHeight, type } from '@/theme/tokens';

function styleOf(label: string) {
  return StyleSheet.flatten(screen.getByText(label).props.style);
}

describe('Text', () => {
  it('defaults to md, normal, default tone and snug leading', async () => {
    await render(<Text>Olá</Text>);
    expect(styleOf('Olá')).toMatchObject({
      fontFamily: 'Inter_400Regular',
      fontSize: type.size.md,
      lineHeight: lineHeight(type.size.md, 'snug'),
      color: contrast[900],
    });
  });

  it.each([
    ['normal', 'Inter_400Regular'],
    ['medium', 'Inter_500Medium'],
    ['semibold', 'Inter_600SemiBold'],
    ['bold', 'Inter_700Bold'],
  ] as const)('maps weight %s to %s without fontWeight', async (weight, family) => {
    await render(<Text weight={weight}>w</Text>);
    const style = styleOf('w');
    expect(style.fontFamily).toBe(family);
    expect(style.fontWeight).toBeUndefined();
  });

  it.each([
    ['default', contrast[900]],
    ['high', contrast[975]],
    ['medium', colors.textMedium],
    ['low', colors.textLow],
    ['primary', colors.primary],
    ['danger', colors.danger],
    ['onPrimary', colors.onPrimary],
  ] as const)('maps tone %s to its color', async (tone, color) => {
    await render(<Text tone={tone}>t</Text>);
    expect(styleOf('t').color).toBe(color);
  });

  it('derives size and line height from the scale', async () => {
    await render(
      <Text size="_3xl" leading="tight">
        grande
      </Text>,
    );
    expect(styleOf('grande')).toMatchObject({
      fontSize: type.size._3xl,
      lineHeight: lineHeight(type.size._3xl, 'tight'),
    });
  });

  it('lets style override and forwards Text props', async () => {
    await render(
      <Text numberOfLines={2} style={{ color: '#123456' }}>
        x
      </Text>,
    );
    expect(styleOf('x').color).toBe('#123456');
    expect(screen.getByText('x').props.numberOfLines).toBe(2);
  });
});
