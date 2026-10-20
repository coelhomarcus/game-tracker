// Fluxos de biblioteca e jogo contra o backend real (ambiente isolado, nunca produção).
//
//   flutter test test/integration --dart-define=GT_BACKEND=http://localhost:3100
//
// Requer os jogos sintéticos 900001/900002 no cache (cd backend && npm run test:seed),
// porque a IGDB não é acessível neste ambiente.
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/dates/date_only.dart';
import 'package:gametracker/core/design_system/game_status.dart';
import 'package:gametracker/core/network/api_client.dart';
import 'package:gametracker/core/network/app_exception.dart';
import 'package:gametracker/core/network/error_messages.dart';
import 'package:gametracker/core/network/session_manager.dart';
import 'package:gametracker/core/storage/token_store.dart';
import 'package:gametracker/features/auth/data/auth_api.dart';
import 'package:gametracker/features/games/data/game_models.dart';
import 'package:gametracker/features/games/data/games_repository.dart';
import 'package:gametracker/features/library/data/game_entry.dart';
import 'package:gametracker/features/library/data/library_repository.dart';

const backend = String.fromEnvironment('GT_BACKEND');

void main() {
  final skip = backend.isEmpty
      ? 'defina --dart-define=GT_BACKEND=http://localhost:3100'
      : null;

  late Dio dio;
  late RemoteLibraryRepository library;
  late RemoteGamesRepository games;

  Future<void> signUp() async {
    final n = DateTime.now().microsecondsSinceEpoch.toRadixString(36);
    final authApi = AuthApi(createAuthDio(baseUrl: '$backend/api'));
    final session = SessionManager(
      store: MemoryTokenStore(),
      refreshCall: authApi.refresh,
    );
    final r = await authApi.register(
      name: 'Biblioteca',
      username: 'lib_$n',
      email: 'lib_$n@example.test',
      password: 'senha-fixture-123',
    );
    await session.start(r.tokens);
    dio = createApiDio(session, baseUrl: '$backend/api');
    library = RemoteLibraryRepository(dio);
    games = RemoteGamesRepository(dio);
  }

  setUp(() async {
    if (skip == null) await signUp();
  });

  test(
    'game by igdbId: UUID internal distinct of the igdbId, without favorite',
    skip: skip,
    () async {
      final game = await games.byIgdbId(900001);
      expect(game.igdbId, 900001);
      expect(game.id, hasLength(36), reason: 'UUID');
      expect(game.platforms, isNotEmpty);
      expect(game.isFavoritedByMe, isFalse);
    },
  );

  test('missing IGDB game: domain error, does not crash', skip: skip, () async {
    await expectLater(games.byIgdbId(999999999), throwsA(isA<ApiException>()));
  });

  test(
    'search: with IGDB returns results real; without credentials, error light (never list empty)',
    skip: skip,
    () async {
      try {
        final results = await games.search('zelda');
        // Ambiente com IGDB configurada.
        expect(results, isNotEmpty);
        expect(results.every((g) => g.igdbId > 0 && g.name.isNotEmpty), isTrue);
        expect(results.first.platforms, isA<List<String>>());
      } on ApiException catch (e) {
        // Ambiente sem credenciais: a falha precisa ser distinguível de "nenhum resultado".
        expect(e.code, 'igdb_not_configured');
        expect(describeError(e), contains('não está configurada'));
      }
    },
  );

  test(
    'create two playthroughs the same game, edit, clear fields and removes the',
    skip: skip,
    () async {
      final first = await library.create(
        900001,
        const EntryDraft(
          platform: 'PC',
          status: GameStatus.completed,
          startedAt: DateOnly(2026, 1, 5),
          finishedAt: DateOnly(2026, 1, 20),
          hoursPlayed: 12.5,
          rating: 9,
          notes: 'Primeira vez',
        ),
      );
      expect(first.hoursPlayed, 12.5);
      expect(
        first.startedAt,
        const DateOnly(2026, 1, 5),
        reason: 'dia de calendário sem deslocamento de fuso',
      );
      expect(first.finishedAt, const DateOnly(2026, 1, 20));

      final second = await library.create(
        900001,
        const EntryDraft(platform: 'PC', status: GameStatus.backlog),
      );
      expect(second.id, isNot(first.id));
      expect(second.game.id, first.game.id);

      // Limpar tudo o que é opcional: omitido no cliente → null no servidor.
      final cleared = await library.update(
        first,
        const EntryDraft(
          platform: 'PC',
          status: GameStatus.completed,
          notes: 'Primeira vez',
        ),
      );
      expect(cleared.hoursPlayed, isNull);
      expect(cleared.rating, isNull);
      expect(cleared.startedAt, isNull);
      expect(cleared.finishedAt, isNull);
      expect(
        cleared.notes,
        'Primeira vez',
        reason: 'campo não alterado é preservado',
      );

      // E a coleção completa confirma o mesmo (não é só a resposta do PATCH).
      final all = await library.listMine();
      final reloaded = all.firstWhere((e) => e.id == first.id);
      expect(
        (
          reloaded.hoursPlayed,
          reloaded.rating,
          reloaded.startedAt,
          reloaded.finishedAt,
        ),
        (null, null, null, null),
      );

      await library.delete(first.id);
      final left = await library.listMine();
      expect(left.map((e) => e.id), [
        second.id,
      ], reason: 'o outro playthrough continua');
    },
  );

  test(
    'zero hours is saved and read the zero; different from missing hours',
    skip: skip,
    () async {
      final entry = await library.create(
        900002,
        const EntryDraft(
          platform: 'PC',
          status: GameStatus.playing,
          hoursPlayed: 0,
        ),
      );
      expect(entry.hoursPlayed, 0.0);

      final bumped = await library.update(
        entry,
        EntryDraft.fromEntry(entry).copyHours(7.5),
      );
      expect(bumped.hoursPlayed, 7.5);
      final zeroAgain = await library.update(
        bumped,
        EntryDraft.fromEntry(bumped).copyHours(0),
      );
      expect(
        zeroAgain.hoursPlayed,
        0.0,
        reason: 'trocar por zero não é limpar',
      );
    },
  );

  test(
    'editing without changes makes in the request and returns the same entry',
    skip: skip,
    () async {
      final entry = await library.create(
        900001,
        const EntryDraft(platform: 'PC', status: GameStatus.backlog, rating: 6),
      );
      final same = await library.update(entry, EntryDraft.fromEntry(entry));
      expect(identical(same, entry), isTrue);
    },
  );

  test(
    'favorite and unfavorite are idempotent and update the game',
    skip: skip,
    () async {
      final game = await games.byIgdbId(900001);
      await games.setFavorite(game.id, favorite: true);
      await games.setFavorite(game.id, favorite: true);
      expect((await games.byIgdbId(900001)).isFavoritedByMe, isTrue);
      await games.setFavorite(game.id, favorite: false);
      expect((await games.byIgdbId(900001)).isFavoritedByMe, isFalse);
    },
  );

  test('statistics and players count my playthrough', skip: skip, () async {
    final game = await games.byIgdbId(900002);
    final before = await games.stats(game.id);
    await library.create(
      900002,
      const EntryDraft(
        platform: 'PC',
        status: GameStatus.playing,
        hoursPlayed: 3.5,
      ),
    );
    final after = await games.stats(game.id);
    expect(after.playing, before.playing + 1);

    final players = await games.players(
      game.id,
      status: GameStatus.playing,
      scope: PlayersScope.all,
    );
    expect(players.any((p) => p.hoursPlayed == 3.5), isTrue);
    final following = await games.players(
      game.id,
      status: GameStatus.playing,
      scope: PlayersScope.following,
    );
    expect(following, isEmpty, reason: 'não sigo ninguém');
  });

  test('entry of another user cannot ser editado', skip: skip, () async {
    final mine = await library.create(
      900001,
      const EntryDraft(platform: 'PC', status: GameStatus.backlog),
    );
    await signUp(); // outra conta
    await expectLater(
      library.update(mine, EntryDraft.fromEntry(mine).copyHours(1)),
      throwsA(isA<ApiException>().having((e) => e.status, 'status', 404)),
    );
    await expectLater(library.delete(mine.id), throwsA(isA<ApiException>()));
  });
}

extension on EntryDraft {
  EntryDraft copyHours(double hours) => EntryDraft(
    platform: platform,
    status: status,
    startedAt: startedAt,
    finishedAt: finishedAt,
    hoursPlayed: hours,
    rating: rating,
    notes: notes,
  );
}
