import 'dart:async';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/models/user_summary.dart';
import 'package:gametracker/app/providers.dart';
import 'package:gametracker/core/network/app_exception.dart';
import 'package:gametracker/features/auth/data/auth_repository.dart';
import 'package:gametracker/features/notifications/application/notifications_controller.dart';
import 'package:gametracker/features/notifications/data/notification_models.dart';
import 'package:gametracker/features/notifications/presentation/notifications_page.dart';
import 'package:material_ui/material_ui.dart';

import '../../support/fake_auth.dart';
import '../../support/fake_feed.dart';
import '../../support/fake_notifications.dart';
import '../../support/fake_profiles.dart';
import '../../support/fixtures.dart';
import '../../support/harness.dart';

void scenario(
  String name,
  void Function(
    FakeAsync async,
    ProviderContainer c,
    FakeNotificationsRepository repo,
    void Function() pump,
  )
  body,
) {
  test(name, () {
    fakeAsync((async) {
      final repo = FakeNotificationsRepository();
      final c = ProviderContainer(
        retry: noAutomaticRetry,
        overrides: [
          ...fakeAuthOverrides(
            FakeAuthRepository()..restoreResult = Restored(fakeUser()),
          ),
          notificationsRepositoryProvider.overrideWithValue(repo),
          clockProvider.overrideWithValue(
            () => DateTime.utc(2026).add(async.elapsed),
          ),
        ],
      );
      void pump() {
        async.flushMicrotasks();
        async.elapse(Duration.zero);
        async.flushMicrotasks();
      }

      c.read(sessionControllerProvider);
      pump();
      try {
        body(async, c, repo, pump);
      } finally {
        c.dispose();
      }
    });
  });
}

NotificationsData data(ProviderContainer c) =>
    c.read(notificationsControllerProvider).requireValue;

void main() {
  group('contract: reply real from the backend', () {
    test('list with likes, comment and followers', () {
      final parsed = NotificationsData.fromJson(
        fixtureBody('notifications_list') as Map<String, dynamic>,
      );
      expect(parsed.items, isNotEmpty);
      expect(
        parsed.items.map((n) => n.type).toSet(),
        containsAll([
          NotificationType.like,
          NotificationType.comment,
          NotificationType.follow,
        ]),
      );
      expect(
        parsed.items
            .firstWhere((n) => n.type == NotificationType.follow)
            .postId,
        isNull,
      );
      expect(
        parsed.items.firstWhere((n) => n.type == NotificationType.like).postId,
        isNotNull,
      );
      expect(parsed.unreadCount, isA<int>());
    });

    test(
      'unknown type (backend newest) is ignored instead of breaking the list',
      () {
        final parsed = NotificationsData.fromJson({
          'items': [
            {
              'id': 'n1',
              'type': 'repost',
              'postId': null,
              'read': false,
              'createdAt': '2026-06-01T00:00:00.000Z',
              'actor': {
                'id': 'u',
                'username': 'a',
                'name': null,
                'avatarUrl': null,
              },
            },
            {
              'id': 'n2',
              'type': 'like',
              'postId': 'p',
              'read': false,
              'createdAt': '2026-06-01T00:00:00.000Z',
              'actor': {
                'id': 'u',
                'username': 'a',
                'name': null,
                'avatarUrl': null,
              },
            },
          ],
          'unreadCount': 2,
        });
        expect(parsed.items.map((n) => n.id), ['n2']);
      },
    );

    test('the server returns at most 50: with 50 items warns that can there be more', () {
      final fifty = notificationsOf([
        for (var i = 0; i < 50; i++) fakeNotification('n$i'),
      ]);
      expect(fifty.maybeTruncated, isTrue);
      expect(notificationsOf([fakeNotification('a')]).maybeTruncated, isFalse);
    });

    test(
      'filters: interactions are likes and comments; followers only follow',
      () {
        expect(
          NotificationFilter.interactions.matches(NotificationType.like),
          isTrue,
        );
        expect(
          NotificationFilter.interactions.matches(NotificationType.comment),
          isTrue,
        );
        expect(
          NotificationFilter.interactions.matches(NotificationType.follow),
          isFalse,
        );
        expect(
          NotificationFilter.followers.matches(NotificationType.follow),
          isTrue,
        );
        expect(
          NotificationFilter.followers.matches(NotificationType.like),
          isFalse,
        );
        expect(NotificationFilter.all.matches(NotificationType.follow), isTrue);
      },
    );

    test('destination of the notification: only by ids', () {
      expect(
        notificationRoute(
          fakeNotification('a', type: NotificationType.like, postId: 'p9'),
        ),
        '/posts/p9',
      );
      expect(
        notificationRoute(
          fakeNotification('a', type: NotificationType.comment, postId: 'p9'),
        ),
        '/posts/p9',
      );
      expect(
        notificationRoute(fakeNotification('a', type: NotificationType.follow)),
        '/users/u-beto',
      );
      expect(
        notificationRoute(
          fakeNotification('a', type: NotificationType.like, postId: null),
        ),
        isNull,
      );
    });
  });

  group('NotificationsController', () {
    scenario('carrega a lista e o contador de não lidas', (
      async,
      c,
      repo,
      pump,
    ) {
      repo.data = notificationsOf([
        fakeNotification('a'),
        fakeNotification('b', read: true),
      ]);
      c.listen(notificationsControllerProvider, (_, _) {});
      pump();
      expect(data(c).items.length, 2);
      expect(c.read(unreadNotificationsProvider), 1);
    });

    scenario(
      'o contador vem do servidor e conta todas, não só as 50 mostradas',
      (async, c, repo, pump) {
        repo.data = notificationsOf([fakeNotification('a')], unread: 130);
        c.listen(notificationsControllerProvider, (_, _) {});
        pump();
        expect(c.read(unreadNotificationsProvider), 130);
      },
    );

    scenario('marcar todas como lidas é imediato e confirma no servidor', (
      async,
      c,
      repo,
      pump,
    ) {
      repo.data = notificationsOf([
        fakeNotification('a'),
        fakeNotification('b'),
      ]);
      c.listen(notificationsControllerProvider, (_, _) {});
      pump();
      unawaited(c.read(notificationsControllerProvider.notifier).markAllRead());
      expect(c.read(unreadNotificationsProvider), 0, reason: 'imediato');
      expect(data(c).items.every((n) => n.read), isTrue);
      pump();
      expect(repo.markCalls, 1);
    });

    scenario('falha ao marcar volta ao estado anterior e relança', (
      async,
      c,
      repo,
      pump,
    ) {
      repo.data = notificationsOf([
        fakeNotification('a'),
        fakeNotification('b', read: true),
      ]);
      repo.markError = const NetworkException();
      c.listen(notificationsControllerProvider, (_, _) {});
      pump();
      Object? error;
      c
          .read(notificationsControllerProvider.notifier)
          .markAllRead()
          .catchError((Object e) => error = e);
      pump();
      expect(error, isA<NetworkException>());
      expect(c.read(unreadNotificationsProvider), 1);
      expect(data(c).items.where((n) => !n.read).length, 1);
    });

    scenario('duas chamadas ao mesmo tempo fazem uma só requisição', (
      async,
      c,
      repo,
      pump,
    ) {
      repo.data = notificationsOf([fakeNotification('a')]);
      repo.markGate = Completer<void>();
      c.listen(notificationsControllerProvider, (_, _) {});
      pump();
      final ctl = c.read(notificationsControllerProvider.notifier);
      unawaited(ctl.markAllRead());
      unawaited(ctl.markAllRead());
      unawaited(ctl.markAllRead());
      pump();
      expect(repo.markCalls, 1);
      repo.markGate!.complete();
      pump();
    });

    scenario('sem não lidas não faz requisição', (async, c, repo, pump) {
      repo.data = notificationsOf([fakeNotification('a', read: true)]);
      c.listen(notificationsControllerProvider, (_, _) {});
      pump();
      unawaited(c.read(notificationsControllerProvider.notifier).markAllRead());
      pump();
      expect(repo.markCalls, 0);
    });

    scenario('polling a cada 60 s com o app aberto; para em segundo plano', (
      async,
      c,
      repo,
      pump,
    ) {
      c.listen(notificationsControllerProvider, (_, _) {});
      pump();
      expect(repo.listCalls, 1);
      async.elapse(const Duration(seconds: 61));
      async.flushMicrotasks();
      expect(repo.listCalls, 2);

      c.read(notificationsControllerProvider.notifier).setForeground(false);
      async.elapse(const Duration(minutes: 5));
      async.flushMicrotasks();
      expect(repo.listCalls, 2, reason: 'sem polling em segundo plano');

      c.read(notificationsControllerProvider.notifier).setForeground(true);
      pump();
      expect(
        repo.listCalls,
        3,
        reason: 'ao voltar, revalida porque ficou velho',
      );
    });

    scenario('notificação nova aparece depois do polling e atualiza o selo', (
      async,
      c,
      repo,
      pump,
    ) {
      c.listen(notificationsControllerProvider, (_, _) {});
      pump();
      expect(c.read(unreadNotificationsProvider), 0);
      repo.data = notificationsOf([fakeNotification('nova')]);
      async.elapse(const Duration(seconds: 61));
      async.flushMicrotasks();
      expect(c.read(unreadNotificationsProvider), 1);
    });

    scenario('falha no polling mantém a lista anterior', (
      async,
      c,
      repo,
      pump,
    ) {
      repo.data = notificationsOf([fakeNotification('a')]);
      c.listen(notificationsControllerProvider, (_, _) {});
      pump();
      repo.listError = const NetworkException();
      async.elapse(const Duration(seconds: 61));
      async.flushMicrotasks();
      expect(c.read(notificationsControllerProvider).hasError, isTrue);
      expect(data(c).items.length, 1);
      expect(c.read(unreadNotificationsProvider), 1);
    });

    scenario('o polling não atropela uma marcação em andamento', (
      async,
      c,
      repo,
      pump,
    ) {
      repo.data = notificationsOf([fakeNotification('a')]);
      repo.markGate = Completer<void>();
      c.listen(notificationsControllerProvider, (_, _) {});
      pump();
      unawaited(c.read(notificationsControllerProvider.notifier).markAllRead());
      pump();
      final before = repo.listCalls;
      async.elapse(const Duration(seconds: 61));
      async.flushMicrotasks();
      expect(
        repo.listCalls,
        before,
        reason: 'revalidar agora traria o estado antigo e desfaria o "lido"',
      );
      expect(c.read(unreadNotificationsProvider), 0);
      repo.markGate!.complete();
      pump();
    });

    scenario('sair da conta descarta as notificações', (async, c, repo, pump) {
      repo.data = notificationsOf([fakeNotification('a')]);
      c.listen(notificationsControllerProvider, (_, _) {});
      pump();
      unawaited(c.read(sessionControllerProvider.notifier).logout());
      pump();
      expect(c.read(unreadNotificationsProvider), 0);
    });
  });

  group('screen', () {
    Future<AppHarness> open(
      WidgetTester tester,
      NotificationsData data, {
      Size size = const Size(400, 900),
      FakeNotificationsRepository? repo,
    }) async {
      final h = AppHarness(
        notifications: repo ?? (FakeNotificationsRepository(data)),
      );
      await h.pump(tester, size: size);
      await tapAndSettle(tester, find.byTooltip(RegExp('Notificações')));
      return h;
    }

    NotificationsData mixed() => notificationsOf([
      fakeNotification('a', type: NotificationType.like),
      fakeNotification('b', type: NotificationType.comment, actor: ana),
      fakeNotification(
        'c',
        type: NotificationType.follow,
        actor: const UserSummary(id: 'u-cris', username: 'cris'),
        read: true,
      ),
    ]);

    testWidgets('the bell shows the count of unread and opens the center', (
      tester,
    ) async {
      final h = AppHarness(notifications: FakeNotificationsRepository(mixed()));
      await h.pump(tester);
      expect(find.widgetWithText(Badge, '2'), findsOneWidget);
      await tapAndSettle(tester, find.byTooltip('Notificações, 2 não lidas'));
      expect(find.byTooltip('Marcar todas como lidas'), findsOneWidget);
    });

    testWidgets('shows the that happened, who did and highlights the unread', (
      tester,
    ) async {
      await open(tester, mixed());
      expect(find.textContaining('beto curtiu seu post'), findsOneWidget);
      expect(find.textContaining('curtiu seu post'), findsOneWidget);
      expect(find.textContaining('comentou no seu post'), findsOneWidget);
      expect(find.textContaining('começou a seguir você'), findsOneWidget);
      expect(
        find.byIcon(Icons.circle),
        findsNWidgets(2),
        reason: 'dois pontos de não lida',
      );
    });

    testWidgets('filters: Interactions and followers', (tester) async {
      await open(tester, mixed());
      await tapAndSettle(tester, find.widgetWithText(FilterChip, 'Interações'));
      expect(find.textContaining('curtiu seu post'), findsOneWidget);
      expect(find.textContaining('começou a seguir você'), findsNothing);
      await tapAndSettle(tester, find.widgetWithText(FilterChip, 'Seguidores'));
      expect(find.textContaining('começou a seguir você'), findsOneWidget);
      expect(find.textContaining('curtiu seu post'), findsNothing);
      await tapAndSettle(tester, find.widgetWithText(FilterChip, 'Tudo'));
      expect(find.textContaining('curtiu seu post'), findsOneWidget);
    });

    testWidgets(
      'the filter without results differs from having in the notifications',
      (tester) async {
        await open(tester, notificationsOf([fakeNotification('a')]));
        await tapAndSettle(
          tester,
          find.widgetWithText(FilterChip, 'Seguidores'),
        );
        expect(find.text('Nada em "Seguidores"'), findsOneWidget);
        expect(find.text('Sem notificações'), findsNothing);
      },
    );

    testWidgets(
      'without notifications: state empty and without button of mark',
      (tester) async {
        await open(tester, const NotificationsData(items: [], unreadCount: 0));
        expect(find.text('Sem notificações'), findsOneWidget);
        expect(find.byTooltip('Marcar todas como lidas'), findsNothing);
      },
    );

    testWidgets(
      'mark all the read: some the highlight, the button and the badge; open the item does not marks nothing',
      (tester) async {
        final repo = FakeNotificationsRepository(mixed());
        final h = await open(tester, mixed(), repo: repo);
        await tapAndSettle(tester, find.textContaining('beto curtiu'));
        expect(
          repo.markCalls,
          0,
          reason: 'abrir uma notificação não é "ler todas"',
        );
        await tester.binding.handlePopRoute();
        await tester.pumpAndSettle();

        await tapAndSettle(tester, find.byTooltip('Marcar todas como lidas'));
        expect(repo.markCalls, 1);
        expect(find.byIcon(Icons.circle), findsNothing);
        expect(find.byTooltip('Marcar todas como lidas'), findsNothing);
        await tester.binding.handlePopRoute();
        await tester.pumpAndSettle();
        expect(
          find.byType(Badge),
          findsNothing,
          reason: 'o selo do sino zerou',
        );
        expect(h.notifications.markCalls, 1);
      },
    );

    testWidgets('fails to the mark returns to the state previous and warns', (
      tester,
    ) async {
      final repo = FakeNotificationsRepository(mixed())
        ..markError = const NetworkException();
      await open(tester, mixed(), repo: repo);
      await tapAndSettle(tester, find.byTooltip('Marcar todas como lidas'));
      expect(find.textContaining('Sem conexão'), findsOneWidget);
      expect(
        find.byIcon(Icons.circle),
        findsNWidgets(2),
        reason: 'continuam não lidas',
      );
      expect(find.byTooltip('Marcar todas como lidas'), findsOneWidget);
    });

    testWidgets('like and comment open the post; follower opens the profile', (
      tester,
    ) async {
      final h = AppHarness(
        notifications: FakeNotificationsRepository(mixed()),
        feed: FakeFeedRepository()
          ..posts['p1'] = fakePost(id: 'p1', content: 'Meu post de teste'),
        profiles: FakeProfilesRepository()
          ..profiles['u-cris'] = fakeProfile(
            id: 'u-cris',
            username: 'cris',
            name: 'Cris',
          ),
      );
      await h.pump(tester);
      await tapAndSettle(tester, find.byTooltip(RegExp('Notificações')));
      await tapAndSettle(tester, find.textContaining('curtiu seu post'));
      expect(find.text('Meu post de teste'), findsOneWidget);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();

      await tapAndSettle(tester, find.textContaining('começou a seguir você'));
      expect(find.text('@cris'), findsOneWidget);
    });

    testWidgets('with 50 items warns that shows only the more recent', (
      tester,
    ) async {
      await open(
        tester,
        notificationsOf([
          for (var i = 0; i < 50; i++) fakeNotification('n$i', read: true),
        ]),
      );
      await tester.drag(find.byType(Scrollable).last, const Offset(0, -20000));
      await tester.pumpAndSettle();
      expect(find.text('Mostrando as 50 mais recentes.'), findsOneWidget);
    });

    testWidgets('error to the load is not list empty and allows try of new', (
      tester,
    ) async {
      final repo = FakeNotificationsRepository(mixed())
        ..listError = const NetworkException();
      final h = AppHarness(notifications: repo);
      await h.pump(tester);
      await goTo(tester, '/notifications');
      expect(find.textContaining('Sem conexão'), findsOneWidget);
      expect(find.text('Sem notificações'), findsNothing);
      repo.listError = null;
      await tapAndSettle(tester, find.text('Tentar de novo'));
      expect(find.textContaining('curtiu seu post'), findsOneWidget);
    });

    testWidgets('layout the 360 px with text 200% does not overflows', (
      tester,
    ) async {
      final h = AppHarness(notifications: FakeNotificationsRepository(mixed()));
      await h.pump(tester, size: const Size(360, 800), textScale: 2.0);
      await goTo(tester, '/notifications');
      expect(tester.takeException(), isNull);
    });
  });
}
