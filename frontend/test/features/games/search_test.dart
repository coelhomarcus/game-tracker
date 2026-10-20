import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/network/app_exception.dart';
import 'package:gametracker/features/games/application/game_providers.dart';
import 'package:gametracker/features/games/data/game_models.dart';
import 'package:material_ui/material_ui.dart';

import '../../support/fake_repos.dart';
import '../../support/harness.dart';

const _zelda = GameSummary(
  igdbId: 900001,
  name: 'Zelda Fixture',
  platforms: ['Switch', 'Wii U'],
  genres: [],
);

Future<void> typeQuery(WidgetTester tester, String text) async {
  await tester.enterText(
    find.descendant(
      of: find.byType(SearchBar),
      matching: find.byType(EditableText),
    ),
    text,
  );
  await tester.pump(searchDebounce + const Duration(milliseconds: 50));
  await tester.pumpAndSettle();
}

Future<AppHarness> openExplore(
  WidgetTester tester, {
  FakeGamesRepository? games,
}) async {
  final h = AppHarness(
    games: games ?? (FakeGamesRepository()..searchResult = [_zelda]),
  );
  await h.pump(tester);
  await tapAndSettle(tester, find.text('Explorar').last);
  return h;
}

void main() {
  testWidgets(
    'without the search term shows the hint and does not query the server',
    (tester) async {
      final h = await openExplore(tester);
      expect(find.text('Busque um jogo pelo nome'), findsOneWidget);
      await typeQuery(tester, 'z');
      expect(find.text('Busque um jogo pelo nome'), findsOneWidget);
      expect(h.games.searches, isEmpty);
    },
  );

  testWidgets('shows results after of the debounce', (tester) async {
    final h = await openExplore(tester);
    await typeQuery(tester, 'zelda');
    expect(h.games.searches, ['zelda']);
    expect(find.text('Zelda Fixture'), findsOneWidget);
    expect(find.text('Switch · Wii U'), findsOneWidget);
  });

  testWidgets('in the result is different of error', (tester) async {
    final games = FakeGamesRepository()..searchResult = const [];
    await openExplore(tester, games: games);
    await typeQuery(tester, 'xyz');
    expect(find.text('Nenhum jogo encontrado'), findsOneWidget);
    expect(find.text('Tentar de novo'), findsNothing);
  });

  testWidgets(
    'IGDB does not configured shows error explanatory with new attempt',
    (tester) async {
      final games = FakeGamesRepository()
        ..searchError = const ApiException(503, 'igdb_not_configured', 'x');
      await openExplore(tester, games: games);
      await typeQuery(tester, 'zelda');
      expect(find.textContaining('ainda não está configurada'), findsOneWidget);
      expect(find.text('Nenhum jogo encontrado'), findsNothing);

      games
        ..searchError = null
        ..searchResult = [_zelda];
      await tapAndSettle(tester, find.text('Tentar de novo'));
      await tester.pump(searchDebounce + const Duration(milliseconds: 50));
      await tester.pumpAndSettle();
      expect(find.text('Zelda Fixture'), findsOneWidget);
    },
  );

  testWidgets('tap in the result opens the page of the game', (tester) async {
    await openExplore(tester);
    await typeQuery(tester, 'zelda');
    await tapAndSettle(tester, find.text('Zelda Fixture'));
    expect(find.text('Meu progresso'), findsOneWidget);
  });

  testWidgets('button add opens the form of new playthrough', (tester) async {
    await openExplore(tester);
    await typeQuery(tester, 'zelda');
    await tapAndSettle(
      tester,
      find.byTooltip('Adicionar Zelda Fixture à biblioteca'),
    );
    expect(find.text('Novo registro'), findsWidgets);
    expect(find.text('Plataforma'), findsOneWidget);
  });

  testWidgets('clear the search returns to the hint', (tester) async {
    await openExplore(tester);
    await typeQuery(tester, 'zelda');
    await tapAndSettle(tester, find.byTooltip('Limpar busca'));
    expect(find.text('Busque um jogo pelo nome'), findsOneWidget);
  });

  testWidgets('selector of game from the Library opens form', (tester) async {
    final h = AppHarness(games: FakeGamesRepository()..searchResult = [_zelda]);
    await h.pump(tester);
    await tapAndSettle(
      tester,
      find.widgetWithText(FloatingActionButton, 'Adicionar jogo'),
    );
    await typeQuery(tester, 'zelda');
    await tapAndSettle(tester, find.text('Zelda Fixture'));
    expect(find.text('Novo registro'), findsWidgets);
  });
}
