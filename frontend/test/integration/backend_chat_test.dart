// Chat contra o backend real, com sockets reais (ambiente isolado, nunca produção).
//
//   flutter test test/integration --dart-define=GT_BACKEND=http://localhost:3100
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/client_id.dart';
import 'package:gametracker/core/network/api_client.dart';
import 'package:gametracker/core/network/session_manager.dart';
import 'package:gametracker/core/realtime/chat_connection.dart';
import 'package:gametracker/core/realtime/chat_transport.dart';
import 'package:gametracker/core/storage/token_store.dart';
import 'package:gametracker/features/auth/data/auth_api.dart';
import 'package:gametracker/features/chat/data/chat_models.dart';
import 'package:gametracker/features/chat/data/chat_repository.dart';

const backend = String.fromEnvironment('GT_BACKEND');

/// Um usuário com REST, transporte Socket.IO real e conexão gerenciada.
class Peer {
  Peer(this.id, this.dio, this.session)
    : repository = RemoteChatRepository(dio),
      transport = SocketIoTransport(url: backend) {
    connection = ChatConnection(
      transport: transport,
      accessToken: () async => outage ? 'token-invalido' : session.accessToken,
      refresh: (used) async {
        if (outage) return TokenRefresh.unavailable;
        final outcome = await session.refreshAfterUnauthorized(used);
        return outcome == RefreshOutcome.refreshed
            ? TokenRefresh.refreshed
            : TokenRefresh.sessionEnded;
      },
      backoff: (a) => const Duration(milliseconds: 300),
    );
    transport.events.listen(events.add);
  }

  final String id;
  final Dio dio;
  final SessionManager session;
  final RemoteChatRepository repository;
  final SocketIoTransport transport;
  late final ChatConnection connection;
  final events = <ChatEvent>[];

  /// Enquanto verdadeiro, a conexão só consegue um token que o servidor recusa e a renovação
  /// falha: simula uma interrupção em que o cliente não consegue voltar.
  bool outage = false;

  List<ChatMessage> get received => [
    for (final e in events)
      if (e is MessageReceived) ChatMessage.fromJson(e.json),
  ];

  Future<void> close() async {
    await connection.dispose();
    transport.dispose();
  }
}

Future<Peer> signUp(String prefix) async {
  final n = DateTime.now().microsecondsSinceEpoch.toRadixString(36);
  final authApi = AuthApi(createAuthDio(baseUrl: '$backend/api'));
  final session = SessionManager(
    store: MemoryTokenStore(),
    refreshCall: authApi.refresh,
  );
  final r = await authApi.register(
    name: prefix,
    username: '${prefix}_$n',
    email: '${prefix}_$n@example.test',
    password: 'senha-fixture-123',
  );
  await session.start(r.tokens);
  return Peer(
    r.user.id,
    createApiDio(session, baseUrl: '$backend/api'),
    session,
  );
}

Future<void> eventually(
  bool Function() condition, {
  Duration timeout = const Duration(seconds: 12),
  String? reason,
}) async {
  final deadline = DateTime.now().add(timeout);
  while (!condition()) {
    if (DateTime.now().isAfter(deadline)) {
      fail(reason ?? 'condição não ocorreu em $timeout');
    }
    await Future<void>.delayed(const Duration(milliseconds: 50));
  }
}

/// Dois usuários, uma conversa, ambos conectados e dentro da sala.
Future<(Peer, Peer, String)> pair() async {
  final a = await signUp('ca');
  final b = await signUp('cb');
  final convId = await a.repository.openWith(b.id);
  a.connection.start();
  b.connection.start();
  await eventually(
    () => a.connection.state.isConnected && b.connection.state.isConnected,
    reason: 'não conectou',
  );
  expect(await a.connection.joinRoom(convId), isTrue);
  expect(await b.connection.joinRoom(convId), isTrue);
  return (a, b, convId);
}

Future<Map<String, dynamic>> send(
  Peer from,
  String convId,
  String text, {
  String? cid,
}) => from.transport.request('message:send', {
  'conversationId': convId,
  'content': text,
  'clientMessageId': ?cid,
});

void main() {
  final skip = backend.isEmpty
      ? 'defina --dart-define=GT_BACKEND=http://localhost:3100'
      : null;

  test(
    'connect with token invalid: the server rejects and the connection refreshes the session and reconnects',
    skip: skip,
    () async {
      final a = await signUp('cr');
      final real = a.session.accessToken!;
      var token = 'token-que-o-servidor-recusa';
      var refreshes = 0;
      final connection = ChatConnection(
        transport: a.transport,
        accessToken: () async => token,
        refresh: (used) async {
          refreshes++;
          expect(used, 'token-que-o-servidor-recusa');
          token = real;
          return TokenRefresh.refreshed;
        },
      );
      connection.start();
      await eventually(
        () => connection.state.isConnected,
        reason: 'não reconectou depois de renovar',
      );
      expect(refreshes, 1);
      await connection.dispose();
      a.transport.dispose();
    },
  );

  test(
    'without the token, the connection is rejected with an authentication error',
    skip: skip,
    () async {
      final transport = SocketIoTransport(url: backend);
      await expectLater(
        transport.connect(token: 'invalido'),
        throwsA(isA<TransportAuthException>()),
      );
      transport.dispose();
    },
  );

  test(
    'sending with clientMessageId: ACK, recipient event and history without duplicates on retry',
    skip: skip,
    () async {
      final (a, b, convId) = await pair();
      final cid = newClientId();

      final ack = await send(a, convId, 'olá do Dart', cid: cid);
      final message = ChatMessage.fromJson(
        Map<String, dynamic>.from(ack['message'] as Map),
      );
      expect(message.clientMessageId, cid);
      await eventually(
        () => b.received.any((m) => m.id == message.id),
        reason: 'B não recebeu',
      );

      // Reenvio com o mesmo clientMessageId (como depois de um ACK perdido).
      final again = await send(a, convId, 'olá do Dart', cid: cid);
      expect(
        ChatMessage.fromJson(Map<String, dynamic>.from(again['message'] as Map))
            .id,
        message.id,
      );
      await Future<void>.delayed(const Duration(milliseconds: 400));
      expect(
        b.received.where((m) => m.clientMessageId == cid).length,
        1,
        reason: 'um único evento',
      );

      final history = await b.repository.messages(convId);
      expect(
        history.items.where((m) => m.clientMessageId == cid).length,
        1,
        reason: 'uma única linha',
      );
      await a.close();
      await b.close();
    },
  );

  test(
    'typing and presence arrive to the another side; snapshot correct',
    skip: skip,
    () async {
      final (a, b, convId) = await pair();
      final snapshot = await a.transport.request('presence:get', {
        'conversationId': convId,
      });
      expect(snapshot['online'], contains(b.id));

      a.transport.send('typing:start', {'conversationId': convId});
      await eventually(
        () => b.events.any(
          (e) => e is TypingChanged && e.typing && e.userId == a.id,
        ),
        reason: 'B não viu a digitação',
      );
      a.transport.send('typing:stop', {'conversationId': convId});
      await eventually(
        () => b.events.any(
          (e) => e is TypingChanged && !e.typing && e.userId == a.id,
        ),
      );

      await b.connection.stop();
      await eventually(
        () => a.events.any(
          (e) => e is PresenceChanged && !e.online && e.userId == b.id,
        ),
        reason: 'A não soube que B saiu',
      );
      final after = await a.transport.request('presence:get', {
        'conversationId': convId,
      });
      expect(after['online'], isNot(contains(b.id)));
      await a.close();
      await b.close();
    },
  );

  test(
    'drop and automatic reconnection: rejoins the room and receives again; the missed message is in history',
    skip: skip,
    () async {
      final (a, b, convId) = await pair();
      var resyncs = 0;
      b.connection.resynced.listen((_) => resyncs++);

      // B cai e não consegue voltar por um tempo.
      b.outage = true;
      b.transport.simulateDrop();
      await eventually(
        () => b.connection.state.status == ChatConnectionStatus.waiting,
        reason: 'B não ficou esperando para reconectar',
      );

      for (var i = 1; i <= 3; i++) {
        await send(a, convId, 'enquanto B estava fora $i', cid: newClientId());
      }

      // B volta sozinho (o que o usuário faria com "Tentar agora" ou ao reabrir o app).
      b.outage = false;
      b.connection.reconnectNow();
      await eventually(
        () => b.connection.state.isConnected && resyncs >= 1,
        reason: 'B não reconectou',
      );

      // O que passou durante a queda NÃO chega como evento: está no histórico REST (é o que a tela sincroniza).
      final history = await b.repository.messages(convId);
      expect(
        history.items
            .where((m) => m.content.startsWith('enquanto B estava fora'))
            .length,
        3,
      );
      expect(
        b.received.where((m) => m.content.startsWith('enquanto B estava fora')),
        isEmpty,
        reason: 'eventos perdidos na queda: por isso a sincronização por REST',
      );

      // E B voltou a estar na sala (o servidor esqueceu a sala ao cair; a reconexão reentrou).
      final live = await send(
        a,
        convId,
        'depois da reconexão',
        cid: newClientId(),
      );
      final liveId = (live['message'] as Map)['id'] as String;
      await eventually(
        () => b.received.any((m) => m.id == liveId),
        reason: 'B não voltou à sala',
      );
      await a.close();
      await b.close();
    },
  );

  test(
    'short drop: reconnects immediately and keeps receiving',
    skip: skip,
    () async {
      final (a, b, convId) = await pair();
      var resyncs = 0;
      b.connection.resynced.listen((_) => resyncs++);

      b.transport.simulateDrop();
      await eventually(() => resyncs >= 1, reason: 'B não reconectou sozinho');

      final live = await send(
        a,
        convId,
        'logo depois da queda',
        cid: newClientId(),
      );
      final liveId = (live['message'] as Map)['id'] as String;
      await eventually(
        () => b.received.any((m) => m.id == liveId),
        reason: 'B não voltou à sala',
      );
      await a.close();
      await b.close();
    },
  );

  test('server survives invalid ids in socket events', skip: skip, () async {
    final (a, b, convId) = await pair();
    final bad = await a.transport.request('conversation:join', {
      'conversationId': 'isto-nao-e-uuid',
    });
    expect(bad['error'], isNotNull);
    final badSend = await a.transport.request('message:send', {
      'conversationId': 'xxx',
      'content': 'oi',
    });
    expect(badSend['error'], isNotNull);
    final badCid = await a.transport.request('message:send', {
      'conversationId': convId,
      'content': 'oi',
      'clientMessageId': 'nao-uuid',
    });
    expect(badCid['error'], isNotNull);
    a.transport.send('typing:start', {'conversationId': 'lixo'});

    final health = await Dio().get<Map<String, dynamic>>('$backend/api/health');
    expect(health.data!['status'], 'ok');
    await a.close();
    await b.close();
  });

  test(
    'history paginated by cursor, messages with and without clientMessageId, and reading',
    skip: skip,
    () async {
      final (a, b, convId) = await pair();
      for (var i = 1; i <= 35; i++) {
        await send(a, convId, 'm$i', cid: i.isEven ? newClientId() : null);
      }
      final first = await b.repository.messages(convId);
      expect(first.items.length, RemoteChatRepository.pageSize);
      expect(first.items.first.content, 'm35', reason: 'mais recente primeiro');
      expect(first.nextCursor, isNotNull);
      final second = await b.repository.messages(
        convId,
        cursor: first.nextCursor,
      );
      expect(second.items.length, 5);
      expect(second.nextCursor, isNull);
      expect(
        {...first.items, ...second.items}.length,
        35,
        reason: 'sem repetidas entre páginas',
      );
      expect(
        first.items.any((m) => m.clientMessageId == null),
        isTrue,
        reason: 'legado/sem id',
      );

      expect((await b.repository.conversations()).single.unread, isTrue);
      await b.repository.markRead(convId);
      expect((await b.repository.conversations()).single.unread, isFalse);
      await a.close();
      await b.close();
    },
  );

  test(
    'the same conversation requested at the same time by both returns the single one id',
    skip: skip,
    () async {
      final a = await signUp('cx');
      final b = await signUp('cy');
      final ids = await Future.wait([
        a.repository.openWith(b.id),
        b.repository.openWith(a.id),
        a.repository.openWith(b.id),
      ]);
      expect(ids.toSet().length, 1);
      expect((await a.repository.conversations()).length, 1);
      await a.close();
      await b.close();
    },
  );
}
