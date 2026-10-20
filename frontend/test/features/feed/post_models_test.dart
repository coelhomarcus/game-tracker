import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/dates/relative_time.dart';
import 'package:gametracker/core/design_system/game_status.dart';
import 'package:gametracker/features/feed/data/post_models.dart';

import '../../support/fake_feed.dart';
import '../../support/fixtures.dart';

void main() {
  group('contract: replies real from the backend', () {
    test('feed: page with items and cursor opaque', () {
      final page = PostPage.fromJson(
        fixtureBody('feed_general') as Map<String, dynamic>,
      );
      expect(page.items, isNotEmpty);
      expect(page.nextCursor, isNotNull, reason: 'limit=1 e há mais posts');
      final p = page.items.first;
      expect(p.id, hasLength(36));
      expect(p.author.username, isNotEmpty);
      expect(p.likeCount, isA<int>());
      expect(
        p.createdAt.isUtc,
        isTrue,
        reason: 'instante, convertido só na exibição',
      );
    });

    test('post linked only the the game (without entry)', () {
      final page = PostPage.fromJson(
        fixtureBody('feed_default_scope') as Map<String, dynamic>,
      );
      final post = Post.fromJson(
        fixtureBody('post_detail') as Map<String, dynamic>,
      );
      expect(
        post.entry,
        isNotNull,
        reason: 'o post de comemoração vem de um registro',
      );
      expect(post.game, isNotNull);
      expect(page.items, isA<List<Post>>());
    });

    test('activity: status is the snapshot history, does not the current', () {
      final page = PostPage.fromJson(
        fixtureBody('user_posts_activity') as Map<String, dynamic>,
      );
      final activity = page.items.firstWhere((p) => p.isActivity);
      expect(activity.activityStatus, isNotNull);
      expect(activity.type, PostType.activity);
    });

    test('activity survives to the deletion of the entry (gameEntry null)', () {
      final page = PostPage.fromJson(
        fixtureBody('user_posts_after_entry_deleted') as Map<String, dynamic>,
      );
      expect(page.items, isNotEmpty);
      final orphan = page.items.where((p) => p.entry == null && p.isActivity);
      expect(orphan, isNotEmpty, reason: 'o post continua, sem o registro');
      expect(orphan.first.game, isNotNull);
    });

    test('comments: tree with replies nested and likes', () {
      final tree = (fixtureBody('post_comments') as List)
          .cast<Map<String, dynamic>>()
          .map(Comment.fromJson)
          .toList();
      expect(tree.length, 1);
      expect(tree.first.replies.length, 1);
      expect(tree.first.replies.first.parentCommentId, tree.first.id);
      expect(tree.first.likeCount, 1);
      expect(countComments(tree), 2);
    });
  });

  group('tree of comments', () {
    final deep = [
      fakeComment(
        id: 'a',
        replies: [
          fakeComment(
            id: 'b',
            parent: 'a',
            replies: [
              fakeComment(
                id: 'c',
                parent: 'b',
                replies: [
                  fakeComment(
                    id: 'd',
                    parent: 'c',
                    replies: [fakeComment(id: 'e', parent: 'd')],
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
      fakeComment(id: 'f'),
    ];

    test('count includes all the levels', () {
      expect(countComments(deep), 6);
    });

    test('updates the comment deep preserving the rest of the tree', () {
      final updated = updateCommentInTree(
        deep,
        'e',
        (c) => c.copyWith(likeCount: 9, likedByMe: true),
      );
      expect(findCommentInTree(updated, 'e')!.likeCount, 9);
      expect(findCommentInTree(updated, 'e')!.likedByMe, isTrue);
      expect(countComments(updated), 6, reason: 'nenhum comentário some');
      expect(findCommentInTree(updated, 'f')!.likeCount, 0);
      expect(
        findCommentInTree(deep, 'e')!.likeCount,
        0,
        reason: 'original imutável',
      );
    });

    test('id missing does not changes nothing', () {
      expect(
        countComments(
          updateCommentInTree(deep, 'zzz', (c) => c.copyWith(likeCount: 1)),
        ),
        6,
      );
      expect(findCommentInTree(deep, 'zzz'), isNull);
    });
  });

  group('time relative', () {
    final now = DateTime.utc(2026, 6, 10, 15);
    String rel(DateTime t) => formatRelativeTime(t, now: now);

    test('bands', () {
      expect(rel(now.subtract(const Duration(seconds: 10))), 'agora');
      expect(rel(now.subtract(const Duration(minutes: 5))), 'há 5 min');
      expect(rel(now.subtract(const Duration(hours: 3))), 'há 3 h');
      expect(rel(now.subtract(const Duration(days: 3))), contains('dias'));
    });

    test('future (clocks out-of-sync) becomes "now"', () {
      expect(rel(now.add(const Duration(minutes: 3))), 'agora');
    });

    test('dates old show day/month and, in another year, the year', () {
      final sameYear = formatRelativeTime(
        DateTime(2026, 1, 5, 12),
        now: DateTime(2026, 6, 10, 12),
      );
      expect(sameYear, '05/01');
      final otherYear = formatRelativeTime(
        DateTime(2025, 1, 5, 12),
        now: DateTime(2026, 6, 10, 12),
      );
      expect(otherYear, '05/01/2025');
    });

    test('ontem', () {
      expect(
        formatRelativeTime(
          DateTime(2026, 6, 9, 8),
          now: DateTime(2026, 6, 10, 20),
        ),
        'ontem',
      );
    });
  });

  test('GameStatus of the snapshot of activity is read of the API', () {
    final p = Post.fromJson({
      'id': 'x',
      'content': 'zerou',
      'type': 'activity',
      'activityStatus': 'completed',
      'createdAt': '2026-06-01T00:00:00.000Z',
      'user': {'id': 'u', 'username': 'a', 'name': null, 'avatarUrl': null},
      'game': null,
      'gameEntry': null,
      'likeCount': 0,
      'commentCount': 0,
      'likedByMe': false,
    });
    expect(p.activityStatus, GameStatus.completed);
    expect(p.game, isNull);
  });
}
