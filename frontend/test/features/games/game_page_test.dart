import 'package:flutter/painting.dart' show Offset, Size;
import 'package:flutter/rendering.dart' show RenderBox;
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart'
    show Chip, Scrollable, SegmentedButton;
import 'package:gametracker/core/design_system/game_status.dart';
import 'package:gametracker/core/network/app_exception.dart';
import 'package:gametracker/core/models/user_summary.dart';
import 'package:gametracker/features/games/data/game_models.dart';

import '../../support/fake_repos.dart';
import '../../support/harness.dart';

AppHarness harness({
  FakeGamesRepository? games,
  FakeLibraryRepository? library,
}) => AppHarness(
  games: games,
  library:
      library ??
      FakeLibraryRepository([
        fakeEntry(
          id: 'a',
          status: GameStatus.completed,
          hours: 20,
          rating: 8,
          platform: 'PC',
        ),
        fakeEntry(
          id: 'b',
          status: GameStatus.backlog,
          platform: 'PlayStation 5',
        ),
      ]),
);

Future<void> openGame(
  WidgetTester tester,
  AppHarness h, {
  int igdbId = 900001,
}) async {
  await h.pump(tester);
  await goTo(tester, '/games/$igdbId');
}

void main() {
  testWidgets('opens through the igdbId of the route and shows the game', (
    tester,
  ) async {
    await openGame(tester, harness());
    expect(find.text('Jogo Fixture Um'), findsWidgets);
    expect(find.text('Sinopse de teste.'), findsOneWidget);
    expect(find.text('PC · PlayStation 5'), findsOneWidget);
    expect(
      find.text('RPG'),
      findsWidgets,
      reason: 'no cabeçalho e nos gêneros de Sobre',
    );
  });

  testWidgets('game without summary or screenshots does not crash', (
    tester,
  ) async {
    final games = FakeGamesRepository(
      games: {
        900002: const Game(
          id: 'g2',
          igdbId: 900002,
          name: 'Sem Dados',
          screenshots: [],
          platforms: [],
          genres: [],
        ),
      },
    );
    await openGame(tester, harness(games: games), igdbId: 900002);
    expect(find.text('Este jogo ainda não tem sinopse.'), findsOneWidget);
    expect(find.text('Screenshots'), findsNothing);
  });

  testWidgets('game missing shows error with exit', (tester) async {
    final games = FakeGamesRepository()
      ..gameError = const ApiException(404, 'not_found', 'Jogo não encontrado');
    await openGame(tester, harness(games: games));
    expect(find.text('Não encontrado.'), findsOneWidget);
    expect(find.text('Tentar de novo'), findsOneWidget);
  });

  testWidgets(
    'favorite changes the icon immediately; failure reverts it and warns',
    (tester) async {
      final games = FakeGamesRepository();
      final h = harness(games: games);
      await openGame(tester, h);

      await tapAndSettle(tester, find.byTooltip('Favoritar'));
      expect(find.byTooltip('Remover dos favoritos'), findsOneWidget);
      expect(games.favoriteCalls.single, ('g-900001', true));

      games.favoriteError = const NetworkException();
      await tapAndSettle(tester, find.byTooltip('Remover dos favoritos'));
      expect(
        find.byTooltip('Remover dos favoritos'),
        findsOneWidget,
        reason: 'desfez para o estado anterior',
      );
      expect(find.textContaining('Sem conexão'), findsOneWidget);
    },
  );

  testWidgets('my progress lists the two playthroughs with hours and notes', (
    tester,
  ) async {
    await openGame(tester, harness());
    await tapAndSettle(tester, find.text('Meu progresso'));
    expect(find.text('PC'), findsWidgets);
    expect(find.text('PlayStation 5'), findsWidgets);
    expect(find.text('20,0 h'), findsOneWidget, reason: 'vírgula decimal');
    expect(find.text('Nota 8/10'), findsOneWidget);
    expect(find.text('Novo registro (replay)'), findsOneWidget);
  });

  testWidgets('without entries: invites the create the first', (tester) async {
    await openGame(tester, harness(library: FakeLibraryRepository()));
    await tapAndSettle(tester, find.text('Meu progresso'));
    expect(find.text('Você ainda não registrou este jogo'), findsOneWidget);
    expect(find.text('Novo registro'), findsWidgets);
  });

  testWidgets('community: playthrough and player statistics', (tester) async {
    final games = FakeGamesRepository()
      ..playersResult = [
        const GamePlayer(
          user: UserSummary(id: 'u9', username: 'beto', name: 'Beto'),
          status: GameStatus.playing,
          hoursPlayed: 3.5,
        ),
      ];
    await openGame(tester, harness(games: games));
    await tapAndSettle(tester, find.text('Comunidade'));
    expect(find.text('2 jogando'), findsOneWidget);
    expect(find.text('3 concluído'), findsOneWidget);
    expect(find.textContaining('registros, não pessoas'), findsOneWidget);
    expect(find.text('Beto'), findsOneWidget);
    expect(find.text('3,5 h'), findsOneWidget);
  });

  for (final (name, width, scale) in [
    ('360 px', 360.0, 1.0),
    ('360 px com texto 150%', 360.0, 1.5),
    ('320 px com texto 200%', 320.0, 2.0),
  ]) {
    testWidgets(
      'community: the counters break of line without cover the that comes after ($name)',
      (tester) async {
        final games = FakeGamesRepository()
          ..playersResult = [
            const GamePlayer(
              user: UserSummary(id: 'u9', username: 'beto', name: 'Beto'),
              status: GameStatus.playing,
              hoursPlayed: 3.5,
            ),
          ];
        final h = harness(games: games);
        await h.pump(tester, size: Size(width, 900), textScale: scale);
        await goTo(tester, '/games/900001');
        // Com texto muito grande o cabeçalho ocupa a primeira tela: rola até as abas.
        await tester.scrollUntilVisible(
          find.text('Comunidade'),
          150,
          scrollable: find.byType(Scrollable).first,
        );
        await tapAndSettle(tester, find.text('Comunidade'));
        expect(tester.takeException(), isNull);
        // A página é uma rolagem só e preguiçosa: com texto grande o cabeçalho ocupa a primeira
        // tela, e as estatísticas só são construídas depois de rolar até elas.
        final page = find.byType(Scrollable).first;
        final stats = find.textContaining('registros, não pessoas');
        for (var i = 0; i < 20 && stats.evaluate().isEmpty; i++) {
          await tester.drag(page, const Offset(0, -150));
          await tester.pump();
        }

        final chips = tester.widgetList<Chip>(find.byType(Chip)).length;
        expect(chips, GameStatus.values.length);
        var lastChipBottom = 0.0;
        for (final chip in find.byType(Chip).evaluate()) {
          final box = chip.renderObject! as RenderBox;
          final bottom = box.localToGlobal(Offset.zero).dy + box.size.height;
          if (bottom > lastChipBottom) lastChipBottom = bottom;
        }
        final noteFinder = find.textContaining('registros, não pessoas');
        final note = tester.getTopLeft(noteFinder);
        expect(
          note.dy,
          greaterThanOrEqualTo(lastChipBottom),
          reason: 'o aviso "conta registros" não pode ficar por cima dos contadores',
        );

        // A lista é preguiçosa: rola até o seletor ser construído e mede os dois no mesmo estado.
        final scope = find.byType(SegmentedButton<PlayersScope>);
        // A página é uma rolagem só (cabeçalho, abas e conteúdo).
        final list = find.byType(Scrollable).first;
        for (var i = 0; i < 20 && scope.evaluate().isEmpty; i++) {
          await tester.drag(list, const Offset(0, -200));
          await tester.pump();
        }
        expect(scope, findsOneWidget);
        expect(noteFinder, findsOneWidget);
        final noteBottom =
            tester.getTopLeft(noteFinder).dy +
            tester.getSize(noteFinder).height;
        expect(
          tester.getTopLeft(scope).dy,
          greaterThanOrEqualTo(noteBottom),
          reason: 'os botões Todos / Quem eu sigo não podem ficar por baixo do aviso',
        );
      },
    );
  }

  testWidgets('community: nobody followed playing shows message own', (
    tester,
  ) async {
    await openGame(tester, harness());
    await tapAndSettle(tester, find.text('Comunidade'));
    expect(find.text('Ninguém está jogando agora.'), findsOneWidget);
    await tapAndSettle(tester, find.text('Quem eu sigo'));
    expect(find.text('Ninguém que você segue está jogando.'), findsOneWidget);
  });

  testWidgets('community: statistics failure does not crash the other tabs', (
    tester,
  ) async {
    final games = FakeGamesRepository();
    final h = harness(games: games);
    await openGame(tester, h);
    // A aba Sobre e Meu progresso continuam funcionando sem depender das estatísticas.
    await tapAndSettle(tester, find.text('Meu progresso'));
    expect(find.text('20,0 h'), findsOneWidget);
    await tapAndSettle(tester, find.text('Sobre'));
    expect(find.text('Sinopse de teste.'), findsOneWidget);
  });

  testWidgets('screenshots open in the image tapped, navigate and close', (
    tester,
  ) async {
    final games = FakeGamesRepository(
      games: {
        900001: const Game(
          id: 'g-900001',
          igdbId: 900001,
          name: 'Jogo Fixture Um',
          screenshots: [
            'http://localhost:3100/api/images/cover?url=a',
            'http://localhost:3100/api/images/cover?url=b',
            'http://localhost:3100/api/images/cover?url=c',
          ],
          platforms: ['PC'],
          genres: [],
        ),
      },
    );
    final semantics = tester.ensureSemantics();
    await openGame(tester, harness(games: games));
    await tapAndSettle(
      tester,
      find.bySemanticsLabel('Abrir screenshot 2 de 3'),
    );
    expect(
      find.text('2 de 3'),
      findsOneWidget,
      reason: 'abre na imagem tocada, não na primeira',
    );

    await tapAndSettle(tester, find.byTooltip('Próxima imagem'));
    expect(find.text('3 de 3'), findsOneWidget);
    expect(
      find.byTooltip('Próxima imagem'),
      findsNothing,
      reason: 'fim da galeria',
    );

    await tapAndSettle(tester, find.byTooltip('Fechar'));
    expect(find.text('3 de 3'), findsNothing);
    expect(find.text('Sinopse'), findsOneWidget);
    semantics.dispose();
  });
}
