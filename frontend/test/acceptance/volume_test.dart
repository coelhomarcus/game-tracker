// Volume de dados na interface (plano 8.1): 500 registros e 1000 mensagens. Garante que as listas
// são preguiçosas (só constroem o que aparece), chegam ao fim e não repetem nem travam.
// Os tempos só são impressos; o teto é largo (pega travamento). Tempo de parede em suíte paralela é instável.
import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/design_system/game_card.dart';
import 'package:gametracker/core/design_system/game_status.dart';
import 'package:gametracker/features/library/application/library_groups.dart';
import 'package:material_ui/material_ui.dart'
    show AxisDirection, PageStorageKey, Scrollable, Size, TextField;

import '../support/fake_chat.dart';
import '../support/fake_repos.dart';
import '../support/harness.dart';

final _vertical = find.byWidgetPredicate(
  (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
);

void main() {
  testWidgets(
    'library with 1000 entries (800 games, with replays): lazy, scrolls to the end',
    (tester) async {
      // 800 jogos; os 200 primeiros têm um replay: 1000 registros.
      final entries = [
        for (var i = 0; i < 1000; i++)
          () {
            final game = i < 800 ? i : i - 800;
            return fakeEntry(
              id: 'e$i',
              game: fakeGame(
                igdbId: 1000 + game,
                name: 'Jogo ${game.toString().padLeft(3, '0')}',
              ),
              status: GameStatus.values[i % GameStatus.values.length],
              platform: i.isEven ? 'PC' : 'PlayStation 5',
              hours: i / 2,
              rating: 1 + i % 10,
              // Quanto maior o número do jogo, mais antigo: o último da lista é o "Jogo 799".
              createdAt: DateTime.utc(2026)
                  .add(Duration(minutes: 5000 - game * 2 - (i >= 800 ? 1 : 0))),
            );
          }(),
      ];

      final overviewWatch = Stopwatch()..start();
      final overview = buildLibraryOverview(entries);
      overviewWatch.stop();
      expect(overview.summary.games, 800);
      expect(overview.summary.records, 1000);
      expect(overview.groups.where((g) => g.hasReplays), hasLength(200));
      expect(
        overviewWatch.elapsedMilliseconds,
        lessThan(2000),
        reason: 'projeção de 1000 registros',
      );

      final h = AppHarness(library: FakeLibraryRepository(entries));
      final openWatch = Stopwatch()..start();
      await h.pump(tester, size: const Size(400, 800));
      openWatch.stop();

      expect(
        find.byType(GameCard).evaluate().length,
        lessThan(60),
        reason: 'a grade precisa ser preguiçosa',
      );

      final scrollWatch = Stopwatch()..start();
      final libraryScroll = find.descendant(
        of: find.byKey(const PageStorageKey<String>('library-scroll-u1')),
        matching: _vertical,
      );
      final lastGridCard = find.byWidgetPredicate(
        (widget) => widget is GameCard && widget.title == 'Jogo 799',
      );
      expect(libraryScroll, findsOneWidget);
      await tester.scrollUntilVisible(
        lastGridCard,
        4000,
        scrollable: libraryScroll,
        maxScrolls: 400,
      );
      scrollWatch.stop();
      await tester.pumpAndSettle();

      // ignore: avoid_print
      print(
        'projeção 1000: ${overviewWatch.elapsedMilliseconds} ms · abrir: ${openWatch.elapsedMilliseconds} ms · rolar até o fim: ${scrollWatch.elapsedMilliseconds} ms',
      );
      expect(lastGridCard, findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'library with 1000 entries: search and filter responds without rebuild everything',
    (tester) async {
      final entries = [
        for (var i = 0; i < 1000; i++)
          fakeEntry(
            id: 'e$i',
            game: fakeGame(
              igdbId: 1000 + i,
              name: i == 777 ? 'Pokémon Ônix' : 'Jogo $i',
            ),
            status: GameStatus.values[i % GameStatus.values.length],
          ),
      ];
      await AppHarness(library: FakeLibraryRepository(entries))
          .pump(tester, size: const Size(400, 800));
      await tester.enterText(
        find.widgetWithText(TextField, 'Buscar na biblioteca'),
        'pokemon onix',
      );
      await tester.pumpAndSettle();
      expect(find.text('1 jogo encontrado'), findsOneWidget);
      expect(find.byType(GameCard).evaluate().length, lessThan(5));
    },
  );

  testWidgets(
    'conversation with 1000 messages: loads pages to the beginning, without repeat',
    (tester) async {
      final h = AppHarness();
      h.chat.pageSize = 50;
      h.chat.history[convId] = [
        for (var i = 0; i < 1000; i++)
          serverMessage(
            'm${i.toString().padLeft(4, '0')}',
            text: 'mensagem $i',
            minute: i,
            mine: i.isEven,
          ),
      ];
      await h.pump(tester, size: const Size(400, 800));
      await goTo(tester, '/messages/$convId');

      final scrollWatch = Stopwatch()..start();
      var rounds = 0;
      while (find.text('mensagem 0').evaluate().isEmpty && rounds < 120) {
        await tester.fling(
          find.byType(Scrollable).first,
          const Offset(0, 2500),
          6000,
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        rounds++;
      }
      scrollWatch.stop();
      await tester.pumpAndSettle();

      // ignore: avoid_print
      print(
        'subir 1000 mensagens: ${scrollWatch.elapsedMilliseconds} ms em $rounds gestos, ${h.chat.messageCalls.length} páginas buscadas',
      );
      expect(
        find.text('mensagem 0'),
        findsOneWidget,
        reason: 'a primeira mensagem precisa ser alcançável',
      );
      // 20 páginas de 50; a primeira é buscada duas vezes de propósito (carga inicial e a
      // sincronização feita ao entrar na sala). Nenhuma outra página repete.
      final cursors = h.chat.messageCalls.map((c) => c.$2).toList();
      expect(cursors.length, 21);
      expect(cursors.where((c) => c == null).length, 2);
      final later = cursors.whereType<String>().toList();
      expect(
        later.toSet().length,
        later.length,
        reason: 'mesma página buscada duas vezes',
      );
      expect(tester.takeException(), isNull);
    },
  );
}
