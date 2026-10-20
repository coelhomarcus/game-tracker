// Volume (plano 8.1): 500 registros na biblioteca e 1000 mensagens numa conversa, contra o
// backend real isolado. Os números são carga de teste, não volume observado da plataforma.
//
//   flutter test test/integration --dart-define=GT_BACKEND=http://localhost:3100
import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/design_system/game_status.dart';
import 'package:gametracker/features/library/data/game_entry.dart';
import 'package:gametracker/features/library/data/library_repository.dart';

import 'backend_chat_test.dart' show backend, eventually, pair, send, signUp;

void main() {
  final skip = backend.isEmpty
      ? 'defina --dart-define=GT_BACKEND=http://localhost:3100'
      : null;

  test(
    '500 entries: all return, without repeat, with hours and notes unchanged',
    skip: skip,
    timeout: const Timeout(Duration(minutes: 3)),
    () async {
      final user = await signUp('vol');
      final library = RemoteLibraryRepository(user.dio);

      final createWatch = Stopwatch()..start();
      for (var i = 0; i < 500; i += 10) {
        await Future.wait([
          for (var j = i; j < i + 10; j++)
            library.create(
              900001,
              EntryDraft(
                platform: 'PC',
                status: GameStatus.values[j % GameStatus.values.length],
                hoursPlayed: j / 2,
                rating: 1 + j % 10,
                notes: 'registro $j',
              ),
            ),
        ]);
      }
      createWatch.stop();

      final listWatch = Stopwatch()..start();
      final entries = await library.listMine();
      listWatch.stop();

      // ignore: avoid_print
      print(
        'criar 500: ${createWatch.elapsedMilliseconds} ms · listar 500: ${listWatch.elapsedMilliseconds} ms',
      );
      expect(entries.length, 500);
      expect(entries.map((e) => e.id).toSet().length, 500);
      for (final e in entries) {
        final n = int.parse(e.notes!.substring('registro '.length));
        expect(e.hoursPlayed, n / 2, reason: 'horas do registro $n');
        expect(e.rating, 1 + n % 10, reason: 'nota do registro $n');
      }
      expect(
        listWatch.elapsedMilliseconds,
        lessThan(3000),
        reason: 'a listagem de 500 registros ficou lenta',
      );
    },
  );

  test(
    '1000 messages: complete paginated history, ordered without repetition',
    skip: skip,
    timeout: const Timeout(Duration(minutes: 5)),
    () async {
      final (a, b, convId) = await pair();
      addTearDown(() async {
        await a.close();
        await b.close();
      });

      final sendWatch = Stopwatch()..start();
      for (var i = 0; i < 1000; i++) {
        final ack = await send(i.isEven ? a : b, convId, 'mensagem $i');
        expect(ack['message'], isNotNull, reason: 'ACK da mensagem $i: $ack');
      }
      sendWatch.stop();

      final pageWatch = Stopwatch()..start();
      final ids = <String>[];
      final contents = <String>[];
      String? cursor;
      var pages = 0;
      do {
        final page = await a.repository.messages(convId, cursor: cursor);
        for (final m in page.items) {
          ids.add(m.id!);
          contents.add(m.content);
        }
        cursor = page.nextCursor;
        pages++;
      } while (cursor != null);
      pageWatch.stop();

      // ignore: avoid_print
      print(
        'enviar 1000: ${sendWatch.elapsedMilliseconds} ms · paginar ($pages páginas): ${pageWatch.elapsedMilliseconds} ms',
      );
      expect(ids.length, 1000);
      expect(
        ids.toSet().length,
        1000,
        reason: 'mensagem repetida entre páginas',
      );
      expect(contents, [
        for (var i = 999; i >= 0; i--) 'mensagem $i',
      ], reason: 'ordem do histórico (mais recentes primeiro)');
      await eventually(
        () => a.received.length >= 500 && b.received.length >= 500,
        reason: 'os eventos em tempo real não chegaram aos dois lados',
      );
    },
  );
}
