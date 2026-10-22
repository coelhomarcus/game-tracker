import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router, Stack, Tabs, type Href } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { useMemo, useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text as RNText, View, type ViewStyle } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Layout } from '@/components';
import { useHeaderHeight } from '@/lib/useHeaderHeight';
import { colors, hairline } from '@/theme/tokens';

const { AppHeader, renderStackHeader, renderTabHeader } = Layout.Header;

const TOP_INSET = 24;
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: TOP_INSET, left: 0, right: 0, bottom: 0 },
};

function renderInsets(element: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={metrics}>{element}</SafeAreaProvider>);
}

function stubNavigation(canGoBack: boolean) {
  return { canGoBack: jest.fn(() => canGoBack), goBack: jest.fn() };
}

describe('Layout.Header.Outer', () => {
  it('pads the status bar itself and keeps a 48 dp bar below it', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <Layout.Header.Outer>
          <RNText>Título</RNText>
        </Layout.Header.Outer>
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId('app-header')).toHaveStyle({
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: TOP_INSET,
      paddingBottom: 4,
      minHeight: 48 + TOP_INSET,
      backgroundColor: colors.bg,
      borderBottomWidth: hairline,
      borderBottomColor: colors.borderLow,
    });
  });

  it('drops the hairline with noBottomBorder', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <Layout.Header.Outer noBottomBorder>
          <RNText>Título</RNText>
        </Layout.Header.Outer>
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId('app-header')).not.toHaveStyle({ borderBottomWidth: hairline });
  });
});

describe('AppHeader', () => {
  it('renders the title as a two-line heading, a back button and the right slot', async () => {
    await renderInsets(
      <AppHeader
        backButton
        navigation={stubNavigation(true)}
        options={{
          title: 'Editar perfil',
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="Salvar" onPress={() => {}} />
          ),
        }}
      />,
    );
    const title = screen.getByRole('header', { name: 'Editar perfil' });
    expect(title.props.numberOfLines).toBe(2);
    expect(title).toHaveStyle({ fontFamily: 'Inter_600SemiBold', fontSize: 16.9, lineHeight: 19 });
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeOnTheScreen();
  });

  it('goes back when the navigator can', async () => {
    const navigation = stubNavigation(true);
    await renderInsets(<AppHeader backButton navigation={navigation} options={{ title: 'Post' }} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('renders a custom title node in place of the text title', async () => {
    await renderInsets(
      <AppHeader
        backButton
        navigation={stubNavigation(true)}
        options={{
          title: 'ignored',
          headerTitle: ({ children }) => <RNText>{`Custom ${children}`}</RNText>,
        }}
      />,
    );
    expect(screen.getByText('Custom ignored')).toBeOnTheScreen();
    expect(screen.queryByRole('header')).toBeNull();
  });

  // Android drops touches outside a parent's bounds, so hitSlop past a column does not count: each
  // header button needs a real 48 dp box inside a column at least that big.
  it('gives the back button a real 48 dp target inside a 48 dp column', async () => {
    await renderInsets(<AppHeader backButton navigation={stubNavigation(true)} options={{ title: 'Post' }} />);
    const back = screen.getByRole('button', { name: 'Voltar' });
    expect(back).toHaveStyle({ width: 48, height: 48 });
    expect(back.props.hitSlop).toBeUndefined();

    const slot = StyleSheet.flatten(back.parent?.props.style) as ViewStyle;
    expect(slot.width).toBe(48);
    // It reaches over the 4 dp bottom padding (44 + 4 = 48) and still takes 33 dp in the row,
    // shifted 3 dp left so the arrow lines up with the gutter.
    expect(slot.marginBottom).toBe(-4);
    expect(48 + Number(slot.marginLeft) + Number(slot.marginRight)).toBe(33);
    expect(Number(slot.marginLeft) - Number(slot.marginRight)).toBe(-6);
    expect(screen.getByTestId('app-header')).toHaveStyle({ alignItems: 'stretch', paddingBottom: 4 });
  });

  it('puts headerLeft, the title and headerRight in columns that span the bar', async () => {
    await renderInsets(
      <AppHeader
        navigation={stubNavigation(false)}
        options={{
          title: 'Início',
          headerLeft: () => <Pressable accessibilityRole="button" accessibilityLabel="Esquerda" />,
          headerRight: () => <Pressable accessibilityRole="button" accessibilityLabel="Direita" />,
        }}
      />,
    );
    for (const name of ['Esquerda', 'Direita']) {
      expect(screen.getByRole('button', { name }).parent).toHaveStyle({ marginBottom: -4 });
    }
    expect(screen.getByRole('header', { name: 'Início' }).parent).toHaveStyle({ marginBottom: -4, flex: 1 });
  });

  it('renders each header option as its own component, so their hooks do not mix', async () => {
    // The chat title, for one, uses hooks; dropping a hook-using headerLeft before it must not
    // shift the title's hooks, as it would if both were called inline in one render.
    function Avatar() {
      const [label] = useState('Seu perfil');
      return <Pressable accessibilityRole="button" accessibilityLabel={label} />;
    }
    function Title({ children }: { children: string }) {
      const text = useMemo(() => `Conversa com ${children}`, [children]);
      return <RNText>{text}</RNText>;
    }
    const navigation = stubNavigation(true);
    await renderInsets(
      <AppHeader backButton navigation={navigation} options={{ title: 'Ana', headerLeft: Avatar, headerTitle: Title }} />,
    );
    expect(screen.getByRole('button', { name: 'Seu perfil' })).toBeOnTheScreen();

    await screen.rerender(
      <SafeAreaProvider initialMetrics={metrics}>
        <AppHeader backButton navigation={navigation} options={{ title: 'Ana', headerTitle: Title }} />
      </SafeAreaProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Seu perfil' })).toBeNull();
    expect(screen.getByText('Conversa com Ana')).toBeOnTheScreen();
  });

  it('renders no heading for an empty title', async () => {
    await renderInsets(
      <AppHeader backButton navigation={stubNavigation(true)} options={{ title: '', headerTitle: '' }} />,
    );
    expect(screen.queryByRole('header')).toBeNull();
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeOnTheScreen();
  });

  it('replaces the back button with headerLeft and has none without backButton', async () => {
    await renderInsets(
      <AppHeader
        navigation={stubNavigation(false)}
        options={{
          title: 'Início',
          headerLeft: () => <Pressable accessibilityRole="button" accessibilityLabel="Seu perfil" />,
        }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Seu perfil' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Voltar' })).toBeNull();
  });
});

function HeightProbe() {
  return <RNText testID="probe">{String(useHeaderHeight())}</RNText>;
}

function layoutHeader(height: number) {
  // The navigator measures the view it wraps around the header.
  const wrapper = screen.getByTestId('app-header').parent;
  if (wrapper === null) throw new Error('header has no wrapper');
  return act(async () => {
    fireEvent(wrapper, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height } } });
  });
}

describe('header navigation', () => {
  const routes = {
    _layout: () => <Stack screenOptions={{ header: renderStackHeader }} />,
    index: () => <RNText>Home</RNText>,
    a: () => (
      <>
        <Stack.Screen options={{ title: 'Página A' }} />
        <RNText>A</RNText>
      </>
    ),
    b: () => (
      <>
        <Stack.Screen options={{ title: 'Página B' }} />
        <HeightProbe />
      </>
    ),
  };

  it('pops to the previous screen', async () => {
    const app = await renderRouter(routes, { initialUrl: '/a' });
    await act(async () => router.push('/b' as Href));
    expect(await screen.findByRole('header', { name: 'Página B' })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    expect(app.getPathname()).toBe('/a');
  });

  it('goes home when there is nothing to go back to', async () => {
    const app = await renderRouter(routes, { initialUrl: '/b' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Voltar' }));
    expect(app.getPathname()).toBe('/');
    expect(await screen.findByText('Home')).toBeOnTheScreen();
  });

  it('reports the measured stack header height to the screen', async () => {
    await renderRouter(routes, { initialUrl: '/b' });
    await screen.findByRole('header', { name: 'Página B' });
    await layoutHeader(48 + TOP_INSET);
    expect(screen.getByTestId('probe')).toHaveTextContent(String(48 + TOP_INSET));
  });

  it('reports the measured tab header height to the screen', async () => {
    await renderRouter(
      {
        _layout: () => (
          <Tabs screenOptions={{ header: renderTabHeader }}>
            <Tabs.Screen name="index" options={{ title: 'Início' }} />
          </Tabs>
        ),
        index: () => (
          <View>
            <HeightProbe />
          </View>
        ),
      },
      { initialUrl: '/' },
    );
    expect(await screen.findByRole('header', { name: 'Início' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Voltar' })).toBeNull();
    await layoutHeader(48 + TOP_INSET);
    expect(screen.getByTestId('probe')).toHaveTextContent(String(48 + TOP_INSET));
  });
});
