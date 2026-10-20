import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/client_id.dart';
import 'package:gametracker/features/chat/application/message_merge.dart';
import 'package:gametracker/features/chat/data/chat_models.dart';

import '../../support/fake_feed.dart';

const _conv = 'c1';

ChatMessage server(
  String id, {
  String? cid,
  String text = 'oi',
  int minute = 0,
  bool mine = true,
}) => ChatMessage(
  id: id,
  clientMessageId: cid,
  conversationId: _conv,
  sender: mine ? ana : beto,
  content: text,
  createdAt: DateTime.utc(2026, 6, 1, 12, minute),
);

ChatMessage pending(
  String cid, {
  String text = 'pendente',
  int minute = 30,
  MessageStatus status = MessageStatus.sending,
}) => ChatMessage(
  clientMessageId: cid,
  conversationId: _conv,
  sender: ana,
  content: text,
  createdAt: DateTime.utc(2026, 6, 1, 12, minute),
  status: status,
);

List<String> keys(List<ChatMessage> l) => l.map((m) => m.key).toList();

void main() {
  group('deduplication by clientMessageId', () {
    test('event arrives before ACK: pending message is replaced once', () {
      var list = mergeMessages(const [], [pending('c-1', text: 'olá')]);
      list = mergeMessages(list, [
        server('s-1', cid: 'c-1', text: 'olá', minute: 1),
      ]); // evento
      list = mergeMessages(list, [
        server('s-1', cid: 'c-1', text: 'olá', minute: 1),
      ]); // ACK
      expect(list.length, 1);
      expect(list.single.id, 's-1');
      expect(list.single.status, MessageStatus.sent);
    });

    test('the ACK arrives before of the event: same result', () {
      var list = mergeMessages(const [], [pending('c-1')]);
      list = mergeMessages(list, [server('s-1', cid: 'c-1')]); // ACK
      list = mergeMessages(list, [server('s-1', cid: 'c-1')]); // evento
      expect(list.length, 1);
    });

    test('the key does not change when the pending message is confirmed (the list does not blinks)', () {
      final before = mergeMessages(const [], [pending('c-1')]);
      final after = mergeMessages(before, [server('s-1', cid: 'c-1')]);
      expect(before.single.key, 'c-1');
      expect(after.single.key, 'c-1');
    });

    test(
      'the ACK never arrives: the history confirms the message uncertain',
      () {
        var list = mergeMessages(const [], [
          pending('c-1', status: MessageStatus.uncertain),
        ]);
        list = mergeMessages(list, [
          server('s-9', cid: 'c-1', minute: 5),
          server('s-8', minute: 4, mine: false),
        ]);
        expect(list.where((m) => m.clientMessageId == 'c-1').length, 1);
        expect(
          list.firstWhere((m) => m.clientMessageId == 'c-1').status,
          MessageStatus.sent,
        );
        expect(
          list.any((m) => !m.isConfirmed),
          isFalse,
          reason: 'nada fica pendente',
        );
      },
    );

    test('confirm the pending does not moves in the other', () {
      var list = mergeMessages(const [], [
        pending('a', minute: 30),
        pending('b', minute: 31),
      ]);
      list = mergeMessages(list, [server('s-a', cid: 'a')]);
      expect(list.length, 2);
      expect(list.first.id, 's-a');
      expect(list.last.clientMessageId, 'b');
      expect(list.last.isConfirmed, isFalse);
    });

    test('pending added twice does not duplicates', () {
      var list = mergeMessages(const [], [pending('a')]);
      list = mergeMessages(list, [pending('a')]);
      expect(list.length, 1);
    });

    test('pending message is not added when confirmed message is already in the list', () {
      var list = mergeMessages(const [], [server('s-a', cid: 'a')]);
      list = mergeMessages(list, [pending('a')]);
      expect(list.length, 1);
      expect(list.single.isConfirmed, isTrue);
    });
  });

  group('deduplication by id', () {
    test('the same message by two paths becomes the only', () {
      var list = mergeMessages(const [], [server('s-1')]);
      list = mergeMessages(list, [server('s-1'), server('s-1')]);
      expect(list.length, 1);
    });

    test('message from another user (without clientMessageId) is not confused with the my', () {
      var list = mergeMessages(const [], [pending('a')]);
      list = mergeMessages(list, [server('s-x', mine: false)]);
      expect(list.length, 2);
    });

    test('messages of the client legacy (clientMessageId null) coexist and deduplicate by id', () {
      var list = mergeMessages(const [], [
        server('s-1', cid: null),
        server('s-2', cid: null, minute: 1),
      ]);
      list = mergeMessages(list, [server('s-2', cid: null, minute: 1)]);
      expect(keys(list), ['s-1', 's-2']);
    });
  });

  group('order', () {
    test('confirmed in order from the server; pending after, in the order in that were written', () {
      final list = mergeMessages(const [], [
        pending('p2', minute: 31),
        server('s-3', minute: 3),
        pending('p1', minute: 30),
        server('s-1', minute: 1),
      ]);
      expect(list.map((m) => m.id ?? m.clientMessageId).toList(), [
        's-1',
        's-3',
        'p2',
        'p1',
      ]);
    });

    test('same timestamp: breaks ties by id, stably', () {
      final list = mergeMessages(const [], [
        server('b', minute: 1),
        server('a', minute: 1),
      ]);
      expect(list.map((m) => m.id).toList(), ['a', 'b']);
    });

    test('pages old enter before of the new', () {
      var list = mergeMessages(const [], [
        server('s-5', minute: 5),
        server('s-6', minute: 6),
      ]);
      list = mergeMessages(list, [
        server('s-1', minute: 1),
        server('s-2', minute: 2),
      ]);
      expect(list.map((m) => m.id).toList(), ['s-1', 's-2', 's-5', 's-6']);
    });

    test('confirmed message uses server time and may move before another message received meanwhile', () {
      var list = mergeMessages(const [], [pending('a', minute: 30)]);
      list = mergeMessages(list, [server('s-b', minute: 2, mine: false)]);
      list = mergeMessages(list, [server('s-a', cid: 'a', minute: 1)]);
      expect(list.map((m) => m.id).toList(), ['s-a', 's-b']);
    });
  });

  group('properties', () {
    test(
      'is idempotent: merging of new the same messages does not change nothing',
      () {
        final incoming = [
          server('s-1', cid: 'a'),
          server('s-2', minute: 1, mine: false),
          pending('b', minute: 30),
        ];
        final once = mergeMessages(const [], incoming);
        final twice = mergeMessages(once, incoming);
        expect(keys(twice), keys(once));
      },
    );

    test('does not depends of the order of arrival: any shuffle gives the same list end', () {
      final all = [
        for (var i = 1; i <= 12; i++)
          server(
            's-${i.toString().padLeft(2, '0')}',
            cid: i.isEven ? 'c-$i' : null,
            minute: i,
            mine: i.isEven,
          ),
      ];
      final expected = keys(mergeMessages(const [], all));
      final random = Random(42);
      for (var run = 0; run < 50; run++) {
        // Páginas que se sobrepõem, em ordem aleatória, com repetições.
        final chunks = <List<ChatMessage>>[];
        for (var s = 0; s < 8; s++) {
          final start = random.nextInt(all.length - 3);
          chunks.add(all.sublist(start, start + 2 + random.nextInt(3)));
        }
        chunks.add(all); // garante cobertura total
        chunks.shuffle(random);
        var list = <ChatMessage>[];
        for (final c in chunks) {
          list = mergeMessages(list, c);
        }
        expect(keys(list), expected, reason: 'execução $run');
      }
    });

    test('with pending in the middle, the confirmation in any order does not duplicates or loses', () {
      final random = Random(7);
      for (var run = 0; run < 30; run++) {
        var list = mergeMessages(const [], [
          for (var i = 0; i < 4; i++) pending('p$i', minute: 30 + i),
        ]);
        final confirmations = [
          for (var i = 0; i < 4; i++) server('s$i', cid: 'p$i', minute: i),
        ]..shuffle(random);
        for (final c in confirmations) {
          list = mergeMessages(list, [c]);
          list = mergeMessages(list, [c]);
        }
        expect(list.length, 4);
        expect(list.every((m) => m.isConfirmed), isTrue);
      }
    });

    test('latestConfirmedId ignores the pending', () {
      final list = mergeMessages(const [], [
        server('s-1', minute: 1),
        server('s-2', minute: 2),
        pending('p'),
      ]);
      expect(latestConfirmedId(list), 's-2');
      expect(
        latestConfirmedId(mergeMessages(const [], [pending('p')])),
        isNull,
      );
    });
  });

  group('newClientId', () {
    test('is the valid and unique UUID v4', () {
      final pattern = RegExp(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      );
      final ids = {for (var i = 0; i < 500; i++) newClientId()};
      expect(ids.length, 500);
      expect(ids.every(pattern.hasMatch), isTrue);
    });
  });

  group('contract: replies real from the backend', () {
    test('history: message with and without clientMessageId', () {
      final withCid = ChatMessage.fromJson({
        'id': 'a1b2c3d4-0000-4000-8000-000000000001',
        'conversationId': 'c',
        'senderId': 'u',
        'content': 'oi',
        'clientMessageId': 'a1b2c3d4-0000-4000-8000-0000000000aa',
        'createdAt': '2026-10-04T15:45:15.136Z',
        'sender': {
          'id': 'u',
          'username': 'ana',
          'name': null,
          'avatarUrl': null,
        },
      });
      expect(withCid.clientMessageId, isNotNull);
      expect(withCid.key, withCid.clientMessageId);
      final legacy = ChatMessage.fromJson({
        'id': 'a1b2c3d4-0000-4000-8000-000000000002',
        'conversationId': 'c',
        'senderId': 'u',
        'content': 'legado',
        'clientMessageId': null,
        'createdAt': '2026-10-04T15:45:16.136Z',
        'sender': {
          'id': 'u',
          'username': 'ana',
          'name': null,
          'avatarUrl': null,
        },
      });
      expect(legacy.clientMessageId, isNull);
      expect(legacy.key, legacy.id);
    });

    test('list of conversations', () {
      final c = ConversationSummary.fromJson({
        'id': 'c1',
        'otherUser': {
          'id': 'u2',
          'username': 'beto',
          'name': 'Beto',
          'avatarUrl': null,
        },
        'lastMessage': {
          'id': 'm',
          'content': 'oi',
          'senderId': 'u2',
          'createdAt': '2026-10-04T15:45:15.136Z',
          'conversationId': 'c1',
        },
        'unread': true,
      });
      expect(c.otherUser!.displayName, 'Beto');
      expect(c.lastMessage!.content, 'oi');
      expect(c.unread, isTrue);
      expect(
        ConversationSummary.fromJson({
          'id': 'c2',
          'otherUser': null,
          'lastMessage': null,
          'unread': false,
        }).lastMessage,
        isNull,
      );
    });
  });
}
