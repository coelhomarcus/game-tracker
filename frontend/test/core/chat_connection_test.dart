import 'dart:async';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/realtime/chat_connection.dart';
import 'package:gametracker/core/realtime/chat_transport.dart';

import '../support/fake_transport.dart';

class Harness {
  Harness({this._refreshResult = TokenRefresh.refreshed}) {
    connection = ChatConnection(
      transport: transport,
      accessToken: () async => token,
      refresh: (used) async {
        refreshCalls.add(used);
        if (_refreshResult == TokenRefresh.refreshed) {
          token = 'novo-${refreshCalls.length}';
        }
        return _refreshResult;
      },
      backoff: (attempt) => Duration(seconds: attempt + 1),
    );
    connection.states.listen(states.add);
    connection.resynced.listen((_) => resyncs++);
  }

  final transport = FakeChatTransport();
  late final ChatConnection connection;
  String? token = 'token-0';
  final TokenRefresh _refreshResult;
  final refreshCalls = <String?>[];
  final states = <ChatConnectionState>[];
  int resyncs = 0;

  List<ChatConnectionStatus> get statuses =>
      states.map((s) => s.status).toList();
}

void run(void Function(FakeAsync async, Harness h) body, {Harness? harness}) {
  fakeAsync((async) {
    final h = harness ?? Harness();
    body(async, h);
  });
}

void main() {
  test('connects with the token current and warns that synced', () {
    run((async, h) {
      h.connection.start();
      async.flushMicrotasks();
      expect(h.transport.connectTokens, ['token-0']);
      expect(h.connection.state.isConnected, isTrue);
      expect(h.statuses, [
        ChatConnectionStatus.connecting,
        ChatConnectionStatus.connected,
      ]);
      expect(h.resyncs, 1);
    });
  });

  test('starting twice does not open two connections', () {
    run((async, h) {
      h.connection.start();
      h.connection.start();
      async.flushMicrotasks();
      expect(h.transport.connectTokens.length, 1);
    });
  });

  test('server rejects the token: refreshes the session and reconnects with the token new', () {
    run((async, h) {
      h.transport.outcomes.add(const ConnectAuthError());
      h.connection.start();
      async.flushMicrotasks();
      expect(h.refreshCalls, [
        'token-0',
      ], reason: 'a renovação recebe o token que foi recusado');
      expect(h.transport.connectTokens, ['token-0', 'novo-1']);
      expect(h.connection.state.isConnected, isTrue);
    });
  });

  test('session closed to the refresh: for of time, without insist', () {
    run((async, h) {
      final harness = Harness(refreshResult: TokenRefresh.sessionEnded);
      harness.transport.defaultOutcome = const ConnectAuthError();
      harness.connection.start();
      async.flushMicrotasks();
      async.elapse(const Duration(minutes: 2));
      expect(harness.transport.connectTokens.length, 1);
      expect(harness.connection.state.status, ChatConnectionStatus.stopped);
    });
  });

  test('renewing each attempt does not create the tight loop: after two attempts, use backoff', () {
    run((async, h) {
      h.transport.defaultOutcome = const ConnectAuthError();
      h.connection.start();
      async.flushMicrotasks();
      // 1 tentativa inicial + 2 repetições imediatas, depois espera.
      expect(h.transport.connectTokens.length, 3);
      expect(h.connection.state.status, ChatConnectionStatus.waiting);
    });
  });

  test('fails of network: waits with backoff increasing and reconnects', () {
    run((async, h) {
      h.transport.outcomes.addAll([const ConnectFail(), const ConnectFail()]);
      h.connection.start();
      async.flushMicrotasks();
      expect(h.transport.connectTokens.length, 1);
      expect(h.connection.state.status, ChatConnectionStatus.waiting);
      expect(h.connection.state.attempt, 1);

      async.elapse(const Duration(milliseconds: 900));
      expect(
        h.transport.connectTokens.length,
        1,
        reason: 'primeira espera é de 1 s',
      );
      async.elapse(const Duration(milliseconds: 200));
      expect(h.transport.connectTokens.length, 2);
      expect(h.connection.state.attempt, 2);

      async.elapse(const Duration(milliseconds: 1800));
      expect(
        h.transport.connectTokens.length,
        2,
        reason: 'segunda espera é de 2 s',
      );
      async.elapse(const Duration(milliseconds: 200));
      expect(h.transport.connectTokens.length, 3);
      expect(h.connection.state.isConnected, isTrue);
      expect(
        h.connection.state.attempt,
        0,
        reason: 'conectou: zera as tentativas',
      );
    });
  });

  test('drop after connected: reconnects immediately, without backoff', () {
    run((async, h) {
      h.connection.start();
      async.flushMicrotasks();
      h.transport.drop();
      async.flushMicrotasks();
      expect(h.transport.connectTokens.length, 2);
      expect(h.connection.state.isConnected, isTrue);
      expect(
        h.resyncs,
        2,
        reason: 'cada reconexão pede sincronização do histórico',
      );
    });
  });

  test('joins desired rooms and rejoins all after each reconnection', () {
    run((async, h) {
      h.connection.start();
      async.flushMicrotasks();
      unawaited(h.connection.joinRoom('c1'));
      unawaited(h.connection.joinRoom('c2'));
      async.flushMicrotasks();
      expect(h.transport.joins, ['c1', 'c2']);

      h.transport.drop();
      async.flushMicrotasks();
      expect(h.transport.joins, [
        'c1',
        'c2',
        'c1',
        'c2',
      ], reason: 'o servidor esquece as salas ao reconectar');
    });
  });

  test('requested room without the connection is joined when the connection returns', () {
    run((async, h) {
      h.transport.outcomes.add(const ConnectFail());
      h.connection.start();
      async.flushMicrotasks();
      bool? joined;
      h.connection.joinRoom('c1').then((v) => joined = v);
      async.flushMicrotasks();
      expect(joined, isFalse, reason: 'ainda sem conexão');
      expect(h.transport.joins, isEmpty);

      async.elapse(const Duration(seconds: 2));
      expect(h.transport.joins, ['c1']);
    });
  });

  test('room rejected through the server leaves of ser desired', () {
    run((async, h) {
      h.transport.rejectedRooms.add('c1');
      h.connection.start();
      async.flushMicrotasks();
      bool? joined;
      h.connection.joinRoom('c1').then((v) => joined = v);
      async.flushMicrotasks();
      expect(joined, isFalse);

      h.transport.drop();
      async.flushMicrotasks();
      expect(h.transport.joins, [
        'c1',
      ], reason: 'não tenta de novo uma sala recusada');
    });
  });

  test('leave of the room warns the server and does not rejoins after', () {
    run((async, h) {
      h.connection.start();
      async.flushMicrotasks();
      unawaited(h.connection.joinRoom('c1'));
      async.flushMicrotasks();
      h.connection.leaveRoom('c1');
      expect(h.transport.sent.single.$1, 'conversation:leave');
      expect(h.transport.sent.single.$2['conversationId'], 'c1');
      h.transport.drop();
      async.flushMicrotasks();
      expect(h.transport.joins, ['c1']);
    });
  });

  test('join ACK lost during reconnection does not crash the connection and retries', () {
    run((async, h) {
      var joinCalls = 0;
      h.transport.onRequest = (event, payload) {
        if (event == 'conversation:join' && ++joinCalls == 2) {
          // 1ª: entrada normal. 2ª: reentrada depois da queda, sem resposta.
          throw const RequestTimeoutException();
        }
        return {'ok': true};
      };
      h.connection.start();
      async.flushMicrotasks();
      unawaited(h.connection.joinRoom('c1'));
      async.flushMicrotasks();
      expect(joinCalls, 1);

      h.transport.drop();
      async.flushMicrotasks();
      // A reentrada deu timeout: a conexão não presta, é derrubada e refeita (sem backoff).
      async.elapse(const Duration(seconds: 3));
      expect(h.transport.connectTokens.length, 3);
      expect(h.connection.state.isConnected, isTrue);
      expect(joinCalls, 3, reason: 'na terceira conexão a entrada funcionou');
    });
  });

  test('reconnectNow shortens the waits of the backoff', () {
    run((async, h) {
      h.transport.outcomes.add(const ConnectFail());
      h.connection.start();
      async.flushMicrotasks();
      expect(h.connection.state.status, ChatConnectionStatus.waiting);

      h.connection.reconnectNow();
      async.flushMicrotasks();
      expect(h.transport.connectTokens.length, 2, reason: 'não esperou o 1 s');
      expect(h.connection.state.isConnected, isTrue);
    });
  });

  test('reconnectNow restarts the stopped connection', () {
    run((async, h) {
      h.connection.reconnectNow();
      async.flushMicrotasks();
      expect(h.connection.state.isConnected, isTrue);
    });
  });

  test('stop closes the socket, forgets the rooms and for of try', () {
    run((async, h) {
      h.connection.start();
      async.flushMicrotasks();
      unawaited(h.connection.joinRoom('c1'));
      async.flushMicrotasks();

      unawaited(h.connection.stop());
      async.flushMicrotasks();
      expect(h.connection.state.status, ChatConnectionStatus.stopped);
      expect(h.transport.isConnected, isFalse);
      async.elapse(const Duration(minutes: 1));
      expect(h.transport.connectTokens.length, 1);

      h.connection.start();
      async.flushMicrotasks();
      expect(h.transport.joins, [
        'c1',
      ], reason: 'a sala da sessão anterior não volta');
    });
  });

  test('stop during backoff cancels the next attempt', () {
    run((async, h) {
      h.transport.defaultOutcome = const ConnectFail();
      h.connection.start();
      async.flushMicrotasks();
      unawaited(h.connection.stop());
      async.elapse(const Duration(minutes: 1));
      expect(h.transport.connectTokens.length, 1);
    });
  });

  test('without token (session ended): for without try connect', () {
    run((async, h) {
      h.token = null;
      h.connection.start();
      async.flushMicrotasks();
      expect(h.transport.connectTokens, isEmpty);
      expect(h.connection.state.status, ChatConnectionStatus.stopped);
    });
  });

  test('verify: connection responds according to its state', () {
    run((async, h) {
      h.connection.start();
      async.flushMicrotasks();
      unawaited(h.connection.joinRoom('c1'));
      async.flushMicrotasks();
      unawaited(h.connection.verify());
      async.flushMicrotasks();
      expect(h.transport.connectTokens.length, 1);
    });
  });

  test('verify: silent dead connection is closed and recreated', () {
    run((async, h) {
      h.connection.start();
      async.flushMicrotasks();
      unawaited(h.connection.joinRoom('c1'));
      async.flushMicrotasks();
      h.transport.onRequest = (event, payload) => event == 'presence:get'
          ? throw const RequestTimeoutException()
          : {'ok': true};
      unawaited(h.connection.verify());
      async.flushMicrotasks();
      expect(h.transport.connectTokens.length, 2);
      expect(h.connection.state.isConnected, isTrue);
    });
  });

  test('verify without the connection only reconnects', () {
    run((async, h) {
      h.transport.outcomes.add(const ConnectFail());
      h.connection.start();
      async.flushMicrotasks();
      unawaited(h.connection.verify());
      async.flushMicrotasks();
      expect(h.connection.state.isConnected, isTrue);
    });
  });
}
