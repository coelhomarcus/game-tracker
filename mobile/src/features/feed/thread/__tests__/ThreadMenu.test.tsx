import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { usePreferences } from '@/lib/preferences';

import { ThreadMenu } from '../ThreadMenu';

const metrics = {
  frame: { x: 0, y: 0, width: 360, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const onChange = jest.fn();

async function openMenu() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThreadMenu onChange={onChange} />
    </SafeAreaProvider>,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Opções da conversa' }));
}

function section(title: string) {
  const found = screen
    .getAllByTestId('sheet-section')
    .find((node) => within(node).queryByRole('header', { name: title }));
  if (!found) throw new Error(`no section ${title}`);
  return within(found);
}

beforeEach(() => {
  jest.clearAllMocks();
  usePreferences.setState({ threadView: 'linear', threadSort: 'oldest' });
});

describe('ThreadMenu', () => {
  it('is a 48 dp header button', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ThreadMenu />
      </SafeAreaProvider>,
    );

    expect(screen.getByRole('button', { name: 'Opções da conversa' })).toHaveStyle({
      width: 48,
      height: 48,
    });
  });

  it('shows the view and the order, with the current ones checked', async () => {
    usePreferences.setState({ threadView: 'tree', threadSort: 'top' });
    await openMenu();

    const view = section('Mostrar respostas como');
    expect(view.getByRole('button', { name: 'Em linha' })).not.toBeSelected();
    expect(view.getByRole('button', { name: 'Em árvore' })).toBeSelected();
    const sort = section('Ordenar respostas');
    expect(sort.getByRole('button', { name: 'Mais curtidas' })).toBeSelected();
    expect(sort.getByRole('button', { name: 'Mais antigas' })).not.toBeSelected();
    expect(sort.getByRole('button', { name: 'Mais novas' })).not.toBeSelected();
  });

  it('keeps another view in the preferences and says it changed', async () => {
    await openMenu();

    await fireEvent.press(screen.getByRole('button', { name: 'Em árvore' }));

    expect(usePreferences.getState()).toMatchObject({ threadView: 'tree', threadSort: 'oldest' });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('keeps another order in the preferences and says it changed', async () => {
    await openMenu();

    await fireEvent.press(screen.getByRole('button', { name: 'Mais novas' }));

    expect(usePreferences.getState()).toMatchObject({ threadView: 'linear', threadSort: 'newest' });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('changes nothing when the current choice is picked again', async () => {
    await openMenu();

    await fireEvent.press(screen.getByRole('button', { name: 'Mais antigas' }));

    expect(usePreferences.getState()).toMatchObject({ threadView: 'linear', threadSort: 'oldest' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes once a choice is made', async () => {
    await openMenu();

    await fireEvent.press(screen.getByRole('button', { name: 'Em árvore' }));

    expect(screen.queryByRole('button', { name: 'Em linha' })).toBeNull();
  });
});
