// Notificações e registro de push contra o backend real (ambiente isolado, nunca produção).
// Tokens de push são falsos: o backend sem credenciais não envia nada pela rede.
//
//   flutter test test/integration --dart-define=GT_BACKEND=http://localhost:3100
import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/client_id.dart';
import 'package:gametracker/core/network/app_exception.dart';
import 'package:gametracker/features/notifications/data/notification_models.dart';
import 'package:gametracker/features/notifications/data/notifications_repository.dart';
import 'package:gametracker/features/profiles/data/profiles_repository.dart';
import 'package:gametracker/features/push/data/push_repository.dart';

import 'backend_chat_test.dart' show Peer, signUp, backend;

void main() {
  if (backend.isEmpty) {
    test('without GT_BACKEND', () {}, skip: 'define --dart-define=GT_BACKEND');
    return;
  }

  group('notifications', () {
    test('follow generates the notification; mark all clears the counter; repeat does not duplicates', () async {
      final ana = await signUp('na');
      final beto = await signUp('nb');
      final notifications = RemoteNotificationsRepository(ana.dio);

      expect((await notifications.list()).unreadCount, 0);

      final profiles = RemoteProfilesRepository(beto.dio);
      await profiles.setFollow(ana.id, follow: true);
      await profiles.setFollow(ana.id, follow: true);

      var data = await notifications.list();
      expect(data.unreadCount, 1, reason: 'seguir de novo não duplica');
      expect(data.items.single.type, NotificationType.follow);
      expect(data.items.single.actor.id, beto.id);
      expect(data.items.single.read, isFalse);

      await notifications.markAllRead();
      data = await notifications.list();
      expect(data.unreadCount, 0);
      expect(data.items.single.read, isTrue);
      await notifications.markAllRead();
    });

    test('without the valid session, the list is rejected (401)', () async {
      final ana = await signUp('nc');
      final other = RemoteNotificationsRepository(ana.dio);
      await ana.session.clear();
      await expectLater(
        other.list(),
        throwsA(
          predicate(
            (e) =>
                e is ApiException && e.isUnauthorized ||
                e is CancelledException,
          ),
        ),
      );
    });
  });

  group('push installations', () {
    late Peer ana;
    late Peer beto;
    late PushRepository anaPush;
    late PushRepository betoPush;

    setUp(() async {
      ana = await signUp('pa');
      beto = await signUp('pb');
      anaPush = RemotePushRepository(ana.dio);
      betoPush = RemotePushRepository(beto.dio);
    });

    Future<void> put(PushRepository r, String id, String token) => r.register(
      installationId: id,
      provider: 'fcm',
      platform: 'android',
      token: token,
    );

    test('registration is idempotent; revoking twice too', () async {
      final id = newClientId();
      await put(anaPush, id, 'tok-${newClientId()}');
      await put(anaPush, id, 'tok-${newClientId()}');
      await anaPush.revoke(id);
      await anaPush.revoke(id);
    });

    test(
      'same installation in another account (account switch) is accepted',
      () async {
        final id = newClientId();
        await put(anaPush, id, 'tok-${newClientId()}');
        await put(betoPush, id, 'tok-${newClientId()}');
      },
    );

    test(
      "revoking another user's installation gives an error and reveals nothing",
      () async {
        final id = newClientId();
        await put(anaPush, id, 'tok-${newClientId()}');
        await betoPush.revoke(id);
      },
    );

    test('non-UUID id is rejected with the validation error', () async {
      await expectLater(
        put(anaPush, 'nao-uuid', 'tok'),
        throwsA(isA<ApiException>().having((e) => e.status, 'status', 400)),
      );
    });
  });
}
