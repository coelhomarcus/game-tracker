import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/features/chat/data/chat_models.dart';
import 'package:gametracker/features/chat/presentation/chat_items.dart';

import '../../support/fake_chat.dart';

ChatMessage m(String id, {bool mine = false, DateTime? at, int minute = 0}) =>
    ChatMessage(
      id: id,
      conversationId: convId,
      sender: mine ? me : serverMessage('x').sender,
      content: id,
      createdAt: at ?? DateTime(2026, 6, 10, 12, minute),
    );

List<MessageItem> messageItems(List<ChatItem> items) =>
    items.whereType<MessageItem>().toList();

void main() {
  test('consecutive messages from the same author form the group; only the first has an avatar and only the last has the timestamp', () {
    final items = messageItems(
      buildChatItems([
        m('a', minute: 0),
        m('b', minute: 1),
        m('c', minute: 2),
      ], meId: meId),
    );
    expect(items.map((i) => i.firstInGroup), [true, false, false]);
    expect(items.map((i) => i.lastInGroup), [false, false, true]);
  });

  test('switch of author opens the new group', () {
    final items = messageItems(
      buildChatItems([
        m('a', minute: 0),
        m('b', mine: true, minute: 1),
        m('c', minute: 2),
      ], meId: meId),
    );
    expect(items.map((i) => i.firstInGroup), [true, true, true]);
    expect(items.map((i) => i.lastInGroup), [true, true, true]);
    expect(items.map((i) => i.mine), [false, true, false]);
  });

  test('the pause of 5 minutes or more separates the group, same being the same author', () {
    final items = messageItems(
      buildChatItems([
        m('a', minute: 0),
        m('b', minute: 4),
        m('c', minute: 10),
      ], meId: meId),
    );
    expect(items.map((i) => i.firstInGroup), [true, false, true]);
    expect(items.map((i) => i.lastInGroup), [false, true, true]);
  });

  test('there is the day separator at the beginning and each day change', () {
    final items = buildChatItems([
      m('a', at: DateTime(2026, 6, 9, 22)),
      m('b', at: DateTime(2026, 6, 9, 23)),
      m('c', at: DateTime(2026, 6, 10, 9)),
    ], meId: meId);
    expect(
      items
          .map((i) => i is DaySeparator ? 'dia' : (i as MessageItem).message.id)
          .toList(),
      ['dia', 'a', 'b', 'dia', 'c'],
    );
  });

  test('messages the same author in days different does not remain the same group (same stuck to the half-night)', () {
    final items = messageItems(
      buildChatItems([
        m('a', at: DateTime(2026, 6, 9, 23, 59)),
        m('b', at: DateTime(2026, 6, 10, 0, 1)),
      ], meId: meId),
    );
    expect(items.map((i) => i.firstInGroup), [true, true]);
  });

  test('list empty generates nothing', () {
    expect(buildChatItems(const [], meId: meId), isEmpty);
  });

  test('the standalone message is first and last in its group', () {
    final item = messageItems(buildChatItems([m('a')], meId: meId)).single;
    expect((item.firstInGroup, item.lastInGroup), (true, true));
  });

  test('labels of day', () {
    final now = DateTime(2026, 6, 10, 15);
    expect(dayLabel(DateTime(2026, 6, 10), now: now), 'Hoje');
    expect(dayLabel(DateTime(2026, 6, 9), now: now), 'Ontem');
    expect(dayLabel(DateTime(2026, 5, 2), now: now), '02/05');
    expect(dayLabel(DateTime(2025, 12, 31), now: now), '31/12/2025');
  });

  test('timestamp with the leading zero', () {
    expect(clockLabel(DateTime(2026, 6, 10, 9, 5)), '09:05');
  });
}
