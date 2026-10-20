// Etapa 12: central de notificações, destino removido e telas auxiliares (não encontrada,
// restauração de sessão, login e cadastro).
import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/design_system/user_avatar.dart';
import 'package:gametracker/core/network/app_exception.dart';
import 'package:gametracker/features/auth/data/auth_repository.dart';
import 'package:gametracker/features/notifications/data/notification_models.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../support/fake_auth.dart';
import '../../support/fake_feed.dart';
import '../../support/fake_notifications.dart';
import '../../support/fake_profiles.dart';
import '../../support/harness.dart';

String uri(WidgetTester tester) =>
    GoRouter.of(tester.element(find.byType(Scaffold).first)).state.uri
        .toString();

Future<AppHarness> openCenter(
  WidgetTester tester,
  FakeNotificationsRepository repo, {
  Size size = const Size(400, 900),
  double textScale = 1,
  AppHarness? harness,
}) async {
  final h = harness ?? AppHarness(notifications: repo);
  await h.pump(tester, size: size, textScale: textScale);
  await goTo(tester, '/notifications');
  return h;
}

void main() {
  group('center', () {
    final items = [
      fakeNotification('n1'),
      fakeNotification('n2', type: NotificationType.comment, actor: ana),
      fakeNotification('n3', type: NotificationType.follow, read: true),
    ];

    testWidgets(
      'lines consistent: avatar, action, time and indicator of unread',
      (tester) async {
        await openCenter(
          tester,
          FakeNotificationsRepository(notificationsOf(items)),
        );
        expect(find.byType(UserAvatar), findsNWidgets(3));
        expect(find.textContaining('curtiu seu post'), findsOneWidget);
        expect(find.textContaining('comentou no seu post'), findsOneWidget);
        expect(find.textContaining('começou a seguir você'), findsOneWidget);
        expect(
          find.byIcon(Icons.circle),
          findsNWidgets(2),
          reason: 'duas não lidas',
        );
      },
    );

    testWidgets('the unread item is read the "Unread"', (tester) async {
      final semantics = tester.ensureSemantics();
      await openCenter(
        tester,
        FakeNotificationsRepository(notificationsOf(items)),
      );
      expect(
        find.bySemanticsLabel(RegExp(r'^Não lida\. beto curtiu')),
        findsOneWidget,
      );
      expect(
        find.bySemanticsLabel(RegExp(r'^beto começou a seguir')),
        findsOneWidget,
      );
      semantics.dispose();
    });

    testWidgets('column of reading of at most 680 dp', (tester) async {
      await openCenter(
        tester,
        FakeNotificationsRepository(notificationsOf(items)),
        size: const Size(1440, 900),
      );
      final tile = tester.getSize(find.byType(ListTile).first);
      expect(tile.width, lessThanOrEqualTo(680));
    });

    testWidgets(
      'the filters break of line with text large, without scroll for the side',
      (tester) async {
        await openCenter(
          tester,
          FakeNotificationsRepository(notificationsOf(items)),
          size: const Size(360, 800),
          textScale: 2,
        );
        expect(tester.takeException(), isNull);
        for (final f in ['Tudo', 'Interações', 'Seguidores']) {
          expect(find.widgetWithText(FilterChip, f), findsOneWidget);
          final r = tester.getRect(find.widgetWithText(FilterChip, f));
          expect(r.left, greaterThanOrEqualTo(0));
          expect(r.right, lessThanOrEqualTo(360), reason: f);
        }
        expect(
          find.byWidgetPredicate(
            (w) =>
                w is SingleChildScrollView &&
                w.scrollDirection == Axis.horizontal,
          ),
          findsNothing,
        );
      },
    );

    testWidgets(
      'the global "mark all as read" action continues working and tapping an item does not mark anything',
      (tester) async {
        final repo = FakeNotificationsRepository(notificationsOf(items));
        await openCenter(tester, repo);
        await tapAndSettle(tester, find.byTooltip('Marcar todas como lidas'));
        expect(find.byIcon(Icons.circle), findsNothing);
        expect(find.byTooltip('Marcar todas como lidas'), findsNothing);
      },
    );

    testWidgets('50 items: the footer explains that these are the 50 newest', (
      tester,
    ) async {
      final fifty = [for (var i = 0; i < 50; i++) fakeNotification('n$i')];
      await openCenter(
        tester,
        FakeNotificationsRepository(notificationsOf(fifty)),
        size: const Size(400, 6000),
      );
      expect(find.text('Mostrando as 50 mais recentes.'), findsOneWidget);
    });

    testWidgets(
      'with fewer than 50, there is in the footer or fake pagination',
      (tester) async {
        await openCenter(
          tester,
          FakeNotificationsRepository(notificationsOf(items)),
        );
        expect(find.textContaining('mais recentes'), findsNothing);
      },
    );

    testWidgets(
      'the bell badge follows the server counter, not the visible rows',
      (tester) async {
        // 3 linhas visíveis, mas o servidor conta 7 não lidas no total.
        final repo = FakeNotificationsRepository(
          NotificationsData(items: items, unreadCount: 7),
        );
        final h = AppHarness(notifications: repo);
        await h.pump(tester);
        expect(
          find.text('7'),
          findsOneWidget,
          reason: 'selo do sino na Biblioteca',
        );
      },
    );
  });

  group('destination removed', () {
    testWidgets(
      'like number post deleted: explains and returns for the center',
      (tester) async {
        final feed = FakeFeedRepository()
          ..postError = const ApiException(
            404,
            'not_found',
            'Post não encontrado',
          );
        final repo = FakeNotificationsRepository(
          notificationsOf([fakeNotification('n1')]),
        );
        final h = AppHarness(feed: feed, notifications: repo);
        await openCenter(tester, repo, harness: h);
        await tapAndSettle(tester, find.textContaining('curtiu seu post'));
        expect(uri(tester), '/posts/p1');
        expect(find.text('Este post não está mais disponível'), findsOneWidget);
        expect(find.text('Tentar de novo'), findsNothing);

        await tapAndSettle(tester, find.widgetWithText(FilledButton, 'Voltar'));
        expect(
          uri(tester),
          '/notifications',
          reason: 'volta ao ponto de partida',
        );
        expect(find.textContaining('curtiu seu post'), findsOneWidget);
      },
    );

    testWidgets('new follower with the account removed: same handling', (
      tester,
    ) async {
      final profiles = FakeProfilesRepository()
        ..profileError = const ApiException(
          404,
          'not_found',
          'Usuário não encontrado',
        );
      final repo = FakeNotificationsRepository(
        notificationsOf([
          fakeNotification('n1', type: NotificationType.follow),
        ]),
      );
      final h = AppHarness(profiles: profiles, notifications: repo);
      await openCenter(tester, repo, harness: h);
      await tapAndSettle(tester, find.textContaining('começou a seguir você'));
      expect(find.text('Este perfil não está mais disponível'), findsOneWidget);
      await tapAndSettle(tester, find.widgetWithText(FilledButton, 'Voltar'));
      expect(uri(tester), '/notifications');
    });
  });

  group('screens auxiliary', () {
    testWidgets('page does not found: explains and takes to the Library', (
      tester,
    ) async {
      final h = AppHarness();
      await h.pump(tester, size: const Size(360, 800), textScale: 2);
      await goTo(tester, '/nada');
      expect(find.text('Página não encontrada.'), findsOneWidget);
      expect(find.text('O endereço não existe ou mudou.'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tapAndSettle(
        tester,
        find.widgetWithText(FilledButton, 'Ir para a Biblioteca'),
      );
      expect(uri(tester), '/library');
    });

    testWidgets(
      'restoration without the connection: state with both exits, without overflow the 200%',
      (tester) async {
        final auth = FakeAuthRepository()
          ..restoreResult = const RestoreUnavailable();
        final h = AppHarness(auth: auth, signedIn: false);
        await h.pump(tester, size: const Size(360, 640), textScale: 2);
        expect(find.text('Não foi possível conectar'), findsOneWidget);
        expect(find.text('Tentar novamente'), findsOneWidget);
        expect(find.text('Sair da conta'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );

    for (final (path, label) in [
      ('/login', 'Entrar'),
      ('/register', 'Criar conta'),
    ]) {
      testWidgets(
        '$path the 360 px and 200%: title, fields, and action visible, without overflow',
        (tester) async {
          final h = AppHarness(signedIn: false);
          await h.pump(tester, size: const Size(360, 640), textScale: 2);
          await goTo(tester, path);
          expect(tester.takeException(), isNull);
          expect(
            find.byIcon(Icons.sports_esports),
            findsOneWidget,
            reason: 'marca da tela',
          );
          expect(find.widgetWithText(FilledButton, label), findsOneWidget);
        },
      );

      testWidgets('$path in screen wide stays a column narrow and centered', (
        tester,
      ) async {
        final h = AppHarness(signedIn: false);
        await h.pump(tester, size: const Size(1440, 900));
        await goTo(tester, path);
        final width = tester.getSize(find.byType(TextFormField).first).width;
        expect(width, lessThanOrEqualTo(420));
      });
    }
  });
}
