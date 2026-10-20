import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useLibrary } from "@/features/library/queries";
import type { GameEntry } from "@/features/library/types";

import { ExploreScreen } from "../ExploreScreen";
import { useGameSearch } from "../queries";
import type { Game, GameSummary } from "../types";

jest.mock("../queries", () => ({ useGameSearch: jest.fn() }));
jest.mock("@/features/library/queries", () => ({ useLibrary: jest.fn() }));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

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
  mockPush.mockReset();
  refetch.mockReset();
  mockSearch();
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
});
