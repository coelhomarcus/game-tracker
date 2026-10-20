import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/network/api_client.dart';
import 'package:gametracker/core/network/app_exception.dart';
import 'package:gametracker/core/network/session_manager.dart';
import 'package:gametracker/core/storage/token_store.dart';

import '../support/fake_api.dart';

/// Servidor falso com a regra do backend: access token expirado → 401; refresh
/// token de uso único.
class Harness {
  Harness({String refreshToken = 'r0', this.accessValid = 'a1'})
    : store = MemoryTokenStore(refreshToken) {
    session = SessionManager(store: store, refreshCall: _refresh);
    session.onExpired = () => expired++;
    adapter = FakeAdapter(_handle);
    dio = createApiDio(session, baseUrl: 'http://fake', adapter: adapter);
  }

  final MemoryTokenStore store;
  late final SessionManager session;
  late final FakeAdapter adapter;
  late final Dio dio;

  /// Access token que o servidor aceita agora.
  String accessValid;
  int refreshCalls = 0;
  int expired = 0;
  int _next = 2;

  /// Se definido, o refresh só termina quando o completer for resolvido.
  Completer<void>? refreshGate;

  /// Se definido, o refresh falha com esta exceção.
  AppException? refreshFailure;

  /// Se verdadeiro, o servidor responde 401 mesmo com token novo.
  bool alwaysUnauthorized = false;

  Future<SessionTokens> _refresh(String refreshToken) async {
    refreshCalls++;
    await refreshGate?.future;
    final failure = refreshFailure;
    if (failure != null) throw failure;
    accessValid = 'a$_next';
    return SessionTokens(accessToken: accessValid, refreshToken: 'r${_next++}');
  }

  Future<ResponseBody> _handle(RequestOptions o) async {
    final auth = o.headers['Authorization'];
    if (o.path == '/slow') {
      await Future<void>.delayed(const Duration(milliseconds: 30));
    }
    if (alwaysUnauthorized || auth != 'Bearer $accessValid') {
      return errorResponse(401, 'unauthorized', 'Token inválido');
    }
    return jsonResponse(200, {'ok': true, 'auth': auth});
  }

  int hits(String path) => adapter.requests.where((r) => r.path == path).length;
}

void main() {
  group('refresh in 401', () {
    test('multiple simultaneous 401 responses trigger the single refresh and all are repeated', () async {
      final h = Harness();
      await h.session.start(
        const SessionTokens(accessToken: 'velho', refreshToken: 'r0'),
      );
      h.refreshGate = Completer<void>();

      final calls = [for (var i = 0; i < 5; i++) h.dio.get<dynamic>('/data$i')];
      await Future<void>.delayed(const Duration(milliseconds: 20));
      h.refreshGate!.complete();
      final results = await Future.wait(calls);

      expect(h.refreshCalls, 1);
      expect(results.every((r) => r.statusCode == 200), isTrue);
      expect(results.first.data['auth'], 'Bearer a2');
      for (var i = 0; i < 5; i++) {
        expect(
          h.hits('/data$i'),
          2,
          reason: 'uma tentativa original e uma repetição',
        );
      }
      expect(await h.store.read(), 'r2');
    });

    test('request that failed with token old does not refreshes of new if another already refreshed', () async {
      final h = Harness();
      await h.session.start(
        const SessionTokens(accessToken: 'velho', refreshToken: 'r0'),
      );
      final slow = h.dio.get<dynamic>('/slow');
      await Future<void>.delayed(const Duration(milliseconds: 5));
      final fast = h.dio.get<dynamic>('/fast');
      await Future.wait([slow, fast]);
      expect(h.refreshCalls, 1);
    });

    test(
      'repeats at most the time, same that the server continue rejecting',
      () async {
        final h = Harness()..alwaysUnauthorized = true;
        await h.session.start(
          const SessionTokens(accessToken: 'velho', refreshToken: 'r0'),
        );
        await expectLater(
          h.dio.get<dynamic>('/data'),
          throwsA(isA<DioException>()),
        );
        expect(h.hits('/data'), 2);
        expect(h.refreshCalls, 1);
      },
    );

    test(
      'refresh rejected clears the session and warns the single time',
      () async {
        final h = Harness()
          ..refreshFailure = const ApiException(
            401,
            'invalid_refresh_token',
            'inválido',
          );
        await h.session.start(
          const SessionTokens(accessToken: 'velho', refreshToken: 'r0'),
        );
        final calls = [
          for (var i = 0; i < 3; i++)
            h.dio
                .get<dynamic>('/data$i')
                .catchError(
                  (_) =>
                      Response(requestOptions: RequestOptions(), statusCode: 0),
                ),
        ];
        await Future.wait(calls);
        expect(h.expired, 1);
        expect(h.session.accessToken, isNull);
        expect(await h.store.read(), isNull);
        expect(h.refreshCalls, 1, reason: 'sem loop de refresh');
      },
    );

    test(
      'network unavailable in the refresh preserves the credentials',
      () async {
        final h = Harness()..refreshFailure = const NetworkException();
        await h.session.start(
          const SessionTokens(accessToken: 'velho', refreshToken: 'r0'),
        );
        await expectLater(
          h.dio.get<dynamic>('/data'),
          throwsA(isA<DioException>()),
        );
        expect(h.expired, 0);
        expect(await h.store.read(), 'r0');
      },
    );

    test('error that is not 401 does not triggers refresh', () async {
      final h = Harness();
      h.accessValid = 'a1';
      await h.session.start(
        const SessionTokens(accessToken: 'a1', refreshToken: 'r0'),
      );
      final r = await h.dio.get<dynamic>('/data');
      expect(r.statusCode, 200);
      expect(h.refreshCalls, 0);
    });
  });

  group('logout and switches of account', () {
    test(
      'logout during the refresh: result late does not restores the account',
      () async {
        final h = Harness();
        await h.session.start(
          const SessionTokens(accessToken: 'velho', refreshToken: 'r0'),
        );
        h.refreshGate = Completer<void>();
        final call = h.dio
            .get<dynamic>('/data')
            .then<Object?>((r) => r, onError: (Object e) => e);
        await Future<void>.delayed(const Duration(milliseconds: 20));

        await h.session.clear();
        h.refreshGate!.complete();
        final result = await call;

        expect(result, isA<DioException>());
        expect((result as DioException).type, DioExceptionType.cancel);
        expect(h.session.accessToken, isNull);
        expect(
          await h.store.read(),
          isNull,
          reason: 'refresh tardio não regrava o token',
        );
        expect(h.expired, 0);
      },
    );

    test('reply that arrives after of the logout is discarded', () async {
      final h = Harness();
      h.accessValid = 'a1';
      await h.session.start(
        const SessionTokens(accessToken: 'a1', refreshToken: 'r0'),
      );
      final call = h.dio
          .get<dynamic>('/slow')
          .then<Object?>((r) => r, onError: (Object e) => e);
      await Future<void>.delayed(const Duration(milliseconds: 5));
      await h.session.clear();
      final result = await call;
      expect(result, isA<DioException>());
      expect((result as DioException).type, DioExceptionType.cancel);
    });

    test(
      'start from another account invalidates requests of the previous',
      () async {
        final h = Harness();
        h.accessValid = 'a1';
        await h.session.start(
          const SessionTokens(accessToken: 'a1', refreshToken: 'r0'),
        );
        final call = h.dio
            .get<dynamic>('/slow')
            .then<Object?>((r) => r, onError: (Object e) => e);
        await Future<void>.delayed(const Duration(milliseconds: 5));
        await h.session.start(
          const SessionTokens(accessToken: 'b1', refreshToken: 'rb'),
        );
        expect(await call, isA<DioException>());
        expect(h.session.accessToken, 'b1');
        expect(await h.store.read(), 'rb');
      },
    );

    test(
      'clear returns the refresh token previous for revocation remote',
      () async {
        final h = Harness();
        await h.session.start(
          const SessionTokens(accessToken: 'a1', refreshToken: 'r7'),
        );
        expect(await h.session.clear(), 'r7');
        expect(await h.session.clear(), isNull);
      },
    );
  });

  group('restore (bootstrap)', () {
    test('without token stored', () async {
      final h = Harness();
      await h.store.clear();
      expect(await h.session.restore(), RefreshOutcome.noSession);
    });

    test('token valid restores the session', () async {
      final h = Harness();
      expect(await h.session.restore(), RefreshOutcome.refreshed);
      expect(h.session.accessToken, 'a2');
    });

    test('token revoked clears and signals expiration', () async {
      final h = Harness()
        ..refreshFailure = const ApiException(
          401,
          'invalid_refresh_token',
          'inválido',
        );
      expect(await h.session.restore(), RefreshOutcome.invalid);
      expect(await h.store.read(), isNull);
      expect(h.expired, 1);
    });

    test('fails of network keeps the token and allows try of new', () async {
      final h = Harness()..refreshFailure = const NetworkException();
      expect(await h.session.restore(), RefreshOutcome.unavailable);
      expect(await h.store.read(), 'r0');
      expect(h.expired, 0);

      h.refreshFailure = null;
      expect(await h.session.restore(), RefreshOutcome.refreshed);
    });

    test(
      'error 5xx also is unavailability, does not session invalid',
      () async {
        final h = Harness()
          ..refreshFailure = const ApiException(503, 'server_error', 'fora');
        expect(await h.session.restore(), RefreshOutcome.unavailable);
        expect(await h.store.read(), 'r0');
      },
    );
  });

  group('mapDioException', () {
    DioException bad(int status, Object? data) => DioException(
      requestOptions: RequestOptions(),
      type: DioExceptionType.badResponse,
      response: Response(
        requestOptions: RequestOptions(),
        statusCode: status,
        data: data,
      ),
    );

    test('envelope default', () {
      final e = mapDioException(
        bad(409, {
          'error': {'code': 'conflict', 'message': 'Username já cadastrado'},
        }),
      ) as ApiException;
      expect(
        (e.status, e.code, e.message),
        (409, 'conflict', 'Username já cadastrado'),
      );
    });

    test('rate limiter with body outside of the envelope', () {
      final e = mapDioException(
        bad(429, 'Too many requests, please try again later.'),
      ) as ApiException;
      expect(e.isRateLimited, isTrue);
      expect(e.code, 'rate_limited');
      expect(e.message, contains('Muitas tentativas'));
    });

    test('body HTML of proxy 502', () {
      final e =
          mapDioException(bad(502, '<html>Bad gateway</html>')) as ApiException;
      expect(e.isServerError, isTrue);
    });

    test('timeout and connection rejected become NetworkException', () {
      for (final type in [
        DioExceptionType.connectionTimeout,
        DioExceptionType.connectionError,
        DioExceptionType.receiveTimeout,
      ]) {
        expect(
          mapDioException(
            DioException(requestOptions: RequestOptions(), type: type),
          ),
          isA<NetworkException>(),
        );
      }
    });
  });
}
