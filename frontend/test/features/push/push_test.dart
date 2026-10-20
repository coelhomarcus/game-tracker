import 'dart:async';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/app/providers.dart';
import 'package:gametracker/core/network/app_exception.dart';
import 'package:gametracker/features/auth/data/auth_repository.dart';
import 'package:gametracker/features/notifications/application/notifications_controller.dart';
import 'package:gametracker/features/push/application/push_controller.dart';
import 'package:gametracker/features/push/application/push_destination.dart';
import 'package:gametracker/features/push/data/push_platform.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../support/fake_auth.dart';
import '../../support/fake_feed.dart';
import '../../support/fake_notifications.dart';
import '../../support/fake_push.dart';
import '../../support/fixtures.dart';
import '../../support/harness.dart';

const _post = '11111111-1111-4111-8111-111111111111';
const _actor = '22222222-2222-4222-8222-222222222222';
const _conversation = '33333333-3333-4333-8333-333333333333';

class Rig {
  Rig({FakePushPlatform? platform, bool signedIn = true})
    : platform = platform ?? FakePushPlatform() {
    auth = FakeAuthRepository()
      ..restoreResult = signedIn ? Restored(fakeUser()) : const SignedOut();
    notifications = FakeNotificationsRepository();
    push = FakePushRepository();
  }

  final FakePushPlatform platform;
  late final FakeAuthRepository auth;
  late final FakeNotificationsRepository notifications;
  late final FakePushRepository push;
  DateTime now = DateTime.utc(2026, 6, 1, 12);
  late final ProviderContainer container;

  Future<void> start() async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    container = ProviderContainer(
      retry: noAutomaticRetry,
      overrides: [
        ...fakeAuthOverrides(auth),
        notificationsRepositoryProvider.overrideWithValue(notifications),
        pushPlatformProvider.overrideWithValue(platform),
        pushRepositoryProvider.overrideWithValue(push),
        sharedPreferencesProvider.overrideWithValue(prefs),
        clockProvider.overrideWithValue(() => now),
      ],
    );
    container.listen(sessionControllerProvider, (_, _) {});
    container.listen(pushControllerProvider, (_, _) {});
    container.listen(pendingPushRouteProvider, (_, _) {});
    await settle();
  }

  Future<void> settle() => pumpEventQueue(times: 50);

  PushStatus get status => container.read(pushControllerProvider);
  String? get pendingRoute => container.read(pendingPushRouteProvider);
  PushController get controller =>
      container.read(pushControllerProvider.notifier);
}

Future<Rig> rig({FakePushPlatform? platform, bool signedIn = true}) async {
  final r = Rig(platform: platform, signedIn: signedIn);
  await r.start();
  addTearDown(r.container.dispose);
  return r;
}

void main() {
  group('resolvePushRoute', () {
    Map<String, String> d(Map<String, String> extra) => {
      'recipientId': 'u1',
      ...extra,
    };

    test('like and comment open the post; follower opens the profile; message opens the conversation', () {
      expect(
        resolvePushRoute(d({'type': 'like', 'postId': _post}), userId: 'u1'),
        '/posts/$_post',
      );
      expect(
        resolvePushRoute(d({'type': 'comment', 'postId': _post}), userId: 'u1'),
        '/posts/$_post',
      );
      expect(
        resolvePushRoute(
          d({'type': 'follow', 'actorId': _actor}),
          userId: 'u1',
        ),
        '/users/$_actor',
      );
      expect(
        resolvePushRoute(
          d({'type': 'message', 'conversationId': _conversation}),
          userId: 'u1',
        ),
        '/messages/$_conversation',
      );
    });

    test(
      'push from another account or without the session does not opens nothing',
      () {
        final data = d({'type': 'like', 'postId': _post});
        expect(resolvePushRoute(data, userId: 'u2'), isNull);
        expect(resolvePushRoute(data, userId: null), isNull);
        expect(
          resolvePushRoute({'type': 'like', 'postId': _post}, userId: 'u1'),
          isNull,
        );
      },
    );

    test('id invalid never becomes path: lands on the center (or nothing, for message)', () {
      for (final bad in [
        '../admin',
        '$_post/../x',
        'abc',
        '',
        '$_post?x=1',
        'https://evil.test',
      ]) {
        expect(
          resolvePushRoute(d({'type': 'like', 'postId': bad}), userId: 'u1'),
          '/notifications',
          reason: bad,
        );
        expect(
          resolvePushRoute(d({'type': 'follow', 'actorId': bad}), userId: 'u1'),
          '/notifications',
          reason: bad,
        );
        expect(
          resolvePushRoute(
            d({'type': 'message', 'conversationId': bad}),
            userId: 'u1',
          ),
          isNull,
          reason: bad,
        );
      }
      expect(
        resolvePushRoute(d({'type': 'like'}), userId: 'u1'),
        '/notifications',
      );
    });

    test('unknown type (backend newest) is ignored', () {
      expect(
        resolvePushRoute(d({'type': 'repost', 'postId': _post}), userId: 'u1'),
        isNull,
      );
      expect(resolvePushRoute(d({}), userId: 'u1'), isNull);
    });

    test('the payload real from the backend (contract) is understood', () {
      final body = fixtureBody('push_payloads')! as Map<String, dynamic>;
      for (final entry in body.entries) {
        final data = (entry.value as Map<String, dynamic>).map(
          (k, v) => MapEntry(k, '$v'),
        );
        expect(
          resolvePushRoute(data, userId: data['recipientId']),
          isNotNull,
          reason: entry.key,
        );
      }
    });
  });

  group('entry', () {
    test(
      'with permission granted registers the device and stays active',
      () async {
        final r = await rig();
        expect(r.status, PushStatus.on);
        expect(r.push.registered.length, 1);
        final reg = r.push.registered.single;
        expect(reg.provider, 'fcm');
        expect(reg.platform, 'android');
        expect(reg.token, 'fcm-token-1');
        expect(reg.installationId, matches(RegExp(r'^[0-9a-f-]{36}$')));
      },
    );

    test(
      'without the session does not registers; registers to the enter',
      () async {
        final r = await rig(signedIn: false);
        expect(r.push.registered, isEmpty);
        r.auth.nextUser = fakeUser();
        await r.container
            .read(sessionControllerProvider.notifier)
            .login('ana', 'senha');
        await r.settle();
        expect(r.push.registered.length, 1);
        expect(r.status, PushStatus.on);
      },
    );

    test('permission still does not requested: does not registers or asks on its own', () async {
      final r = await rig(
        platform: FakePushPlatform(
          currentPermission: PushPermission.notDetermined,
        ),
      );
      expect(r.status, PushStatus.off);
      expect(r.platform.permissionRequests, 0);
      expect(r.push.registered, isEmpty);
    });

    test('enable() requests permission and registers', () async {
      final r = await rig(
        platform: FakePushPlatform(
          currentPermission: PushPermission.notDetermined,
        ),
      );
      await r.controller.enable();
      expect(r.platform.permissionRequests, 1);
      expect(r.status, PushStatus.on);
      expect(r.push.registered.length, 1);
    });

    test(
      'user rejects in the dialog: stays denied and nothing is registrado',
      () async {
        final platform = FakePushPlatform(
          currentPermission: PushPermission.notDetermined,
        )..answerOnRequest = PushPermission.denied;
        final r = await rig(platform: platform);
        await r.controller.enable();
        expect(r.status, PushStatus.denied);
        expect(r.push.registered, isEmpty);
      },
    );

    test(
      'denied in the system: status "denied" and does not asks of new',
      () async {
        final r = await rig(
          platform: FakePushPlatform(currentPermission: PushPermission.denied),
        );
        expect(r.status, PushStatus.denied);
        await r.controller.enable();
        expect(r.platform.permissionRequests, 0);
        expect(r.push.registered, isEmpty);
      },
    );

    test('fails on the server: status "failed"; returning to the app tries of new and completes', () async {
      final r = Rig();
      r.push.registerError = const NetworkException();
      await r.start();
      addTearDown(r.container.dispose);
      expect(r.status, PushStatus.failed);

      r.push.registerError = null;
      r.controller.onResume();
      await r.settle();
      expect(r.status, PushStatus.on);
      expect(r.push.registered.length, 1);
    });

    test('token unavailable: "failed", without call the server', () async {
      final r = await rig(platform: FakePushPlatform(currentToken: null));
      expect(r.status, PushStatus.failed);
      expect(r.push.registered, isEmpty);
    });

    test('token refreshed through the system is registrado of new, the same installation', () async {
      final r = await rig();
      r.platform.refreshToken('fcm-token-2');
      await r.settle();
      expect(r.push.registered.map((e) => e.token), [
        'fcm-token-1',
        'fcm-token-2',
      ]);
      expect(r.push.registered.map((e) => e.installationId).toSet().length, 1);
    });

    test(
      'returning to the app with everything correct does not repeat the entry',
      () async {
        final r = await rig();
        r.controller.onResume();
        await r.settle();
        expect(r.push.registered.length, 1);
      },
    );

    test('leave of the account during the retrieval of the token does not registers for the session wrong', () async {
      final platform = FakePushPlatform()..tokenGate = Completer<void>();
      final r = Rig(platform: platform);
      await r.start();
      addTearDown(r.container.dispose);
      await r.container.read(sessionControllerProvider.notifier).logout();
      platform.tokenGate!.complete();
      await r.settle();
      expect(r.push.registered, isEmpty);
    });

    test('without support (web or without adapter): nothing is done', () async {
      final r = await rig(platform: FakePushPlatform(supported: false));
      expect(r.status, PushStatus.unsupported);
      expect(r.push.registered, isEmpty);
      await r.container.read(sessionControllerProvider.notifier).logout();
      expect(r.push.revoked, isEmpty);
      expect(r.auth.logoutCalls, 1);
    });
  });

  group('leave and switching accounts', () {
    test('leave revokes the device before of close the session', () async {
      final r = await rig();
      r.push.revokeGate = Completer<void>();
      unawaited(r.container.read(sessionControllerProvider.notifier).logout());
      await r.settle();
      expect(r.push.revoked.length, 1);
      expect(
        r.auth.logoutCalls,
        0,
        reason: 'a revogação precisa do token de acesso',
      );
      expect(r.container.read(currentUserIdProvider), 'u1');
      r.push.revokeGate!.complete();
      await r.settle();
      expect(r.auth.logoutCalls, 1);
      expect(r.container.read(currentUserIdProvider), isNull);
      expect(r.push.revoked.single, r.push.registered.single.installationId);
    });

    test('if the revocation fails (without the network connection), the logout happens same thus', () async {
      final r = await rig();
      r.push.revokeError = const NetworkException();
      await r.container.read(sessionControllerProvider.notifier).logout();
      expect(r.auth.logoutCalls, 1);
      expect(r.container.read(currentUserIdProvider), isNull);
    });

    test('if the revocation hang, the logout waits at most 3 s', () {
      fakeAsync((async) {
        final r = Rig();
        r.push.revokeGate = Completer<void>();
        unawaited(r.start());
        async.elapse(const Duration(seconds: 1));
        var done = false;
        r.container
            .read(sessionControllerProvider.notifier)
            .logout()
            .then((_) => done = true);
        async.elapse(const Duration(seconds: 2));
        expect(done, isFalse);
        async.elapse(const Duration(seconds: 2));
        expect(done, isTrue);
        expect(r.auth.logoutCalls, 1);
        r.container.dispose();
      });
    });

    test('switching accounts in the device: same installation, new account registers of new', () async {
      final r = await rig();
      final first = r.push.registered.single.installationId;
      await r.container.read(sessionControllerProvider.notifier).logout();
      r.auth.nextUser = fakeUser('u2', 'beto');
      await r.container
          .read(sessionControllerProvider.notifier)
          .login('beto', 'senha');
      await r.settle();
      expect(r.push.registered.length, 2);
      expect(r.push.registered.last.installationId, first);
      expect(r.status, PushStatus.on);
    });
  });

  group('messages', () {
    test('push with the app open updates the center', () async {
      final r = await rig();
      r.container.listen(notificationsControllerProvider, (_, _) {});
      await r.settle();
      final before = r.notifications.listCalls;
      r.platform.receive(pushOf('like', postId: _post));
      await r.settle();
      expect(r.notifications.listCalls, before + 1);
    });

    test('push from another account with the app open is ignored', () async {
      final r = await rig();
      r.container.listen(notificationsControllerProvider, (_, _) {});
      await r.settle();
      final before = r.notifications.listCalls;
      r.platform.receive(pushOf('like', recipientId: 'u2', postId: _post));
      await r.settle();
      expect(r.notifications.listCalls, before);
    });

    test(
      'push of message does not moves in the center of notifications',
      () async {
        final r = await rig();
        r.container.listen(notificationsControllerProvider, (_, _) {});
        await r.settle();
        final before = r.notifications.listCalls;
        r.platform.receive(pushOf('message', conversationId: _conversation));
        await r.settle();
        expect(r.notifications.listCalls, before);
      },
    );

    test(
      'tap in the push requests the navigation to the destination',
      () async {
        final r = await rig();
        r.platform.open(pushOf('comment', postId: _post));
        await r.settle();
        expect(r.pendingRoute, '/posts/$_post');
      },
    );

    test('tap in the push from another account does not navigate', () async {
      final r = await rig();
      r.platform.open(pushOf('comment', recipientId: 'u2', postId: _post));
      await r.settle();
      expect(r.pendingRoute, isNull);
    });

    test(
      'push tapped before the session ser restored waits and navigates after',
      () async {
        final r = await rig(signedIn: false);
        r.platform.open(pushOf('follow', actorId: _actor));
        await r.settle();
        expect(r.pendingRoute, isNull);
        r.auth.nextUser = fakeUser();
        await r.container
            .read(sessionControllerProvider.notifier)
            .login('ana', 'senha');
        await r.settle();
        expect(r.pendingRoute, '/users/$_actor');
      },
    );

    test('push stored there is more of 2 minutes is discarded', () async {
      final r = await rig(signedIn: false);
      r.platform.open(pushOf('follow', actorId: _actor));
      await r.settle();
      r.now = r.now.add(const Duration(minutes: 3));
      r.auth.nextUser = fakeUser();
      await r.container
          .read(sessionControllerProvider.notifier)
          .login('ana', 'senha');
      await r.settle();
      expect(r.pendingRoute, isNull);
    });

    test(
      'push stored for the account does not opens nothing in another account',
      () async {
        final r = await rig(signedIn: false);
        r.platform.open(pushOf('follow', actorId: _actor));
        await r.settle();
        r.auth.nextUser = fakeUser('u2', 'beto');
        await r.container
            .read(sessionControllerProvider.notifier)
            .login('beto', 'senha');
        await r.settle();
        expect(r.pendingRoute, isNull);
      },
    );

    test(
      'notification that opened the app of the zero is handled the single time',
      () async {
        final platform = FakePushPlatform()
          ..initial = pushOf('like', postId: _post);
        final r = await rig(platform: platform);
        expect(r.pendingRoute, '/posts/$_post');
        r.container.read(pendingPushRouteProvider.notifier).set(null);
        await r.container.read(sessionControllerProvider.notifier).logout();
        r.auth.nextUser = fakeUser();
        await r.container
            .read(sessionControllerProvider.notifier)
            .login('ana', 'senha');
        await r.settle();
        expect(
          r.pendingRoute,
          isNull,
          reason: 'não reabre o mesmo push depois',
        );
        expect(platform.initialCalls, 1);
      },
    );
  });

  group('installation', () {
    test('the id is generated the time and persisted', () async {
      final r = await rig();
      final prefs = r.container.read(sharedPreferencesProvider);
      expect(
        savedInstallationId(prefs),
        r.push.registered.single.installationId,
      );
      expect(r.controller.installationId(), savedInstallationId(prefs));
    });
  });

  group('screen and navigation', () {
    testWidgets('tap in the push opens the post by top of the screen current', (
      tester,
    ) async {
      final platform = FakePushPlatform();
      final h = AppHarness(
        pushPlatform: platform,
        feed: FakeFeedRepository()
          ..posts[_post] = fakePost(id: _post, content: 'Post do push'),
      );
      await h.pump(tester);
      platform.open(pushOf('like', postId: _post));
      await tester.pumpAndSettle();
      expect(find.text('Post do push'), findsOneWidget);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('Post do push'), findsNothing);
    });

    testWidgets(
      'notification that opened the app opens destination after restore the session',
      (tester) async {
        final platform = FakePushPlatform()
          ..initial = pushOf('like', postId: _post);
        final h = AppHarness(
          pushPlatform: platform,
          feed: FakeFeedRepository()
            ..posts[_post] = fakePost(id: _post, content: 'Post do push'),
        );
        await h.pump(tester);
        expect(find.text('Post do push'), findsOneWidget);
      },
    );

    testWidgets(
      'push from another account with the app open does not navigate',
      (tester) async {
        final platform = FakePushPlatform();
        final h = AppHarness(pushPlatform: platform);
        await h.pump(tester);
        platform.open(pushOf('like', recipientId: 'u2', postId: _post));
        await tester.pumpAndSettle();
        expect(find.byType(NavigationBar), findsOneWidget);
      },
    );

    testWidgets(
      'settings: without support explains where see the notifications',
      (tester) async {
        final h = AppHarness();
        await h.pump(tester);
        await goTo(tester, '/settings');
        expect(
          find.text(
            'As notificações aparecem na central com o app aberto. '
            'Avisos com o app fechado não estão disponíveis nesta versão.',
          ),
          findsOneWidget,
        );
        expect(find.text('Ativar'), findsNothing);
      },
    );

    testWidgets(
      'settings: enable requests permission and passes the "Enabled"',
      (tester) async {
        final platform = FakePushPlatform(
          currentPermission: PushPermission.notDetermined,
        );
        final h = AppHarness(pushPlatform: platform);
        await h.pump(tester);
        await goTo(tester, '/settings');
        expect(find.text('Desativadas neste aparelho.'), findsOneWidget);
        await tapAndSettle(tester, find.text('Ativar'));
        expect(find.text('Ativadas neste aparelho.'), findsOneWidget);
        expect(h.push.registered.length, 1);
        expect(find.text('Ativar'), findsNothing);
      },
    );

    testWidgets('settings: denied shows the reason and the resolver', (
      tester,
    ) async {
      final h = AppHarness(
        pushPlatform: FakePushPlatform(
          currentPermission: PushPermission.denied,
        ),
      );
      await h.pump(tester);
      await goTo(tester, '/settings');
      expect(
        find.textContaining('Bloqueadas nas configurações do sistema'),
        findsOneWidget,
      );
    });

    testWidgets('settings: fails of entry offers try of new', (tester) async {
      final push = FakePushRepository()
        ..registerError = const NetworkException();
      final h = AppHarness(pushPlatform: FakePushPlatform(), push: push);
      await h.pump(tester);
      await goTo(tester, '/settings');
      expect(
        find.textContaining('Não foi possível ativar agora'),
        findsOneWidget,
      );
      push.registerError = null;
      await tapAndSettle(tester, find.text('Tentar de novo'));
      expect(find.text('Ativadas neste aparelho.'), findsOneWidget);
    });

    testWidgets(
      'leave by settings revokes the device and returns to the login',
      (tester) async {
        final h = AppHarness(pushPlatform: FakePushPlatform());
        await h.pump(tester);
        await goTo(tester, '/settings');
        await tapSignOut(tester);
        expect(h.push.revoked.length, 1);
        expect(h.auth.logoutCalls, 1);
      },
    );

    testWidgets('layout the 360 px with text 200% does not overflows', (
      tester,
    ) async {
      final h = AppHarness(
        pushPlatform: FakePushPlatform(
          currentPermission: PushPermission.denied,
        ),
      );
      await h.pump(tester, size: const Size(360, 800), textScale: 2.0);
      await goTo(tester, '/settings');
      expect(tester.takeException(), isNull);
    });
  });
}
