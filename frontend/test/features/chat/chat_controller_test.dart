import 'dart:async';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/app/providers.dart';
import 'package:gametracker/core/realtime/chat_connection.dart';
import 'package:gametracker/core/realtime/chat_transport.dart';
import 'package:gametracker/features/auth/data/auth_repository.dart';
import 'package:gametracker/features/chat/application/chat_controller.dart';
import 'package:gametracker/features/chat/application/chat_providers.dart';
import 'package:gametracker/features/chat/application/conversations_controller.dart';
import 'package:gametracker/features/chat/data/chat_models.dart';

import '../../support/fake_auth.dart';
import '../../support/fake_chat.dart';
import '../../support/fake_transport.dart';

/// Tudo o que um teste de conversa precisa, montado dentro do `fakeAsync` do teste.
class Env {
  Env(this.async, {FakeAuthRepository? auth}) {
    server = FakeChatServer(transport, repo);
    connection = ChatConnection(
      transport: transport,
      accessToken: () async => 'token',
      refresh: (_) async => TokenRefresh.refreshed,
      backoff: (a) => Duration(seconds: a + 1),
    );
    container = ProviderContainer(
      retry: noAutomaticRetry,
      overrides: [
        ...fakeAuthOverrides(
          auth ??
              (FakeAuthRepository()
                ..restoreResult = Restored(fakeUser(meId, 'ana'))),
        ),
        chatTransportProvider.overrideWithValue(transport),
        chatRepositoryProvider.overrideWithValue(repo),
        chatConnectionProvider.overrideWith((ref) {
          // Igual ao provider real: sem sessão não há conexão; ao sair, a conexão é encerrada.
          if (ref.watch(currentUserIdProvider) == null) return null;
          connection.start();
          ref.onDispose(() => unawaited(connection.stop()));
          return connection;
        }),
        chatRetryDelayProvider.overrideWithValue(
          (attempt) => Duration(seconds: attempt),
        ),
      ],
    );
    container.read(sessionControllerProvider);
    pump();
  }

  final FakeAsync async;
  final transport = FakeChatTransport();
  final repo = FakeChatRepository();
  late final FakeChatServer server;
  late final ChatConnection connection;
  late final ProviderContainer container;
  ProviderSubscription<AsyncValue<ChatState>>? _sub;

  void pump([Duration by = Duration.zero]) {
    async.flushMicrotasks();
    async.elapse(by);
    async.flushMicrotasks();
    async.flushMicrotasks();
  }

  /// Abre a conversa (a tela mantém o provider ouvido) e espera carregar.
  void open() {
    container.read(chatConnectionProvider); // inicia a conexão da sessão
    pump();
    _sub = container.listen(chatControllerProvider(convId), (_, _) {});
    pump();
  }

  ChatController get chat =>
      container.read(chatControllerProvider(convId).notifier);
  AsyncValue<ChatState> get value =>
      container.read(chatControllerProvider(convId));
  ChatState get state => value.requireValue;
  List<ChatMessage> get messages => state.messages;
  ConversationSummary get conv => container
      .read(conversationsControllerProvider)
      .requireValue
      .firstWhere((c) => c.id == convId);

  void close() {
    _sub?.close();
    pump();
  }

  void dispose() {
    _sub?.close();
    container.dispose();
  }
}

void scenario(String name, void Function(FakeAsync async, Env env) body) {
  test(name, () {
    fakeAsync((async) {
      final env = Env(async);
      try {
        body(async, env);
      } finally {
        env.dispose();
      }
    });
  });
}

Iterable<(String, Map<String, dynamic>)> requests(Env env, String event) =>
    env.transport.requests.where((r) => r.$1 == event);

void main() {
  group('load', () {
    scenario('abre a conversa, resolve a outra pessoa e entra na sala', (
      async,
      env,
    ) {
      env.repo.history[convId] = [
        serverMessage('m1', text: 'primeira', minute: 1),
        serverMessage('m2', text: 'segunda', minute: 2),
      ];
      env.open();
      expect(env.messages.map((m) => m.content), ['primeira', 'segunda']);
      expect(env.state.other.username, 'beto');
      expect(env.transport.joins, [convId]);
    });

    scenario(
      'o histórico vem em páginas; carregar mais antigas mescla sem duplicar',
      (async, env) {
        env.repo.pageSize = 2;
        env.repo.history[convId] = [
          for (var i = 1; i <= 5; i++)
            serverMessage('m$i', text: 'msg $i', minute: i),
        ];
        env.open();
        expect(env.messages.map((m) => m.content), ['msg 4', 'msg 5']);
        expect(env.state.hasOlder, isTrue);

        env.chat.loadOlder();
        env.pump();
        expect(env.messages.map((m) => m.content), [
          'msg 2',
          'msg 3',
          'msg 4',
          'msg 5',
        ]);
        env.chat.loadOlder();
        env.pump();
        expect(env.messages.map((m) => m.content), [
          'msg 1',
          'msg 2',
          'msg 3',
          'msg 4',
          'msg 5',
        ]);
        expect(env.state.hasOlder, isFalse);
      },
    );

    scenario(
      'carregar mais antigas duas vezes ao mesmo tempo busca uma só página',
      (async, env) {
        env.repo.history[convId] = [
          for (var i = 1; i <= 6; i++) serverMessage('m$i', minute: i),
        ];
        env.open();
        final before = env.repo.messageCalls.length;
        env.chat.loadOlder();
        env.chat.loadOlder();
        env.chat.loadOlder();
        env.pump();
        expect(env.repo.messageCalls.length, before + 1);
      },
    );

    scenario(
      'erro ao carregar mais antigas mantém a lista e permite tentar de novo',
      (async, env) {
        env.repo.history[convId] = [
          for (var i = 1; i <= 6; i++) serverMessage('m$i', minute: i),
        ];
        env.open();
        env.repo.messagesError = StateError('rede');
        env.chat.loadOlder();
        env.pump();
        expect(env.state.olderError, isNotNull);
        expect(env.state.loadingOlder, isFalse);
        expect(env.messages.length, 2);

        env.repo.messagesError = null;
        env.chat.loadOlder();
        env.pump();
        expect(env.state.olderError, isNull);
        expect(env.messages.length, 4);
      },
    );

    scenario('conversa desconhecida: recarrega a lista uma vez e então falha', (
      async,
      env,
    ) {
      env.repo.list = [];
      env.container.read(chatConnectionProvider);
      env.pump();
      env.container.listen(chatControllerProvider('inexistente'), (_, _) {});
      env.pump();
      expect(
        env.repo.conversationsCalls,
        2,
        reason: 'a inicial e uma tentativa de achar a conversa nova',
      );
      expect(
        env.container.read(chatControllerProvider('inexistente')).hasError,
        isTrue,
      );
    });

    scenario('evento que chega durante a carga do histórico não se perde', (
      async,
      env,
    ) {
      env.repo.history[convId] = [
        serverMessage('m1', text: 'antiga', minute: 1),
      ];
      env.repo.messagesGate = Completer<void>();
      env.container.read(chatConnectionProvider);
      env.pump();
      env._sub = env.container.listen(
        chatControllerProvider(convId),
        (_, _) {},
      );
      env.pump();
      expect(env.value.isLoading, isTrue);

      env.server.incoming('chegou durante a carga', minute: 5, id: 'm9');
      env.repo.messagesGate!.complete();
      env.pump();
      expect(env.messages.map((m) => m.content), [
        'antiga',
        'chegou durante a carga',
      ]);
    });

    scenario('evento de outra conversa é ignorado', (async, env) {
      env.open();
      env.transport.emit(
        MessageReceived(
          messageJson(
            serverMessage('x1', text: 'alheia', conversation: 'outra'),
          ),
        ),
      );
      env.pump();
      expect(env.messages, isEmpty);
    });
  });

  group('sending', () {
    scenario(
      'a mensagem aparece na hora como pendente e vira enviada com o ACK',
      (async, env) {
        env.open();
        env.chat.send('  olá!  ');
        expect(env.messages.single.status, MessageStatus.sending);
        expect(env.messages.single.content, 'olá!', reason: 'texto aparado');
        expect(env.messages.single.sender.id, meId);
        expect(env.messages.single.isConfirmed, isFalse);

        env.pump();
        expect(env.messages.single.status, MessageStatus.sent);
        expect(env.messages.single.id, 'srv-1');
        expect(env.server.stored, 1);
      },
    );

    scenario('envia um clientMessageId UUID v4 e o mesmo texto', (async, env) {
      env.open();
      env.chat.send('oi');
      env.pump();
      final payload = env.server.sends.single;
      expect(payload['conversationId'], convId);
      expect(payload['content'], 'oi');
      expect(
        payload['clientMessageId'],
        matches(
          RegExp(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
          ),
        ),
      );
    });

    scenario(
      'texto vazio, só espaços ou acima de 2000 caracteres não é enviado',
      (async, env) {
        env.open();
        env.chat.send('');
        env.chat.send('   ');
        env.chat.send('x' * 2001);
        env.pump();
        expect(env.messages, isEmpty);
        expect(env.server.sends, isEmpty);
        env.chat.send('x' * 2000);
        env.pump();
        expect(env.messages.length, 1);
      },
    );

    scenario('evento antes do ACK: uma única mensagem', (async, env) {
      env.server.eventBeforeAck = true;
      env.open();
      env.chat.send('uma só');
      env.pump();
      expect(env.messages.length, 1);
      expect(env.messages.single.status, MessageStatus.sent);
    });

    scenario('evento depois do ACK: uma única mensagem', (async, env) {
      env.server.eventAfterAck = true;
      env.open();
      env.chat.send('uma só');
      env.pump();
      expect(env.messages.length, 1);
    });

    scenario('várias mensagens seguidas mantêm a ordem escrita', (async, env) {
      env.open();
      env.chat.send('um');
      env.chat.send('dois');
      env.chat.send('três');
      env.pump();
      expect(env.messages.map((m) => m.content), ['um', 'dois', 'três']);
      expect(env.server.stored, 3);
    });

    scenario(
      'enviar atualiza a lista de conversas (última mensagem, sem "não lida")',
      (async, env) {
        env.open();
        env.chat.send('minha mensagem');
        env.pump();
        expect(env.conv.lastMessage!.content, 'minha mensagem');
        expect(env.conv.unread, isFalse);
      },
    );
  });

  group('sending uncertain: ACK lost', () {
    scenario('reenvia com o MESMO clientMessageId e o servidor não duplica', (
      async,
      env,
    ) {
      env.server.dropAcks = 1;
      env.open();
      env.chat.send('importante');
      env.pump();
      expect(env.messages.single.status, MessageStatus.uncertain);
      expect(env.messages.single.attempts, 1);

      env.pump(const Duration(seconds: 2));
      expect(env.server.sends.length, 2);
      expect(
        env.server.sends[0]['clientMessageId'],
        env.server.sends[1]['clientMessageId'],
      );
      expect(env.server.stored, 1, reason: 'o servidor gravou uma só vez');
      expect(env.messages.length, 1);
      expect(env.messages.single.status, MessageStatus.sent);
    });

    scenario(
      'o servidor gravou e o evento chegou: a mensagem incerta vira enviada sem reenviar',
      (async, env) {
        env.server.dropAcks = 1;
        env.server.eventBeforeAck = true;
        env.open();
        env.chat.send('gravada');
        env.pump(const Duration(seconds: 3));
        expect(env.messages.length, 1);
        expect(env.messages.single.status, MessageStatus.sent);
        expect(
          env.server.sends.length,
          1,
          reason: 'o evento já confirmou: não há o que reenviar',
        );
      },
    );

    scenario(
      'três tentativas sem confirmação: falha, mas o texto continua na conversa',
      (async, env) {
        env.server.ignoreSends = 99;
        env.open();
        env.chat.send('não saiu');
        env.pump(const Duration(seconds: 10));
        expect(env.messages.single.status, MessageStatus.failed);
        expect(
          env.messages.single.content,
          'não saiu',
          reason: 'o texto não se perde',
        );
        expect(env.server.sends.length, ChatController.maxAttempts);
        expect(env.messages.single.error, isNotNull);
      },
    );

    scenario(
      '"Tentar de novo" reenvia a mesma mensagem e funciona quando o servidor volta',
      (async, env) {
        env.server.ignoreSends = 3;
        env.open();
        env.chat.send('vai');
        env.pump(const Duration(seconds: 10));
        final cid = env.messages.single.clientMessageId!;
        expect(env.messages.single.status, MessageStatus.failed);

        env.chat.retry(cid);
        env.pump();
        expect(env.messages.length, 1);
        expect(env.messages.single.status, MessageStatus.sent);
        expect(env.messages.single.clientMessageId, cid);
      },
    );

    scenario('descartar remove só a mensagem não entregue', (async, env) {
      env.server.ignoreSends = 99;
      env.open();
      env.chat.send('descartar isto');
      env.pump(const Duration(seconds: 10));
      env.server.ignoreSends = 0;
      env.chat.send('esta segue');
      env.pump();
      expect(env.messages.length, 2);

      final failed = env.messages.firstWhere(
        (m) => m.content == 'descartar isto',
      );
      env.chat.discard(failed.clientMessageId!);
      expect(env.messages.map((m) => m.content), ['esta segue']);
    });

    scenario('descartar não apaga uma mensagem já confirmada', (async, env) {
      env.open();
      env.chat.send('confirmada');
      env.pump();
      env.chat.discard(env.messages.single.clientMessageId!);
      expect(env.messages.length, 1);
    });

    scenario('recusa definitiva do servidor: falha na hora, sem insistir', (
      async,
      env,
    ) {
      env.server.rejectWith = 'Conversa não encontrada';
      env.open();
      env.chat.send('negada');
      env.pump(const Duration(seconds: 10));
      expect(env.messages.single.status, MessageStatus.failed);
      expect(env.messages.single.error, 'Conversa não encontrada');
      expect(env.server.sends.length, 1);
    });
  });

  group('drop of connection', () {
    scenario(
      'mensagem escrita sem conexão fica na fila e sai uma vez quando volta',
      (async, env) {
        env.open();
        env.transport.defaultOutcome = const ConnectFail();
        env.transport.drop();
        env.pump();
        expect(env.connection.state.isConnected, isFalse);

        env.chat.send('offline');
        env.pump();
        expect(
          env.messages.single.status,
          MessageStatus.sending,
          reason: 'na fila, sem gastar tentativas',
        );
        expect(env.messages.single.attempts, 0);
        expect(env.server.sends, isEmpty);

        env.transport.defaultOutcome = const ConnectOk();
        env.pump(const Duration(seconds: 5));
        expect(env.messages.single.status, MessageStatus.sent);
        expect(env.server.stored, 1);
        expect(env.messages.length, 1);
      },
    );

    scenario(
      'ao reconectar busca o que chegou durante a queda (várias páginas, sem duplicar)',
      (async, env) {
        env.repo.pageSize = 2;
        env.repo.history[convId] = [
          serverMessage('m1', text: 'antes', minute: 1),
        ];
        env.open();
        expect(env.messages.map((m) => m.content), ['antes']);

        env.transport.drop();
        // Durante a queda chegam 5 mensagens (3 páginas).
        for (var i = 2; i <= 6; i++) {
          env.repo.history[convId]!.add(
            serverMessage('m$i', text: 'durante $i', minute: i),
          );
        }
        env.pump();
        expect(env.messages.map((m) => m.content), [
          'antes',
          'durante 2',
          'durante 3',
          'durante 4',
          'durante 5',
          'durante 6',
        ]);
        expect(
          env.messages.map((m) => m.id).toSet().length,
          6,
          reason: 'sem duplicatas',
        );
      },
    );

    scenario('a sincronização para ao reencontrar a última mensagem conhecida', (
      async,
      env,
    ) {
      env.repo.pageSize = 2;
      env.repo.history[convId] = [
        for (var i = 1; i <= 8; i++) serverMessage('m$i', minute: i),
      ];
      env.open(); // m7, m8
      final before = env.repo.messageCalls.length;
      env.transport.drop();
      env.repo.history[convId]!.add(serverMessage('m9', minute: 9));
      env.pump();
      // Primeira página (m9, m8) já contém o m8 conhecido: uma única consulta.
      expect(env.repo.messageCalls.length, before + 1);
      expect(env.messages.map((m) => m.id), ['m7', 'm8', 'm9']);
    });

    scenario(
      'queda muito longa: acima do limite de páginas, descarta o histórico antigo e guarda o cursor',
      (async, env) {
        env.repo.pageSize = 2;
        env.repo.history[convId] = [
          serverMessage('m0', text: 'conhecida', minute: 0),
        ];
        env.open();
        env.transport.drop();
        for (var i = 1; i <= 30; i++) {
          env.repo.history[convId]!.add(
            serverMessage('n${i.toString().padLeft(2, '0')}', minute: i),
          );
        }
        env.pump();
        expect(
          env.messages.length,
          ChatController.maxResyncPages * 2,
          reason: 'só as páginas mais recentes',
        );
        expect(
          env.messages.any((m) => m.id == 'm0'),
          isFalse,
          reason: 'não dá para garantir contiguidade com o antigo',
        );
        expect(
          env.state.hasOlder,
          isTrue,
          reason: 'dá para carregar mais antigas a partir daí',
        );
        expect(env.messages.last.id, 'n30');
      },
    );

    scenario(
      'mensagem incerta cujo ACK se perdeu é confirmada pelo histórico depois de reconectar',
      (async, env) {
        env.server.dropAcks = 1;
        env.open();
        env.chat.send('gravou mas o ACK se perdeu');
        env.pump();
        expect(env.messages.single.status, MessageStatus.uncertain);

        env.transport.drop();
        env.pump(const Duration(seconds: 5));
        expect(env.messages.length, 1);
        expect(env.messages.single.status, MessageStatus.sent);
        expect(env.server.stored, 1);
      },
    );

    scenario('reentra na sala depois da reconexão', (async, env) {
      env.open();
      env.transport.drop();
      env.pump();
      expect(env.transport.joins, [convId, convId]);
    });

    scenario(
      'falha ao sincronizar não derruba a conversa nem apaga mensagens',
      (async, env) {
        env.repo.history[convId] = [
          serverMessage('m1', text: 'fica', minute: 1),
        ];
        env.open();
        env.repo.messagesError = StateError('rede');
        env.transport.drop();
        env.pump();
        expect(env.messages.map((m) => m.content), ['fica']);
        expect(env.value.hasError, isFalse);
      },
    );
  });

  group('receive', () {
    scenario('mensagem da outra pessoa entra na lista e na conversa da lista', (
      async,
      env,
    ) {
      env.open();
      env.server.incoming('olá do beto');
      env.pump();
      expect(env.messages.single.content, 'olá do beto');
      expect(env.conv.lastMessage!.content, 'olá do beto');
      expect(env.conv.unread, isTrue, reason: 'a conversa não está visível');
    });

    scenario('a mesma mensagem entregue duas vezes aparece uma vez', (
      async,
      env,
    ) {
      env.open();
      final m = env.server.incoming('duplicada', id: 'x1');
      env.transport.emit(MessageReceived(messageJson(m)));
      env.pump();
      expect(env.messages.length, 1);
    });
  });

  group('reading', () {
    scenario('conversa invisível não é marcada como lida', (async, env) {
      env.open();
      env.server.incoming('oi');
      env.pump(const Duration(seconds: 2));
      expect(env.repo.markReadCalls, isEmpty);
      expect(env.conv.unread, isTrue);
    });

    scenario('ao ficar visível marca como lida e zera o "não lida" na lista', (
      async,
      env,
    ) {
      env.open();
      env.server.incoming('oi');
      env.pump();
      env.chat.setVisible(true);
      env.pump(const Duration(seconds: 1));
      expect(env.repo.markReadCalls, [convId]);
      expect(env.conv.unread, isFalse);
    });

    scenario(
      'mensagem que chega com a conversa visível é lida (e não fica "não lida")',
      (async, env) {
        env.open();
        env.chat.setVisible(true);
        env.pump();
        env.server.incoming('ao vivo');
        env.pump(const Duration(seconds: 1));
        expect(env.repo.markReadCalls.length, 1);
        expect(env.conv.unread, isFalse);
      },
    );

    scenario(
      'não marca de novo enquanto não há mensagem nova da outra pessoa',
      (async, env) {
        env.open();
        env.server.incoming('oi');
        env.pump();
        env.chat.setVisible(true);
        env.pump(const Duration(seconds: 1));
        env.chat.setVisible(false);
        env.chat.setVisible(true);
        env.pump(const Duration(seconds: 1));
        expect(env.repo.markReadCalls.length, 1);

        env.server.incoming('outra', minute: 30);
        env.pump(const Duration(seconds: 1));
        expect(env.repo.markReadCalls.length, 2);
      },
    );

    scenario('minhas próprias mensagens não disparam leitura', (async, env) {
      env.open();
      env.chat.setVisible(true);
      env.chat.send('minha');
      env.pump(const Duration(seconds: 1));
      expect(env.repo.markReadCalls, isEmpty);
    });

    scenario(
      'falha ao marcar como lida não quebra e tenta de novo no próximo evento',
      (async, env) {
        env.open();
        env.chat.setVisible(true);
        env.repo.markReadError = StateError('rede');
        env.server.incoming('a');
        env.pump(const Duration(seconds: 1));
        expect(env.repo.markReadCalls.length, 1);
        expect(env.value.hasError, isFalse);

        env.repo.markReadError = null;
        env.server.incoming('b', minute: 30);
        env.pump(const Duration(seconds: 1));
        expect(
          env.repo.markReadCalls.length,
          2,
          reason: 'a primeira não foi dada como lida: tenta de novo com a nova',
        );
        expect(env.conv.unread, isFalse);
      },
    );
  });

  group('typing', () {
    scenario(
      'avisa uma vez a cada 2 s enquanto escreve e para quando fica 3 s parado',
      (async, env) {
        env.open();
        env.chat.composerChanged('o');
        env.chat.composerChanged('ol');
        env.chat.composerChanged('olá');
        expect(
          env.transport.sent.where((e) => e.$1 == 'typing:start').length,
          1,
        );

        env.pump(const Duration(seconds: 2, milliseconds: 100));
        env.chat.composerChanged('olá!');
        expect(
          env.transport.sent.where((e) => e.$1 == 'typing:start').length,
          2,
          reason: 'depois da janela, avisa de novo',
        );

        env.pump(const Duration(seconds: 3, milliseconds: 100));
        expect(
          env.transport.sent.where((e) => e.$1 == 'typing:stop').length,
          1,
        );
      },
    );

    scenario('apagar o texto avisa que parou', (async, env) {
      env.open();
      env.chat.composerChanged('oi');
      env.chat.composerChanged('');
      expect(env.transport.sent.map((e) => e.$1), [
        'typing:start',
        'typing:stop',
      ]);
    });

    scenario(
      'enviar a mensagem avisa que parou; não envia stop sem ter começado',
      (async, env) {
        env.open();
        env.chat.send('sem digitar antes');
        env.pump();
        expect(env.transport.sent.where((e) => e.$1 == 'typing:stop'), isEmpty);

        env.chat.composerChanged('digitando');
        env.chat.send('agora sim');
        env.pump();
        expect(
          env.transport.sent.where((e) => e.$1 == 'typing:stop').length,
          1,
        );
      },
    );

    scenario('perder o foco do campo avisa que parou', (async, env) {
      env.open();
      env.chat.composerChanged('oi');
      env.chat.composerBlurred();
      expect(env.transport.sent.last.$1, 'typing:stop');
    });

    scenario(
      'a outra pessoa digitando aparece e some sozinha depois de 4 s sem aviso',
      (async, env) {
        env.open();
        env.transport.emit(
          const TypingChanged(
            conversationId: convId,
            userId: 'u-beto',
            typing: true,
          ),
        );
        env.pump();
        expect(env.state.otherTyping, isTrue);

        env.pump(const Duration(seconds: 4, milliseconds: 100));
        expect(
          env.state.otherTyping,
          isFalse,
          reason: 'sem o stop (a conexão caiu), o indicador expira',
        );
      },
    );

    scenario('typing:stop e a chegada da mensagem limpam o indicador', (
      async,
      env,
    ) {
      env.open();
      env.transport.emit(
        const TypingChanged(
          conversationId: convId,
          userId: 'u-beto',
          typing: true,
        ),
      );
      env.transport.emit(
        const TypingChanged(
          conversationId: convId,
          userId: 'u-beto',
          typing: false,
        ),
      );
      env.pump();
      expect(env.state.otherTyping, isFalse);

      env.transport.emit(
        const TypingChanged(
          conversationId: convId,
          userId: 'u-beto',
          typing: true,
        ),
      );
      env.server.incoming('mandei');
      env.pump();
      expect(env.state.otherTyping, isFalse);
    });

    scenario('digitação de outra conversa ou de outra pessoa é ignorada', (
      async,
      env,
    ) {
      env.open();
      env.transport.emit(
        const TypingChanged(
          conversationId: 'outra',
          userId: 'u-beto',
          typing: true,
        ),
      );
      env.transport.emit(
        const TypingChanged(
          conversationId: convId,
          userId: 'estranho',
          typing: true,
        ),
      );
      env.pump();
      expect(env.state.otherTyping, isFalse);
    });
  });

  group('presence', () {
    scenario('o snapshot inicial diz se a outra pessoa está online', (
      async,
      env,
    ) {
      env.transport.online = ['u-beto'];
      env.open();
      expect(env.state.otherOnline, isTrue);
    });

    scenario('snapshot sem a pessoa: offline', (async, env) {
      env.open();
      expect(env.state.otherOnline, isFalse);
    });

    scenario('eventos de presença atualizam; de outras pessoas são ignorados', (
      async,
      env,
    ) {
      env.open();
      env.transport.emit(const PresenceChanged(userId: 'u-beto', online: true));
      env.pump();
      expect(env.state.otherOnline, isTrue);
      env.transport.emit(
        const PresenceChanged(userId: 'estranho', online: false),
      );
      env.transport.emit(
        const PresenceChanged(userId: 'u-beto', online: false),
      );
      env.pump();
      expect(env.state.otherOnline, isFalse);
    });

    scenario(
      'se o snapshot falhar, continua desconhecido (nunca vira "offline" por engano)',
      (async, env) {
        env.server.sends; // garante o servidor falso instalado
        env.transport.onRequest = (event, payload) {
          if (event == 'presence:get') throw const RequestTimeoutException();
          return {'ok': true};
        };
        env.open();
        expect(env.state.otherOnline, isNull);
      },
    );

    scenario('reconectar atualiza a presença', (async, env) {
      env.open();
      expect(env.state.otherOnline, isFalse);
      env.transport.online = ['u-beto'];
      env.transport.drop();
      env.pump();
      expect(env.state.otherOnline, isTrue);
    });
  });

  group('cycle of life', () {
    scenario('fechar a conversa sai da sala e avisa que parou de digitar', (
      async,
      env,
    ) {
      env.open();
      env.chat.composerChanged('oi');
      env.close();
      expect(
        env.transport.sent.any((e) => e.$1 == 'conversation:leave'),
        isTrue,
      );
      expect(
        env.transport.sent.last.$1,
        anyOf('conversation:leave', 'typing:stop'),
      );
      expect(env.transport.sent.where((e) => e.$1 == 'typing:stop').length, 1);
    });

    scenario('reabrir a conversa carrega de novo e entra na sala outra vez', (
      async,
      env,
    ) {
      env.open();
      env.close();
      env.open();
      expect(env.transport.joins.where((j) => j == convId).length, 2);
    });

    scenario('sair da conta encerra a conexão e descarta a conversa', (
      async,
      env,
    ) {
      env.open();
      unawaited(
        env.container.read(sessionControllerProvider.notifier).logout(),
      );
      env.pump();
      expect(env.container.read(chatConnectionProvider), isNull);
      expect(env.transport.isConnected, isFalse);
    });
  });
}
