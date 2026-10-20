import 'dart:async';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/app/providers.dart';
import 'package:gametracker/core/models/user_summary.dart';
import 'package:gametracker/features/auth/data/auth_repository.dart';
import 'package:gametracker/features/chat/application/chat_providers.dart';
import 'package:gametracker/features/chat/application/conversations_controller.dart';
import 'package:gametracker/features/chat/data/chat_models.dart';

import '../../support/fake_auth.dart';
import '../../support/fake_chat.dart';

LastMessage last(String text, int minute, {String from = 'u-beto'}) =>
    LastMessage(
      id: 'm$minute',
      content: text,
      senderId: from,
      createdAt: DateTime.utc(2026, 6, 1, 12, minute),
    );

void scenario(
  String name,
  void Function(
    FakeAsync async,
    ProviderContainer c,
    FakeChatRepository repo,
    void Function() pump,
  )
  body, {
  DateTime Function()? clock,
}) {
  test(name, () {
    fakeAsync((async) {
      final repo = FakeChatRepository();
      final c = ProviderContainer(
        retry: noAutomaticRetry,
        overrides: [
          ...fakeAuthOverrides(
            FakeAuthRepository()..restoreResult = Restored(fakeUser()),
          ),
          chatRepositoryProvider.overrideWithValue(repo),
          // O relógio real não avança dentro do fakeAsync: usa o tempo simulado.
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

List<ConversationSummary> list(ProviderContainer c) =>
    c.read(conversationsControllerProvider).requireValue;

void main() {
  scenario(
    'ordena pela última mensagem, mais recente primeiro; sem mensagem vai para o fim',
    (async, c, repo, pump) {
      repo.list = [
        conversation(id: 'a', last: last('antiga', 1)),
        conversation(id: 'b'),
        conversation(id: 'c', last: last('nova', 9)),
      ];
      c.listen(conversationsControllerProvider, (_, _) {});
      pump();
      expect(list(c).map((e) => e.id), ['c', 'a', 'b']);
    },
  );

  scenario('o selo conta as conversas com mensagem não lida', (
    async,
    c,
    repo,
    pump,
  ) {
    repo.list = [
      conversation(id: 'a', unread: true, last: last('x', 1)),
      conversation(id: 'b', unread: false, last: last('y', 2)),
      conversation(id: 'c', unread: true, last: last('z', 3)),
    ];
    c.listen(conversationsControllerProvider, (_, _) {});
    pump();
    expect(c.read(unreadConversationsProvider), 2);
  });

  scenario(
    'mensagem minha: vira a última, sobe para o topo e não conta como não lida',
    (async, c, repo, pump) {
      repo.list = [
        conversation(id: 'a', last: last('antiga', 1)),
        conversation(id: 'b', unread: true, last: last('b', 5)),
      ];
      c.listen(conversationsControllerProvider, (_, _) {});
      pump();
      final ctl = c.read(conversationsControllerProvider.notifier);
      ctl.applyOutgoing(
        'a',
        serverMessage(
          'mm',
          text: 'respondi',
          minute: 30,
          mine: true,
          conversation: 'a',
        ),
      );
      expect(list(c).first.id, 'a');
      expect(list(c).first.lastMessage!.content, 'respondi');
      expect(list(c).first.unread, isFalse);
    },
  );

  scenario(
    'mensagem da outra pessoa: não lida se a conversa não está sendo lida, lida se está',
    (async, c, repo, pump) {
      repo.list = [conversation(id: 'a'), conversation(id: 'b')];
      c.listen(conversationsControllerProvider, (_, _) {});
      pump();
      final ctl = c.read(conversationsControllerProvider.notifier);
      ctl.applyIncoming(
        'a',
        serverMessage('x1', text: 'oi', minute: 10, conversation: 'a'),
        beingRead: false,
      );
      ctl.applyIncoming(
        'b',
        serverMessage('x2', text: 'oi', minute: 11, conversation: 'b'),
        beingRead: true,
      );
      expect(list(c).firstWhere((e) => e.id == 'a').unread, isTrue);
      expect(list(c).firstWhere((e) => e.id == 'b').unread, isFalse);
      expect(c.read(unreadConversationsProvider), 1);
    },
  );

  scenario('marcar como lida localmente zera o selo na hora', (
    async,
    c,
    repo,
    pump,
  ) {
    repo.list = [conversation(id: 'a', unread: true, last: last('x', 1))];
    c.listen(conversationsControllerProvider, (_, _) {});
    pump();
    c.read(conversationsControllerProvider.notifier).markReadLocal('a');
    expect(c.read(unreadConversationsProvider), 0);
  });

  scenario('polling a cada 30 s com o app aberto', (async, c, repo, pump) {
    c.listen(conversationsControllerProvider, (_, _) {});
    pump();
    expect(repo.conversationsCalls, 1);
    async.elapse(const Duration(seconds: 31));
    async.flushMicrotasks();
    expect(repo.conversationsCalls, 2);
    async.elapse(const Duration(seconds: 30));
    async.flushMicrotasks();
    expect(repo.conversationsCalls, 3);
  });

  scenario('o polling para com o app em segundo plano e volta ao reabrir', (
    async,
    c,
    repo,
    pump,
  ) {
    c.listen(conversationsControllerProvider, (_, _) {});
    pump();
    c.read(conversationsControllerProvider.notifier).setForeground(false);
    async.elapse(const Duration(minutes: 5));
    async.flushMicrotasks();
    expect(repo.conversationsCalls, 1, reason: 'sem polling em segundo plano');

    c.read(conversationsControllerProvider.notifier).setForeground(true);
    pump();
    expect(
      repo.conversationsCalls,
      2,
      reason: 'passou de 30 s: revalida ao voltar',
    );
    async.elapse(const Duration(seconds: 31));
    async.flushMicrotasks();
    expect(repo.conversationsCalls, 3, reason: 'o polling voltou');
  });

  scenario('mensagem nova aparece depois do polling', (async, c, repo, pump) {
    repo.list = [conversation(id: 'a', last: last('antiga', 1))];
    c.listen(conversationsControllerProvider, (_, _) {});
    pump();
    repo.list = [conversation(id: 'a', unread: true, last: last('chegou', 9))];
    async.elapse(const Duration(seconds: 31));
    async.flushMicrotasks();
    expect(list(c).single.lastMessage!.content, 'chegou');
    expect(c.read(unreadConversationsProvider), 1);
  });

  scenario('falha no polling mantém a lista anterior', (async, c, repo, pump) {
    repo.list = [conversation(id: 'a', unread: true, last: last('fica', 1))];
    c.listen(conversationsControllerProvider, (_, _) {});
    pump();
    repo.conversationsError = StateError('rede');
    async.elapse(const Duration(seconds: 31));
    async.flushMicrotasks();
    final state = c.read(conversationsControllerProvider);
    expect(state.hasError, isTrue);
    expect(
      state.value!.single.id,
      'a',
      reason: 'a lista anterior continua disponível',
    );
    expect(c.read(unreadConversationsProvider), 1);
  });

  scenario('sair da conta descarta a lista', (async, c, repo, pump) {
    repo.list = [conversation(id: 'a', unread: true, last: last('x', 1))];
    c.listen(conversationsControllerProvider, (_, _) {});
    pump();
    expect(list(c), isNotEmpty);
    unawaited(c.read(sessionControllerProvider.notifier).logout());
    pump();
    expect(c.read(conversationsControllerProvider).value, isEmpty);
    expect(c.read(unreadConversationsProvider), 0);
  });

  test('conversation without the another person does not crash the parse', () {
    final c = ConversationSummary.fromJson({
      'id': 'x',
      'otherUser': null,
      'lastMessage': null,
      'unread': false,
    });
    expect(c.otherUser, isNull);
    expect(c.lastMessage, isNull);
    expect(const UserSummary(id: 'u', username: 'a').displayName, 'a');
  });
}
