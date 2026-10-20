import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/design_system/game_status.dart';
import 'package:gametracker/core/models/user_summary.dart';
import 'package:gametracker/core/network/app_exception.dart';
import 'package:gametracker/features/feed/data/post_models.dart';
import 'package:material_ui/material_ui.dart';

import '../../support/fake_feed.dart';
import '../../support/fake_profiles.dart';
import '../../support/fake_repos.dart';
import '../../support/harness.dart';

/// O usuário logado no harness (ver `fakeUser`: id u1, nome ANA).
const me = UserSummary(id: 'u1', username: 'ana', name: 'ANA');

Future<AppHarness> openCommunity(
  WidgetTester tester, {
  FakeFeedRepository? feed,
  FakeLibraryRepository? library,
  FakeProfilesRepository? profiles,
}) async {
  final h = AppHarness(feed: feed, library: library, profiles: profiles);
  await h.pump(tester);
  await tapAndSettle(tester, find.text('Comunidade').last);
  return h;
}

void main() {
  testWidgets('General shows author, text, game, likes and comments', (
    tester,
  ) async {
    final feed = FakeFeedRepository(
      general: [
        fakePost(
          id: 'p1',
          author: ana,
          content: 'Terminei o jogo!',
          game: fakeGame(name: 'Jogo Fixture Um'),
          likes: 3,
          comments: 2,
        ),
      ],
    );
    await openCommunity(tester, feed: feed);
    expect(find.text('Ana'), findsOneWidget);
    expect(find.text('Terminei o jogo!'), findsOneWidget);
    expect(find.text('Jogo Fixture Um'), findsWidgets);
    expect(find.text('3'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
  });

  testWidgets('General empty invites the publish', (tester) async {
    await openCommunity(tester);
    expect(find.text('Ainda não há publicações'), findsOneWidget);
    expect(find.text('Seja a primeira pessoa a publicar.'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Publicar'), findsWidgets);
  });

  testWidgets('Following empty explains and takes the explore', (tester) async {
    await openCommunity(tester);
    await tapAndSettle(tester, find.text('Seguindo'));
    expect(find.text('Acompanhe quem joga com você'), findsOneWidget);
    await tapAndSettle(tester, find.text('Encontrar pessoas'));
    expect(
      find.text('Encontre pessoas'),
      findsOneWidget,
      reason: 'abriu Explorar já na aba Pessoas',
    );
  });

  testWidgets(
    'error in the first page shows message and reloads to the try of new',
    (tester) async {
      final feed = FakeFeedRepository(
        general: [fakePost(id: 'p1', content: 'Chegou')],
      )..feedError = const NetworkException();
      await openCommunity(tester, feed: feed);
      expect(find.textContaining('Sem conexão'), findsOneWidget);
      expect(
        find.text('Ainda não há posts'),
        findsNothing,
        reason: 'erro não é vazio',
      );

      feed.feedError = null;
      await tapAndSettle(tester, find.text('Tentar de novo'));
      expect(find.text('Chegou'), findsOneWidget);
    },
  );

  testWidgets(
    'scroll to the end loads the next pages, without duplicates, and ends',
    (tester) async {
      final feed = FakeFeedRepository(
        general: [
          for (var i = 1; i <= 5; i++)
            fakePost(id: 'p$i', content: 'post número $i'),
        ],
      );
      await openCommunity(tester, feed: feed);

      for (var i = 0; i < 6; i++) {
        await tester.fling(
          find.byType(Scrollable).last,
          const Offset(0, -600),
          2000,
        );
        await tester.pumpAndSettle();
      }
      expect(find.text('Você chegou ao fim.'), findsOneWidget);
      expect(
        feed.feedCalls.where((c) => c.$1.apiValue == 'general').length,
        3,
        reason: '5 posts em páginas de 2',
      );
      for (var i = 1; i <= 5; i++) {
        expect(
          find.text('post número $i', skipOffstage: false),
          findsOneWidget,
          reason: 'sem duplicata do $i',
        );
      }
    },
  );

  testWidgets(
    'fails to the load more shows warning in the footer and allows try of new',
    (tester) async {
      final feed = FakeFeedRepository(
        general: [
          for (var i = 1; i <= 6; i++) fakePost(id: 'p$i', content: 'post $i'),
        ],
      )..pageTwoError = const NetworkException();
      await openCommunity(tester, feed: feed);
      await tester.fling(
        find.byType(Scrollable).last,
        const Offset(0, -900),
        3000,
      );
      await tester.pumpAndSettle();

      expect(
        find.text('Não foi possível carregar mais posts.'),
        findsOneWidget,
      );
      expect(
        find.text('post 1'),
        findsOneWidget,
        reason: 'a lista carregada continua',
      );

      feed.pageTwoError = null;
      await tapAndSettle(tester, find.text('Tentar de novo'));
      expect(find.text('Não foi possível carregar mais posts.'), findsNothing);
    },
  );

  testWidgets('like updates immediately; fails undoes and warns', (
    tester,
  ) async {
    final feed = FakeFeedRepository(general: [fakePost(id: 'p1', likes: 4)]);
    await openCommunity(tester, feed: feed);

    await tapAndSettle(tester, find.text('4'));
    expect(find.text('5'), findsOneWidget);
    expect(find.byIcon(Icons.favorite), findsOneWidget);
    expect(feed.likeCalls.single, ('p1', true));

    feed.likeError = const NetworkException();
    await tapAndSettle(tester, find.text('5'));
    expect(find.text('5'), findsOneWidget, reason: 'voltou ao valor anterior');
    expect(find.textContaining('Sem conexão'), findsOneWidget);
  });

  testWidgets('the like of the feed appears in the detail of the post', (
    tester,
  ) async {
    final feed = FakeFeedRepository(
      general: [fakePost(id: 'p1', content: 'Olha isso', likes: 1)],
    );
    await openCommunity(tester, feed: feed);
    await tapAndSettle(tester, find.text('1'));
    expect(find.text('2'), findsOneWidget);

    await tapAndSettle(tester, find.text('Olha isso'));
    expect(find.text('Comentários (0)'), findsOneWidget);
    expect(find.text('2'), findsOneWidget, reason: 'mesma contagem no detalhe');
    expect(find.byIcon(Icons.favorite), findsOneWidget);
  });

  testWidgets('activity is the line compact with the status of the moment', (
    tester,
  ) async {
    final feed = FakeFeedRepository(
      general: [
        fakePost(
          id: 'a1',
          author: ana,
          type: PostType.activity,
          activityStatus: GameStatus.completed,
          content: 'zerou Jogo Fixture Um! 🎉',
          game: fakeGame(),
        ),
      ],
    );
    final semantics = tester.ensureSemantics();
    await openCommunity(tester, feed: feed);
    expect(find.textContaining('zerou Jogo Fixture Um'), findsOneWidget);
    expect(
      find.bySemanticsLabel(RegExp('Concluído')),
      findsOneWidget,
      reason: 'ícone acompanhado de texto acessível',
    );
    semantics.dispose();
  });

  testWidgets('tap in the author opens the profile his', (tester) async {
    final profiles = FakeProfilesRepository()
      ..profiles['u-beto'] = fakeProfile(
        name: 'Beto Silva',
        bio: 'Gosto de RPG',
      );
    final feed = FakeFeedRepository(
      general: [fakePost(id: 'p1', author: beto)],
    );
    final semantics = tester.ensureSemantics();
    await openCommunity(tester, feed: feed, profiles: profiles);
    await tapAndSettle(tester, find.bySemanticsLabel('Perfil de beto'));
    expect(find.text('Beto Silva'), findsWidgets);
    expect(find.text('Gosto de RPG'), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('the own author resolve for the profile of the user signed-in', (
    tester,
  ) async {
    final profiles = FakeProfilesRepository()
      ..profiles['u1'] = fakeProfile(
        id: 'u1',
        username: 'ana',
        name: 'ANA',
        bio: 'Esta é minha bio',
      );
    final feed = FakeFeedRepository(
      general: [fakePost(id: 'p1', author: me)],
    );
    final semantics = tester.ensureSemantics();
    await openCommunity(tester, feed: feed, profiles: profiles);
    await tapAndSettle(tester, find.bySemanticsLabel('Perfil de ANA'));
    expect(
      find.text('Editar perfil'),
      findsOneWidget,
      reason: 'o próprio perfil tem edição',
    );
    expect(find.text('Esta é minha bio'), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('button publish opens the composer', (tester) async {
    await openCommunity(
      tester,
      feed: FakeFeedRepository(general: [fakePost()]),
    );
    await tapAndSettle(
      tester,
      find.widgetWithText(FloatingActionButton, 'Publicar'),
    );
    expect(find.text('Nova publicação'), findsOneWidget);
  });

  testWidgets('update by gesture retries the query of the feed', (
    tester,
  ) async {
    final feed = FakeFeedRepository(general: [fakePost(id: 'p1')]);
    await openCommunity(tester, feed: feed);
    final before = feed.feedCalls.length;
    await tester.fling(
      find.byType(Scrollable).last,
      const Offset(0, 400),
      1000,
    );
    await tester.pumpAndSettle();
    expect(feed.feedCalls.length, before + 1);
  });

  testWidgets(
    'fails to the update keeps the posts and warns that are outdated',
    (tester) async {
      final feed = FakeFeedRepository(
        general: [fakePost(id: 'p1', content: 'Continua aqui')],
      );
      await openCommunity(tester, feed: feed);
      feed.feedError = const NetworkException();
      await tester.fling(
        find.byType(Scrollable).last,
        const Offset(0, 400),
        1000,
      );
      await tester.pumpAndSettle();
      expect(find.text('Continua aqui'), findsOneWidget);
      expect(find.textContaining('Mostrando os dados salvos'), findsOneWidget);
    },
  );

  testWidgets(
    'complete the game marks the feed the outdated and it revalidates when returning',
    (tester) async {
      final feed = FakeFeedRepository(general: [fakePost(id: 'p1')]);
      final library = FakeLibraryRepository([
        fakeEntry(id: 'e1', status: GameStatus.playing),
      ]);
      final h = AppHarness(feed: feed, library: library);
      await h.pump(tester);
      await tapAndSettle(tester, find.text('Comunidade').last);
      final afterFirstLoad = feed.feedCalls.length;

      await tapAndSettle(tester, find.text('Biblioteca').last);
      await openLibraryGame(tester, 'Jogo Fixture Um');
      await tapAndSettle(
        tester,
        find.byTooltip('Ações do registro de Jogo Fixture Um'),
      );
      await tapAndSettle(tester, find.text('Alterar status'));
      await tapAndSettle(tester, find.widgetWithText(ListTile, 'Concluído'));
      // O status mudou na página do jogo; volta ao app para ir à Comunidade.
      await tapAndSettle(tester, find.byType(BackButton));
      expect(
        feed.feedCalls.length,
        afterFirstLoad,
        reason: 'não refaz o feed agora: a atividade ainda não existe',
      );

      await tapAndSettle(tester, find.text('Comunidade').last);
      expect(
        feed.feedCalls.length,
        greaterThan(afterFirstLoad),
        reason: 'revalida ao voltar para a Comunidade',
      );
    },
  );

  testWidgets('layout the 360 px with text 200% does not overflows', (
    tester,
  ) async {
    final feed = FakeFeedRepository(
      general: [
        fakePost(
          id: 'p1',
          content: 'Um texto bem comprido ' * 8,
          game: fakeGame(
            name:
                'Um jogo com um nome extremamente comprido para testar quebra',
          ),
        ),
        fakePost(
          id: 'a1',
          type: PostType.activity,
          activityStatus: GameStatus.playing,
          content: 'começou a jogar ${'Nome Gigante ' * 4}',
          game: fakeGame(),
        ),
      ],
    );
    final h = AppHarness(feed: feed);
    await h.pump(tester, size: const Size(360, 800), textScale: 2.0);
    await tapAndSettle(tester, find.text('Comunidade').last);
    expect(tester.takeException(), isNull);
  });
}
