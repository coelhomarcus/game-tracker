import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/network/app_exception.dart';
import 'package:gametracker/features/feed/data/post_models.dart';
import 'package:material_ui/material_ui.dart';

import '../../support/fake_feed.dart';
import '../../support/harness.dart';

Finder get composer => find.widgetWithText(TextField, 'Escreva um comentário');
Finder get sendButton => find.widgetWithIcon(IconButton, Icons.send);

Future<AppHarness> openPost(
  WidgetTester tester,
  FakeFeedRepository feed, {
  String id = 'p1',
  Size size = const Size(400, 900),
}) async {
  final h = AppHarness(feed: feed);
  await h.pump(tester, size: size);
  await goTo(tester, '/posts/$id');
  return h;
}

FakeFeedRepository threadFeed() => FakeFeedRepository()
  ..posts['p1'] = fakePost(
    id: 'p1',
    content: 'Post principal',
    comments: 3,
    likes: 2,
  )
  ..commentTrees['p1'] = [
    fakeComment(
      id: 'a',
      content: 'Raiz A',
      likes: 1,
      replies: [
        fakeComment(
          id: 'b',
          parent: 'a',
          content: 'Resposta B',
          author: ana,
          replies: [fakeComment(id: 'c', parent: 'b', content: 'Resposta C')],
        ),
      ],
    ),
  ];

void main() {
  testWidgets(
    'opens by deep link, even without the post have past through the feed',
    (tester) async {
      await openPost(tester, threadFeed());
      expect(find.text('Post principal'), findsOneWidget);
      expect(find.text('Comentários (3)'), findsOneWidget);
    },
  );

  testWidgets('shows the thread entire with the replies nested', (
    tester,
  ) async {
    await openPost(tester, threadFeed());
    expect(find.text('Raiz A'), findsOneWidget);
    expect(find.text('Resposta B'), findsOneWidget);
    expect(find.text('Resposta C'), findsOneWidget);
  });

  testWidgets('thread deep never where comments (only limits the indent)', (
    tester,
  ) async {
    Comment chain(int depth, int max) => fakeComment(
      id: 'n$depth',
      parent: depth == 0 ? null : 'n${depth - 1}',
      content: 'nível $depth',
      replies: depth == max ? const [] : [chain(depth + 1, max)],
    );
    final feed = FakeFeedRepository()
      ..posts['p1'] = fakePost(id: 'p1', comments: 8)
      ..commentTrees['p1'] = [chain(0, 7)];
    await openPost(tester, feed);
    for (var i = 0; i <= 7; i++) {
      expect(
        find.text('nível $i', skipOffstage: false),
        findsOneWidget,
        reason: 'nível $i visível',
      );
    }
    // O recuo para no limite: níveis 3 e 7 começam no mesmo x.
    final x3 = tester.getTopLeft(find.text('nível 3', skipOffstage: false)).dx;
    final x7 = tester.getTopLeft(find.text('nível 7', skipOffstage: false)).dx;
    expect(x7, x3, reason: 'recuo limitado a 3 níveis');
    final x1 = tester.getTopLeft(find.text('nível 1', skipOffstage: false)).dx;
    expect(x1, lessThan(x3));
  });

  testWidgets('like the comment nested is immediate; fails undoes and warns', (
    tester,
  ) async {
    final feed = threadFeed();
    await openPost(tester, feed);
    final like = find.bySemanticsLabel(
      RegExp('Curtir comentário de beto, 0 curtidas'),
    );
    final semantics = tester.ensureSemantics();
    await tester.pumpAndSettle();
    expect(like, findsWidgets);

    await tapAndSettle(tester, like.last);
    expect(feed.commentLikeCalls.single, ('c', true));
    expect(
      find.bySemanticsLabel(RegExp('Descurtir comentário de beto, 1 curtidas')),
      findsOneWidget,
    );

    feed.likeError = const NetworkException();
    await tapAndSettle(
      tester,
      find.bySemanticsLabel(RegExp('Descurtir comentário de beto, 1 curtidas')),
    );
    expect(
      find.bySemanticsLabel(RegExp('Descurtir comentário de beto, 1 curtidas')),
      findsOneWidget,
      reason: 'desfez a descurtida',
    );
    expect(find.textContaining('Sem conexão'), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('commenting updates the thread and the counter', (tester) async {
    final feed = threadFeed();
    await openPost(tester, feed);
    await tester.enterText(composer, 'Meu comentário');
    await tester.pumpAndSettle();
    await tapAndSettle(tester, sendButton);

    expect(feed.addedComments.single.content, 'Meu comentário');
    expect(feed.addedComments.single.parent, isNull);
    expect(find.text('Meu comentário'), findsOneWidget);
    expect(find.text('Comentários (4)'), findsOneWidget);
    expect(
      tester.widget<TextField>(composer).controller!.text,
      isEmpty,
      reason: 'campo limpo no sucesso',
    );
  });

  testWidgets('responds nests to the comment chosen and shows the target', (
    tester,
  ) async {
    final feed = threadFeed();
    await openPost(tester, feed);
    final semantics = tester.ensureSemantics();
    await tapAndSettle(tester, find.bySemanticsLabel('Responder a beto').first);
    expect(find.text('Respondendo a @beto'), findsOneWidget);

    await tester.enterText(
      find.widgetWithText(TextField, 'Escreva sua resposta'),
      'Concordo',
    );
    await tester.pumpAndSettle();
    await tapAndSettle(tester, sendButton);

    expect(
      feed.addedComments.single.parent,
      'a',
      reason: 'resposta ao primeiro comentário',
    );
    expect(
      find.text('Respondendo a @beto'),
      findsNothing,
      reason: 'alvo limpo depois de enviar',
    );
    expect(find.text('Concordo'), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('cancel the reply returns the commenting in the post', (
    tester,
  ) async {
    final feed = threadFeed();
    await openPost(tester, feed);
    final semantics = tester.ensureSemantics();
    await tapAndSettle(tester, find.bySemanticsLabel('Responder a beto').first);
    await tapAndSettle(tester, find.byTooltip('Cancelar resposta'));
    expect(find.text('Respondendo a @beto'), findsNothing);
    await tester.enterText(composer, 'De novo no post');
    await tester.pumpAndSettle();
    await tapAndSettle(tester, sendButton);
    expect(feed.addedComments.single.parent, isNull);
    semantics.dispose();
  });

  testWidgets(
    'fails to the commenting preserves the text and the target of the reply',
    (tester) async {
      final feed = threadFeed()..commentError = const NetworkException();
      await openPost(tester, feed);
      final semantics = tester.ensureSemantics();
      await tapAndSettle(
        tester,
        find.bySemanticsLabel('Responder a beto').first,
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Escreva sua resposta'),
        'Texto importante',
      );
      await tester.pumpAndSettle();
      await tapAndSettle(tester, sendButton);

      expect(find.textContaining('Sem conexão'), findsOneWidget);
      expect(
        find.text('Texto importante'),
        findsOneWidget,
        reason: 'texto preservado',
      );
      expect(
        find.text('Respondendo a @beto'),
        findsOneWidget,
        reason: 'alvo preservado',
      );
      expect(feed.addedComments, isEmpty);

      feed.commentError = null;
      await tapAndSettle(tester, sendButton);
      expect(feed.addedComments.single.content, 'Texto importante');
      expect(feed.addedComments.single.parent, 'a');
      semantics.dispose();
    },
  );

  testWidgets('send stays disabled without text', (tester) async {
    await openPost(tester, threadFeed());
    expect(tester.widget<IconButton>(sendButton).onPressed, isNull);
    await tester.enterText(composer, '   ');
    await tester.pumpAndSettle();
    expect(
      tester.widget<IconButton>(sendButton).onPressed,
      isNull,
      reason: 'só espaços não conta',
    );
    await tester.enterText(composer, 'ok');
    await tester.pumpAndSettle();
    expect(tester.widget<IconButton>(sendButton).onPressed, isNotNull);
  });

  testWidgets('post without comments invites the commenting', (tester) async {
    final feed = FakeFeedRepository()..posts['p1'] = fakePost(id: 'p1');
    await openPost(tester, feed);
    expect(find.textContaining('Seja o primeiro'), findsOneWidget);
  });

  testWidgets(
    'post removed: says that does not is more available and offers return',
    (tester) async {
      final feed = FakeFeedRepository()
        ..postError = const ApiException(
          404,
          'not_found',
          'Post não encontrado',
        );
      await openPost(tester, feed, id: 'zzz');
      expect(find.text('Este post não está mais disponível'), findsOneWidget);
      expect(
        find.text('Tentar de novo'),
        findsNothing,
        reason: 'repetir não adianta',
      );
      await tapAndSettle(tester, find.widgetWithText(FilledButton, 'Voltar'));
      expect(find.text('Comunidade'), findsWidgets);
    },
  );

  testWidgets('fails of network when opening the post offers try of new', (
    tester,
  ) async {
    final feed = threadFeed()..postError = const NetworkException();
    await openPost(tester, feed);
    expect(find.textContaining('Sem conexão'), findsOneWidget);
    expect(find.text('Este post não está mais disponível'), findsNothing);
    feed.postError = null;
    await tapAndSettle(tester, find.text('Tentar de novo'));
    expect(find.text('Post principal'), findsOneWidget);
  });

  testWidgets('fails to the load the comments does not crash the post', (
    tester,
  ) async {
    final feed = threadFeed()..commentsError = const NetworkException();
    await openPost(tester, feed);
    expect(
      find.text('Post principal'),
      findsOneWidget,
      reason: 'o post continua visível',
    );
    expect(find.textContaining('Sem conexão'), findsOneWidget);

    feed.commentsError = null;
    await tapAndSettle(tester, find.text('Tentar de novo'));
    expect(find.text('Raiz A'), findsOneWidget);
  });

  testWidgets('like the post in the detail reflects in the feed', (
    tester,
  ) async {
    final feed = FakeFeedRepository(
      general: [fakePost(id: 'p1', content: 'Post do feed', likes: 5)],
    )..posts['p1'] = fakePost(id: 'p1', content: 'Post do feed', likes: 5);
    final h = AppHarness(feed: feed);
    await h.pump(tester);
    await tapAndSettle(tester, find.text('Comunidade').last);
    await tapAndSettle(tester, find.text('Post do feed'));
    await tapAndSettle(tester, find.text('5'));
    expect(find.text('6'), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(
      find.text('6'),
      findsOneWidget,
      reason: 'o feed mostra a mesma contagem',
    );
    expect(find.text('5'), findsNothing);
  });

  testWidgets('layout the 360 px and text 200% does not overflows', (
    tester,
  ) async {
    await openPost(tester, threadFeed(), size: const Size(360, 800));
    expect(tester.takeException(), isNull);
    final h = AppHarness(feed: threadFeed());
    await h.pump(tester, size: const Size(360, 800), textScale: 2.0);
    await goTo(tester, '/posts/p1');
    expect(tester.takeException(), isNull);
  });
}
