import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useLibrary } from "@/features/library/queries";
import type { GameEntry } from "@/features/library/types";
import { usePeopleSearch } from "@/features/profiles/queries";
import type { PersonResult } from "@/features/profiles/types";

import { ExploreScreen } from "../ExploreScreen";
import { useGameSearch } from "../queries";
import type { Game, GameSummary } from "../types";

jest.mock("../queries", () => ({ useGameSearch: jest.fn() }));
jest.mock("@/features/library/queries", () => ({ useLibrary: jest.fn() }));
jest.mock("@/features/profiles/queries", () => ({
  usePeopleSearch: jest.fn(),
  useToggleFollow: () => ({ mutate: jest.fn() }),
}));

const mockPush = jest.fn();
const mockSetParams = jest.fn();
const mockNavigation = { addListener: jest.fn(), isFocused: jest.fn() };
const mockRouter = { push: mockPush, setParams: mockSetParams };
let mockParams: { tab?: string } = {};
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  useNavigation: () => mockNavigation,
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const hades: GameSummary = {
  igdbId: 11,
  name: "Hades",
  coverUrl: null,
  platforms: ["PC", "Switch"],
  genres: [],
};
const celeste: GameSummary = {
  igdbId: 22,
  name: "Celeste",
  coverUrl: null,
  platforms: [],
  genres: [],
};

const ana: PersonResult = {
  id: "u1",
  username: "ana",
  name: "Ana Souza",
  avatarUrl: null,
  bio: null,
  isFollowedByMe: false,
};

const refetch = jest.fn();

function mockSearch(overrides: Record<string, unknown> = {}) {
  jest.mocked(useGameSearch).mockReturnValue({
    data: [hades, celeste],
    isPending: false,
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
    refetch,
    ...overrides,
  } as unknown as ReturnType<typeof useGameSearch>);
}

function mockPeople() {
  jest.mocked(usePeopleSearch).mockReturnValue({
    data: [ana],
    isPending: false,
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof usePeopleSearch>);
}

function mockLibrary(igdbIds: number[]) {
  const data = igdbIds.map(
    (igdbId) =>
      ({ id: `e${igdbId}`, game: { igdbId } as Game }) as unknown as GameEntry,
  );
  jest
    .mocked(useLibrary)
    .mockReturnValue({ data } as unknown as ReturnType<typeof useLibrary>);
}

async function renderExplore() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ExploreScreen />
    </SafeAreaProvider>,
  );
  await layoutGrid();
}

/** The grid renders nothing until it has been measured. */
async function layoutGrid() {
  await fireEvent(screen.getByTestId("cover-grid"), "layout", {
    nativeEvent: { layout: { width: 358, height: 800 } },
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function type(text: string) {
  await fireEvent.changeText(screen.getByLabelText("Buscar jogos"), text);
}

beforeEach(() => {
  mockParams = {};
  mockPush.mockReset();
  mockSetParams.mockReset();
  refetch.mockReset();
  mockNavigation.addListener.mockReset();
  mockNavigation.addListener.mockReturnValue(jest.fn());
  mockSearch();
  mockPeople();
  mockLibrary([]);
});

describe("ExploreScreen", () => {
  it("shows the hint for a short term and ignores placeholder results", async () => {
    await renderExplore();
    expect(screen.getByText("Busque um jogo pelo nome")).toBeOnTheScreen();
    expect(screen.getByText("Digite pelo menos 2 letras.")).toBeOnTheScreen();
    expect(screen.queryByText("Hades")).not.toBeOnTheScreen();

    await type(" a ");
    expect(screen.getByText("Busque um jogo pelo nome")).toBeOnTheScreen();
    expect(screen.queryByText("Hades")).not.toBeOnTheScreen();
    expect(useGameSearch).toHaveBeenLastCalledWith(" a ");
  });

  it("renders the results with the first platform or a fallback", async () => {
    await renderExplore();
    await type("ha");
    expect(
      screen.queryByText("Busque um jogo pelo nome"),
    ).not.toBeOnTheScreen();
    // The name sits below the cover; a cover without an image repeats it inside.
    expect(screen.getAllByText("Hades").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Celeste").length).toBeGreaterThan(0);
    expect(screen.getByText("PC")).toBeOnTheScreen();
    expect(screen.getByText("Plataformas não informadas")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Hades, PC" })).toBeOnTheScreen();
    expect(
      screen.getByRole("button", {
        name: "Celeste, Plataformas não informadas",
      }),
    ).toBeOnTheScreen();
  });

  it("does not give the cover its own screen reader stop", async () => {
    await renderExplore();
    await type("ha");
    expect(
      screen.queryByLabelText(/Capa de/, { includeHiddenElements: true }),
    ).toBeNull();
  });

  it("marks a game that is already in the library", async () => {
    mockLibrary([11]);
    await renderExplore();
    await type("ha");
    expect(screen.getByText("Na biblioteca")).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Hades, Na biblioteca" }),
    ).toBeOnTheScreen();
    expect(screen.queryByText("PC")).not.toBeOnTheScreen();
  });

  it("listens for a press on its own tab to scroll back to the top", async () => {
    await renderExplore();
    expect(mockNavigation.addListener).toHaveBeenCalledWith(
      "tabPress",
      expect.any(Function),
    );
  });

  it("opens the game when a result is pressed", async () => {
    await renderExplore();
    await type("ha");
    await fireEvent.press(
      screen.getByRole("button", {
        name: "Celeste, Plataformas não informadas",
      }),
    );
    expect(mockPush).toHaveBeenCalledWith("/games/22");
  });

  it("shows an empty state when nothing matches", async () => {
    mockSearch({ data: [] });
    await renderExplore();
    await type("zzz");
    expect(screen.getByText("Nenhum jogo encontrado")).toBeOnTheScreen();
  });

  it("shows the busy indicator while fetching and keeps the previous results", async () => {
    mockSearch({ isFetching: true, isPlaceholderData: true });
    await renderExplore();
    await type("ha");
    expect(screen.getByLabelText("Buscando")).toBeOnTheScreen();
    expect(screen.getAllByText("Hades").length).toBeGreaterThan(0);
  });

  it("offers a retry when the search fails", async () => {
    mockSearch({ data: undefined, isError: true });
    await renderExplore();
    await type("ha");
    expect(screen.getByText("Não foi possível buscar agora")).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Tentar de novo" }),
    );
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  describe("tabs", () => {
    const explore = () => (
      <SafeAreaProvider initialMetrics={metrics}>
        <ExploreScreen />
      </SafeAreaProvider>
    );

    async function renderPlain() {
      await render(explore());
    }

    it("opens on the games tab by default", async () => {
      await renderExplore();
      expect(screen.getByRole("tab", { name: "Jogos" })).toBeSelected();
      expect(screen.getByRole("tab", { name: "Pessoas" })).not.toBeSelected();
      expect(screen.getByLabelText("Buscar jogos")).toBeOnTheScreen();
      expect(screen.queryByLabelText("Buscar pessoas")).not.toBeOnTheScreen();
    });

    it("opens on the people tab when asked by the tab parameter", async () => {
      mockParams = { tab: "people" };
      await renderPlain();
      expect(screen.getByRole("tab", { name: "Pessoas" })).toBeSelected();
      expect(screen.getByLabelText("Buscar pessoas")).toBeOnTheScreen();
      expect(screen.queryByLabelText("Buscar jogos")).not.toBeOnTheScreen();
      expect(screen.getByText("Encontre pessoas")).toBeOnTheScreen();
    });

    it("moves to the people tab when the parameter arrives later", async () => {
      await renderExplore();
      expect(screen.getByLabelText("Buscar jogos")).toBeOnTheScreen();

      mockParams = { tab: "people" };
      await screen.rerender(explore());
      expect(screen.getByLabelText("Buscar pessoas")).toBeOnTheScreen();
    });

    it("consumes the tab parameter so the same link works again", async () => {
      mockParams = { tab: "people" };
      await renderPlain();
      expect(mockSetParams).toHaveBeenCalledWith({ tab: undefined });

      // The router drops the parameter, the user goes back to games, then the link is followed again.
      mockParams = {};
      await screen.rerender(explore());
      await fireEvent.press(screen.getByRole("tab", { name: "Jogos" }));
      await layoutGrid();
      expect(screen.getByLabelText("Buscar jogos")).toBeOnTheScreen();

      mockParams = { tab: "people" };
      await screen.rerender(explore());
      expect(screen.getByLabelText("Buscar pessoas")).toBeOnTheScreen();
    });

    it("opens the games tab when asked, after leaving it on people", async () => {
      mockParams = { tab: "people" };
      await renderPlain();
      mockParams = {};
      await screen.rerender(explore());
      expect(screen.getByLabelText("Buscar pessoas")).toBeOnTheScreen();

      mockParams = { tab: "games" };
      await screen.rerender(explore());
      await layoutGrid();
      expect(screen.getByLabelText("Buscar jogos")).toBeOnTheScreen();
      expect(mockSetParams).toHaveBeenLastCalledWith({ tab: undefined });
    });

    it("keeps the search text of each tab when switching", async () => {
      await renderExplore();
      await type("ha");

      await fireEvent.press(screen.getByRole("tab", { name: "Pessoas" }));
      expect(screen.getByLabelText("Buscar pessoas").props.value).toBe("");
      await fireEvent.changeText(screen.getByLabelText("Buscar pessoas"), "an");
      expect(screen.getByText("Ana Souza")).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole("tab", { name: "Jogos" }));
      await layoutGrid();
      expect(screen.getByLabelText("Buscar jogos").props.value).toBe("ha");

      await fireEvent.press(screen.getByRole("tab", { name: "Pessoas" }));
      expect(screen.getByLabelText("Buscar pessoas").props.value).toBe("an");
    });

    it("opens a profile from a person result", async () => {
      mockParams = { tab: "people" };
      await renderPlain();
      await fireEvent.changeText(screen.getByLabelText("Buscar pessoas"), "an");
      await fireEvent.press(
        screen.getByRole("button", { name: "Perfil de Ana Souza" }),
      );
      expect(mockPush).toHaveBeenCalledWith("/users/u1");
    });
  });
});
