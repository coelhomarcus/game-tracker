import { renderHook } from '@testing-library/react-native';

import { useScrollToTopOnTabPress } from '../useScrollToTopOnTabPress';

const mockNavigation = {
  addListener: jest.fn(),
  isFocused: jest.fn(),
};
jest.mock('expo-router', () => ({ useNavigation: () => mockNavigation }));

const unsubscribe = jest.fn();

beforeEach(() => {
  jest.resetAllMocks();
  mockNavigation.addListener.mockReturnValue(unsubscribe);
});

async function setup() {
  const list = { scrollToOffset: jest.fn() };
  const view = await renderHook(() => useScrollToTopOnTabPress({ current: list }));
  return { list, view };
}

function pressTab() {
  const [event, listener] = mockNavigation.addListener.mock.calls[0];
  expect(event).toBe('tabPress');
  listener();
}

describe('useScrollToTopOnTabPress', () => {
  it('scrolls the list to the top when its own tab is pressed while focused', async () => {
    mockNavigation.isFocused.mockReturnValue(true);
    const { list } = await setup();

    pressTab();

    expect(list.scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: true });
  });

  it('does nothing when the screen is not focused', async () => {
    mockNavigation.isFocused.mockReturnValue(false);
    const { list } = await setup();

    pressTab();

    expect(list.scrollToOffset).not.toHaveBeenCalled();
  });

  it('stops listening on unmount', async () => {
    const { view } = await setup();
    await view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
