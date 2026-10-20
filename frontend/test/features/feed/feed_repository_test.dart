import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/features/feed/data/feed_repository.dart';
import 'package:gametracker/features/feed/data/post_models.dart';

import '../../support/fake_api.dart';

({RemoteFeedRepository repo, FakeAdapter adapter}) make(
  Object? body, {
  int status = 200,
}) {
  final adapter = FakeAdapter((_) async => jsonResponse(status, body));
  final dio = Dio(BaseOptions(baseUrl: 'http://fake'))
    ..httpClientAdapter = adapter;
  return (repo: RemoteFeedRepository(dio), adapter: adapter);
}

void main() {
  test('feed sends the scope explicitly (the default from the server is "following")', () async {
    final m = make({'items': <Object>[], 'nextCursor': null});
    await m.repo.feed(FeedScope.general);
    final q = m.adapter.requests.single.queryParameters;
    expect(q['scope'], 'general');
    expect(q['limit'], 20);
    expect(q.containsKey('cursor'), isFalse);
  });

  test('feed forwards the opaque cursor without changing it', () async {
    final m = make({'items': <Object>[], 'nextCursor': null});
    await m.repo.feed(
      FeedScope.following,
      cursor: 'MjAyNi0xMC0wNFQxNTo0NToxNS4xMzZaX2Jk',
    );
    final q = m.adapter.requests.single.queryParameters;
    expect(q['scope'], 'following');
    expect(q['cursor'], 'MjAyNi0xMC0wNFQxNTo0NToxNS4xMzZaX2Jk');
  });

  test('posts of the game use the UUID internal, 20 by page, and forward the cursor', () async {
    final m = make({'items': <Object>[], 'nextCursor': null});
    await m.repo.gamePosts('uuid-do-jogo');
    await m.repo.gamePosts('uuid-do-jogo', cursor: 'opaco==');
    final first = m.adapter.requests.first;
    expect(first.method, 'GET');
    expect(first.path, '/games/uuid-do-jogo/posts');
    expect(first.queryParameters['limit'], 20);
    expect(first.queryParameters.containsKey('cursor'), isFalse);
    expect(m.adapter.requests.last.queryParameters['cursor'], 'opaco==');
  });

  test(
    'posts of the game: the page brings items and the next cursor',
    () async {
      final m = make({
        'items': [_postJson()],
        'nextCursor': 'c1',
      });
      final page = await m.repo.gamePosts('g');
      expect(page.items, hasLength(1));
      expect(page.nextCursor, 'c1');
    },
  );

  test('create post with entry sends only the entry (the backend derives the game)', () async {
    final m = make(_postJson());
    await m.repo.create(content: 'Zerei!', gameId: 'g1', gameEntryId: 'e1');
    expect(m.adapter.requests.single.data, {
      'content': 'Zerei!',
      'gameEntryId': 'e1',
    });
  });

  test('create post with game, but without entry, sends the game', () async {
    final m = make(_postJson());
    await m.repo.create(content: 'Quero jogar', gameId: 'g1');
    expect(m.adapter.requests.single.data, {
      'content': 'Quero jogar',
      'gameId': 'g1',
    });
  });

  test('create post without link sends only the text', () async {
    final m = make(_postJson());
    await m.repo.create(content: 'Oi');
    expect(m.adapter.requests.single.data, {'content': 'Oi'});
  });

  test('like uses post and unlike uses DELETE', () async {
    final m = make(null, status: 204);
    await m.repo.setLike('p1', liked: true);
    await m.repo.setLike('p1', liked: false);
    expect(m.adapter.requests.map((r) => '${r.method} ${r.path}').toList(), [
      'POST /posts/p1/like',
      'DELETE /posts/p1/like',
    ]);
  });

  test('like comment uses the route of the comment', () async {
    final m = make(null, status: 204);
    await m.repo.setCommentLike('c9', liked: true);
    await m.repo.setCommentLike('c9', liked: false);
    expect(m.adapter.requests.map((r) => '${r.method} ${r.path}').toList(), [
      'POST /comments/c9/like',
      'DELETE /comments/c9/like',
    ]);
  });

  test('comment root does not send parentCommentId; reply sends', () async {
    final m = make(null, status: 201);
    await m.repo.addComment('p1', 'raiz');
    await m.repo.addComment('p1', 'resposta', parentCommentId: 'c1');
    expect(m.adapter.requests[0].data, {'content': 'raiz'});
    expect(m.adapter.requests[1].data, {
      'content': 'resposta',
      'parentCommentId': 'c1',
    });
  });
}

Map<String, Object?> _postJson() => {
  'id': 'p1',
  'content': 'x',
  'type': 'status',
  'activityStatus': null,
  'createdAt': '2026-06-01T00:00:00.000Z',
  'user': {'id': 'u', 'username': 'a', 'name': null, 'avatarUrl': null},
  'game': null,
  'gameEntry': null,
  'likeCount': 0,
  'commentCount': 0,
  'likedByMe': false,
};
