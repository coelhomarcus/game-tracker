import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/design_system/game_list_row.dart';
import 'package:gametracker/core/design_system/game_status.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import 'support/fake_repos.dart';
import 'support/harness.dart';

AppHarness signedIn() => AppHarness(
  library: FakeLibraryRepository([
    fakeEntry(id: 'e1', status: GameStatus.completed, hours: 20, rating: 8),
    fakeEntry(id: 'e2', status: GameStatus.backlog),
    fakeEntry(
      id: 'e3',
      game: fakeGame(
        igdbId: 900002,
        name: 'Jogo Fixture Dois com um nome bem comprido para testar quebra',
      ),
      platform: 'PlayStation 5',
      status: GameStatus.playing,
      hours: 0,
    ),
  ]),
);

void main() {
  testWidgets('without the session, the app opens in the login', (
    tester,
  ) async {
    await AppHarness(signedIn: false).pump(tester, size: const Size(360, 800));
    expect(find.text('GameTracker'), findsOneWidget);
    expect(find.text('Entrar'), findsWidgets);
  });

  for (final w in [360.0, 599.0]) {
    testWidgets('width $w uses NavigationBar', (tester) async {
      await signedIn().pump(tester, size: Size(w, 800));
      expect(find.byType(NavigationBar), findsOneWidget);
      expect(find.byType(NavigationRail), findsNothing);
    });
  }

  for (final w in [600.0, 840.0, 1280.0]) {
    testWidgets('width $w uses NavigationRail with the same 5 destinations', (
      tester,
    ) async {
      await signedIn().pump(tester, size: Size(w, 800));
      expect(find.byType(NavigationRail), findsOneWidget);
      expect(find.byType(NavigationBar), findsNothing);
      for (final label in [
        'Biblioteca',
        'Explorar',
        'Comunidade',
        'Mensagens',
        'Perfil',
      ]) {
        expect(find.text(label), findsWidgets, reason: label);
      }
    });
  }

  testWidgets(
    'navigates between destinations and preserves the filter from the Library',
    (tester) async {
      await signedIn().pump(tester, size: const Size(400, 800));
      await chooseStatus(tester, 'Jogando (1)');
      expect(find.textContaining('Jogo Fixture Dois'), findsWidgets);
      expect(find.text('Jogo Fixture Um'), findsNothing);

      await tapAndSettle(tester, find.text('Mensagens').last);
      expect(find.text('beto'), findsOneWidget);

      await tapAndSettle(tester, find.text('Biblioteca').last);
      expect(
        find.text('Jogo Fixture Um'),
        findsNothing,
        reason: 'estado do destino preservado',
      );
    },
  );

  testWidgets('unknown route shows the useful exit state', (tester) async {
    await signedIn().pump(tester, size: const Size(400, 800));
    tester.element(find.byType(NavigationBar)).go('/nada');
    await tester.pumpAndSettle();
    expect(find.text('Página não encontrada.'), findsOneWidget);
  });

  testWidgets('text the 200% does not generate overflow in the Library', (
    tester,
  ) async {
    await signedIn().pump(tester, size: const Size(360, 800), textScale: 2.0);
    expect(tester.takeException(), isNull);
    // A 200% a lista assume (a grade de capas deixa de ser legível) e começa abaixo do resumo,
    // da prateleira e dos filtros.
    await tester.scrollUntilVisible(
      find.text('Jogo Fixture Um'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.byType(GameListRow), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  group('rail in the pages of detail', () {
    for (final path in [
      '/games/900001',
      '/games/900001/playthroughs/new',
      '/users/u-beto',
      '/settings',
      '/notifications',
    ]) {
      testWidgets('$path keeps the rail the 1280 and does not duplicates', (
        tester,
      ) async {
        await signedIn().pump(tester, size: const Size(1280, 900));
        await goTo(tester, path);
        expect(find.byType(NavigationRail), findsOneWidget);
        expect(tester.takeException(), isNull);
      });

      testWidgets('$path does not show rail or slash the 400', (tester) async {
        await signedIn().pump(tester, size: const Size(400, 900));
        await goTo(tester, path);
        expect(find.byType(NavigationRail), findsNothing);
        expect(find.byType(NavigationBar), findsNothing);
      });
    }

    testWidgets('the rail opens destination chosen the from of the detail', (
      tester,
    ) async {
      await signedIn().pump(tester, size: const Size(1280, 900));
      await goTo(tester, '/games/900001');
      await tapAndSettle(
        tester,
        find.descendant(
          of: find.byType(NavigationRail),
          matching: find.text('Explorar'),
        ),
      );
      final context = tester.element(find.byType(NavigationRail));
      expect(GoRouter.of(context).state.uri.path, '/explore');
      expect(find.byType(NavigationRail), findsOneWidget);
    });

    testWidgets(
      'return of the detail returns the destination with the filter intact',
      (tester) async {
        await signedIn().pump(tester, size: const Size(1280, 900));
        await chooseStatus(tester, 'Jogando (1)');
        await openLibraryGame(
          tester,
          'Jogo Fixture Dois com um nome bem comprido para testar quebra',
        );
        expect(find.byType(NavigationRail), findsOneWidget);
        await tapAndSettle(tester, find.byType(BackButton));
        expect(find.text('Jogo Fixture Um'), findsNothing);
        expect(find.byType(NavigationRail), findsOneWidget);
      },
    );

    testWidgets('resize in the detail does not loses the page open', (
      tester,
    ) async {
      await signedIn().pump(tester, size: const Size(1280, 900));
      await goTo(tester, '/games/900001?tab=progress');
      tester.view.physicalSize = const Size(400, 900);
      await tester.pumpAndSettle();
      expect(find.byType(NavigationRail), findsNothing);
      expect(find.widgetWithText(Tab, 'Meu progresso'), findsOneWidget);
      tester.view.physicalSize = const Size(1280, 900);
      await tester.pumpAndSettle();
      expect(find.byType(NavigationRail), findsOneWidget);
    });
  });

  testWidgets('destination titles start at the same content margin', (
    tester,
  ) async {
    await signedIn().pump(tester, size: const Size(1280, 900));
    double titleLeft(String label) => tester
        .getTopLeft(
          find.descendant(of: find.byType(AppBar), matching: find.text(label)),
        )
        .dx;
    // Biblioteca e Perfil usam a mesma coluna larga; o título não pode ficar mais perto do rail.
    final library = titleLeft('Biblioteca');
    await tapAndSettle(
      tester,
      find.descendant(
        of: find.byType(NavigationRail),
        matching: find.text('Perfil'),
      ),
    );
    expect(titleLeft('Perfil'), library);
  });
}
