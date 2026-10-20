// Projeção da Biblioteca por jogo: agrupamento sem fundir replays, filtros combinados,
// contagens únicas, prateleira e ordenação.
import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/design_system/game_status.dart';
import 'package:gametracker/features/library/application/library_groups.dart';
import 'package:gametracker/features/library/application/library_prefs.dart';
import 'package:gametracker/features/library/data/game_entry.dart';

import '../../support/fake_repos.dart';

DateTime day(int d) => DateTime.utc(2026, 1, d);

GameEntry entry(
  String id,
  int igdb,
  String name, {
  GameStatus status = GameStatus.backlog,
  String platform = 'PC',
  double? hours,
  int created = 1,
}) => fakeEntry(
  id: id,
  game: fakeGame(igdbId: igdb, name: name),
  status: status,
  platform: platform,
  hours: hours,
  createdAt: day(created),
);

List<String> names(LibraryOverview o) => [
  for (final g in o.groups) g.game.name,
];

void main() {
  group('foldText', () {
    test('ignores case, accents, and repeated spaces', () {
      expect(foldText('  Pokémon   Ônix '), 'pokemon onix');
      expect(foldText('ÁÉÍÓÚ àèìòù ãõ ç ñ'), 'aeiou aeiou ao c n');
      expect(foldText('Straße'), 'strasse');
      expect(foldText('Café'), foldText('CAFE'));
    });
  });

  group('grouping', () {
    final replays = [
      entry('a', 1, 'Hades', status: GameStatus.completed, created: 1),
      entry('b', 1, 'Hades', status: GameStatus.playing, created: 3),
      entry('c', 2, 'Celeste', created: 2),
    ];

    test('the group by game, preserving all the entries', () {
      final o = buildLibraryOverview(replays);
      expect(o.groups, hasLength(2));
      final hades = o.groups.firstWhere((g) => g.game.name == 'Hades');
      expect([for (final e in hades.entries) e.id], ['b', 'a']);
      expect(hades.totalEntries, 2);
      expect(hades.hasReplays, isTrue);
    });

    test('entries the same game the same platform continue separated', () {
      final o = buildLibraryOverview([
        entry('x', 1, 'Hades', platform: 'PC', created: 1),
        entry('y', 1, 'Hades', platform: 'PC', created: 2),
      ]);
      expect(o.groups.single.entries, hasLength(2));
      expect(o.summary.records, 2);
      expect(o.summary.games, 1);
    });

    test('order of the entries: newest first, tie-break through the id', () {
      final o = buildLibraryOverview([
        entry('a', 1, 'Hades', created: 5),
        entry('c', 1, 'Hades', created: 5),
        entry('b', 1, 'Hades', created: 5),
        entry('z', 1, 'Hades', created: 9),
      ]);
      expect(
        [for (final e in o.groups.single.entries) e.id],
        ['z', 'c', 'b', 'a'],
      );
    });

    test(
      'summary counts unique games, entries, and currently playing games',
      () {
        final o = buildLibraryOverview([
          ...replays,
          entry('d', 3, 'Doom', status: GameStatus.playing, created: 4),
          entry('e', 3, 'Doom', status: GameStatus.playing, created: 5),
        ]);
        expect(o.summary.games, 3);
        expect(o.summary.records, 5);
        expect(o.summary.playingGames, 2, reason: 'Doom conta uma vez');
      },
    );
  });

  group('status and platform the same entry', () {
    // Concluído no PC + jogando no PS5: não pode aparecer em "jogando / PC".
    final mixed = [
      entry('a', 1, 'Hades', status: GameStatus.completed, platform: 'PC'),
      entry('b', 1, 'Hades', status: GameStatus.playing, platform: 'PS5'),
    ];

    test('playing + PC does not finds the game', () {
      final o = buildLibraryOverview(
        mixed,
        filter: const LibraryFilter(
          status: GameStatus.playing,
          platformKey: 'pc',
        ),
      );
      expect(o.groups, isEmpty);
    });

    test('playing + PS5 finds only the entry of the PS5', () {
      final o = buildLibraryOverview(
        mixed,
        filter: const LibraryFilter(
          status: GameStatus.playing,
          platformKey: 'ps5',
        ),
      );
      final g = o.groups.single;
      expect([for (final e in g.entries) e.id], ['b']);
      expect(g.isPartial, isTrue);
      expect(g.recordsLabel, '1 de 2 registros');
    });

    test('only platform: the game appears with the entry her', () {
      final o = buildLibraryOverview(
        mixed,
        filter: const LibraryFilter(platformKey: 'pc'),
      );
      expect([for (final e in o.groups.single.entries) e.id], ['a']);
    });

    test('platform is compared using normalized text', () {
      final o = buildLibraryOverview([
        entry('a', 1, 'Hades', platform: 'PlayStation 5'),
        entry('b', 2, 'Celeste', platform: 'playstation  5'),
      ]);
      expect(o.platforms, hasLength(1));
      expect(o.platforms.keys.single, 'playstation 5');
      final filtered = buildLibraryOverview([
        entry('a', 1, 'Hades', platform: 'PlayStation 5'),
        entry('b', 2, 'Celeste', platform: 'playstation  5'),
      ], filter: LibraryFilter(platformKey: o.platforms.keys.single));
      expect(filtered.groups, hasLength(2));
    });

    test('card status labels', () {
      final all = buildLibraryOverview(mixed).groups.single;
      expect(all.mixedStatus, isTrue);
      expect(all.singleStatus, isNull);
      final one = buildLibraryOverview(
        mixed,
        filter: const LibraryFilter(status: GameStatus.completed),
      ).groups.single;
      expect(one.singleStatus, GameStatus.completed);
      expect(one.mixedStatus, isFalse);
      expect(all.recordsLabel, '2 registros');
      expect(
        buildLibraryOverview([entry('a', 1, 'Hades')])
            .groups
            .single
            .recordsLabel,
        isNull,
      );
    });
  });

  group('search', () {
    final games = [
      entry('a', 1, 'Pokémon Ônix'),
      entry('b', 2, 'Celeste'),
      entry('c', 3, 'Hollow Knight'),
    ];

    test('without differences in case or accents', () {
      for (final q in ['pokemon', 'POKÉMON', 'onix', 'ÔNIX', 'mon on']) {
        final o = buildLibraryOverview(games, filter: LibraryFilter(query: q));
        expect(names(o), ['Pokémon Ônix'], reason: q);
      }
    });

    test('only considers the title, does not the platform', () {
      expect(
        names(
          buildLibraryOverview(games, filter: const LibraryFilter(query: 'pc')),
        ),
        isEmpty,
      );
    });

    test('whitespace-only query does not filter', () {
      final o = buildLibraryOverview(
        games,
        filter: const LibraryFilter(query: '   '),
      );
      expect(o.groups, hasLength(3));
      expect(const LibraryFilter(query: '   ').isActive, isFalse);
    });
  });

  group('counts of the chips', () {
    final data = [
      entry('a', 1, 'Hades', status: GameStatus.completed, platform: 'PC'),
      entry('b', 1, 'Hades', status: GameStatus.playing, platform: 'PS5'),
      entry('c', 2, 'Celeste', status: GameStatus.completed, platform: 'PC'),
      entry('d', 3, 'Doom', status: GameStatus.backlog, platform: 'PC'),
    ];

    test('count games distinct; the game in two status enters in the two', () {
      final o = buildLibraryOverview(data);
      expect(o.totalGames, 3);
      expect(o.statusCounts[GameStatus.completed], 2);
      expect(o.statusCounts[GameStatus.playing], 1);
      expect(o.statusCounts[GameStatus.backlog], 1);
      expect(o.statusCounts[GameStatus.dropped], 0);
      final sum = o.statusCounts.values.fold(0, (a, b) => a + b);
      expect(sum, 4, reason: 'a soma passa do total de jogos (3)');
    });

    test(
      'follow the search and the platform, but does not the status chosen',
      () {
        final pc = buildLibraryOverview(
          data,
          filter: const LibraryFilter(
            platformKey: 'pc',
            status: GameStatus.dropped,
          ),
        );
        expect(pc.groups, isEmpty);
        expect(pc.totalGames, 3);
        expect(pc.statusCounts[GameStatus.playing], 0, reason: 'o PS5 saiu');
        expect(pc.statusCounts[GameStatus.completed], 2);

        final search = buildLibraryOverview(
          data,
          filter: const LibraryFilter(query: 'hades'),
        );
        expect(search.totalGames, 1);
        expect(search.statusCounts[GameStatus.completed], 1);
        expect(search.statusCounts[GameStatus.playing], 1);
      },
    );

    test('the summary general ignores the filters', () {
      final o = buildLibraryOverview(
        data,
        filter: const LibraryFilter(query: 'celeste'),
      );
      expect(o.summary.games, 3);
      expect(o.summary.records, 4);
    });
  });

  group('currently playing', () {
    test(
      'the game by time, through the entry playing more recent, at most 6',
      () {
        final entries = [
          for (var i = 0; i < 8; i++)
            entry(
              'e$i',
              i,
              'Jogo $i',
              status: GameStatus.playing,
              created: i + 1,
            ),
          entry('old', 99, 'Antigo', status: GameStatus.playing, created: 1),
          entry(
            'done',
            50,
            'Concluído',
            status: GameStatus.completed,
            created: 30,
          ),
          // Replay: o registro mais novo está concluído, mas há um jogando antigo.
          entry('r1', 77, 'Replay', status: GameStatus.playing, created: 10),
          entry('r2', 77, 'Replay', status: GameStatus.completed, created: 20),
        ];
        final shelf = buildLibraryOverview(entries).shelf;
        expect(shelf, hasLength(6));
        expect(
          [for (final g in shelf) g.game.name],
          ['Replay', 'Jogo 7', 'Jogo 6', 'Jogo 5', 'Jogo 4', 'Jogo 3'],
        );
        expect(
          [
            for (final g in shelf)
              g.entries.every((e) => e.status == GameStatus.playing),
          ],
          everyElement(isTrue),
          reason: 'a prateleira só mostra o registro jogando',
        );
      },
    );

    test('the game with two entries playing appears the time', () {
      final shelf = buildLibraryOverview([
        entry('a', 1, 'Doom', status: GameStatus.playing, created: 1),
        entry('b', 1, 'Doom', status: GameStatus.playing, created: 2),
      ]).shelf;
      expect(shelf, hasLength(1));
      expect(shelf.single.entries, hasLength(2));
    });

    test('empty without nothing in progress', () {
      expect(buildLibraryOverview([entry('a', 1, 'Hades')]).shelf, isEmpty);
    });
  });

  group('ordering', () {
    LibraryOverview sorted(
      List<GameEntry> e,
      LibrarySort s, [
      LibraryFilter f = const LibraryFilter(),
    ]) => buildLibraryOverview(e, sort: s, filter: f);

    test('recent: larger createdAt of the group; more time: smaller', () {
      final data = [
        entry('a', 1, 'Antigo', created: 1),
        entry('b', 2, 'Replay', created: 2),
        entry('c', 2, 'Replay', created: 9),
        entry('d', 3, 'Novo', created: 5),
      ];
      expect(names(sorted(data, LibrarySort.recent)), [
        'Replay',
        'Novo',
        'Antigo',
      ]);
      expect(names(sorted(data, LibrarySort.oldest)), [
        'Antigo',
        'Replay',
        'Novo',
      ]);
    });

    test('name A–Z ignores accents and case', () {
      final data = [
        entry('a', 1, 'zelda'),
        entry('b', 2, 'Ápice'),
        entry('c', 3, 'Braid'),
      ];
      expect(names(sorted(data, LibrarySort.name)), [
        'Ápice',
        'Braid',
        'zelda',
      ]);
    });

    test(
      'most hours: sum entries; missing hours last; zero before missing',
      () {
        final data = [
          entry('a', 1, 'Sem horas'),
          entry('b', 2, 'Zero', hours: 0),
          entry('c', 3, 'Soma', hours: 4),
          entry('d', 3, 'Soma', hours: 6),
          entry('e', 4, 'Dez', hours: 10),
          entry('f', 5, 'Cinco', hours: 5),
          entry('g', 5, 'Cinco'),
        ];
        expect(names(sorted(data, LibrarySort.mostPlayed)), [
          'Dez',
          'Soma',
          'Cinco',
          'Zero',
          'Sem horas',
        ]);
        final soma = sorted(
          data,
          LibrarySort.mostPlayed,
        ).groups.firstWhere((g) => g.game.name == 'Soma');
        expect(soma.knownHours, 10);
        expect(
          sorted(data, LibrarySort.mostPlayed).groups.last.knownHours,
          isNull,
        );
      },
    );

    test('the key uses only the entries that passed by filters', () {
      final data = [
        entry('a', 1, 'Alfa', status: GameStatus.completed, hours: 100),
        entry('b', 1, 'Alfa', status: GameStatus.playing, hours: 1),
        entry('c', 2, 'Beta', status: GameStatus.playing, hours: 5),
      ];
      // Sem filtro, Alfa (101 h) vem antes; só jogando, Alfa soma 1 h e perde para Beta.
      expect(names(sorted(data, LibrarySort.mostPlayed)), ['Alfa', 'Beta']);
      expect(
        names(
          sorted(
            data,
            LibrarySort.mostPlayed,
            const LibraryFilter(status: GameStatus.playing),
          ),
        ),
        ['Beta', 'Alfa'],
      );
    });

    test('tie: game title then id, stable result', () {
      final data = [
        entry('b', 2, 'Igual', created: 1),
        entry('a', 1, 'Igual', created: 1),
        entry('c', 3, 'Abaixo', created: 1),
      ];
      final ids = [
        for (final g in sorted(data, LibrarySort.recent).groups) g.game.id,
      ];
      expect(ids, ['g-3', 'g-1', 'g-2']);
      expect([
        for (final g in sorted(
          data.reversed.toList(),
          LibrarySort.recent,
        ).groups)
          g.game.id,
      ], ids);
    });
  });

  group('hours known', () {
    test('null does not becomes zero', () {
      final g = buildLibraryOverview([entry('a', 1, 'Hades')]).groups.single;
      expect(g.knownHours, isNull);
    });

    test('zero is the known value', () {
      final g = buildLibraryOverview([
        entry('a', 1, 'Hades', hours: 0),
        entry('b', 1, 'Hades'),
      ]).groups.single;
      expect(g.knownHours, 0);
    });
  });

  test('platforms of the group: distinct, in the order of the entries', () {
    final g = buildLibraryOverview([
      entry('a', 1, 'Hades', platform: 'PC', created: 3),
      entry('b', 1, 'Hades', platform: 'PS5', created: 2),
      entry('c', 1, 'Hades', platform: 'pc', created: 1),
    ]).groups.single;
    expect(g.platforms, ['PC', 'PS5']);
  });

  test('empty collection', () {
    final o = buildLibraryOverview(const []);
    expect(o.groups, isEmpty);
    expect(o.shelf, isEmpty);
    expect(o.summary.games, 0);
    expect(o.totalGames, 0);
  });
}
