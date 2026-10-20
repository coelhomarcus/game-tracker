// Etapa 07: uma barra para jogos e pessoas, abas, pesquisas recentes, início e resultados.
import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/design_system/game_card.dart';
import 'package:gametracker/core/design_system/game_catalog_row.dart';
import 'package:gametracker/core/design_system/game_shelf_item.dart';
import 'package:gametracker/core/network/app_exception.dart';
import 'package:gametracker/core/design_system/game_status.dart';
import 'package:gametracker/features/games/application/game_providers.dart';
import 'package:gametracker/features/games/data/game_models.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../support/fake_profiles.dart';
import '../../support/fake_repos.dart';
import '../../support/golden.dart';
import '../../support/harness.dart';

const _zelda = GameSummary(
  igdbId: 900001,
  name: 'Zelda Fixture',
  platforms: ['Switch', 'Wii U', 'Wii', '3DS'],
  genres: [],
);
const _celeste = GameSummary(
  igdbId: 900002,
  name: 'Celeste Fixture',
  platforms: ['PC'],
  genres: [],
);

final _wait = searchDebounce + const Duration(milliseconds: 50);

Finder get searchBar => find.byType(SearchBar);
Finder get field =>
    find.descendant(of: searchBar, matching: find.byType(EditableText));

String location(WidgetTester tester) =>
    GoRouter.of(tester.element(find.byType(Scaffold).first)).state.uri.path;

Future<void> type(WidgetTester tester, String text, {bool wait = true}) async {
  await tester.enterText(field, text);
  if (wait) {
    await tester.pump(_wait);
    await tester.pumpAndSettle();
  }
}

Future<void> submit(WidgetTester tester, String text) async {
  await type(tester, text);
  await tester.testTextInput.receiveAction(TextInputAction.search);
  await tester.pumpAndSettle();
}

Future<AppHarness> open(
  WidgetTester tester, {
  FakeGamesRepository? games,
  FakeProfilesRepository? profiles,
  FakeLibraryRepository? library,
  Size size = const Size(400, 900),
  double textScale = 1,
  String path = '/explore',
  Map<String, Object> prefs = const {},
  String? fontFamily,
}) async {
  final h = AppHarness(
    games: games ?? (FakeGamesRepository()..searchResult = [_zelda, _celeste]),
    profiles:
        profiles ??
        (FakeProfilesRepository()
          ..searchResult = [
            fakePerson(
              id: 'u-beto',
              username: 'beto',
              name: 'Beto Silva',
              bio: 'Gosto de RPG',
            ),
          ]),
    library: library,
  );
  await h.pump(
    tester,
    size: size,
    textScale: textScale,
    prefs: prefs,
    fontFamily: fontFamily,
  );
  if (path == '/explore') {
    await tapAndSettle(tester, find.text('Explorar').last);
  } else {
    await goTo(tester, path);
  }
  return h;
}

Future<void> openTab(WidgetTester tester, String tab) =>
    tapAndSettle(tester, find.widgetWithText(Tab, tab));

void main() {
  setUpAll(loadGoldenFonts);

  group('structure', () {
    testWidgets('the slash only, and the tabs games and people below her', (
      tester,
    ) async {
      await open(tester);
      expect(searchBar, findsOneWidget);
      expect(find.text('Buscar jogos ou pessoas'), findsOneWidget);
      expect(find.widgetWithText(Tab, 'Jogos'), findsOneWidget);
      expect(find.widgetWithText(Tab, 'Pessoas'), findsOneWidget);
      expect(
        tester.getTopLeft(find.byType(TabBar)).dy,
        greaterThan(tester.getBottomLeft(searchBar).dy),
        reason: 'as abas ficam abaixo da barra',
      );
      await openTab(tester, 'Pessoas');
      expect(searchBar, findsOneWidget, reason: 'continua uma barra só');
    });

    testWidgets('the query is shared; only the tab active query the server', (
      tester,
    ) async {
      final h = await open(tester);
      await type(tester, 'ze');
      expect(h.games.searches, ['ze']);
      expect(h.profiles.searches, isEmpty);

      await openTab(tester, 'Pessoas');
      await tester.pump(_wait);
      await tester.pumpAndSettle();
      expect(h.profiles.searches, ['ze'], reason: 'a mesma consulta');
      expect(find.text('Beto Silva'), findsOneWidget);
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller?.text,
        'ze',
        reason: 'o campo não muda ao trocar de aba',
      );
    });

    testWidgets(
      'the query and the tab survive the open the result and return',
      (tester) async {
        await open(tester);
        await openTab(tester, 'Pessoas');
        await type(tester, 'be');
        await tapAndSettle(tester, find.text('Beto Silva'));
        expect(location(tester), '/users/u-beto');
        await tapAndSettle(tester, find.byType(BackButton));

        expect(location(tester), '/explore');
        expect(find.text('Beto Silva'), findsOneWidget);
        final bar = tester.widget<SearchBar>(searchBar);
        expect(bar.controller!.text, 'be');
        expect(
          tester.widget<TabBar>(find.byType(TabBar)).controller!.index,
          1,
          reason: 'continua em Pessoas',
        );
      },
    );

    testWidgets('the query is preserved to the switch of destination', (
      tester,
    ) async {
      await open(tester);
      await type(tester, 'zelda');
      await tapAndSettle(tester, find.text('Biblioteca').last);
      await tapAndSettle(tester, find.text('Explorar').last);
      expect(tester.widget<SearchBar>(searchBar).controller!.text, 'zelda');
      expect(find.text('Zelda Fixture'), findsOneWidget);
    });

    testWidgets('clear the search cancels and returns to the start', (
      tester,
    ) async {
      await open(tester);
      await type(tester, 'zelda');
      await tapAndSettle(tester, find.byTooltip('Limpar busca'));
      expect(find.text('Zelda Fixture'), findsNothing);
      expect(find.text('Busque um jogo pelo nome'), findsOneWidget);
    });
  });

  group('scope through the route', () {
    testWidgets('/explore?scope=people opens people', (tester) async {
      await open(tester, path: '/explore?scope=people');
      expect(tester.widget<TabBar>(find.byType(TabBar)).controller!.index, 1);
      expect(find.text('Encontre pessoas'), findsOneWidget);
    });

    testWidgets('value unknown uses games', (tester) async {
      await open(tester, path: '/explore?scope=banana');
      expect(tester.widget<TabBar>(find.byType(TabBar)).controller!.index, 0);
    });

    testWidgets('with the page open, the link switches of tab', (tester) async {
      await open(tester);
      expect(tester.widget<TabBar>(find.byType(TabBar)).controller!.index, 0);
      await goTo(tester, '/explore?scope=people');
      expect(tester.widget<TabBar>(find.byType(TabBar)).controller!.index, 1);
      await goTo(tester, '/explore');
      expect(
        tester.widget<TabBar>(find.byType(TabBar)).controller!.index,
        1,
        reason: 'voltar a /explore sem escopo não tira a pessoa da aba',
      );
    });

    testWidgets('the query never goes for the URL', (tester) async {
      await open(tester);
      await type(tester, 'zelda');
      final router = GoRouter.of(tester.element(find.byType(Scaffold).first));
      expect(router.state.uri.toString(), '/explore');
    });
  });

  group('search', () {
    testWidgets('type fast query only the term end (debounce)', (tester) async {
      final h = await open(tester);
      await type(tester, 'ze', wait: false);
      await tester.pump(const Duration(milliseconds: 100));
      await type(tester, 'zel', wait: false);
      await tester.pump(); // reconstrói com o termo novo antes do tempo passar
      await tester.pump(_wait);
      await tester.pumpAndSettle();
      expect(h.games.searches, ['zel']);
    });

    testWidgets(
      'reply delayed does not replaces the of the search more recent',
      (tester) async {
        final games = FakeGamesRepository()
          ..searchByTerm['ze'] = const [_celeste]
          ..searchByTerm['zel'] = const [_zelda];
        final gate = Completer<void>();
        games.searchGates['ze'] = gate;
        await open(tester, games: games);

        // A busca de 'ze' fica em voo (o carregamento anima, então sem pumpAndSettle).
        await type(tester, 'ze', wait: false);
        await tester
            .pump(); // o termo novo cria a busca; o debounce começa aqui
        await tester.pump(_wait);
        expect(games.searches, ['ze'], reason: 'a busca antiga está em voo');
        await type(tester, 'zel', wait: false);
        await tester.pump();
        await tester.pump(_wait);
        await tester.pumpAndSettle();
        expect(find.text('Zelda Fixture'), findsOneWidget);
        gate.complete();
        await tester.pumpAndSettle();
        expect(find.text('Zelda Fixture'), findsOneWidget);
        expect(
          find.text('Celeste Fixture'),
          findsNothing,
          reason: 'resposta antiga descartada',
        );
        expect(
          games.cancelledSearches,
          1,
          reason: 'a requisição antiga foi cancelada',
        );
      },
    );

    testWidgets(
      'network, credentials and zero results are messages different',
      (tester) async {
        final games = FakeGamesRepository()
          ..searchError = const NetworkException();
        await open(tester, games: games);
        await type(tester, 'zelda');
        expect(find.textContaining('Sem conexão'), findsOneWidget);
        expect(find.text('Nenhum jogo encontrado'), findsNothing);

        games
          ..searchError = null
          ..searchResult = const [];
        await tapAndSettle(tester, find.text('Tentar de novo'));
        await tester.pump(_wait);
        await tester.pumpAndSettle();
        expect(find.text('Nenhum jogo encontrado'), findsOneWidget);
      },
    );
  });

  group('result of game', () {
    testWidgets('cover, name and until two platforms with the that remains', (
      tester,
    ) async {
      await open(tester);
      await type(tester, 'zelda');
      expect(find.text('Zelda Fixture'), findsOneWidget);
      expect(find.text('Switch · Wii U +2'), findsOneWidget);
      expect(find.text('PC'), findsOneWidget);
    });

    testWidgets('without entry: "add" opens the form', (tester) async {
      await open(tester);
      await type(tester, 'zelda');
      expect(find.widgetWithText(FilledButton, 'Adicionar'), findsNWidgets(2));
      expect(find.text('Na biblioteca'), findsNothing);
      await tapAndSettle(
        tester,
        find.byTooltip('Adicionar Zelda Fixture à biblioteca'),
      );
      expect(location(tester), '/games/900001/playthroughs/new');
    });

    testWidgets('with an entry: "in the library" opens my progress', (
      tester,
    ) async {
      final library = FakeLibraryRepository([
        fakeEntry(
          id: 'a',
          game: fakeGame(igdbId: 900001, name: 'Zelda Fixture'),
          status: GameStatus.completed,
        ),
      ]);
      await open(tester, library: library);
      await type(tester, 'zelda');
      expect(find.text('Na biblioteca'), findsOneWidget);
      expect(
        find.widgetWithText(FilledButton, 'Adicionar'),
        findsOneWidget,
        reason: 'só o Celeste',
      );

      await tapAndSettle(tester, find.text('Na biblioteca'));
      expect(location(tester), '/games/900001');
      expect(
        tester.widget<TabBar>(find.byType(TabBar)).controller!.index,
        1,
        reason: 'Meu progresso',
      );
    });

    testWidgets('tap in the body opens the game', (tester) async {
      await open(tester);
      await type(tester, 'zelda');
      await tapAndSettle(tester, find.text('Zelda Fixture'));
      expect(location(tester), '/games/900001');
    });
  });

  group('result of person', () {
    testWidgets('name, handle, bio and follow', (tester) async {
      await open(tester);
      await openTab(tester, 'Pessoas');
      await type(tester, 'be');
      expect(find.text('Beto Silva'), findsOneWidget);
      expect(find.text('@beto'), findsOneWidget);
      expect(find.text('Gosto de RPG'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Seguir'), findsOneWidget);
    });

    testWidgets('bio long occupies at most two lines', (tester) async {
      final profiles = FakeProfilesRepository()
        ..searchResult = [
          fakePerson(username: 'beto', name: 'Beto', bio: 'Uma bio ' * 40),
        ];
      await open(tester, profiles: profiles);
      await openTab(tester, 'Pessoas');
      await type(tester, 'be');
      final bio = tester.widget<Text>(find.textContaining('Uma bio').first);
      expect(bio.maxLines, 2);
      expect(bio.overflow, TextOverflow.ellipsis);
    });

    testWidgets('follow uses the state shared and tap opens the profile', (
      tester,
    ) async {
      final profiles = FakeProfilesRepository()
        ..searchResult = [fakePerson(name: 'Beto Silva')]
        ..profiles['u-beto'] = fakeProfile(name: 'Beto Silva', followers: 3);
      await open(tester, profiles: profiles);
      await openTab(tester, 'Pessoas');
      await type(tester, 'be');
      await tapAndSettle(tester, find.widgetWithText(FilledButton, 'Seguir'));
      expect(profiles.followCalls.single, ('u-beto', true));
      await tapAndSettle(tester, find.text('Beto Silva'));
      expect(location(tester), '/users/u-beto');
      expect(find.text('Seguindo'), findsOneWidget);
    });
  });

  group('searches recent', () {
    testWidgets('type does not saves; Enter saves', (tester) async {
      await open(tester);
      await type(tester, 'zelda');
      await tapAndSettle(tester, find.byTooltip('Limpar busca'));
      expect(
        find.text('Pesquisas recentes'),
        findsNothing,
        reason: 'só digitou',
      );

      await submit(tester, 'zelda');
      await tapAndSettle(tester, find.byTooltip('Limpar busca'));
      expect(find.text('Pesquisas recentes'), findsOneWidget);
      expect(find.widgetWithText(ActionChip, 'zelda'), findsOneWidget);
    });

    testWidgets('open the result saves the term', (tester) async {
      await open(tester);
      await type(tester, 'zelda');
      await tapAndSettle(tester, find.text('Zelda Fixture'));
      await tapAndSettle(tester, find.byType(BackButton));
      await tapAndSettle(tester, find.byTooltip('Limpar busca'));
      expect(find.widgetWithText(ActionChip, 'zelda'), findsOneWidget);
    });

    testWidgets('term short does not becomes search', (tester) async {
      await open(tester);
      await submit(tester, 'z');
      await tapAndSettle(tester, find.byTooltip('Limpar busca'));
      expect(find.text('Pesquisas recentes'), findsNothing);
    });

    testWidgets(
      'repeat moves up to the top without duplicates, ignoring box and accent',
      (tester) async {
        await open(tester);
        for (final t in ['Pokémon', 'zelda', 'POKEMON']) {
          await submit(tester, t);
        }
        await tapAndSettle(tester, find.byTooltip('Limpar busca'));
        final chips = tester
            .widgetList<ActionChip>(find.byType(ActionChip))
            .toList();
        expect(
          [for (final c in chips) (c.label as Text).data],
          ['POKEMON', 'zelda'],
        );
      },
    );

    testWidgets('stores at most 8', (tester) async {
      await open(tester);
      for (var i = 0; i < 10; i++) {
        await submit(tester, 'termo $i');
      }
      await tapAndSettle(tester, find.byTooltip('Limpar busca'));
      expect(find.byType(ActionChip), findsNWidgets(8));
      expect(find.widgetWithText(ActionChip, 'termo 9'), findsOneWidget);
      expect(find.widgetWithText(ActionChip, 'termo 1'), findsNothing);
    });

    testWidgets('tap a recent retries the search', (tester) async {
      final h = await open(tester);
      await submit(tester, 'zelda');
      await tapAndSettle(tester, find.byTooltip('Limpar busca'));
      h.games.searches.clear();
      await tapAndSettle(tester, find.widgetWithText(ActionChip, 'zelda'));
      await tester.pump(_wait);
      await tester.pumpAndSettle();
      expect(tester.widget<SearchBar>(searchBar).controller!.text, 'zelda');
      expect(h.games.searches, ['zelda']);
      expect(find.text('Zelda Fixture'), findsOneWidget);
    });

    testWidgets('"clear history" deletes only the of the scope', (
      tester,
    ) async {
      await open(tester);
      await submit(tester, 'zelda');
      await openTab(tester, 'Pessoas');
      await submit(tester, 'beto');
      await tapAndSettle(tester, find.byTooltip('Limpar busca'));
      expect(find.widgetWithText(ActionChip, 'beto'), findsOneWidget);
      expect(
        find.widgetWithText(ActionChip, 'zelda'),
        findsNothing,
        reason: 'recentes de Jogos ficam em Jogos',
      );

      await tapAndSettle(tester, find.text('Limpar histórico'));
      expect(find.text('Pesquisas recentes'), findsNothing);
      await openTab(tester, 'Jogos');
      expect(find.widgetWithText(ActionChip, 'zelda'), findsOneWidget);
    });

    testWidgets('discarded when leaving of the account', (tester) async {
      await open(tester);
      await submit(tester, 'zelda');
      await tapAndSettle(tester, find.text('Perfil').last);
      await tapAndSettle(tester, find.byTooltip('Configurações'));
      await tapSignOut(tester);
      await tester.enterText(find.byType(TextFormField).first, 'ana');
      await tester.enterText(find.byType(TextFormField).last, 'senha');
      await tapAndSettle(tester, find.widgetWithText(FilledButton, 'Entrar'));
      await goTo(tester, '/explore');
      expect(find.text('Pesquisas recentes'), findsNothing);
      expect(tester.widget<SearchBar>(searchBar).controller!.text, isEmpty);
    });
  });

  group('start', () {
    testWidgets(
      'games: currently playing from the Library, with an invitation to the community',
      (tester) async {
        final library = FakeLibraryRepository([
          fakeEntry(id: 'a', status: GameStatus.playing),
          fakeEntry(
            id: 'b',
            game: fakeGame(igdbId: 2, name: 'Celeste'),
            status: GameStatus.completed,
          ),
        ]);
        await open(tester, library: library);
        expect(find.text('Jogando agora'), findsOneWidget);
        expect(find.text('Busque um jogo pelo nome'), findsNothing);
        expect(
          find.text('Celeste'),
          findsNothing,
          reason: 'só o que está em andamento',
        );

        await tapAndSettle(tester, find.byType(GameShelfItem).first);
        expect(location(tester), '/games/900001');
        await tapAndSettle(tester, find.byType(BackButton));

        await tapAndSettle(
          tester,
          find.text('Encontrar conversas na Comunidade'),
        );
        expect(location(tester), '/community');
      },
    );

    testWidgets('games without date: guidance short and the invitation', (
      tester,
    ) async {
      await open(tester);
      expect(find.text('Busque um jogo pelo nome'), findsOneWidget);
      expect(find.text('Jogando agora'), findsNothing);
      expect(find.text('Encontrar conversas na Comunidade'), findsOneWidget);
    });

    testWidgets('people: guidance and "Meet the community"', (tester) async {
      await open(tester);
      await openTab(tester, 'Pessoas');
      expect(find.text('Encontre pessoas'), findsOneWidget);
      expect(find.text('Jogando agora'), findsNothing, reason: 'só em Jogos');
      await tapAndSettle(tester, find.text('Conhecer a comunidade'));
      expect(location(tester), '/community');
    });

    testWidgets('does not invents "in high"', (tester) async {
      await open(tester);
      expect(find.textContaining('alta'), findsNothing);
    });
  });

  group('layout', () {
    for (final (size, scale, grid) in [
      (const Size(360, 640), 2.0, false),
      (const Size(390, 844), 1.0, false),
      (const Size(600, 960), 1.0, false),
      (const Size(840, 900), 1.0, true),
      (const Size(1280, 900), 1.0, true),
      (const Size(1440, 900), 1.0, true),
      (const Size(1440, 900), 2.0, false),
    ]) {
      testWidgets(
        '${size.width.toInt()} px, text $scale×: start and results without overflow',
        (tester) async {
          final library = FakeLibraryRepository([
            fakeEntry(id: 'a', status: GameStatus.playing),
          ]);
          await open(tester, library: library, size: size, textScale: scale);
          await submit(tester, 'um termo bastante comprido para quebrar linha');
          await tapAndSettle(tester, find.byTooltip('Limpar busca'));
          expect(tester.takeException(), isNull);
          await type(tester, 'zelda');
          expect(tester.takeException(), isNull);
          expect(find.byType(GameCard), grid ? findsWidgets : findsNothing);
          expect(
            find.byType(GameCatalogRow),
            grid ? findsNothing : findsWidgets,
          );
          await openTab(tester, 'Pessoas');
          await tester.pump(_wait);
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
        },
      );
    }
  });

  group('selectors in modal continue with search own', () {
    testWidgets('selector of game from the Library', (tester) async {
      await open(tester);
      await tapAndSettle(tester, find.text('Biblioteca').last);
      await tapAndSettle(
        tester,
        find.widgetWithText(FloatingActionButton, 'Adicionar jogo'),
      );
      expect(searchBar, findsOneWidget);
      expect(
        find.text('Buscar jogos'),
        findsOneWidget,
        reason: 'campo próprio do modal',
      );
      await type(tester, 'zelda');
      expect(
        find.byTooltip('Adicionar Zelda Fixture à biblioteca'),
        findsOneWidget,
      );
      expect(
        find.text('Na biblioteca'),
        findsNothing,
        reason: 'o modal só escolhe',
      );
    });
  });

  group('goldens of the etapa 3', () {
    FakeGamesRepository games() => FakeGamesRepository()
      ..searchResult = [
        _zelda,
        _celeste,
        const GameSummary(
          igdbId: 3,
          name: 'Hades',
          platforms: ['PC', 'PlayStation 5'],
          genres: [],
        ),
        const GameSummary(
          igdbId: 4,
          name: 'The Legend of Zelda: Tears of the Kingdom',
          platforms: ['Switch'],
          genres: [],
        ),
        const GameSummary(
          igdbId: 5,
          name: 'Outer Wilds',
          platforms: [],
          genres: [],
        ),
      ];

    for (final (layout, size) in [
      ('390', const Size(390, 1000)),
      ('1280', const Size(1280, 900)),
    ]) {
      for (final theme in ['light', 'dark']) {
        testWidgets('$layout · $theme', skip: goldenSkip, (tester) async {
          await open(
            tester,
            games: games(),
            size: size,
            prefs: {'theme.mode': theme},
            fontFamily: goldenFontFamily,
          );
          await type(tester, 'jogos');
          await expectLater(
            find.byType(MaterialApp),
            matchesGoldenFile('goldens/explore_${layout}_$theme.png'),
          );
        });
      }
    }
  });
}
