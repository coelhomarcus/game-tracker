// Etapa 03 do redesign: navegação, cabeçalhos, ação principal e retorno de subtelas.
import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/design_system/game_status.dart';
import 'package:gametracker/features/notifications/presentation/notifications_bell.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import 'support/fake_auth.dart';
import 'support/fake_chat.dart';
import 'support/fake_feed.dart';
import 'support/fake_profiles.dart';
import 'support/fake_repos.dart';
import 'support/harness.dart';

AppHarness harness() {
  final me = fakeUser();
  final h = AppHarness(
    library: FakeLibraryRepository([
      fakeEntry(id: 'e1', status: GameStatus.completed),
      fakeEntry(
        id: 'e2',
        game: fakeGame(igdbId: 900002, name: 'Jogo Fixture Dois'),
        status: GameStatus.playing,
      ),
    ]),
    feed: FakeFeedRepository(general: [fakePost()])..posts = {'p1': fakePost()},
  );
  h.profiles.profiles[me.id] = fakeProfile(
    id: me.id,
    username: me.username,
    name: me.displayName,
  );
  return h;
}

/// Rota do topo da pilha, inclusive a empilhada por `push` (que o `routeInformationProvider`
/// não reflete).
String location(WidgetTester tester) =>
    GoRouter.of(tester.element(find.byType(Scaffold).first)).state.uri.path;

Future<void> select(WidgetTester tester, String label) =>
    tapAndSettle(tester, find.text(label).last);

void main() {
  group('return in link direct (without the stack)', () {
    for (final (path, fallback, label) in [
      ('/games/900001', '/library', 'game → Library'),
      ('/posts/p1', '/community', 'post → Community'),
      ('/me/edit', '/me', 'edit profile → Profile'),
      ('/settings', '/me', 'settings → Profile'),
      ('/messages/$convId', '/messages', 'conversation → Messages'),
      ('/posts/new', '/community', 'new post → Community'),
      ('/games/900001/playthroughs/new', '/games/900001', 'entry → game'),
    ]) {
      testWidgets(label, (tester) async {
        await harness().pump(tester);
        await goTo(tester, path);
        expect(location(tester), path);
        expect(
          find.byType(NavigationBar),
          findsNothing,
          reason: 'sem pilha: só a subtela',
        );

        await tapAndSettle(tester, find.byType(BackButton));
        expect(location(tester), fallback);
      });
    }

    testWidgets('form with change asks before leave of the link direct', (
      tester,
    ) async {
      await harness().pump(tester);
      await goTo(tester, '/posts/new');
      await tester.enterText(find.byType(TextField).first, 'rascunho');
      await tester.pumpAndSettle();

      await tapAndSettle(tester, find.byType(BackButton));
      expect(find.text('Descartar publicação?'), findsOneWidget);
      expect(location(tester), '/posts/new');

      await tapAndSettle(tester, find.text('Continuar editando'));
      expect(location(tester), '/posts/new');
      expect(find.text('rascunho'), findsOneWidget);

      await tapAndSettle(tester, find.byType(BackButton));
      await tapAndSettle(tester, find.text('Descartar'));
      expect(location(tester), '/community');
    });

    for (final (path, fallback) in [
      ('/posts/nao-existe', '/community'),
      ('/users/nao-existe', '/community'),
      ('/messages/nao-existe', '/messages'),
    ]) {
      testWidgets('$path not found: error with retry and exit', (tester) async {
        await harness().pump(tester);
        await goTo(tester, path);
        expect(find.text('Tentar de novo'), findsOneWidget);
        await tapAndSettle(tester, find.byType(BackButton));
        expect(location(tester), fallback);
      });
    }

    for (final (name, path, enter) in [
      ('entry', '/games/900001/playthroughs/new', 'hours'),
      ('post', '/posts/new', 'text'),
      ('profile edit', '/me/edit', 'bio'),
    ]) {
      testWidgets(
        'with the stack, returning through the bar also asks before discarding ($name)',
        (tester) async {
          await harness().pump(tester, size: const Size(400, 2000));
          // Aberto por navegação normal: há uma tela embaixo (pilha).
          GoRouter.of(tester.element(find.byType(Scaffold).first)).push(path);
          await tester.pumpAndSettle();
          expect(find.byType(NavigationBar), findsNothing);

          final field = switch (enter) {
            'hours' => find.widgetWithText(TextFormField, 'Horas jogadas'),
            'text' => find.byType(TextField).first,
            _ => find.widgetWithText(TextFormField, 'Bio'),
          };
          // Horas válidas: texto que não vira número não conta como alteração.
          await tester.enterText(field, enter == 'hours' ? '5' : 'alteração');
          await tester.pumpAndSettle();

          await tapAndSettle(tester, find.byType(BackButton));
          expect(
            find.text('Descartar alterações?').evaluate().length +
                find.text('Descartar publicação?').evaluate().length,
            1,
            reason: 'pediu confirmação em vez de descartar em silêncio',
          );
          expect(location(tester), path);
        },
      );
    }

    testWidgets('with the stack, return undoes the push', (tester) async {
      await harness().pump(tester);
      await openLibraryGame(tester, 'Jogo Fixture Um');
      expect(location(tester), '/games/900001');
      await tapAndSettle(tester, find.byType(BackButton));
      expect(location(tester), '/library');
    });

    testWidgets(
      'game with an invalid address shows the useful exit state, not the blank screen',
      (tester) async {
        await harness().pump(tester);
        await goTo(tester, '/games/abc');
        expect(find.text('Jogo não encontrado'), findsOneWidget);
        await tapAndSettle(
          tester,
          find.widgetWithText(FilledButton, 'Ir para a Biblioteca'),
        );
        expect(location(tester), '/library');
      },
    );
  });

  testWidgets(
    'link direct without the session: enters, falls in the destination and returns to the app',
    (tester) async {
      await AppHarness(signedIn: false).pump(tester);
      await goTo(tester, '/games/900001');
      expect(location(tester), '/login');

      await tester.enterText(find.byType(TextFormField).first, 'ana');
      await tester.enterText(find.byType(TextFormField).last, 'senha');
      await tapAndSettle(tester, find.widgetWithText(FilledButton, 'Entrar'));
      expect(location(tester), '/games/900001');

      await tapAndSettle(tester, find.byType(BackButton));
      expect(location(tester), '/library');
    },
  );

  group('action main', () {
    const actions = {
      'Biblioteca': 'Adicionar jogo',
      'Comunidade': 'Publicar',
      'Mensagens': 'Nova conversa',
    };

    for (final entry in actions.entries) {
      testWidgets('${entry.key}: FAB in window narrow, never the two', (
        tester,
      ) async {
        await harness().pump(tester, size: const Size(390, 800));
        await select(tester, entry.key);
        expect(find.byType(FloatingActionButton), findsOneWidget);
        expect(
          find.widgetWithText(FloatingActionButton, entry.value),
          findsOneWidget,
        );
        expect(
          find.byType(IconButton).evaluate().where((e) {
            final b = e.widget as IconButton;
            return b.tooltip == entry.value;
          }),
          isEmpty,
        );
      });

      testWidgets('${entry.key}: button in the header in window wide', (
        tester,
      ) async {
        await harness().pump(tester, size: const Size(900, 800));
        await select(tester, entry.key);
        expect(find.byType(FloatingActionButton), findsNothing);
        expect(
          find.descendant(
            of: find.byType(AppBar),
            matching: find.byWidgetPredicate(
              (w) =>
                  (w is FilledButton || w is IconButton) &&
                  _hasLabel(w, entry.value),
            ),
          ),
          findsOneWidget,
        );
      });
    }

    testWidgets('the breakpoint is 600 dp, the same of the navigation', (
      tester,
    ) async {
      await harness().pump(tester, size: const Size(599, 800));
      expect(find.byType(FloatingActionButton), findsOneWidget);
      expect(find.byType(NavigationBar), findsOneWidget);
      await harness().pump(tester, size: const Size(600, 800));
      expect(find.byType(FloatingActionButton), findsNothing);
      expect(find.byType(NavigationRail), findsOneWidget);
    });

    testWidgets('the button of the header executes the action', (tester) async {
      await harness().pump(tester, size: const Size(900, 800));
      await select(tester, 'Comunidade');
      await tapAndSettle(
        tester,
        find.descendant(
          of: find.byType(AppBar),
          matching: find.widgetWithText(FilledButton, 'Publicar'),
        ),
      );
      expect(location(tester), '/posts/new');
    });
  });

  group('headers of the destinations', () {
    for (final label in ['Biblioteca', 'Explorar', 'Comunidade', 'Perfil']) {
      testWidgets('$label has the bell of notifications', (tester) async {
        await harness().pump(tester, size: const Size(390, 800));
        await select(tester, label);
        expect(find.byType(NotificationsBell), findsOneWidget);
      });
    }

    testWidgets('profile has gear; messages has header own', (tester) async {
      await harness().pump(tester, size: const Size(390, 800));
      await select(tester, 'Perfil');
      expect(find.byTooltip('Configurações'), findsOneWidget);
      await select(tester, 'Mensagens');
      expect(find.byType(NotificationsBell), findsNothing);
      expect(find.byTooltip('Configurações'), findsNothing);
    });
  });

  group('rail and switches of destination', () {
    testWidgets('rail expanded only the from of 1240 dp', (tester) async {
      await harness().pump(tester, size: const Size(1239, 800));
      expect(
        tester.widget<NavigationRail>(find.byType(NavigationRail)).extended,
        isFalse,
      );
      await harness().pump(tester, size: const Size(1240, 800));
      expect(
        tester.widget<NavigationRail>(find.byType(NavigationRail)).extended,
        isTrue,
      );
    });

    testWidgets('resize keeps the destination selected', (tester) async {
      await harness().pump(tester, size: const Size(400, 800));
      await select(tester, 'Comunidade');
      expect(
        tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex,
        2,
      );

      tester.view.physicalSize = const Size(900, 800);
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<NavigationRail>(find.byType(NavigationRail))
            .selectedIndex,
        2,
      );
      expect(location(tester), '/community');
    });

    testWidgets(
      'tap in the destination active does not delete the filter from the Library',
      (tester) async {
        await harness().pump(tester, size: const Size(400, 800));
        await chooseStatus(tester, 'Jogando (1)');
        expect(find.text('Jogo Fixture Um'), findsNothing);
        await select(tester, 'Biblioteca');
        expect(find.text('Jogo Fixture Um'), findsNothing);
        expect(find.text('Jogo Fixture Dois'), findsWidgets);
      },
    );

    testWidgets('tap in the destination active returns to the root his', (
      tester,
    ) async {
      await harness().pump(tester, size: const Size(400, 800));
      await select(tester, 'Perfil');
      await tapAndSettle(tester, find.byTooltip('Configurações'));
      expect(location(tester), '/settings');
      // /settings é empilhada por cima do shell; voltar e tocar no destino leva à raiz.
      await tapAndSettle(tester, find.byType(BackButton));
      await select(tester, 'Perfil');
      expect(location(tester), '/me');
    });
  });
}

bool _hasLabel(Widget w, String label) => switch (w) {
  IconButton(:final tooltip) => tooltip == label,
  FilledButton() =>
    find
        .descendant(of: find.byWidget(w), matching: find.text(label))
        .evaluate()
        .isNotEmpty,
  _ => false,
};
