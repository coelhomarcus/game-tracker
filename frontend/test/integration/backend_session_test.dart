// Prova a sessão contra o backend real (ambiente isolado, nunca produção).
//
//   flutter test test/integration --dart-define=GT_BACKEND=http://localhost:3100
//
// Sem GT_BACKEND os testes são ignorados, então `flutter test` e a CI seguem rápidos.
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/network/api_client.dart';
import 'package:gametracker/core/network/app_exception.dart';
import 'package:gametracker/core/network/session_manager.dart';
import 'package:gametracker/core/storage/token_store.dart';
import 'package:gametracker/features/auth/data/auth_api.dart';
import 'package:gametracker/features/auth/data/auth_repository.dart';

const backend = String.fromEnvironment('GT_BACKEND');

void main() {
  final skip = backend.isEmpty
      ? 'defina --dart-define=GT_BACKEND=http://localhost:3100'
      : null;

  late MemoryTokenStore store;
  late AuthApi api;
  late SessionManager session;
  late Dio apiDio;
  late RemoteAuthRepository repo;
  var expired = 0;

  setUp(() {
    expired = 0;
    store = MemoryTokenStore();
    api = AuthApi(createAuthDio(baseUrl: '$backend/api'));
    session = SessionManager(store: store, refreshCall: api.refresh)
      ..onExpired = () => expired++;
    apiDio = createApiDio(session, baseUrl: '$backend/api');
    repo = RemoteAuthRepository(api: api, session: session, apiDio: apiDio);
  });

  String suffix() => DateTime.now().microsecondsSinceEpoch.toRadixString(36);

  test('signup, login and errors of the envelope real', skip: skip, () async {
    final s = suffix();
    final user = await repo.register(
      name: 'Integração',
      username: 'int_$s',
      email: 'int_$s@example.test',
      password: 'senha-fixture-123',
    );
    expect(user.username, 'int_$s');
    expect(session.hasAccessToken, isTrue);
    expect(await store.read(), isNotNull);

    await expectLater(
      repo.register(
        name: 'Integração',
        username: 'int_$s',
        email: 'int_$s@example.test',
        password: 'senha-fixture-123',
      ),
      throwsA(isA<ApiException>().having((e) => e.status, 'status', 409)),
    );
    await expectLater(
      api.login('int_$s', 'senha-errada'),
      throwsA(
        isA<ApiException>().having(
          (e) => e.code,
          'code',
          'invalid_credentials',
        ),
      ),
    );
  });

  test(
    'multiple simultaneous 401 responses: one refresh, all calls succeed',
    skip: skip,
    () async {
      final s = suffix();
      final registered = await api.register(
        name: 'Concorrência',
        username: 'conc_$s',
        email: 'conc_$s@example.test',
        password: 'senha-fixture-123',
      );
      // Access token inválido (como se tivesse expirado) + refresh token real.
      await session.start(
        SessionTokens(
          accessToken: 'expirado',
          refreshToken: registered.tokens.refreshToken,
        ),
      );

      final results = await Future.wait([
        for (var i = 0; i < 8; i++)
          apiDio.get<Map<String, dynamic>>('/auth/me'),
      ]);

      expect(results.every((r) => r.statusCode == 200), isTrue);
      expect(results.first.data!['username'], 'conc_$s');
      expect(
        expired,
        0,
        reason: 'um segundo refresh com o mesmo token teria expirado a sessão',
      );
      expect(session.accessToken, isNot('expirado'));
      expect(
        await store.read(),
        isNot(registered.tokens.refreshToken),
        reason: 'refresh token rotacionado',
      );
    },
  );

  test(
    'restoration: valid session, then logout revokes it on the server',
    skip: skip,
    () async {
      final s = suffix();
      await repo.register(
        name: 'Restore',
        username: 'rest_$s',
        email: 'rest_$s@example.test',
        password: 'senha-fixture-123',
      );
      final saved = await store.read();

      // Novo "processo": só o refresh token guardado sobrevive.
      final store2 = MemoryTokenStore(saved);
      final session2 = SessionManager(store: store2, refreshCall: api.refresh);
      final repo2 = RemoteAuthRepository(
        api: api,
        session: session2,
        apiDio: createApiDio(session2, baseUrl: '$backend/api'),
      );
      final restored = await repo2.restore();
      expect(restored, isA<Restored>());
      expect((restored as Restored).user.username, 'rest_$s');

      await repo2.logout();
      await Future<void>.delayed(const Duration(milliseconds: 300));
      expect(await store2.read(), isNull);

      // O token antigo foi revogado de verdade no servidor.
      await expectLater(
        api.refresh(saved!),
        throwsA(
          isA<ApiException>().having(
            (e) => e.code,
            'code',
            'invalid_refresh_token',
          ),
        ),
      );
    },
  );

  test(
    'refresh token revoked: restore returns SignedOut and clears the storage',
    skip: skip,
    () async {
      final s = suffix();
      final registered = await api.register(
        name: 'Revogado',
        username: 'rev_$s',
        email: 'rev_$s@example.test',
        password: 'senha-fixture-123',
      );
      await api.logout(registered.tokens.refreshToken);
      await store.write(registered.tokens.refreshToken);

      expect(await repo.restore(), isA<SignedOut>());
      expect(await store.read(), isNull);
      expect(expired, 1);
    },
  );

  test(
    'unreachable server: unavailable restoration preserves the token',
    skip: skip,
    () async {
      final dead = AuthApi(createAuthDio(baseUrl: 'http://127.0.0.1:1/api'));
      final store3 = MemoryTokenStore('qualquer.token');
      final session3 = SessionManager(store: store3, refreshCall: dead.refresh);
      final repo3 = RemoteAuthRepository(
        api: dead,
        session: session3,
        apiDio: createApiDio(session3, baseUrl: 'http://127.0.0.1:1/api'),
      );

      expect(await repo3.restore(), isA<RestoreUnavailable>());
      expect(await store3.read(), 'qualquer.token');
    },
  );
}
