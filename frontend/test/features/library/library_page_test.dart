import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/dates/date_only.dart';
import 'package:gametracker/core/design_system/game_card.dart';
import 'package:gametracker/core/design_system/game_list_row.dart';
import 'package:gametracker/core/design_system/game_shelf_item.dart';
import 'package:gametracker/core/design_system/game_status.dart';
import 'package:gametracker/core/network/app_exception.dart';
import 'package:gametracker/features/library/data/game_entry.dart';
import 'package:gametracker/features/library/presentation/entry_actions.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../support/fake_repos.dart';
import '../../support/golden.dart';
import '../../support/harness.dart';

/// Abre o jogo na Biblioteca e usa o menu de um registro específico ("Meu progresso").
Future<void> openMenu(WidgetTester tester, int index, String item) async {
  await openLibraryGame(tester, 'Jogo Fixture Um');
  await tapAndSettle(tester, find.byType(EntryMenuButton).at(index));
  await tapAndSettle(tester, find.text(item).last);
}

String location(WidgetTester tester) =>
    GoRouter.of(tester.element(find.byType(Scaffold).first)).state.uri.path;

Finder get searchField =>
    find.widgetWithText(TextField, 'Buscar na biblioteca');

final verticalScroll = find.byWidgetPredicate(
  (widget) =>
      widget is Scrollable && widget.axisDirection == AxisDirection.down,
);

Future<void> search(WidgetTester tester, String text) async {
  await tester.enterText(searchField, text);
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(loadGoldenFonts);

  testWidgets('loading state followed by the collection', (tester) async {
    final h = AppHarness(library: FakeLibraryRepository([fakeEntry()]));
    await h.pump(tester);
    expect(find.text('Jogo Fixture Um'), findsWidgets);
    expect(find.text('1 jogo · 1 registro'), findsOneWidget);
  });

  testWidgets('empty collection invites the find the game', (tester) async {
    await AppHarness().pump(tester);
    expect(find.text('Sua biblioteca começa com um jogo'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Encontrar jogo'), findsOneWidget);
    expect(
      find.widgetWithText(FloatingActionButton, 'Adicionar jogo'),
      findsOneWidget,
    );

    await tapAndSettle(
      tester,
      find.widgetWithText(FilledButton, 'Encontrar jogo'),
    );
    expect(location(tester), '/explore');
  });

  testWidgets('a network error shows a message and "try again" reloads', (
    tester,
  ) async {
    final library = FakeLibraryRepository([fakeEntry()])
      ..listError = const NetworkException();
    await AppHarness(library: library).pump(tester);
    expect(find.textContaining('Sem conexão'), findsOneWidget);
    expect(
      find.text('Sua biblioteca começa com um jogo'),
      findsNothing,
      reason: 'erro não é vazio',
    );

    library.listError = null;
    await tapAndSettle(tester, find.text('Tentar de novo'));
    expect(find.text('Jogo Fixture Um'), findsWidgets);
  });

  group('replays', () {
    final twoRecords = FakeLibraryRepository([
      fakeEntry(id: 'a', status: GameStatus.completed, platform: 'PC'),
      fakeEntry(id: 'b', status: GameStatus.backlog, platform: 'PC'),
    ]);

    testWidgets(
      'two entries for the same game become one card with text context',
      (tester) async {
        await AppHarness(library: twoRecords).pump(tester);
        expect(find.byType(GameCard), findsOneWidget);
        expect(find.text('1 jogo · 2 registros'), findsOneWidget);
        expect(find.text('2 registros'), findsOneWidget);
        expect(find.text('1 jogo encontrado'), findsOneWidget);
      },
    );

    testWidgets(
      'the grid shows title, status and context without hours or note',
      (tester) async {
        await AppHarness(
          library: FakeLibraryRepository([
            fakeEntry(
              id: 'a',
              status: GameStatus.completed,
              platform: 'PC',
              hours: 20,
              rating: 8,
            ),
          ]),
        ).pump(tester);
        expect(find.text('Jogo Fixture Um'), findsWidgets);
        expect(find.text('Concluído'), findsOneWidget);
        expect(find.text('PC'), findsOneWidget);
        expect(find.textContaining('20'), findsNothing);
        expect(find.textContaining('8/10'), findsNothing);
      },
    );

    testWidgets('the label of accessibility says status and entries', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();
      await AppHarness(library: twoRecords).pump(tester);
      expect(
        find.bySemanticsLabel('Jogo Fixture Um, Vários status, 2 registros'),
        findsOneWidget,
      );
      handle.dispose();
    });

    testWidgets(
      'in the list: multiple statuses, "2 entries", and summed hours',
      (tester) async {
        await AppHarness(
          library: FakeLibraryRepository([
            fakeEntry(
              id: 'a',
              status: GameStatus.completed,
              hours: 4,
              rating: 9,
            ),
            fakeEntry(id: 'b', status: GameStatus.backlog, hours: 6, rating: 5),
          ]),
        ).pump(tester, prefs: {'library.grid': false});
        expect(find.text('Vários status'), findsOneWidget);
        expect(find.text('2 registros'), findsOneWidget);
        expect(find.text('10,0 h'), findsOneWidget);
        expect(
          find.textContaining('Nota'),
          findsNothing,
          reason: 'a nota é de um registro, não do jogo',
        );
      },
    );

    testWidgets('in the list, one entry only shows the note his', (
      tester,
    ) async {
      await AppHarness(
        library: FakeLibraryRepository([fakeEntry(rating: 8, hours: 0)]),
      ).pump(tester, prefs: {'library.grid': false});
      expect(find.text('Nota 8/10'), findsOneWidget);
      expect(find.text('0,0 h'), findsOneWidget, reason: 'zero é um valor');
    });

    testWidgets('empty platform means absence, not blank text', (tester) async {
      await AppHarness(
        library: FakeLibraryRepository([fakeEntry(platform: '')]),
      ).pump(tester);
      expect(find.text('Plataforma não informada'), findsOneWidget);
    });

    testWidgets('tapping the cover opens the game in "my progress"', (
      tester,
    ) async {
      await AppHarness(library: twoRecords).pump(tester);
      await openLibraryGame(tester, 'Jogo Fixture Um');
      expect(location(tester), '/games/900001');
      expect(find.byType(EntryMenuButton), findsNWidgets(2));
    });

    testWidgets('game menu: view entries and create a new entry', (
      tester,
    ) async {
      await AppHarness(library: twoRecords).pump(tester);
      await tester.ensureVisible(libraryGame('Jogo Fixture Um'));
      await tapAndSettle(tester, find.byType(GameMenuButton));
      expect(find.text('Ver registros'), findsOneWidget);
      expect(
        find.text('Editar'),
        findsNothing,
        reason: 'edição é por registro',
      );
      expect(find.text('Remover'), findsNothing);
      await tapAndSettle(tester, find.text('Novo registro'));
      expect(location(tester), '/games/900001/playthroughs/new');
    });
  });

  testWidgets(
    'new entry through the menu returns to the Library and updates the summary',
    (tester) async {
      final library = FakeLibraryRepository([fakeEntry(id: 'a')]);
      await AppHarness(library: library)
          .pump(tester, size: const Size(400, 2000));
      await tester.ensureVisible(libraryGame('Jogo Fixture Um'));
      await tapAndSettle(tester, find.byType(GameMenuButton));
      await tapAndSettle(tester, find.text('Novo registro'));
      expect(location(tester), '/games/900001/playthroughs/new');
      expect(
        find.text(
          'Você já tem 1 registro deste jogo. Este será um novo registro.',
        ),
        findsOneWidget,
      );

      await tapAndSettle(
        tester,
        find.widgetWithText(FilledButton, 'Salvar registro'),
      );
      expect(
        location(tester),
        '/library',
        reason: 'volta ao contexto de origem',
      );
      expect(find.text('1 jogo · 2 registros'), findsOneWidget);
      expect(library.created, hasLength(1));
    },
  );

  group('filters', () {
    final data = [
      fakeEntry(id: 'a', status: GameStatus.completed, platform: 'PC'),
      fakeEntry(id: 'b', status: GameStatus.playing, platform: 'PS5'),
      fakeEntry(
        id: 'c',
        game: fakeGame(igdbId: 2, name: 'Celeste'),
        status: GameStatus.completed,
        platform: 'PC',
      ),
      fakeEntry(
        id: 'd',
        game: fakeGame(igdbId: 3, name: 'Pokémon Ônix'),
        status: GameStatus.backlog,
        platform: 'Switch',
      ),
    ];

    Future<void> pumpData(WidgetTester tester) =>
        AppHarness(library: FakeLibraryRepository(data))
            .pump(tester, size: const Size(400, 1400));

    testWidgets('the menu of status account games distinct and filters', (
      tester,
    ) async {
      await pumpData(tester);
      expect(statusButtonText('Status'), findsOneWidget);
      expect(find.text('3 jogos encontrados'), findsOneWidget);

      await tapAndSettle(tester, statusMenu);
      expect(find.text('Todos (3)'), findsOneWidget);
      expect(find.text('Concluído (2)'), findsOneWidget);
      expect(find.text('Jogando (1)'), findsOneWidget);
      expect(find.text('Abandonado (0)'), findsOneWidget);
      await tapAndSettle(tester, find.text('Concluído (2)'));
      expect(find.text('2 jogos encontrados'), findsOneWidget);
      expect(libraryGame('Celeste'), findsOneWidget);
      expect(find.text('Pokémon Ônix'), findsNothing);
      expect(
        statusButtonText('Concluído (2)'),
        findsOneWidget,
        reason: 'o botão mostra o filtro ativo',
      );

      await chooseStatus(tester, 'Abandonado (0)');
      expect(find.text('Nenhum jogo com esses filtros'), findsOneWidget);

      await chooseStatus(tester, 'Todos (3)');
      expect(find.text('3 jogos encontrados'), findsOneWidget);
      expect(statusButtonText('Status'), findsOneWidget);
    });

    testWidgets(
      'search ignores box and accents; "clear search" returns the everything',
      (tester) async {
        await pumpData(tester);
        await search(tester, 'pokemon onix');
        expect(find.text('1 jogo encontrado'), findsOneWidget);
        expect(libraryGame('Pokémon Ônix'), findsOneWidget);
        await tapAndSettle(tester, statusMenu);
        expect(
          find.text('Todos (1)'),
          findsOneWidget,
          reason: 'a busca vale para as contagens do menu',
        );
        await tester.tapAt(const Offset(2, 2));
        await tester.pumpAndSettle();

        await tapAndSettle(tester, find.byTooltip('Limpar busca'));
        expect(find.text('3 jogos encontrados'), findsOneWidget);
      },
    );

    testWidgets('platform: the by time, the from of the entries', (
      tester,
    ) async {
      await pumpData(tester);
      await tapAndSettle(tester, find.byTooltip('Filtrar por plataforma'));
      for (final p in ['Todas as plataformas', 'PC', 'PS5', 'Switch']) {
        expect(find.text(p), findsWidgets, reason: p);
      }
      await tapAndSettle(tester, find.text('PS5').last);
      expect(find.text('1 jogo encontrado'), findsOneWidget);
      await tapAndSettle(tester, statusMenu);
      expect(find.text('Concluído (0)'), findsOneWidget);
      expect(find.text('Jogando (1)'), findsOneWidget);
      await tester.tapAt(const Offset(2, 2));
      await tester.pumpAndSettle();

      await tapAndSettle(tester, find.byTooltip('Filtrar por plataforma'));
      await tapAndSettle(tester, find.text('Todas as plataformas'));
      expect(find.text('3 jogos encontrados'), findsOneWidget);
    });

    testWidgets('status and platform count for the same entry', (tester) async {
      // Hades: concluído no PC e jogando no PS5. "Jogando" + "PC" não o encontra.
      await pumpData(tester);
      await chooseStatus(tester, 'Jogando (1)');
      await tapAndSettle(tester, find.byTooltip('Filtrar por plataforma'));
      await tapAndSettle(tester, find.text('PC').last);
      expect(find.text('Nenhum jogo com esses filtros'), findsOneWidget);
      await tapAndSettle(tester, statusMenu);
      expect(
        find.text('Jogando (0)'),
        findsNWidgets(2),
        reason: 'o botão (filtro ativo) e a opção do menu',
      );
      await tester.tapAt(const Offset(2, 2));
      await tester.pumpAndSettle();
    });

    testWidgets('in the list, the filter partial shows "1 of 2 entries"', (
      tester,
    ) async {
      await AppHarness(library: FakeLibraryRepository(data)).pump(
        tester,
        size: const Size(400, 1400),
        prefs: {'library.grid': false},
      );
      expect(find.text('Vários status'), findsOneWidget);
      await chooseStatus(tester, 'Jogando (1)');
      expect(find.text('1 de 2 registros'), findsOneWidget);
      expect(find.text('Vários status'), findsNothing);
      expect(find.text('Jogando'), findsWidgets);
    });

    testWidgets(
      '"clear" and "clear filters" remove search, status and platform',
      (tester) async {
        await AppHarness(library: FakeLibraryRepository(data)).pump(
          tester,
          size: const Size(400, 1400),
          prefs: {'library.grid': false, 'library.sort': 'name'},
        );
        expect(find.text('Limpar'), findsNothing);
        await search(tester, 'zzz');
        await chooseStatus(tester, 'Concluído (0)');
        expect(find.text('Nenhum jogo com esses filtros'), findsOneWidget);

        await tapAndSettle(
          tester,
          find.widgetWithText(OutlinedButton, 'Limpar filtros'),
        );
        expect(find.text('3 jogos encontrados'), findsOneWidget);
        expect(find.text('Limpar'), findsNothing);
        expect(tester.widget<TextField>(searchField).controller!.text, isEmpty);
        expect(
          find.byType(GameListRow),
          findsNWidgets(3),
          reason: 'mantém a lista',
        );
      },
    );

    testWidgets('search and filters survive to the switches of tab', (
      tester,
    ) async {
      await pumpData(tester);
      await search(tester, 'celeste');
      await tapAndSettle(tester, find.text('Explorar').last);
      await tapAndSettle(tester, find.text('Biblioteca').last);
      expect(tester.widget<TextField>(searchField).controller!.text, 'celeste');
      expect(find.text('1 jogo encontrado'), findsOneWidget);
    });

    testWidgets('search and filters are discarded when leaving the account', (
      tester,
    ) async {
      await AppHarness(library: FakeLibraryRepository(data))
          .pump(tester, size: const Size(400, 1400));
      await search(tester, 'celeste');
      await tapAndSettle(tester, find.text('Perfil').last);
      await tapAndSettle(tester, find.byTooltip('Configurações'));
      await tapSignOut(tester);
      await tester.enterText(find.byType(TextFormField).first, 'ana');
      await tester.enterText(find.byType(TextFormField).last, 'senha');
      await tapAndSettle(tester, find.widgetWithText(FilledButton, 'Entrar'));
      // O login volta à rota lembrada (/settings); a Biblioteca é outra conta/sessão.
      await goTo(tester, '/library');
      expect(find.text('3 jogos encontrados'), findsOneWidget);
      expect(tester.widget<TextField>(searchField).controller!.text, isEmpty);
    });
  });

  group('currently playing', () {
    testWidgets('shows the games in progress and some with search or filter', (
      tester,
    ) async {
      await AppHarness(
        library: FakeLibraryRepository([
          fakeEntry(id: 'a', status: GameStatus.playing),
          fakeEntry(
            id: 'b',
            game: fakeGame(igdbId: 2, name: 'Celeste'),
            status: GameStatus.completed,
          ),
        ]),
      ).pump(tester, size: const Size(400, 1400));
      expect(find.text('Jogando agora'), findsOneWidget);
      expect(find.text('1 jogo · 2 registros'), findsNothing);
      expect(
        find.text('2 jogos · 2 registros · 1 jogo em andamento'),
        findsOneWidget,
      );

      await search(tester, 'cel');
      expect(find.text('Jogando agora'), findsNothing);
      await tapAndSettle(tester, find.byTooltip('Limpar busca'));
      expect(find.text('Jogando agora'), findsNothing);
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.pumpAndSettle();
      expect(find.text('Jogando agora'), findsOneWidget);

      await chooseStatus(tester, 'Concluído (1)');
      expect(find.text('Jogando agora'), findsNothing);
    });

    testWidgets(
      'some to the focus the search empty and returns to the lose the focus',
      (tester) async {
        await AppHarness(
          library: FakeLibraryRepository([
            fakeEntry(id: 'a', status: GameStatus.playing),
          ]),
        ).pump(tester, size: const Size(400, 1000));
        expect(find.text('Jogando agora'), findsOneWidget);

        await tester.tap(searchField);
        await tester.pumpAndSettle();
        expect(find.text('Jogando agora'), findsNothing);

        FocusManager.instance.primaryFocus?.unfocus();
        await tester.pumpAndSettle();
        expect(find.text('Jogando agora'), findsOneWidget);
      },
    );

    testWidgets(
      '"show all" filters by currently playing and preserves the shelf',
      (tester) async {
        await AppHarness(
          library: FakeLibraryRepository([
            fakeEntry(id: 'a', status: GameStatus.playing),
            fakeEntry(
              id: 'b',
              game: fakeGame(igdbId: 2, name: 'Celeste'),
              status: GameStatus.completed,
            ),
          ]),
        ).pump(tester, size: const Size(400, 1400));
        await tapAndSettle(tester, find.text('Ver todos'));
        expect(find.text('Jogando agora'), findsNothing);
        expect(find.text('1 jogo encontrado'), findsOneWidget);
        expect(statusButtonText('Jogando (1)'), findsOneWidget);
      },
    );

    testWidgets('at most 6 items identified', (tester) async {
      await AppHarness(
        library: FakeLibraryRepository([
          for (var i = 0; i < 9; i++)
            fakeEntry(
              id: 'e$i',
              game: fakeGame(igdbId: 10 + i, name: 'Jogo $i'),
              status: GameStatus.playing,
              createdAt: DateTime.utc(2026, 1, i + 1),
            ),
        ]),
      ).pump(tester, size: const Size(1400, 1000));
      expect(find.byType(GameShelfItem), findsNWidgets(6));
      expect(find.text('Jogo 8'), findsWidgets);
      expect(
        find.text('9 jogos · 9 registros · 9 jogos em andamento'),
        findsOneWidget,
      );
    });

    testWidgets('shows multiple platforms without arbitrarily choosing one', (
      tester,
    ) async {
      await AppHarness(
        library: FakeLibraryRepository([
          fakeEntry(id: 'a', status: GameStatus.playing, platform: 'PC'),
          fakeEntry(id: 'b', status: GameStatus.playing, platform: 'PS5'),
        ]),
      ).pump(tester, size: const Size(400, 1000));
      expect(find.text('2 plataformas'), findsOneWidget);
    });
  });

  group('composition (golden)', () {
    List<GameEntry> sample() => [
      fakeEntry(
        id: 'a',
        game: fakeGame(igdbId: 1, name: 'Hades'),
        status: GameStatus.playing,
        platform: 'PC',
        hours: 12,
        createdAt: DateTime.utc(2026, 3, 3),
      ),
      fakeEntry(
        id: 'b',
        game: fakeGame(igdbId: 1, name: 'Hades'),
        status: GameStatus.completed,
        platform: 'PC',
        hours: 30,
        rating: 9,
        createdAt: DateTime.utc(2026, 1, 3),
      ),
      fakeEntry(
        id: 'c',
        game: fakeGame(igdbId: 2, name: 'Celeste'),
        status: GameStatus.completed,
        platform: 'Switch',
        hours: 8,
        rating: 10,
        createdAt: DateTime.utc(2026, 2, 3),
      ),
      fakeEntry(
        id: 'd',
        game: fakeGame(
          igdbId: 3,
          name: 'The Legend of Zelda: Tears of the Kingdom — Edição Especial',
        ),
        status: GameStatus.playing,
        platform: 'Switch',
        createdAt: DateTime.utc(2026, 2, 20),
      ),
      fakeEntry(
        id: 'e',
        game: fakeGame(igdbId: 4, name: 'Doom'),
        status: GameStatus.backlog,
        platform: 'PC',
        createdAt: DateTime.utc(2026, 1, 20),
      ),
      fakeEntry(
        id: 'f',
        game: fakeGame(igdbId: 5, name: 'Hollow Knight'),
        status: GameStatus.dropped,
        platform: 'PC',
        createdAt: DateTime.utc(2026, 1, 10),
      ),
    ];

    for (final (name, size, grid) in [
      ('grid_390', const Size(390, 1000), true),
      ('list_390', const Size(390, 1000), false),
      ('grid_1280', const Size(1280, 900), true),
    ]) {
      testWidgets(name, skip: goldenSkip, (tester) async {
        await AppHarness(library: FakeLibraryRepository(sample())).pump(
          tester,
          size: size,
          prefs: {'library.grid': grid},
          fontFamily: goldenFontFamily,
        );
        await expectLater(
          find.byType(MaterialApp),
          matchesGoldenFile('goldens/library_$name.png'),
        );
      });
    }
  });

  group('display', () {
    for (final width in [360.0, 390.0, 600.0, 840.0, 1280.0, 1440.0]) {
      testWidgets('layout without overflow in ${width.toInt()} dp', (
        tester,
      ) async {
        await AppHarness(
          library: FakeLibraryRepository([
            for (var i = 0; i < 6; i++)
              fakeEntry(
                id: 'e$i',
                game: fakeGame(
                  igdbId: 10 + i,
                  name: i == 0
                      ? 'The Legend of Zelda: Tears of the Kingdom — Edição Especial'
                      : 'Jogo $i',
                ),
                status: GameStatus.values[i % GameStatus.values.length],
                platform: 'PlayStation 5 Edição Digital',
              ),
          ]),
        ).pump(tester, size: Size(width, 1000), textScale: 1.5);
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('grid: two columns in 360 dp', (tester) async {
      await AppHarness(
        library: FakeLibraryRepository([
          for (var i = 0; i < 4; i++)
            fakeEntry(
              id: 'e$i',
              game: fakeGame(igdbId: 10 + i, name: 'Jogo $i'),
              status: GameStatus.completed,
            ),
        ]),
      ).pump(tester, size: const Size(360, 1200));
      final lefts = {
        for (final e in find.byType(GameCard).evaluate())
          tester.getTopLeft(find.byWidget(e.widget)).dx.round(),
      };
      expect(lefts, hasLength(2));
    });

    testWidgets(
      'with text at 200% text, the list adapts without changing the preference',
      (tester) async {
        final h = AppHarness(library: FakeLibraryRepository([fakeEntry()]));
        await h.pump(
          tester,
          size: const Size(360, 800),
          textScale: 2.0,
          prefs: {'library.grid': true},
        );
        await tester.scrollUntilVisible(
          find.byType(GameListRow),
          300,
          scrollable: find.byType(Scrollable).first,
        );
        expect(find.byType(GameListRow), findsWidgets);
        expect(
          find.byTooltip('Mostrar como lista'),
          findsOneWidget,
          reason: 'a preferência salva continua sendo grade',
        );
      },
    );

    testWidgets('sorts by name A–Z and by hours', (tester) async {
      await AppHarness(
        library: FakeLibraryRepository([
          fakeEntry(
            id: 'a',
            game: fakeGame(igdbId: 1, name: 'Zeta'),
            hours: 50,
          ),
          fakeEntry(
            id: 'b',
            game: fakeGame(igdbId: 2, name: 'Alfa'),
            hours: 5,
          ),
          fakeEntry(
            id: 'c',
            game: fakeGame(igdbId: 3, name: 'Beta'),
          ),
        ]),
      ).pump(tester, prefs: {'library.grid': false, 'library.sort': 'name'});

      List<String> titles() => [
        for (final row in tester.widgetList<GameListRow>(
          find.byType(GameListRow),
        ))
          row.title,
      ];
      expect(titles(), ['Alfa', 'Beta', 'Zeta']);

      await tapAndSettle(tester, find.byTooltip('Ordenar por Nome A–Z'));
      await tapAndSettle(tester, find.text('Mais horas registradas').last);
      expect(titles(), [
        'Zeta',
        'Alfa',
        'Beta',
      ], reason: 'sem horas por último');
    });
  });

  testWidgets('list/grid and sorting persist across app launches', (
    tester,
  ) async {
    final library = FakeLibraryRepository([
      fakeEntry(id: 'a', hours: 5, createdAt: DateTime.utc(2026, 1, 1)),
      fakeEntry(
        id: 'b',
        game: fakeGame(igdbId: 2, name: 'Segundo'),
        hours: 50,
        createdAt: DateTime.utc(2026, 2, 1),
      ),
    ]);
    await AppHarness(library: library).pump(
      tester,
      prefs: {'library.grid': false, 'library.sort': 'most_played'},
    );
    expect(find.byType(GameListRow), findsNWidgets(2));
    expect(
      tester.widget<GameListRow>(find.byType(GameListRow).first).title,
      'Segundo',
    );
  });

  testWidgets('switching grid/list saves the preference', (tester) async {
    await AppHarness(library: FakeLibraryRepository([fakeEntry()]))
        .pump(tester);
    expect(find.byType(GameListRow), findsNothing);
    await tapAndSettle(tester, find.byTooltip('Mostrar como lista'));
    expect(find.byType(GameListRow), findsOneWidget);
    expect(
      tester
          .widget<SegmentedButton<bool>>(find.byType(SegmentedButton<bool>))
          .selected,
      {false},
    );
  });

  testWidgets(
    'opening and returning from detail preserves the Library position',
    (tester) async {
      await AppHarness(
        library: FakeLibraryRepository([
          for (var i = 0; i < 30; i++)
            fakeEntry(
              id: 'e$i',
              game: fakeGame(igdbId: 100 + i, name: 'Jogo $i'),
            ),
        ]),
      ).pump(tester, size: const Size(400, 800));
      final scroll = tester.widget<CustomScrollView>(
        find.byType(CustomScrollView),
      );
      final target = find.byWidgetPredicate(
        (widget) => widget is GameCard && widget.title == 'Jogo 20',
      );
      await tester.scrollUntilVisible(
        target,
        600,
        scrollable: verticalScroll.first,
      );
      final before = scroll.controller!.offset;
      expect(before, greaterThan(0));

      await openLibraryGame(tester, 'Jogo 20');
      await tapAndSettle(tester, find.byType(BackButton));
      expect(scroll.controller!.offset, closeTo(before, 1));
    },
  );

  testWidgets('the new session starts the Library in the top', (tester) async {
    final h = AppHarness(
      library: FakeLibraryRepository([
        for (var i = 0; i < 30; i++)
          fakeEntry(
            id: 'e$i',
            game: fakeGame(igdbId: 100 + i, name: 'Jogo $i'),
          ),
      ]),
    );
    await h.pump(tester, size: const Size(400, 800));
    await tester.scrollUntilVisible(
      find.byWidgetPredicate(
        (widget) => widget is GameCard && widget.title == 'Jogo 20',
      ),
      600,
      scrollable: verticalScroll.first,
    );
    expect(
      tester
          .widget<CustomScrollView>(find.byType(CustomScrollView))
          .controller!
          .offset,
      greaterThan(0),
    );

    await tapAndSettle(tester, find.text('Perfil').last);
    await tapAndSettle(tester, find.byTooltip('Configurações'));
    await tapSignOut(tester);
    await tester.enterText(find.byType(TextFormField).first, 'ana');
    await tester.enterText(find.byType(TextFormField).last, 'senha');
    await tapAndSettle(tester, find.widgetWithText(FilledButton, 'Entrar'));
    await goTo(tester, '/library');

    expect(
      tester
          .widget<CustomScrollView>(find.byType(CustomScrollView))
          .controller!
          .offset,
      0,
    );
  });

  testWidgets(
    'change status of one entry (page of the game) sends only that change',
    (tester) async {
      final library = FakeLibraryRepository([
        fakeEntry(id: 'a', status: GameStatus.backlog, hours: 3),
      ]);
      await AppHarness(library: library).pump(tester);

      await openMenu(tester, 0, 'Alterar status');
      await tapAndSettle(tester, find.widgetWithText(ListTile, 'Concluído'));

      expect(library.updated.single.$1, 'a');
      expect(library.updated.single.$2.status, GameStatus.completed);
      expect(
        library.updated.single.$2.hoursPlayed,
        3,
        reason: 'o resto do registro é preservado',
      );
      await tapAndSettle(tester, find.byType(BackButton));
      expect(find.text('1 jogo · 1 registro'), findsOneWidget);
      expect(find.text('Jogando agora'), findsNothing);
    },
  );

  testWidgets(
    'change the replay does not moves in the other entries of the game',
    (tester) async {
      final library = FakeLibraryRepository([
        fakeEntry(
          id: 'a',
          status: GameStatus.completed,
          createdAt: DateTime.utc(2026, 3, 1),
        ),
        fakeEntry(
          id: 'b',
          status: GameStatus.backlog,
          createdAt: DateTime.utc(2026, 1, 1),
        ),
      ]);
      await AppHarness(library: library).pump(tester);
      // O primeiro card da página do jogo é o registro mais novo ('a').
      await openMenu(tester, 0, 'Alterar status');
      await tapAndSettle(tester, find.widgetWithText(ListTile, 'Abandonado'));
      expect(library.updated, hasLength(1), reason: 'só um registro é enviado');
      expect(library.updated.single.$1, 'a');
      expect(library.updated.single.$2.status, GameStatus.dropped);
    },
  );

  testWidgets(
    'removes asks for confirmation and removes only the chosen entry',
    (tester) async {
      final library = FakeLibraryRepository([
        fakeEntry(id: 'a'),
        fakeEntry(id: 'b'),
      ]);
      await AppHarness(library: library).pump(tester);

      await openMenu(tester, 0, 'Remover');
      expect(find.text('Remover registro?'), findsOneWidget);
      // Identifica o jogo e o registro, não só "um registro".
      expect(find.textContaining('Jogo Fixture Um'), findsWidgets);
      // A data é a do aparelho (o registro guarda um instante).
      final created = DateOnly.fromLocal(DateTime.utc(2026, 1, 1).toLocal());
      expect(
        find.textContaining('PC · Na fila · criado em ${created.format()}'),
        findsOneWidget,
      );
      await tapAndSettle(tester, find.widgetWithText(TextButton, 'Cancelar'));
      expect(library.deleted, isEmpty);

      await tapAndSettle(tester, find.byType(EntryMenuButton).at(0));
      await tapAndSettle(tester, find.text('Remover').last);
      await tapAndSettle(tester, find.widgetWithText(FilledButton, 'Remover'));
      expect(library.deleted.length, 1);
      await tapAndSettle(tester, find.byType(BackButton));
      expect(
        find.text('1 jogo · 1 registro'),
        findsOneWidget,
        reason: 'o outro playthrough continua',
      );
    },
  );

  testWidgets('fails to the removes keeps the entry and warns', (tester) async {
    final library = FakeLibraryRepository([fakeEntry(id: 'a')])
      ..mutationError = const NetworkException();
    await AppHarness(library: library).pump(tester);
    await openMenu(tester, 0, 'Remover');
    await tapAndSettle(tester, find.widgetWithText(FilledButton, 'Remover'));
    expect(find.textContaining('Sem conexão'), findsOneWidget);
    await tapAndSettle(tester, find.byType(BackButton));
    expect(find.text('1 jogo · 1 registro'), findsOneWidget);
  });

  testWidgets(
    'many entries the 360 px and text 200% does not overflow the layout',
    (tester) async {
      final entries = [
        for (var i = 0; i < 12; i++)
          fakeEntry(
            id: 'e$i',
            game: fakeGame(
              igdbId: i,
              name: 'Um jogo com nome extremamente comprido número $i',
            ),
            status: GameStatus.values[i % 4],
            platform: 'PlayStation 5',
          ),
      ];
      await AppHarness(library: FakeLibraryRepository(entries))
          .pump(tester, size: const Size(360, 800), textScale: 2.0);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('drag for update retries the query', (tester) async {
    final library = FakeLibraryRepository([fakeEntry()]);
    await AppHarness(library: library).pump(tester);
    expect(library.listCalls, 1);
    await tester.fling(
      find.byType(Scrollable).last,
      const Offset(0, 400),
      1000,
    );
    await tester.pumpAndSettle();
    expect(library.listCalls, 2);
  });

  testWidgets('update failure keeps the list and warns that it is stale', (
    tester,
  ) async {
    final library = FakeLibraryRepository([fakeEntry()]);
    await AppHarness(library: library).pump(tester);

    library.listError = const NetworkException();
    await tester.fling(
      find.byType(Scrollable).last,
      const Offset(0, 400),
      1000,
    );
    await tester.pumpAndSettle();

    expect(
      find.text('Jogo Fixture Um'),
      findsWidgets,
      reason: 'a lista continua na tela',
    );
    expect(find.textContaining('Mostrando os dados salvos'), findsOneWidget);
    expect(find.text('Sua biblioteca começa com um jogo'), findsNothing);

    library.listError = null;
    await tapAndSettle(tester, find.text('Tentar de novo'));
    expect(find.textContaining('Mostrando os dados salvos'), findsNothing);
    expect(find.text('Jogo Fixture Um'), findsWidgets);
  });

  testWidgets(
    'the collection does not appear from another account after logout',
    (tester) async {
      final h = AppHarness(library: FakeLibraryRepository([fakeEntry()]));
      await h.pump(tester);
      expect(find.text('Jogo Fixture Um'), findsWidgets);
      await tapAndSettle(tester, find.text('Perfil').last);
      await tapAndSettle(tester, find.byTooltip('Configurações'));
      await tapSignOut(tester);
      expect(find.text('Jogo Fixture Um'), findsNothing);
      expect(find.text('Entrar'), findsWidgets);
    },
  );

  testWidgets('returning from detail restores the scroll position', (
    tester,
  ) async {
    final h = AppHarness(
      library: FakeLibraryRepository([
        for (var i = 0; i < 60; i++)
          fakeEntry(
            id: 'e$i',
            game: fakeGame(igdbId: 910000 + i, name: 'Jogo Volume $i'),
          ),
      ]),
    );
    await h.pump(tester, size: const Size(400, 800));
    await tester.drag(verticalScroll.first, const Offset(0, -2500));
    await tester.pumpAndSettle();
    final before = tester
        .state<ScrollableState>(verticalScroll.first)
        .position
        .pixels;
    expect(before, greaterThan(1000));

    // Abre um jogo visível e volta.
    final visible = find.byType(GameCard).hitTestable();
    await tester.tap(visible.first);
    await tester.pumpAndSettle();
    expect(location(tester), startsWith('/games/'));
    await tapAndSettle(tester, find.byType(BackButton));

    final after = tester
        .state<ScrollableState>(verticalScroll.first)
        .position
        .pixels;
    expect(after, before);
  });
}
