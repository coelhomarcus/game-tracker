import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/app/providers.dart';
import 'package:gametracker/core/network/app_exception.dart';
import 'package:gametracker/features/auth/data/auth_repository.dart';
import 'package:gametracker/features/auth/presentation/session_state.dart';

import '../../support/fake_auth.dart';

ProviderContainer makeContainer(FakeAuthRepository repo) {
  final c = ProviderContainer(
    retry: noAutomaticRetry,
    overrides: fakeAuthOverrides(repo),
  );
  addTearDown(c.dispose);
  return c;
}

Future<SessionState> settle(ProviderContainer c) async {
  c.read(sessionControllerProvider);
  await Future<void>.delayed(Duration.zero);
  await Future<void>.delayed(Duration.zero);
  return c.read(sessionControllerProvider);
}

void main() {
  group('bootstrap', () {
    test('starts initializing and restores the session', () async {
      final repo = FakeAuthRepository()..restoreResult = Restored(fakeUser());
      final c = makeContainer(repo);
      expect(c.read(sessionControllerProvider), isA<SessionInitializing>());
      final state = await settle(c);
      expect(state, isA<SessionAuthenticated>());
      expect((state as SessionAuthenticated).user.id, 'u1');
    });

    test(
      'without the session stored goes for does not authenticated',
      () async {
        final c = makeContainer(FakeAuthRepository());
        expect(await settle(c), isA<SessionUnauthenticated>());
      },
    );

    test('unavailable network does not log out and allows retry', () async {
      final repo = FakeAuthRepository()
        ..restoreResult = const RestoreUnavailable();
      final c = makeContainer(repo);
      expect(await settle(c), isA<SessionRestoreUnavailable>());

      repo.restoreResult = Restored(fakeUser());
      await c.read(sessionControllerProvider.notifier).bootstrap();
      expect(c.read(sessionControllerProvider), isA<SessionAuthenticated>());
      expect(repo.restoreCalls, 2);
    });
  });

  group('actions', () {
    test('login with success authenticates', () async {
      final repo = FakeAuthRepository();
      final c = makeContainer(repo);
      await settle(c);
      await c
          .read(sessionControllerProvider.notifier)
          .login('ana', 'senha-longa');
      expect(c.read(sessionControllerProvider), isA<SessionAuthenticated>());
    });

    test('login rejected propaga the error and keeps the state', () async {
      final repo = FakeAuthRepository()
        ..loginError = const ApiException(
          401,
          'invalid_credentials',
          'Credenciais inválidas',
        );
      final c = makeContainer(repo);
      await settle(c);
      await expectLater(
        c.read(sessionControllerProvider.notifier).login('ana', 'errada'),
        throwsA(isA<ApiException>()),
      );
      expect(c.read(sessionControllerProvider), isA<SessionUnauthenticated>());
    });

    test('logout ends the session and calls the repository', () async {
      final repo = FakeAuthRepository()..restoreResult = Restored(fakeUser());
      final c = makeContainer(repo);
      await settle(c);
      await c.read(sessionControllerProvider.notifier).logout();
      expect(c.read(sessionControllerProvider), isA<SessionUnauthenticated>());
      expect(repo.logoutCalls, 1);
    });

    test('refresh rejected during the use returns to the login', () async {
      final repo = FakeAuthRepository()..restoreResult = Restored(fakeUser());
      final c = makeContainer(repo);
      await settle(c);
      c.read(sessionManagerProvider).onExpired!();
      expect(c.read(sessionControllerProvider), isA<SessionUnauthenticated>());
    });
  });

  group('isolation between accounts', () {
    test(
      'derived session state is discarded on logout and account switch',
      () async {
        final repo = FakeAuthRepository()
          ..restoreResult = Restored(fakeUser('u1', 'ana'));
        final c = makeContainer(repo);
        final created = <String?>[];
        final userData = Provider<Object>((ref) {
          created.add(ref.watch(currentUserIdProvider));
          return Object();
        });

        await settle(c);
        final first = c.read(userData);
        expect(c.read(currentUserIdProvider), 'u1');

        await c.read(sessionControllerProvider.notifier).logout();
        final afterLogout = c.read(userData);
        expect(
          identical(first, afterLogout),
          isFalse,
          reason: 'dados da conta anterior descartados',
        );

        repo.nextUser = fakeUser('u2', 'beto');
        await c
            .read(sessionControllerProvider.notifier)
            .login('beto', 'senha-longa');
        final second = c.read(userData);
        expect(identical(afterLogout, second), isFalse);
        expect(created, ['u1', null, 'u2']);
      },
    );
  });
}
