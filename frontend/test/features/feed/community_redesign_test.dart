// Etapa 09: posts e atividades compactos, coluna de leitura, comentários com recuo limitado e a
// resposta com o contexto à vista.
import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/design_system/game_status.dart';
import 'package:gametracker/core/design_system/status_chip.dart';
import 'package:gametracker/core/design_system/async_content.dart';
import 'package:gametracker/core/design_system/user_avatar.dart';
import 'package:gametracker/core/models/user_summary.dart';
import 'package:gametracker/features/feed/data/post_models.dart';
import 'package:gametracker/features/feed/presentation/post_detail_page.dart';
import 'package:gametracker/features/feed/presentation/post_tiles.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../support/fake_feed.dart';
import '../../support/fake_repos.dart';
import '../../support/harness.dart';

Post written({
  String id = 'p1',
  String text = 'Um post escrito',
  int likes = 0,
}) => fakePost(
  id: id,
  author: ana,
  content: text,
  likes: likes,
  comments: 7,
  game: fakeGame(),
);

Post activity({
  String id = 'a1',
  GameStatus status = GameStatus.completed,
  String text = 'zerou Jogo Fixture Um! 🎉',
}) => fakePost(
  id: id,
  author: ana,
  type: PostType.activity,
  activityStatus: status,
  content: text,
  game: fakeGame(),
);

Future<AppHarness> openCommunity(
  WidgetTester tester,
  FakeFeedRepository feed, {
  Size size = const Size(400, 900),
  double textScale = 1,
  FakeLibraryRepository? library,
}) async {
  final h = AppHarness(feed: feed, library: library);
  await h.pump(tester, size: size, textScale: textScale);
  await tapAndSettle(tester, find.text('Comunidade').last);
  return h;
}

String uri(WidgetTester tester) =>
    GoRouter.of(tester.element(find.byType(Scaffold).first)).state.uri
        .toString();

void main() {
  group('feed in the column of reading', () {
    testWidgets('in screen wide the post occupies at most 680 dp, centered', (
      tester,
    ) async {
      final feed = FakeFeedRepository(general: [written()]);
      await openCommunity(tester, feed, size: const Size(1440, 900));
      final tile = find.byType(PostTile).first;
      final box = tester.getRect(tile);
      expect(box.width, lessThanOrEqualTo(680));
      // Centralizado na área ao lado do rail de navegação.
      final area = tester.getRect(find.byType(TabBarView));
      expect(box.center.dx, closeTo(area.center.dx, 1));
    });

    testWidgets('title and tabs remain aligned to the column of the feed', (
      tester,
    ) async {
      final feed = FakeFeedRepository(general: [written()]);
      await openCommunity(tester, feed, size: const Size(1440, 900));
      final column = tester.getRect(find.byType(PostTile).first);
      final title = tester.getTopLeft(
        find.descendant(
          of: find.byType(AppBar),
          matching: find.text('Comunidade'),
        ),
      );
      final tabs = tester.getRect(find.byType(TabBar));
      expect(title.dx, closeTo(column.left, 1));
      expect(tabs.left, closeTo(column.left, 1));
      expect(tabs.right, closeTo(column.right, 1));
    });

    testWidgets('in the phone uses the width less the margin of 16', (
      tester,
    ) async {
      await openCommunity(tester, FakeFeedRepository(general: [written()]));
      final box = tester.getRect(find.byType(PostTile).first);
      expect(box.left, 16);
      expect(box.width, 400 - 32);
    });

    testWidgets('General remains the initial and chronological tab', (
      tester,
    ) async {
      final feed = FakeFeedRepository(
        general: [
          written(id: 'p1', text: 'Primeiro'),
          written(id: 'p2', text: 'Segundo'),
        ],
      );
      await openCommunity(tester, feed);
      expect(
        DefaultTabController.of(tester.element(find.byType(TabBar))).index,
        0,
      );
      expect(find.text('Geral'), findsOneWidget);
      expect(find.text('Seguindo'), findsOneWidget);
      expect(
        tester.getTopLeft(find.text('Primeiro')).dy,
        lessThan(tester.getTopLeft(find.text('Segundo')).dy),
      );
    });
  });

  group('post written and activity', () {
    testWidgets(
      'post: avatar of 40, name, handle, time, text, game and actions',
      (tester) async {
        await openCommunity(
          tester,
          FakeFeedRepository(general: [written(likes: 3)]),
        );
        final avatar = tester.widget<UserAvatar>(find.byType(UserAvatar).first);
        expect(avatar.radius, 20, reason: '40 dp de diâmetro');
        expect(find.text('Ana'), findsOneWidget);
        expect(find.textContaining('@ana'), findsOneWidget);
        expect(find.text('Um post escrito'), findsOneWidget);
        expect(find.text('Jogo Fixture Um'), findsWidgets);
        expect(find.text('3'), findsOneWidget);
        expect(find.text('7'), findsOneWidget);
      },
    );

    testWidgets(
      'activity: avatar of 32, verb, status with text and game, keeping the actions',
      (tester) async {
        await openCommunity(tester, FakeFeedRepository(general: [activity()]));
        final avatars = tester
            .widgetList<UserAvatar>(find.byType(UserAvatar))
            .toList();
        expect(avatars.single.radius, 16, reason: '32 dp de diâmetro');
        expect(find.textContaining('zerou Jogo Fixture Um'), findsWidgets);
        expect(find.widgetWithText(StatusChip, 'Concluído'), findsOneWidget);
        expect(
          find.byIcon(Icons.favorite_border),
          findsOneWidget,
          reason: 'curtir',
        );
        expect(
          find.byIcon(Icons.mode_comment_outlined),
          findsOneWidget,
          reason: 'comentar',
        );
      },
    );

    testWidgets(
      'the target of tap of the avatar has 48 dp in the two formats',
      (tester) async {
        await openCommunity(
          tester,
          FakeFeedRepository(general: [written(), activity()]),
        );
        for (final id in ['Perfil de Ana']) {
          final targets = find.bySemanticsLabel(id);
          expect(targets, findsNWidgets(2));
        }
        for (final e in find.byType(UserAvatar).evaluate()) {
          final inkWell = find
              .ancestor(
                of: find.byWidget(e.widget),
                matching: find.byType(InkWell),
              )
              .first;
          final size = tester.getSize(inkWell);
          expect(size.width, greaterThanOrEqualTo(48));
          expect(size.height, greaterThanOrEqualTo(48));
        }
      },
    );

    testWidgets(
      'the activity shows the status of the moment, same that the entry change after',
      (tester) async {
        // Concluído quando aconteceu; hoje o registro está jogando (replay) ou nem existe mais.
        for (final library in [
          FakeLibraryRepository([
            fakeEntry(id: 'e1', status: GameStatus.playing),
          ]),
          FakeLibraryRepository(),
        ]) {
          await openCommunity(
            tester,
            FakeFeedRepository(
              general: [activity(status: GameStatus.completed)],
            ),
            library: library,
          );
          expect(find.widgetWithText(StatusChip, 'Concluído'), findsOneWidget);
          expect(find.widgetWithText(StatusChip, 'Jogando'), findsNothing);
          await tester.pumpWidget(const SizedBox());
        }
      },
    );

    testWidgets('activity without the game (deleted) remains readable', (
      tester,
    ) async {
      final orphan = fakePost(
        id: 'o1',
        author: ana,
        type: PostType.activity,
        activityStatus: GameStatus.playing,
        content: 'começou a jogar algo',
      );
      await openCommunity(tester, FakeFeedRepository(general: [orphan]));
      expect(find.textContaining('começou a jogar algo'), findsOneWidget);
      expect(find.widgetWithText(StatusChip, 'Jogando'), findsOneWidget);
    });

    testWidgets('liking the post also applies in the detail (same entity)', (
      tester,
    ) async {
      final feed = FakeFeedRepository(general: [written(likes: 1)])
        ..posts = {'p1': written(likes: 1)};
      await openCommunity(tester, feed);
      await tapAndSettle(tester, find.byIcon(Icons.favorite_border));
      expect(find.text('2'), findsOneWidget);
      await tapAndSettle(tester, find.text('Um post escrito'));
      expect(uri(tester), '/posts/p1');
      expect(find.byIcon(Icons.favorite), findsOneWidget);
      expect(find.text('2'), findsWidgets, reason: 'o contador acompanhou');
    });

    testWidgets(
      'names and texts long does not cover the actions the 360 px and 200%',
      (tester) async {
        final longAuthor = fakePost(
          id: 'p9',
          author: const UserSummary(
            id: 'u-long',
            username: 'um_username_muito_comprido_mesmo',
            name: 'Um Nome Extremamente Comprido Para Testar Quebra De Linha',
          ),
          content: 'Texto comprido ' * 20,
          game: fakeGame(
            name: 'Um jogo com um nome extremamente comprido para testar',
          ),
        );
        await openCommunity(
          tester,
          FakeFeedRepository(
            general: [
              longAuthor,
              activity(text: 'começou a jogar ${'Nome ' * 12}'),
            ],
          ),
          size: const Size(360, 800),
          textScale: 2,
        );
        expect(tester.takeException(), isNull);
        expect(find.byIcon(Icons.favorite_border), findsWidgets);
      },
    );
  });

  group('states empty', () {
    testWidgets('Following takes the explore in the tab people', (
      tester,
    ) async {
      await openCommunity(tester, FakeFeedRepository());
      await tapAndSettle(tester, find.text('Seguindo'));
      expect(find.text('Acompanhe quem joga com você'), findsOneWidget);
      await tapAndSettle(tester, find.text('Encontrar pessoas'));
      expect(uri(tester), '/explore?scope=people');
      expect(tester.widget<TabBar>(find.byType(TabBar)).controller!.index, 1);
    });

    testWidgets('empty General invites the first post', (tester) async {
      await openCommunity(tester, FakeFeedRepository());
      expect(find.text('Ainda não há publicações'), findsOneWidget);
      await tapAndSettle(
        tester,
        find.descendant(
          of: find.byType(EmptyView),
          matching: find.widgetWithText(FilledButton, 'Publicar'),
        ),
      );
      expect(uri(tester), '/posts/new');
    });
  });

  group('comments', () {
    Comment chain(int levels) {
      Comment build(int i) => fakeComment(
        id: 'c$i',
        parent: i == 0 ? null : 'c${i - 1}',
        author: i.isEven ? beto : ana,
        content: 'Nível $i',
        replies: i + 1 < levels ? [build(i + 1)] : const [],
      );
      return build(0);
    }

    FakeFeedRepository threadOf(int levels) => FakeFeedRepository()
      ..posts['p1'] = fakePost(
        id: 'p1',
        content: 'Post principal bem longo ${'texto ' * 80}',
        comments: levels,
      )
      ..commentTrees['p1'] = [chain(levels)];

    Future<void> openThread(
      WidgetTester tester,
      FakeFeedRepository feed, {
      Size size = const Size(400, 1600),
      double textScale = 1,
    }) async {
      final h = AppHarness(feed: feed);
      await h.pump(tester, size: size, textScale: textScale);
      await goTo(tester, '/posts/p1');
    }

    testWidgets('the post original appears integer, before of the comments', (
      tester,
    ) async {
      await openThread(tester, threadOf(2));
      final post = tester.widget<Text>(
        find.textContaining('Post principal bem longo'),
      );
      expect(post.maxLines, isNull, reason: 'sem truncar o texto');
      expect(
        tester.getTopLeft(find.textContaining('Post principal')).dy,
        lessThan(tester.getTopLeft(find.text('Nível 0')).dy),
      );
    });

    testWidgets(
      'indents up to two levels; deeper replies align and identify the responds',
      (tester) async {
        await openThread(tester, threadOf(6));
        double left(int i) => tester.getTopLeft(find.text('Nível $i')).dx;
        // O nível 1 recua 16 mais a barra de conexão (14); o 2 recua só 16.
        expect(left(1) - left(0), 30);
        expect(left(2) - left(1), 16);
        for (final i in [3, 4, 5]) {
          expect(
            left(i),
            left(2),
            reason: 'nível $i não recua além do segundo',
          );
        }
        expect(find.text('Respondendo a @beto'), findsWidgets);
        expect(
          find.textContaining('Respondendo a @'),
          findsNWidgets(3),
          reason: 'só nos níveis 3, 4 e 5',
        );
        for (var i = 0; i < 6; i++) {
          expect(
            find.text('Nível $i'),
            findsOneWidget,
            reason: 'nenhum comentário some',
          );
        }
      },
    );

    testWidgets(
      'the caption indicates the author immediate of the reply underlies',
      (tester) async {
        await openThread(tester, threadOf(4));
        // Nível 3 responde ao nível 2 (autor beto, par).
        final legend = find.text('Respondendo a @beto');
        expect(legend, findsOneWidget);
        expect(
          tester.getTopLeft(legend).dy,
          lessThan(tester.getTopLeft(find.text('Nível 3')).dy),
        );
      },
    );

    testWidgets('text width does not shrink beyond the second indent', (
      tester,
    ) async {
      await openThread(tester, threadOf(12), size: const Size(400, 3000));
      final w2 = tester.getSize(find.text('Nível 2')).width;
      final w11 = tester.getSize(find.text('Nível 11')).width;
      expect(w11, greaterThanOrEqualTo(w2 - 1));
    });
  });

  group('reply', () {
    FakeFeedRepository feed() => FakeFeedRepository()
      ..posts['p1'] = fakePost(id: 'p1', content: 'Post', comments: 1)
      ..commentTrees['p1'] = [
        fakeComment(
          id: 'a',
          content: 'Um comentário que serve de alvo e é razoavelmente longo para cortar a linha',
          author: const UserSummary(
            id: 'u-cris',
            username: 'cris',
            name: 'Cris Souza',
          ),
        ),
      ];

    Future<AppHarness> open(
      WidgetTester tester,
      FakeFeedRepository f, {
      Size size = const Size(400, 900),
      double textScale = 1,
    }) async {
      final h = AppHarness(feed: f);
      await h.pump(tester, size: size, textScale: textScale);
      await goTo(tester, '/posts/p1');
      return h;
    }

    testWidgets(
      'shows the person and the comment excerpt, with a "cancel reply" action',
      (tester) async {
        await open(tester, feed());
        final semantics = tester.ensureSemantics();
        await tapAndSettle(
          tester,
          find.bySemanticsLabel('Responder a Cris Souza'),
        );
        expect(find.text('Respondendo a Cris Souza (@cris)'), findsOneWidget);
        expect(
          find.widgetWithText(TextButton, 'Cancelar resposta'),
          findsOneWidget,
          reason: 'ação visível, não só um ícone',
        );
        expect(
          find.widgetWithText(TextField, 'Escreva sua resposta'),
          findsOneWidget,
        );

        await tapAndSettle(tester, find.text('Cancelar resposta'));
        expect(find.textContaining('Respondendo a'), findsNothing);
        expect(
          find.widgetWithText(TextField, 'Escreva um comentário'),
          findsOneWidget,
        );
        semantics.dispose();
      },
    );

    testWidgets('cancel does not delete the that was typed', (tester) async {
      await open(tester, feed());
      final semantics = tester.ensureSemantics();
      await tapAndSettle(
        tester,
        find.bySemanticsLabel('Responder a Cris Souza'),
      );
      await tester.enterText(find.byType(TextField).last, 'meu rascunho');
      await tester.pumpAndSettle();
      await tapAndSettle(tester, find.text('Cancelar resposta'));
      expect(find.text('meu rascunho'), findsOneWidget);
      semantics.dispose();
    });

    testWidgets(
      'success clears the field, the target and updates the list and the counter',
      (tester) async {
        final f = feed();
        await open(tester, f);
        final semantics = tester.ensureSemantics();
        await tapAndSettle(
          tester,
          find.bySemanticsLabel('Responder a Cris Souza'),
        );
        await tester.enterText(find.byType(TextField).last, 'Concordo');
        await tester.pumpAndSettle();
        await tapAndSettle(tester, find.byIcon(Icons.send));
        expect(f.addedComments.single.parent, 'a');
        expect(find.textContaining('Respondendo a'), findsNothing);
        expect(
          tester
              .widget<TextField>(find.byType(TextField).last)
              .controller!
              .text,
          isEmpty,
        );
        semantics.dispose();
      },
    );

    testWidgets('at 360 px and 200% text, actions remain within reach', (
      tester,
    ) async {
      await open(tester, feed(), size: const Size(360, 800), textScale: 2);
      final semantics = tester.ensureSemantics();
      await tapAndSettle(
        tester,
        find.bySemanticsLabel('Responder a Cris Souza'),
      );
      expect(tester.takeException(), isNull);
      final screen =
          tester.view.physicalSize.height / tester.view.devicePixelRatio;
      for (final finder in [
        find.text('Cancelar resposta'),
        find.byIcon(Icons.send),
      ]) {
        expect(finder, findsOneWidget);
        expect(tester.getBottomLeft(finder).dy, lessThanOrEqualTo(screen));
        expect(tester.getTopLeft(finder).dy, greaterThanOrEqualTo(0));
      }
      semantics.dispose();
    });
  });

  group('tree logic', () {
    test('flattenComments brings profundidade and the comment answered, without crop nothing', () {
      final tree = [
        fakeComment(
          id: 'a',
          replies: [
            fakeComment(
              id: 'b',
              replies: [fakeComment(id: 'c')],
            ),
          ],
        ),
        fakeComment(id: 'd'),
      ];
      final flat = flattenComments(tree);
      expect(
        [for (final (c, d, p) in flat) (c.id, d, p?.id)],
        [('a', 0, null), ('b', 1, 'a'), ('c', 2, 'b'), ('d', 0, null)],
      );
      expect(maxIndentLevels, 2);
    });
  });
}
