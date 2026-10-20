// Critérios de liberação (plano 8.3): sem overflow nem ação inacessível nas larguras e escalas de
// texto acordadas, claro/escuro, janela ampla e diretrizes de acessibilidade do Flutter.
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/design_system/game_status.dart';
import 'package:gametracker/features/chat/data/chat_models.dart';
import 'package:gametracker/features/notifications/data/notification_models.dart';
import 'package:material_ui/material_ui.dart'
    show
        EditableText,
        NavigationBar,
        Scaffold,
        SearchBar,
        Size,
        TextInputAction;

import '../support/fake_chat.dart';
import '../support/fake_feed.dart';
import '../support/fake_notifications.dart';
import '../support/fake_profiles.dart';
import '../support/fake_repos.dart';
import '../support/harness.dart';

const _longName =
    'The Legend of Zelda: Tears of the Kingdom — Edição Colecionador Especial';
const _longText =
    'Um texto bem longo para testar quebra de linha em telas estreitas com fonte ampliada, '
    'sem estourar o layout nem esconder ações importantes do usuário na tela.';

AppHarness rich({bool signedIn = true}) {
  final games = [
    for (var i = 0; i < 6; i++)
      fakeGame(igdbId: 1000 + i, name: i == 0 ? _longName : 'Jogo $i'),
  ];
  final posts = [
    for (var i = 0; i < 6; i++)
      fakePost(
        id: 'p$i',
        author: i.isEven ? ana : beto,
        content: i == 0 ? _longText : 'Post $i',
        likes: i,
        comments: i,
        game: i == 1 ? games[1] : null,
        activityStatus: i == 1 ? GameStatus.completed : null,
      ),
  ];
  final h = AppHarness(
    signedIn: signedIn,
    library: FakeLibraryRepository([
      for (var i = 0; i < 6; i++)
        fakeEntry(
          id: 'e$i',
          game: games[i],
          status: GameStatus.values[i % GameStatus.values.length],
          hours: i * 3.5,
          rating: i == 0 ? null : 1 + i,
        ),
    ]),
    feed: FakeFeedRepository(
      general: posts,
      following: posts.take(2).toList(),
      pageSize: 10,
    )..posts = {for (final p in posts) p.id: p},
    notifications: FakeNotificationsRepository(
      notificationsOf([
        fakeNotification('n1'),
        fakeNotification('n2', type: NotificationType.comment, actor: ana),
        fakeNotification('n3', type: NotificationType.follow, read: true),
      ]),
    ),
  );
  h.profiles.profiles['u1'] = fakeProfile(
    id: 'u1',
    username: 'ana',
    name: 'ANA',
    bio: _longText,
  );
  h.profiles.profiles['u-beto'] = fakeProfile();
  h.chat.list = [
    conversation(
      last: LastMessage(
        id: 'm0',
        content: _longText,
        senderId: 'u-beto',
        createdAt: DateTime.utc(2026, 6, 1),
      ),
      unread: true,
    ),
  ];
  h.chat.history[convId] = [
    serverMessage('m1', text: _longText, minute: 1),
    serverMessage('m2', text: 'resposta', minute: 2, mine: true),
  ];
  return h;
}

/// Telas por caminho. `login` e `register` precisam de sessão encerrada.
const _signedInRoutes = {
  'library': '/library',
  'explore': '/explore',
  'community': '/community',
  'messages': '/messages',
  'profile': '/me',
  'edit profile': '/me/edit',
  'settings': '/settings',
  'notifications': '/notifications',
  'post': '/posts/p0',
  'another user profile': '/users/u-beto',
  'game': '/games/1000',
  'conversation': '/messages/$convId',
  'new post': '/posts/new',
};
const _signedOutRoutes = {'login': '/login', 'create account': '/register'};

const _viewports = {
  'phone 400': (Size(400, 900), 1.0),
  'small phone 360, text 200%': (Size(360, 640), 2.0),
  'portrait tablet 800': (Size(800, 1100), 1.0),
  'wide window 1400': (Size(1400, 900), 1.0),
};

/// Os dois lados de cada corte de layout (barra/rail, rail estendido) e um texto intermediário.
const _breakpointViewports = {
  'window 599': (Size(599, 900), 1.0),
  'window 600': (Size(600, 960), 1.0),
  'window 839': (Size(839, 900), 1.0),
  'window 840': (Size(840, 900), 1.0),
  'window 1239': (Size(1239, 900), 1.0),
  'window 1240': (Size(1240, 900), 1.0),
  'phone 390, text 150%': (Size(390, 844), 1.5),
};

/// [tapTargets] fica desligado só no Explorar: a diretriz mede o nó interno do campo do `SearchBar`
/// (312x24), mas a barra inteira (56 dp) recebe o toque; há um teste próprio para isso.
Future<void> _guidelines(WidgetTester tester, {bool tapTargets = true}) async {
  if (tapTargets) {
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
  }
  await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
  await expectLater(tester, meetsGuideline(textContrastGuideline));
}

void main() {
  group('layout: in the screen overflows in in the width, scale or theme', () {
    for (final dark in [false, true]) {
      for (final MapEntry(key: viewName, value: (size, scale))
          in _viewports.entries) {
        for (final MapEntry(key: name, value: path) in {
          ..._signedInRoutes,
        }.entries) {
          testWidgets('${dark ? 'dark' : 'light'} · $viewName · $name', (
            tester,
          ) async {
            final h = rich();
            await h.pump(
              tester,
              size: size,
              textScale: scale,
              prefs: {'theme.mode': dark ? 'dark' : 'light'},
            );
            await goTo(tester, path);
            expect(tester.takeException(), isNull);
          });
        }
      }
    }

    for (final dark in [false, true]) {
      for (final MapEntry(key: viewName, value: (size, scale))
          in _breakpointViewports.entries) {
        for (final MapEntry(key: name, value: path)
            in _signedInRoutes.entries) {
          testWidgets('${dark ? 'dark' : 'light'} · $viewName · $name', (
            tester,
          ) async {
            final h = rich();
            await h.pump(
              tester,
              size: size,
              textScale: scale,
              prefs: {'theme.mode': dark ? 'dark' : 'light'},
            );
            await goTo(tester, path);
            expect(tester.takeException(), isNull);
          });
        }
      }
    }

    for (final MapEntry(key: name, value: path) in _signedOutRoutes.entries) {
      for (final MapEntry(key: viewName, value: (size, scale))
          in _viewports.entries) {
        testWidgets('without the session · $viewName · $name', (tester) async {
          final h = rich(signedIn: false);
          await h.pump(tester, size: size, textScale: scale);
          await goTo(tester, path);
          expect(tester.takeException(), isNull);
        });
      }
    }
  });

  group('guidelines of accessibility (tap ≥ 48 dp, labels, contrast)', () {
    for (final dark in [false, true]) {
      for (final MapEntry(key: name, value: path) in {
        ..._signedInRoutes,
      }.entries) {
        testWidgets('${dark ? 'dark' : 'light'} · $name', (tester) async {
          final handle = tester.ensureSemantics();
          try {
            final h = rich();
            await h.pump(
              tester,
              prefs: {'theme.mode': dark ? 'dark' : 'light'},
            );
            await goTo(tester, path);
            await _guidelines(tester, tapTargets: path != '/explore');
          } finally {
            handle.dispose();
          }
        });
      }
    }

    for (final dark in [false, true]) {
      for (final MapEntry(key: name, value: path) in _signedOutRoutes.entries) {
        testWidgets('${dark ? 'dark' : 'light'} · $name', (tester) async {
          final handle = tester.ensureSemantics();
          try {
            final h = rich(signedIn: false);
            await h.pump(
              tester,
              prefs: {'theme.mode': dark ? 'dark' : 'light'},
            );
            await goTo(tester, path);
            await _guidelines(tester);
          } finally {
            handle.dispose();
          }
        });
      }
    }
  });

  group('slash of search', () {
    testWidgets(
      'the slash entire has 48 dp or more and receives the tap in any dot',
      (tester) async {
        await rich().pump(tester);
        await goTo(tester, '/explore');
        final bar = tester.getRect(find.byType(SearchBar).first);
        expect(bar.height, greaterThanOrEqualTo(48));
        await tester.tapAt(Offset(bar.center.dx + 60, bar.top + 4));
        await tester.pump();
        expect(
          tester.testTextInput.isVisible,
          isTrue,
          reason: 'o teclado abre ao tocar na borda da barra',
        );
      },
    );
  });

  group('navigation assistive', () {
    testWidgets('main navigation exposes every destination by name', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();
      try {
        await rich().pump(tester);
        for (final label in [
          'Biblioteca',
          'Explorar',
          'Comunidade',
          'Perfil',
        ]) {
          expect(
            find.bySemanticsLabel(RegExp(label)),
            findsWidgets,
            reason: label,
          );
        }
        expect(find.bySemanticsLabel(RegExp('Mensagens')), findsWidgets);
      } finally {
        handle.dispose();
      }
    });

    testWidgets('all field of text of the login has label', (tester) async {
      final handle = tester.ensureSemantics();
      try {
        await rich(signedIn: false).pump(tester);
        final fields = <SemanticsNode>[];
        void visit(SemanticsNode node) {
          if (node.flagsCollection.isTextField) fields.add(node);
          node.visitChildren((c) {
            visit(c);
            return true;
          });
        }

        visit(tester.semantics.find(find.byType(Scaffold).first));
        expect(fields, isNotEmpty);
        for (final f in fields) {
          expect(
            '${f.label}${f.hint}'.trim(),
            isNotEmpty,
            reason: f.toString(),
          );
        }
      } finally {
        handle.dispose();
      }
    });

    testWidgets(
      'the "unread" state and notification type are read, not only displayed',
      (tester) async {
        final handle = tester.ensureSemantics();
        try {
          await rich().pump(tester);
          await goTo(tester, '/notifications');
          expect(
            find.bySemanticsLabel(RegExp('^Não lida\\. .*curtiu seu post')),
            findsOneWidget,
          );
        } finally {
          handle.dispose();
        }
      },
    );
  });

  group('gesture of return and keyboard', () {
    testWidgets(
      'return closes the screen stacked and returns to the previous',
      (tester) async {
        await rich().pump(tester);
        await tapAndSettle(tester, find.byTooltip(RegExp('Notificações')));
        expect(find.text('Notificações'), findsWidgets);
        await tester.binding.handlePopRoute();
        await tester.pumpAndSettle();
        expect(find.byTooltip(RegExp('Notificações')), findsOneWidget);
        expect(find.byType(NavigationBar), findsOneWidget);
      },
    );

    testWidgets(
      'return in the root of the tab delivers the gesture to the system',
      (tester) async {
        await rich().pump(tester);
        expect(await tester.binding.handlePopRoute(), isFalse);
      },
    );

    testWidgets('Enter in the last field sends the login', (tester) async {
      final h = rich(signedIn: false);
      await h.pump(tester);
      await goTo(tester, '/login');
      await tester.enterText(find.byType(EditableText).at(0), 'ana');
      await tester.enterText(find.byType(EditableText).at(1), 'senha-123');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      expect(h.auth.loginCalls, [('ana', 'senha-123')]);
    });
  });
}
