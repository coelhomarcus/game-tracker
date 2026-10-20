import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/features/chat/application/chat_controller.dart';
import 'package:gametracker/features/chat/presentation/chat_room_page.dart';
import 'package:gametracker/core/models/user_summary.dart';
import 'package:gametracker/core/network/app_exception.dart';
import 'package:gametracker/core/realtime/chat_transport.dart';
import 'package:gametracker/features/chat/data/chat_models.dart';
import 'package:material_ui/material_ui.dart';

import '../../support/fake_chat.dart';
import '../../support/fake_feed.dart';
import '../../support/fake_profiles.dart';
import '../../support/fake_transport.dart';
import '../../support/harness.dart';

LastMessage last(String text, {String from = 'u-beto', int minute = 5}) =>
    LastMessage(
      id: 'l$minute',
      content: text,
      senderId: from,
      createdAt: DateTime.now().subtract(Duration(minutes: minute)),
    );

Finder get composer => find.widgetWithText(TextField, 'Mensagem');
Finder get sendButton => find.widgetWithIcon(IconButton, Icons.send);

Future<AppHarness> openMessages(
  WidgetTester tester, {
  AppHarness? harness,
  Size size = const Size(400, 900),
}) async {
  final h = harness ?? AppHarness();
  await h.pump(tester, size: size);
  await tapAndSettle(tester, find.text('Mensagens').last);
  return h;
}

Future<AppHarness> openRoom(
  WidgetTester tester, {
  AppHarness? harness,
  Size size = const Size(400, 900),
}) async {
  final h = harness ?? AppHarness();
  await h.pump(tester, size: size);
  await goTo(tester, '/messages/$convId');
  return h;
}

Future<void> typeAndSend(WidgetTester tester, String text) async {
  await tester.enterText(composer, text);
  await tester.pumpAndSettle();
  await tapAndSettle(tester, sendButton);
}

void main() {
  group('list of conversations', () {
    testWidgets(
      'shows the person, the preview (with "You:" in the my) and the hour',
      (tester) async {
        final h = AppHarness();
        h.chat.list = [
          conversation(id: 'a', last: last('oi, tudo bem?')),
          conversation(
            id: 'b',
            other: ana,
            last: last('combinado', from: meId, minute: 40),
          ),
        ];
        await openMessages(tester, harness: h);
        expect(find.text('beto'), findsOneWidget);
        expect(find.text('oi, tudo bem?'), findsOneWidget);
        expect(find.text('Você: combinado'), findsOneWidget);
        expect(find.text('há 5 min'), findsOneWidget);
      },
    );

    testWidgets('unread: dot in the line and badge with the count in the tab', (
      tester,
    ) async {
      final h = AppHarness();
      h.chat.list = [
        conversation(id: 'a', unread: true, last: last('nova!')),
        conversation(
          id: 'b',
          other: ana,
          unread: true,
          last: last('outra', minute: 9),
        ),
        conversation(
          id: 'c',
          other: const UserSummary(id: 'u-cris', username: 'cris'),
          last: last('lida', minute: 20),
        ),
      ];
      await h.pump(tester);
      expect(
        find.widgetWithText(Badge, '2'),
        findsOneWidget,
        reason: 'selo na aba, sem abrir Mensagens',
      );
      await tapAndSettle(tester, find.text('Mensagens').last);
      expect(find.byType(Badge), findsOneWidget);
    });

    testWidgets('without conversations: state empty with action', (
      tester,
    ) async {
      final h = AppHarness();
      h.chat.list = [];
      await openMessages(tester, harness: h);
      expect(find.text('Nenhuma conversa ainda'), findsOneWidget);
      expect(
        find.widgetWithText(FilledButton, 'Nova conversa'),
        findsOneWidget,
      );
      expect(find.byType(Badge), findsNothing);
    });

    testWidgets('error to the load is not list empty and allows try of new', (
      tester,
    ) async {
      final h = AppHarness();
      h.chat.conversationsError = const NetworkException();
      await openMessages(tester, harness: h);
      expect(find.textContaining('Sem conexão'), findsOneWidget);
      expect(find.text('Nenhuma conversa ainda'), findsNothing);
      h.chat.conversationsError = null;
      await tapAndSettle(tester, find.text('Tentar de novo'));
      expect(find.text('beto'), findsOneWidget);
    });

    testWidgets('tap opens the conversation', (tester) async {
      final h = AppHarness();
      h.chat.history[convId] = [serverMessage('m1', text: 'olá!', minute: 1)];
      await openMessages(tester, harness: h);
      await tapAndSettle(tester, find.text('beto'));
      expect(find.text('olá!'), findsOneWidget);
      expect(find.widgetWithText(TextField, 'Mensagem'), findsOneWidget);
    });

    testWidgets(
      'in screen wide: list and conversation side the side, without button of return',
      (tester) async {
        final h = AppHarness();
        h.chat.history[convId] = [serverMessage('m1', text: 'olá!', minute: 1)];
        await openMessages(tester, harness: h, size: const Size(1100, 800));
        expect(find.text('Escolha uma conversa'), findsOneWidget);

        await tapAndSettle(tester, find.text('beto'));
        expect(find.text('olá!'), findsOneWidget);
        expect(find.text('Escolha uma conversa'), findsNothing);
        expect(
          find.byType(BackButton),
          findsNothing,
          reason: 'painel de detalhe, não uma rota',
        );
        expect(
          find.text('Mensagens'),
          findsWidgets,
          reason: 'a lista continua visível',
        );
      },
    );

    testWidgets('drag for update retries the query', (tester) async {
      final h = await openMessages(tester);
      final before = h.chat.conversationsCalls;
      await tester.fling(
        find.byType(Scrollable).last,
        const Offset(0, 400),
        1000,
      );
      await tester.pumpAndSettle();
      expect(h.chat.conversationsCalls, before + 1);
    });
  });

  group('new conversation', () {
    testWidgets('choose the person opens (or reuses) the conversation', (
      tester,
    ) async {
      final h = AppHarness();
      h.chat.list = [];
      h.profiles.searchResult = [
        fakePerson(id: 'u-beto', username: 'beto', name: 'Beto Silva'),
      ];
      await openMessages(tester, harness: h);
      h.chat.list = [conversation(other: beto)];

      await tapAndSettle(
        tester,
        find.widgetWithText(FloatingActionButton, 'Nova conversa'),
      );
      await tester.enterText(
        find.descendant(
          of: find.byType(SearchBar),
          matching: find.byType(EditableText),
        ),
        'be',
      );
      await tester.pump(const Duration(milliseconds: 450));
      await tester.pumpAndSettle();
      expect(
        find.text('Seguir'),
        findsNothing,
        reason: 'no seletor não há botão de seguir',
      );
      await tapAndSettle(tester, find.text('Beto Silva'));

      expect(h.chat.opened, ['u-beto']);
      expect(
        find.widgetWithText(TextField, 'Mensagem'),
        findsOneWidget,
        reason: 'abriu a conversa',
      );
    });

    testWidgets(
      'the button message in the profile opens the conversation with the person',
      (tester) async {
        final h = AppHarness();
        h.profiles.profiles['u-beto'] = fakeProfile(name: 'Beto');
        await h.pump(tester);
        await goTo(tester, '/users/u-beto');
        await tapAndSettle(
          tester,
          find.widgetWithText(OutlinedButton, 'Mensagem'),
        );
        expect(h.chat.opened, ['u-beto']);
        expect(find.widgetWithText(TextField, 'Mensagem'), findsOneWidget);
      },
    );

    testWidgets('the profile own does not has button message', (tester) async {
      final h = AppHarness();
      h.profiles.profiles['u1'] = fakeProfile(
        id: 'u1',
        username: 'ana',
        name: 'ANA',
      );
      await h.pump(tester);
      await tapAndSettle(tester, find.text('Perfil').last);
      expect(find.widgetWithText(OutlinedButton, 'Mensagem'), findsNothing);
    });

    testWidgets(
      'fails when opening the conversation warns and does not navigate',
      (tester) async {
        final h = AppHarness();
        h.profiles.profiles['u-beto'] = fakeProfile(name: 'Beto');
        await h.pump(tester);
        await goTo(tester, '/users/u-beto');
        h.chat.conversationsError = const NetworkException();
        await tapAndSettle(
          tester,
          find.widgetWithText(OutlinedButton, 'Mensagem'),
        );
        expect(find.textContaining('Sem conexão'), findsOneWidget);
        expect(find.widgetWithText(TextField, 'Mensagem'), findsNothing);
      },
    );
  });

  group('conversation: history', () {
    testWidgets(
      'shows the messages with separator of day and the hour of the end of the group',
      (tester) async {
        final h = AppHarness();
        h.chat.history[convId] = [
          serverMessage('m1', text: 'primeira', minute: 1),
          serverMessage('m2', text: 'segunda', minute: 2),
          serverMessage('m3', text: 'minha resposta', minute: 3, mine: true),
        ];
        await openRoom(tester, harness: h);
        expect(find.text('primeira'), findsOneWidget);
        expect(find.text('segunda'), findsOneWidget);
        expect(find.text('minha resposta'), findsOneWidget);
        expect(find.text('Início da conversa'), findsOneWidget);
        // Minha mensagem à direita, a da outra pessoa à esquerda.
        final mineX = tester.getCenter(find.text('minha resposta')).dx;
        final theirsX = tester.getCenter(find.text('primeira')).dx;
        expect(mineX, greaterThan(theirsX));
      },
    );

    testWidgets('conversation new: invites the say oi', (tester) async {
      await openRoom(tester);
      expect(find.text('Diga oi para beto'), findsOneWidget);
    });

    testWidgets(
      'history long loads more old to the scroll for top, without duplicates',
      (tester) async {
        final h = AppHarness();
        h.chat.pageSize = 10;
        h.chat.history[convId] = [
          for (var i = 1; i <= 25; i++)
            serverMessage(
              'm${i.toString().padLeft(2, '0')}',
              text: 'msg $i',
              minute: i,
            ),
        ];
        await openRoom(tester, harness: h, size: const Size(400, 500));
        expect(find.text('msg 25'), findsOneWidget);

        for (var i = 0; i < 8; i++) {
          await tester.drag(
            find.byType(Scrollable).first,
            const Offset(0, 500),
          );
          await tester.pumpAndSettle();
        }
        expect(
          find.text('Início da conversa', skipOffstage: false),
          findsOneWidget,
        );
        // A lista é lazy: confere o estado (todas as 25, sem repetir) e não só o que está construído.
        final container = ProviderScope.containerOf(
          tester.element(find.byType(ChatRoomView)),
        );
        final messages = container
            .read(chatControllerProvider(convId))
            .requireValue
            .messages;
        expect(messages.length, 25);
        expect(
          messages.map((m) => m.id).toSet().length,
          25,
          reason: 'sem duplicatas',
        );
        expect(
          h.chat.messageCalls.where((c) => c.$2 != null).length,
          2,
          reason: '25 mensagens em páginas de 10',
        );
      },
    );

    testWidgets('conversation missing shows error with exit', (tester) async {
      final h = AppHarness();
      h.chat.list = [];
      await h.pump(tester);
      await goTo(tester, '/messages/nao-existe');
      expect(find.text('Não encontrado.'), findsOneWidget);
    });
  });

  group('conversation: send', () {
    testWidgets(
      'message appears immediately, input clears, and timestamp arrives with ACK',
      (tester) async {
        final h = AppHarness();
        await openRoom(tester, harness: h);
        await typeAndSend(tester, 'Olá, Beto!');

        expect(find.text('Olá, Beto!'), findsOneWidget);
        expect(tester.widget<TextField>(composer).controller!.text, isEmpty);
        expect(find.text('Enviando…'), findsNothing, reason: 'o ACK já chegou');
        expect(h.chatServer.stored, 1);
        expect(find.byIcon(Icons.done), findsOneWidget);
      },
    );

    testWidgets('send is disabled without text and with spaces only', (
      tester,
    ) async {
      await openRoom(tester);
      expect(tester.widget<IconButton>(sendButton).onPressed, isNull);
      await tester.enterText(composer, '   ');
      await tester.pumpAndSettle();
      expect(tester.widget<IconButton>(sendButton).onPressed, isNull);
      await tester.enterText(composer, 'ok');
      await tester.pumpAndSettle();
      expect(tester.widget<IconButton>(sendButton).onPressed, isNotNull);
    });

    testWidgets('near of the limit appears the counter', (tester) async {
      await openRoom(tester);
      await tester.enterText(composer, 'x' * 1850);
      await tester.pumpAndSettle();
      expect(find.text('1850/2000'), findsOneWidget);
    });

    testWidgets(
      'event before of the ACK does not duplicates the message in the screen',
      (tester) async {
        final h = AppHarness();
        await openRoom(tester, harness: h);
        h.chatServer.eventBeforeAck = true;
        await typeAndSend(tester, 'uma só');
        expect(find.text('uma só'), findsOneWidget);
      },
    );

    testWidgets(
      'a lost ACK shows "confirming…" and confirms without duplicates',
      (tester) async {
        final h = AppHarness();
        await openRoom(tester, harness: h);
        h.chatServer.dropAcks = 1;
        await tester.enterText(composer, 'importante');
        await tester.pumpAndSettle();
        await tester.tap(sendButton);
        await tester.pump();
        await tester.pump();
        expect(find.text('Confirmando…'), findsOneWidget);

        await tester.pump(const Duration(seconds: 2));
        await tester.pumpAndSettle();
        expect(find.text('Confirmando…'), findsNothing);
        expect(find.text('importante'), findsOneWidget);
        expect(
          h.chatServer.stored,
          1,
          reason: 'o reenvio não duplicou no servidor',
        );
        expect(h.chatServer.sends.length, 2);
      },
    );

    testWidgets(
      'an undelivered message keeps its text, with "try again" and "discard" actions',
      (tester) async {
        final h = AppHarness();
        await openRoom(tester, harness: h);
        h.chatServer.ignoreSends = 3;
        await typeAndSend(tester, 'não saiu');
        await tester.pump(const Duration(seconds: 10));
        await tester.pumpAndSettle();

        expect(
          find.text('não saiu'),
          findsOneWidget,
          reason: 'o texto não se perde',
        );
        expect(find.text('Não enviada'), findsOneWidget);
        expect(find.text('Tentar de novo'), findsOneWidget);

        await tapAndSettle(tester, find.text('Tentar de novo'));
        expect(find.text('Não enviada'), findsNothing);
        expect(find.text('não saiu'), findsOneWidget);
        expect(h.chatServer.stored, 1);
      },
    );

    testWidgets('discard removes the message does not delivered', (
      tester,
    ) async {
      final h = AppHarness();
      await openRoom(tester, harness: h);
      h.chatServer.ignoreSends = 3;
      await typeAndSend(tester, 'descartar');
      await tester.pump(const Duration(seconds: 10));
      await tester.pumpAndSettle();
      await tapAndSettle(tester, find.text('Descartar'));
      expect(find.text('descartar'), findsNothing);
    });

    testWidgets('rejects from the server appears the does not send', (
      tester,
    ) async {
      final h = AppHarness();
      await openRoom(tester, harness: h);
      h.chatServer.rejectWith = 'Conversa não encontrada';
      await typeAndSend(tester, 'negada');
      await tester.pumpAndSettle();
      expect(find.text('Não enviada'), findsOneWidget);
    });

    testWidgets('the draft survives the leave and return of the conversation', (
      tester,
    ) async {
      final h = AppHarness();
      await openRoom(tester, harness: h);
      await tester.enterText(composer, 'ainda estou escrevendo');
      await tester.pumpAndSettle();

      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      await goTo(tester, '/messages/$convId');
      expect(
        tester.widget<TextField>(composer).controller!.text,
        'ainda estou escrevendo',
      );
    });

    testWidgets('after send, the draft some', (tester) async {
      final h = AppHarness();
      await openRoom(tester, harness: h);
      await typeAndSend(tester, 'enviada');
      await goTo(tester, '/messages');
      await goTo(tester, '/messages/$convId');
      expect(tester.widget<TextField>(composer).controller!.text, isEmpty);
    });
  });

  group('conversation: connection', () {
    testWidgets(
      'without connection: warning, message queued, and delivered once after reconnecting',
      (tester) async {
        final h = AppHarness();
        await openRoom(tester, harness: h);
        h.transport.defaultOutcome = const ConnectFail();
        h.transport.drop();
        await tester.pumpAndSettle();
        expect(find.textContaining('Sem conexão'), findsOneWidget);
        expect(find.text('Tentar agora'), findsOneWidget);

        await typeAndSend(tester, 'na fila');
        expect(find.text('na fila'), findsOneWidget);
        expect(find.text('Enviando…'), findsOneWidget);
        expect(h.chatServer.sends, isEmpty);

        h.transport.defaultOutcome = const ConnectOk();
        await tapAndSettle(tester, find.text('Tentar agora'));
        await tester.pump(const Duration(seconds: 3));
        await tester.pumpAndSettle();
        expect(find.textContaining('Sem conexão'), findsNothing);
        expect(find.text('Enviando…'), findsNothing);
        expect(h.chatServer.stored, 1);
        expect(find.text('na fila'), findsOneWidget);
      },
    );

    testWidgets('the that arrived during the drop appears after reconnect', (
      tester,
    ) async {
      final h = AppHarness();
      h.chat.history[convId] = [serverMessage('m1', text: 'antes', minute: 1)];
      await openRoom(tester, harness: h);
      h.transport.drop();
      h.chat.history[convId]!.add(
        serverMessage('m2', text: 'durante a queda', minute: 2),
      );
      await tester.pumpAndSettle();
      expect(find.text('durante a queda'), findsOneWidget);
      expect(find.text('antes'), findsOneWidget);
    });
  });

  group('conversation: to the live', () {
    testWidgets('message of the another person appears immediately', (
      tester,
    ) async {
      final h = AppHarness();
      await openRoom(tester, harness: h);
      h.chatServer.incoming('chegou agora');
      await tester.pumpAndSettle();
      expect(find.text('chegou agora'), findsOneWidget);
    });

    testWidgets(
      'typing and online appear under the name; unknown does not asserts offline',
      (tester) async {
        final h = AppHarness();
        await openRoom(tester, harness: h);
        expect(find.text('online'), findsNothing);
        expect(find.text('digitando…'), findsNothing);

        h.transport.emit(const PresenceChanged(userId: 'u-beto', online: true));
        await tester.pumpAndSettle();
        expect(find.text('online'), findsOneWidget);

        h.transport.emit(
          const TypingChanged(
            conversationId: convId,
            userId: 'u-beto',
            typing: true,
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('digitando…'), findsOneWidget);
        expect(
          find.text('online'),
          findsNothing,
          reason: 'digitando tem prioridade',
        );

        await tester.pump(const Duration(seconds: 5));
        expect(
          find.text('digitando…'),
          findsNothing,
          reason: 'expira sem o aviso de parada',
        );
      },
    );

    testWidgets('snapshot of presence initial shows online', (tester) async {
      final h = AppHarness();
      h.transport.online = ['u-beto'];
      await openRoom(tester, harness: h);
      expect(find.text('online'), findsOneWidget);
    });

    testWidgets('write warns the another person (the time in the window)', (
      tester,
    ) async {
      final h = AppHarness();
      await openRoom(tester, harness: h);
      await tester.enterText(composer, 'o');
      await tester.enterText(composer, 'ol');
      await tester.enterText(composer, 'olá');
      await tester.pump();
      expect(h.transport.sent.where((e) => e.$1 == 'typing:start').length, 1);
      await tester.pump(const Duration(seconds: 4));
    });

    testWidgets('open the conversation marks the read and clears the badge', (
      tester,
    ) async {
      final h = AppHarness();
      h.chat.list = [conversation(unread: true, last: last('nova'))];
      h.chat.history[convId] = [serverMessage('m1', text: 'nova', minute: 1)];
      await h.pump(tester);
      expect(find.widgetWithText(Badge, '1'), findsOneWidget);

      await goTo(tester, '/messages/$convId');
      await tester.pump(const Duration(seconds: 1));
      await tester.pumpAndSettle();
      expect(h.chat.markReadCalls, [convId]);
      await goTo(tester, '/messages');
      expect(find.byType(Badge), findsNothing);
    });

    testWidgets('title opens profile of the another person', (tester) async {
      final h = AppHarness();
      h.profiles.profiles['u-beto'] = fakeProfile(name: 'Beto');
      await openRoom(tester, harness: h);
      await tapAndSettle(tester, find.text('beto').first);
      expect(find.text('@beto'), findsOneWidget);
    });
  });

  testWidgets('layout the 360 px with text 200% does not overflows', (
    tester,
  ) async {
    final h = AppHarness();
    h.chat.history[convId] = [
      serverMessage('m1', text: 'Uma mensagem bem comprida ' * 6, minute: 1),
      serverMessage(
        'm2',
        text: 'e a resposta também é longa ' * 5,
        minute: 2,
        mine: true,
      ),
    ];
    await h.pump(tester, size: const Size(360, 800), textScale: 2.0);
    await goTo(tester, '/messages/$convId');
    expect(tester.takeException(), isNull);
  });
}
