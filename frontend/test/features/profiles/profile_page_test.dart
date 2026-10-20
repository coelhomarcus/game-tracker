import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:gametracker/core/design_system/game_card.dart';
import 'package:gametracker/core/design_system/game_list_row.dart';
import 'package:gametracker/core/design_system/game_shelf_item.dart';
import 'package:gametracker/core/design_system/user_avatar.dart';
import 'package:gametracker/features/library/presentation/entry_actions.dart';
import 'package:gametracker/core/design_system/game_status.dart';
import 'package:gametracker/core/network/app_exception.dart';
import 'package:gametracker/features/feed/data/post_models.dart';
import 'package:gametracker/features/library/data/game_entry.dart';
import 'package:material_ui/material_ui.dart';

import '../../support/fake_feed.dart';
import '../../support/fake_profiles.dart';
import '../../support/fake_repos.dart';
import '../../support/golden.dart';
import '../../support/harness.dart';

/// Viewport alta: a lista de registros é lazy e começa abaixo das prateleiras.
const tall = Size(400, 2000);

GameEntry _entry(
  String id,
  String name,
  GameStatus status, {
  double? hours,
  int? rating,
  String? notes,
  int igdb = 1,
}) => fakeEntry(
  id: id,
  game: fakeGame(igdbId: igdb, name: name),
  status: status,
  hours: hours,
  rating: rating,
  notes: notes,
);

Future<AppHarness> openProfile(
  WidgetTester tester, {
  FakeProfilesRepository? profiles,
  FakeFeedRepository? feed,
  FakeLibraryRepository? library,
  String userId = 'u-beto',
  Size size = const Size(400, 900),
  double textScale = 1,
  Map<String, Object> prefs = const {},
  String? fontFamily,
}) async {
  final h = AppHarness(profiles: profiles, feed: feed, library: library);
  await h.pump(
    tester,
    size: size,
    textScale: textScale,
    prefs: prefs,
    fontFamily: fontFamily,
  );
  await goTo(tester, '/users/$userId');
  return h;
}

FakeProfilesRepository withBeto({bool followed = false, int followers = 3}) =>
    FakeProfilesRepository()
      ..profiles['u-beto'] = fakeProfile(
        name: 'Beto Silva',
        bio: 'Gosto de RPG',
        followers: followers,
        following: 1,
        entries: 1,
        followed: followed,
      );

/// O contador "N jogos" do cabeçalho (um `Text.rich`, não o texto "Jogos" da aba).
final gamesCounter = find.byWidgetPredicate(
  (w) =>
      w is Text &&
      RegExp(r'^\d+ jogos?$').hasMatch(w.textSpan?.toPlainText() ?? ''),
);

void main() {
  setUpAll(loadGoldenFonts);

  group('profile from another user', () {
    testWidgets('shows identity, bio and counters the labels (without links)', (
      tester,
    ) async {
      await openProfile(tester, profiles: withBeto());
      expect(find.text('Beto Silva'), findsWidgets);
      expect(find.text('@beto'), findsOneWidget);
      expect(find.text('Gosto de RPG'), findsOneWidget);
      expect(find.textContaining('3 seguidores'), findsOneWidget);
      expect(find.textContaining('1 seguindo'), findsOneWidget);
      expect(
        find.textContaining('1 registro'),
        findsOneWidget,
        reason: 'conta playthroughs, no singular',
      );
      expect(find.text('Editar perfil'), findsNothing);
      expect(find.widgetWithText(FilledButton, 'Seguir'), findsOneWidget);
    });

    testWidgets(
      'without name uses the username; without bio does not show bio',
      (tester) async {
        final profiles = FakeProfilesRepository()
          ..profiles['u-beto'] = fakeProfile(name: null, bio: '');
        await openProfile(tester, profiles: profiles);
        expect(find.text('beto'), findsWidgets);
        expect(find.text('Gosto de RPG'), findsNothing);
      },
    );

    testWidgets('follow is immediate (+1 follower); fails undoes and warns', (
      tester,
    ) async {
      final profiles = withBeto();
      await openProfile(tester, profiles: profiles);

      await tapAndSettle(tester, find.widgetWithText(FilledButton, 'Seguir'));
      expect(find.text('Seguindo'), findsOneWidget);
      expect(find.textContaining('4 seguidores'), findsOneWidget);
      expect(profiles.followCalls.single, ('u-beto', true));

      profiles.followError = const NetworkException();
      await tapAndSettle(tester, find.text('Seguindo'));
      expect(
        find.text('Seguindo'),
        findsOneWidget,
        reason: 'desfez o "deixar de seguir"',
      );
      expect(find.textContaining('4 seguidores'), findsOneWidget);
      expect(find.textContaining('Sem conexão'), findsOneWidget);
    });

    testWidgets(
      'already following shows "Following" and leave of follow removes 1 follower',
      (tester) async {
        final profiles = withBeto(followed: true);
        await openProfile(tester, profiles: profiles);
        expect(find.text('Seguindo'), findsOneWidget);
        await tapAndSettle(tester, find.text('Seguindo'));
        expect(find.widgetWithText(FilledButton, 'Seguir'), findsOneWidget);
        expect(find.textContaining('2 seguidores'), findsOneWidget);
        expect(profiles.followCalls.single, ('u-beto', false));
      },
    );

    testWidgets('removed profile is in the longer available, with exit', (
      tester,
    ) async {
      final profiles = FakeProfilesRepository()
        ..profileError = const ApiException(
          404,
          'not_found',
          'Usuário não encontrado',
        );
      await openProfile(tester, profiles: profiles);
      expect(find.text('Este perfil não está mais disponível'), findsOneWidget);
      expect(find.text('Tentar de novo'), findsNothing);
      await tapAndSettle(tester, find.widgetWithText(FilledButton, 'Voltar'));
      expect(find.text('Comunidade'), findsWidgets);
    });

    testWidgets('fails of network when opening the profile offers try of new', (
      tester,
    ) async {
      final profiles = FakeProfilesRepository()
        ..profileError = const NetworkException();
      await openProfile(tester, profiles: profiles);
      expect(find.textContaining('Sem conexão'), findsOneWidget);
      profiles
        ..profileError = null
        ..profiles['u-beto'] = fakeProfile();
      await tapAndSettle(tester, find.text('Tentar de novo'));
      expect(find.text('@beto'), findsOneWidget);
    });

    testWidgets(
      'the current user is redirected to the canonical profile (/me)',
      (tester) async {
        final profiles = FakeProfilesRepository()
          ..profiles['u1'] = fakeProfile(
            id: 'u1',
            username: 'ana',
            name: 'ANA',
          );
        await openProfile(tester, profiles: profiles, userId: 'u1');
        expect(find.text('Editar perfil'), findsOneWidget);
        expect(find.byTooltip('Configurações'), findsOneWidget);
        expect(
          find.byType(NavigationBar),
          findsOneWidget,
          reason: 'dentro da navegação principal',
        );
      },
    );
  });

  group('public collection', () {
    FakeProfilesRepository rich() {
      final p = withBeto();
      p.favoritesByUser['u-beto'] = [
        fakeGame(igdbId: 7, name: 'Favorito Sete'),
      ];
      p.collectionByUser['u-beto'] = [
        _entry('a', 'Jogando Agora', GameStatus.playing, igdb: 1, hours: 3.5),
        _entry(
          'b',
          'Concluído Bom',
          GameStatus.completed,
          igdb: 2,
          hours: 20,
          rating: 9,
          notes: 'NOTA-PRIVADA-DO-BETO',
        ),
        _entry('c', 'Abandonado Ruim', GameStatus.dropped, igdb: 900001),
      ];
      return p;
    }

    /// Cards identificáveis da grade; destaques usam `GameShelfItem`.
    final grid = find.descendant(
      of: find.byType(SliverGrid),
      matching: find.byType(GameCard),
    );

    testWidgets(
      'highlights and grid identify the profile without exposing private date',
      (tester) async {
        await openProfile(tester, profiles: rich(), size: tall);
        expect(find.text('Favoritos'), findsOneWidget);
        expect(find.text('Jogando agora'), findsOneWidget);
        expect(
          find.text('Concluídos'),
          findsNothing,
          reason: 'não é mais um destaque',
        );
        expect(statusMenu, findsOneWidget);
        expect(grid, findsNWidgets(3));
        expect(
          find.descendant(of: grid, matching: find.text('Concluído Bom')),
          findsWidgets,
        );
        expect(
          find.descendant(of: grid, matching: find.text('Concluído')),
          findsOneWidget,
        );
        expect(find.text('3,5 h'), findsNothing);
        expect(find.textContaining('9/10'), findsNothing);
        expect(find.byType(ListTile), findsNothing);
      },
    );

    testWidgets('never shows the notes personal from another user', (
      tester,
    ) async {
      await openProfile(tester, profiles: rich(), size: tall);
      expect(find.textContaining('NOTA-PRIVADA'), findsNothing);
    });

    testWidgets('filter by status with a game count; "all" clears the filter', (
      tester,
    ) async {
      await openProfile(tester, profiles: rich(), size: tall);
      expect(grid, findsNWidgets(3));
      await tapAndSettle(tester, statusMenu);
      expect(find.text('Todos (3)'), findsOneWidget);
      await tapAndSettle(tester, find.text('Abandonado (1)'));
      expect(grid, findsNWidgets(1));
      expect(statusButtonText('Abandonado (1)'), findsOneWidget);

      await chooseStatus(tester, 'Jogando (1)');
      expect(grid, findsNWidgets(1));

      await chooseStatus(tester, 'Todos (3)');
      expect(grid, findsNWidgets(3), reason: '"Todos" limpa o filtro');
      expect(statusButtonText('Status'), findsOneWidget);
    });

    testWidgets('is read-only: without menu in the card from another user', (
      tester,
    ) async {
      await openProfile(tester, profiles: rich(), size: tall);
      expect(find.byType(GameMenuButton), findsNothing);
      expect(find.byType(EntryMenuButton), findsNothing);
      expect(find.byType(PopupMenuButton), findsNothing);
    });

    testWidgets('tap a cover opens the page of the game', (tester) async {
      await openProfile(tester, profiles: rich(), size: tall);
      // "Abandonado Ruim" é o único jogo que o fake de jogos conhece (900001) e vem primeiro
      // na ordem por título.
      await tester.ensureVisible(grid.first);
      await tester.pumpAndSettle();
      await tester.tap(grid.first);
      await tester.pumpAndSettle();
      expect(find.text('Meu progresso'), findsOneWidget);
    });

    testWidgets('empty collection shows state empty', (tester) async {
      await openProfile(tester, profiles: withBeto());
      expect(find.text('Coleção vazia'), findsOneWidget);
    });

    testWidgets('failure loading the collection shows error and tries of new', (
      tester,
    ) async {
      final p = rich()..collectionError = const NetworkException();
      await openProfile(tester, profiles: p, size: tall);
      expect(find.textContaining('Sem conexão'), findsOneWidget);
      p.collectionError = null;
      await tapAndSettle(tester, find.text('Tentar de novo'));
      expect(statusMenu, findsOneWidget);
    });

    for (final width in [360.0, 390.0, 600.0, 840.0, 1280.0, 1440.0]) {
      testWidgets(
        'identifiable collection without overflow in ${width.toInt()} dp',
        (tester) async {
          await openProfile(tester, profiles: rich(), size: Size(width, 1400));
          expect(grid, findsNWidgets(3));
          expect(tester.takeException(), isNull);
        },
      );
    }

    testWidgets('200% text switches the collection to readable rows', (
      tester,
    ) async {
      await openProfile(
        tester,
        profiles: rich(),
        size: const Size(360, 2400),
        textScale: 2,
      );
      expect(find.byType(SliverGrid), findsNothing);
      expect(find.byType(GameListRow), findsNWidgets(3));
      expect(tester.takeException(), isNull);
    });

    testWidgets(
      'replays become one card with text context and of the not repeat highlights',
      (tester) async {
        final p =
            withBeto(); // perfil diz 1 registro; a coleção tem 3 do mesmo jogo
        p.collectionByUser['u-beto'] = [
          _entry('a', 'Hades', GameStatus.playing, igdb: 5),
          _entry('b', 'Hades', GameStatus.playing, igdb: 5),
          _entry('c', 'Hades', GameStatus.completed, igdb: 5),
        ];
        await openProfile(tester, profiles: p, size: tall);
        expect(grid, findsOneWidget);
        expect(find.text('3 registros'), findsOneWidget);
        expect(find.text('Vários status'), findsOneWidget);
        expect(find.textContaining('1 jogo'), findsOneWidget);
        // "Jogando agora": o jogo aparece uma vez, apesar de dois registros jogando.
        expect(
          find.byWidgetPredicate(
            (w) => w is GameShelfItem && w.title == 'Hades',
          ),
          findsOneWidget,
        );
      },
    );
  });

  group('profile own', () {
    FakeProfilesRepository mine({String? bio}) => FakeProfilesRepository()
      ..profiles['u1'] = fakeProfile(
        id: 'u1',
        username: 'ana',
        name: 'ANA',
        bio: bio,
        entries: 1,
      );

    testWidgets(
      'the collection matches the Library and editing stays in the current profile',
      (tester) async {
        final library = FakeLibraryRepository([
          _entry('a', 'Meu Jogo', GameStatus.playing, hours: 1),
        ]);
        final profiles = mine();
        final h = AppHarness(library: library, profiles: profiles);
        await h.pump(tester, size: tall);
        await tapAndSettle(tester, find.text('Perfil').last);
        expect(find.text('Editar perfil'), findsOneWidget);
        expect(statusMenu, findsOneWidget);
        expect(
          profiles.collectionCalls,
          0,
          reason: 'o próprio usuário usa a coleção da Biblioteca, sem outra consulta',
        );
      },
    );

    testWidgets('one entry new appears in the profile own without reload', (
      tester,
    ) async {
      final library = FakeLibraryRepository([
        _entry('a', 'Primeiro', GameStatus.playing),
      ]);
      final h = AppHarness(library: library, profiles: mine());
      await h.pump(tester, size: tall);
      await goTo(tester, '/games/900001/playthroughs/new');
      await tapAndSettle(
        tester,
        find.widgetWithText(FilledButton, 'Salvar registro'),
      );
      await goTo(tester, '/me');
      expect(
        find.textContaining('2 registros'),
        findsOneWidget,
        reason: 'contador acompanha a Biblioteca',
      );
    });

    testWidgets('"manage library" opens the Library tab', (tester) async {
      final h = AppHarness(profiles: mine());
      await h.pump(tester);
      await tapAndSettle(tester, find.text('Perfil').last);
      await tapAndSettle(tester, find.text('Gerenciar biblioteca'));
      expect(find.text('Biblioteca'), findsWidgets);
      expect(find.byType(FloatingActionButton), findsOneWidget);
    });

    testWidgets(
      'another user profile has no "manage library" action or invitation',
      (tester) async {
        await openProfile(tester, profiles: withBeto());
        expect(find.text('Gerenciar biblioteca'), findsNothing);
        expect(find.text('Editar perfil'), findsNothing);
      },
    );

    testWidgets(
      'without bio: invitation subtle in the own profile; with bio, the text complete',
      (tester) async {
        final h = AppHarness(profiles: mine());
        await h.pump(tester);
        await tapAndSettle(tester, find.text('Perfil').last);
        expect(find.text('Conte um pouco sobre você'), findsOneWidget);
        await tapAndSettle(tester, find.text('Conte um pouco sobre você'));
        expect(find.text('Editar perfil'), findsWidgets);

        final long = 'Uma bio longa. ' * 18;
        final h2 = AppHarness(profiles: mine(bio: long));
        await tester.pumpWidget(const SizedBox());
        await h2.pump(tester);
        await tapAndSettle(tester, find.text('Perfil').last);
        final bio = tester.widget<Text>(find.textContaining('Uma bio longa.'));
        expect(bio.data, long, reason: 'a bio inteira');
        expect(bio.maxLines, isNull, reason: 'sem truncar');
        expect(find.text('Conte um pouco sobre você'), findsNothing);
      },
    );

    testWidgets(
      'profile from another user without the bio does not reserve space or invite',
      (tester) async {
        final p = FakeProfilesRepository()
          ..profiles['u-beto'] = fakeProfile(name: 'Beto', bio: null);
        await openProfile(tester, profiles: p);
        expect(find.text('Conte um pouco sobre você'), findsNothing);
      },
    );
  });

  group('counters and highlights', () {
    testWidgets(
      'unique games starts from the collection; entries starts from the profile',
      (tester) async {
        final p = withBeto();
        p.profiles['u-beto'] = fakeProfile(
          name: 'Beto',
          entries: 7,
          followers: 2,
          following: 4,
        );
        p.collectionByUser['u-beto'] = [
          _entry('a', 'Um', GameStatus.completed, igdb: 1),
          _entry('b', 'Dois', GameStatus.completed, igdb: 2),
          _entry('c', 'Dois', GameStatus.playing, igdb: 2),
        ];
        await openProfile(tester, profiles: p);
        expect(find.textContaining('2 jogos'), findsOneWidget);
        expect(find.textContaining('7 registros'), findsOneWidget);
        expect(find.textContaining('2 seguidores'), findsOneWidget);
        expect(find.textContaining('4 seguindo'), findsOneWidget);
      },
    );

    testWidgets(
      'while the collection loads, there is in the game counter (never zero)',
      (tester) async {
        final gate = Completer<void>();
        final p = withBeto()..collectionGate = gate;
        p.collectionByUser['u-beto'] = [
          _entry('a', 'Um', GameStatus.completed),
        ];
        final h = AppHarness(profiles: p);
        await h.pump(tester);
        GoRouter.of(tester.element(find.byType(Scaffold).first))
            .go('/users/u-beto');
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));
        expect(gamesCounter, findsNothing);

        expect(
          find.textContaining('registro'),
          findsOneWidget,
          reason: 'o do perfil já vale',
        );
        gate.complete();
        await tester.pumpAndSettle();
        expect(find.textContaining('1 jogo'), findsOneWidget);
      },
    );

    testWidgets(
      'collection with an error: the game counter remains present, not zero',
      (tester) async {
        final p = withBeto()..collectionError = const NetworkException();
        await openProfile(tester, profiles: p);
        expect(gamesCounter, findsNothing);

        expect(find.textContaining('1 registro'), findsOneWidget);
      },
    );

    testWidgets(
      'favorites: up to 6, "show all" expands and "show less" collapses',
      (tester) async {
        final p = withBeto();
        p.favoritesByUser['u-beto'] = [
          for (var i = 1; i <= 9; i++) fakeGame(igdbId: i, name: 'Favorito $i'),
        ];
        await openProfile(tester, profiles: p, size: tall);
        Finder covers() => find.byWidgetPredicate(
          (w) => w is GameShelfItem && w.title.startsWith('Favorito'),
        );
        expect(covers(), findsNWidgets(6));
        await tapAndSettle(tester, find.text('Ver todos'));
        expect(covers(), findsNWidgets(9));
        await tapAndSettle(tester, find.text('Ver menos'));
        expect(covers(), findsNWidgets(6));
      },
    );

    testWidgets(
      'with up to 6 favorites there is in the "See all"; order follows the date',
      (tester) async {
        final p = withBeto();
        p.favoritesByUser['u-beto'] = [
          fakeGame(igdbId: 3, name: 'Terceiro'),
          fakeGame(igdbId: 1, name: 'Primeiro'),
        ];
        await openProfile(tester, profiles: p, size: tall);
        expect(find.text('Ver todos'), findsNothing);
        double x(String t) => tester
            .getTopLeft(
              find.byWidgetPredicate((w) => w is GameShelfItem && w.title == t),
            )
            .dx;
        expect(x('Terceiro'), lessThan(x('Primeiro')));
      },
    );

    testWidgets('currently playing: up to 6, grouped by game', (tester) async {
      final p = withBeto();
      p.collectionByUser['u-beto'] = [
        for (var i = 1; i <= 8; i++)
          _entry('e$i', 'Jogo $i', GameStatus.playing, igdb: i),
      ];
      await openProfile(tester, profiles: p, size: tall);
      final inHighlights = find.byWidgetPredicate(
        (w) => w is GameShelfItem && w.title.startsWith('Jogo '),
      );
      expect(inHighlights, findsNWidgets(6));
    });
  });

  group('structure and layout', () {
    testWidgets('fixed tabs: games, activity, and posts (without replies)', (
      tester,
    ) async {
      await openProfile(tester, profiles: withBeto());
      for (final t in ['Jogos', 'Atividade', 'Posts']) {
        expect(find.widgetWithText(Tab, t), findsOneWidget, reason: t);
      }
      expect(find.text('Respostas'), findsNothing);
      expect(find.text('Coleção'), findsNothing);
    });

    testWidgets('banner 3:1 with the avatar of 88 overlaid in the phone', (
      tester,
    ) async {
      await openProfile(tester, profiles: withBeto());
      final banner = tester.getSize(find.byType(AspectRatio).first);
      expect(banner.width / banner.height, closeTo(3, 0.01));
      final avatar = tester.widget<UserAvatar>(find.byType(UserAvatar).first);
      expect(avatar.radius, (88 - 6) / 2);
      // O avatar atravessa a borda inferior do banner.
      final bannerBottom = tester
          .getBottomLeft(find.byType(AspectRatio).first)
          .dy;
      final avatarRect = tester.getRect(find.byType(UserAvatar).first);
      expect(avatarRect.top, lessThan(bannerBottom));
      expect(avatarRect.bottom, greaterThan(bannerBottom));
      // Nome, handle e bio ficam abaixo da imagem, sobre a superfície.
      expect(
        tester.getTopLeft(find.text('Beto Silva').first).dy,
        greaterThan(bannerBottom),
      );
    });

    testWidgets('the lower half of the avatar also receives taps', (
      tester,
    ) async {
      final profiles = FakeProfilesRepository()
        ..profiles['u-beto'] = fakeProfile(
          avatarUrl: 'http://localhost:3100/uploads/avatars/a.jpg',
        );
      await openProfile(tester, profiles: profiles);
      final r = tester.getRect(find.byType(UserAvatar).first);
      await tester.tapAt(Offset(r.center.dx, r.bottom - 6));
      await tester.pumpAndSettle();
      expect(find.byType(InteractiveViewer), findsOneWidget);
    });

    testWidgets('name of until two lines; handle separate', (tester) async {
      final p = FakeProfilesRepository()
        ..profiles['u-beto'] = fakeProfile(
          name: 'Um Nome Muito Comprido ' * 8,
          username: 'handle_longo',
        );
      await openProfile(tester, profiles: p, size: const Size(360, 800));
      final name = tester.widget<Text>(
        find.textContaining('Um Nome Muito').first,
      );
      expect(name.maxLines, 2);
      expect(find.text('@handle_longo'), findsOneWidget);
    });

    testWidgets('in wide content: 280 column, 112 avatar, and side tabs', (
      tester,
    ) async {
      final p = withBeto();
      p.collectionByUser['u-beto'] = [_entry('a', 'Um', GameStatus.playing)];
      await openProfile(tester, profiles: p, size: const Size(1440, 900));
      final column = tester.getSize(find.byType(SingleChildScrollView).first);
      expect(column.width, 280);
      final avatar = tester.widget<UserAvatar>(find.byType(UserAvatar).first);
      expect(avatar.radius, (112 - 6) / 2);
      // O banner mantém 3:1 dentro da coluna estreita.
      final banner = tester.getSize(find.byType(AspectRatio).first);
      expect(banner.width, 280);
      expect(banner.width / banner.height, closeTo(3, 0.01));
      // As abas ficam à direita da coluna de identidade.
      expect(
        tester.getTopLeft(find.byType(TabBar)).dx,
        greaterThan(
          tester.getTopRight(find.byType(SingleChildScrollView).first).dx,
        ),
      );
      // Ações embaixo da identidade, não ao lado do avatar.
      expect(find.widgetWithText(FilledButton, 'Seguir'), findsOneWidget);
    });

    testWidgets(
      'the breakpoint between the two columns is 1000 dp of space useful',
      (tester) async {
        final p = withBeto();
        await openProfile(tester, profiles: p, size: const Size(1100, 900));
        final area = tester
            .getSize(
              find
                      .byType(LayoutBuilder)
                      .evaluate()
                      .map((e) => e.widget)
                      .whereType<LayoutBuilder>()
                      .isEmpty
                  ? find.byType(Scaffold).last
                  : find.byType(Scaffold).last,
            )
            .width;
        final chrome = 1100 - area;
        tester.view.physicalSize = Size(999 + chrome, 900);
        await tester.pumpAndSettle();
        expect(
          tester.widget<UserAvatar>(find.byType(UserAvatar).first).radius,
          (88 - 6) / 2,
        );
        tester.view.physicalSize = Size(1000 + chrome, 900);
        await tester.pumpAndSettle();
        expect(
          tester.widget<UserAvatar>(find.byType(UserAvatar).first).radius,
          (112 - 6) / 2,
        );
      },
    );

    testWidgets(
      'without images and with texts long: without overflow the 360 px and 200%',
      (tester) async {
        final p = FakeProfilesRepository()
          ..profiles['u-beto'] = fakeProfile(
            name: 'Nome ' * 20,
            bio: 'Bio ' * 70,
          )
          ..favoritesByUser['u-beto'] = [
            for (var i = 0; i < 8; i++)
              fakeGame(igdbId: i + 1, name: 'Favorito comprido $i'),
          ]
          ..collectionByUser['u-beto'] = [
            for (var i = 0; i < 4; i++)
              _entry(
                'e$i',
                'Jogo de nome extremamente comprido $i',
                GameStatus.playing,
                igdb: 10 + i,
              ),
          ];
        final h = AppHarness(profiles: p);
        await h.pump(tester, size: const Size(360, 800), textScale: 2.0);
        await goTo(tester, '/users/u-beto');
        expect(tester.takeException(), isNull);
      },
    );
  });

  group('activities and posts', () {
    testWidgets('tabs show only the that belongs the each the', (tester) async {
      final feed = FakeFeedRepository();
      feed.userPostLists['u-beto:activity'] = [
        fakePost(
          id: 'a1',
          author: beto,
          type: PostType.activity,
          activityStatus: GameStatus.completed,
          content: 'zerou Algum Jogo',
          game: fakeGame(),
        ),
      ];
      feed.userPostLists['u-beto:post'] = [
        fakePost(id: 'p1', author: beto, content: 'Meu post publicado'),
      ];
      await openProfile(tester, profiles: withBeto(), feed: feed);

      await tapAndSettle(tester, find.text('Atividade'));
      expect(find.textContaining('zerou Algum Jogo'), findsOneWidget);
      expect(find.text('Meu post publicado'), findsNothing);

      await tapAndSettle(tester, find.text('Posts'));
      expect(find.text('Meu post publicado'), findsOneWidget);
      expect(feed.userPostCalls.map((c) => c.$2).toSet(), {true, false});
    });

    testWidgets('without activities and without posts show state empty', (
      tester,
    ) async {
      await openProfile(tester, profiles: withBeto());
      await tapAndSettle(tester, find.text('Atividade'));
      expect(find.text('Ainda não há atividades'), findsOneWidget);
      await tapAndSettle(tester, find.text('Posts'));
      expect(find.text('Ainda não há posts'), findsOneWidget);
    });

    testWidgets(
      'like the post of the profile uses the same count of the feed',
      (tester) async {
        final feed = FakeFeedRepository(
          general: [
            fakePost(
              id: 'p1',
              author: beto,
              content: 'Compartilhado',
              likes: 2,
            ),
          ],
        );
        feed.userPostLists['u-beto:post'] = [
          fakePost(id: 'p1', author: beto, content: 'Compartilhado', likes: 2),
        ];
        final h = AppHarness(profiles: withBeto(), feed: feed);
        await h.pump(tester);
        await tapAndSettle(tester, find.text('Comunidade').last);
        expect(find.text('2'), findsOneWidget);

        await goTo(tester, '/users/u-beto');
        await tapAndSettle(tester, find.text('Posts'));
        await tapAndSettle(tester, find.text('2'));
        expect(find.text('3'), findsOneWidget);

        await goTo(tester, '/community');
        expect(
          find.text('3'),
          findsOneWidget,
          reason: 'o feed mostra a curtida feita no perfil',
        );
      },
    );
  });

  group('images of the profile', () {
    testWidgets(
      'without photo or cover there is nothing to enlarge (without error)',
      (tester) async {
        final semantics = tester.ensureSemantics();
        await openProfile(tester, profiles: withBeto());
        await tester.tap(find.bySemanticsLabel('Sem foto'));
        await tester.pumpAndSettle();
        expect(find.byType(InteractiveViewer), findsNothing);
        semantics.dispose();
      },
    );

    testWidgets('tapping the photo opens the enlarged view and closes it', (
      tester,
    ) async {
      final profiles = FakeProfilesRepository()
        ..profiles['u-beto'] = fakeProfile(
          avatarUrl: 'http://localhost:3100/uploads/avatars/a.jpg',
          bannerUrl: 'http://localhost:3100/uploads/banners/b.jpg',
        );
      final semantics = tester.ensureSemantics();
      await openProfile(tester, profiles: profiles);
      await tapAndSettle(tester, find.bySemanticsLabel('Ampliar foto de Beto'));
      expect(find.text('1 de 1'), findsOneWidget);
      expect(find.byType(InteractiveViewer), findsOneWidget);
      await tapAndSettle(tester, find.byTooltip('Fechar'));
      expect(find.text('1 de 1'), findsNothing);

      await tapAndSettle(tester, find.bySemanticsLabel('Ampliar capa de Beto'));
      expect(find.text('1 de 1'), findsOneWidget);
      semantics.dispose();
    });
  });

  testWidgets('layout the 360 px with text 200% does not overflows', (
    tester,
  ) async {
    final p = withBeto();
    p.favoritesByUser['u-beto'] = [
      fakeGame(name: 'Favorito com nome muito comprido'),
    ];
    p.collectionByUser['u-beto'] = [
      _entry(
        'a',
        'Um nome de jogo extremamente comprido para testar',
        GameStatus.playing,
        hours: 3,
      ),
    ];
    final h = AppHarness(profiles: p);
    await h.pump(tester, size: const Size(360, 800), textScale: 2.0);
    await goTo(tester, '/users/u-beto');
    expect(tester.takeException(), isNull);
  });

  group('goldens of the etapa 3', () {
    FakeProfilesRepository sample() {
      final profiles = withBeto();
      profiles.favoritesByUser['u-beto'] = [
        fakeGame(igdbId: 7, name: 'Hollow Knight', platforms: ['PC']),
        fakeGame(igdbId: 8, name: 'Celeste', platforms: ['Switch', 'PC']),
      ];
      profiles.collectionByUser['u-beto'] = [
        _entry('a', 'Hades', GameStatus.playing, igdb: 1, hours: 12),
        _entry('b', 'Hades', GameStatus.completed, igdb: 1, hours: 20),
        _entry('c', 'Sea of Stars', GameStatus.playing, igdb: 2),
        _entry('d', 'Outer Wilds', GameStatus.completed, igdb: 3),
      ];
      return profiles;
    }

    for (final (layout, size) in [
      ('390', const Size(390, 1000)),
      ('1280', const Size(1280, 900)),
    ]) {
      for (final theme in ['light', 'dark']) {
        testWidgets('$layout · $theme', skip: goldenSkip, (tester) async {
          await openProfile(
            tester,
            profiles: sample(),
            size: size,
            prefs: {'theme.mode': theme},
            fontFamily: goldenFontFamily,
          );
          await expectLater(
            find.byType(MaterialApp),
            matchesGoldenFile('goldens/profile_${layout}_$theme.png'),
          );
        });
      }
    }
  });
}
