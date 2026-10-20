import 'dart:async';

import 'package:dio/dio.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/app/providers.dart';
import 'package:gametracker/app/theme_mode.dart';
import 'package:gametracker/core/models/user_summary.dart';
import 'package:gametracker/core/network/app_exception.dart';
import 'package:gametracker/features/auth/data/auth_models.dart';
import 'package:gametracker/features/auth/data/auth_repository.dart';
import 'package:gametracker/features/feed/application/feed_controller.dart';
import 'package:gametracker/features/feed/application/post_store.dart';
import 'package:gametracker/features/feed/data/post_models.dart';
import 'package:gametracker/features/games/data/game_models.dart';
import 'package:gametracker/features/profiles/application/follow_store.dart';
import 'package:gametracker/features/profiles/application/profile_editor.dart';
import 'package:gametracker/features/profiles/application/profile_image_picker.dart';
import 'package:gametracker/features/profiles/application/profile_providers.dart';
import 'package:gametracker/features/profiles/data/profile_models.dart';
import 'package:gametracker/features/profiles/data/profiles_repository.dart';
import 'package:material_ui/material_ui.dart' show ThemeMode;
import 'package:shared_preferences/shared_preferences.dart';

import '../../support/fake_auth.dart';
import '../../support/fake_feed.dart';
import '../../support/fake_api.dart';
import '../../support/fake_profiles.dart';
import '../../support/fixtures.dart';

Future<ProviderContainer> makeContainer(
  FakeProfilesRepository profiles, {
  FakeAuthRepository? auth,
  FakeFeedRepository? feed,
  DateTime Function()? clock,
}) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  final c = ProviderContainer(
    retry: noAutomaticRetry,
    overrides: [
      ...fakeAuthOverrides(
        auth ??
            (FakeAuthRepository()
              ..restoreResult = Restored(fakeUser('u-ana', 'ana'))),
      ),
      profilesRepositoryProvider.overrideWithValue(profiles),
      feedRepositoryProvider.overrideWithValue(feed ?? FakeFeedRepository()),
      sharedPreferencesProvider.overrideWithValue(prefs),
      if (clock != null) clockProvider.overrideWithValue(clock),
    ],
  );
  addTearDown(c.dispose);
  c.read(sessionControllerProvider);
  await Future<void>.delayed(Duration.zero);
  await Future<void>.delayed(Duration.zero);
  return c;
}

void main() {
  group('contract: replies real from the backend', () {
    test('profile: counters, relationship, and dates', () {
      final p = UserProfile.fromJson(
        fixtureBody('user_profile') as Map<String, dynamic>,
      );
      expect(p.id, hasLength(36));
      expect(p.username, isNotEmpty);
      expect(p.followerCount, isA<int>());
      expect(
        p.entryCount,
        isA<int>(),
        reason: 'gameEntryCount conta playthroughs',
      );
      expect(p.createdAt.isUtc, isTrue);
      expect(p.bannerUrl, isNull);
    });

    test('result of search of people', () {
      final list = (fixtureBody('users_search') as List)
          .cast<Map<String, dynamic>>()
          .map(PersonResult.fromJson)
          .toList();
      expect(list, isNotEmpty);
      expect(list.first.user.username, isNotEmpty);
      expect(list.first.isFollowedByMe, isA<bool>());
    });

    test('profile favorites are complete games', () {
      final games = (fixtureBody('user_favorites') as List)
          .cast<Map<String, dynamic>>()
          .map(Game.fromJson)
          .toList();
      expect(games.single.igdbId, 900001);
    });

    test(
      'bio empty equivale the without bio; name missing falls in the username',
      () {
        final p = fakeProfile(bio: '', name: null, username: 'zé');
        expect(p.bioOrNull, isNull);
        expect(p.displayName, 'zé');
        expect(fakeProfile(bio: '  ').bioOrNull, isNull);
        expect(fakeProfile(bio: 'oi').bioOrNull, 'oi');
      },
    );

    test('changes send only the that was informed; bio empty clears', () {
      expect(const ProfileChanges(bio: 'x').toJson(), {'bio': 'x'});
      expect(const ProfileChanges(bio: '').toJson(), {'bio': ''});
      expect(const ProfileChanges().isEmpty, isTrue);
      expect(const ProfileChanges(name: 'A', username: 'a_b').toJson(), {
        'username': 'a_b',
        'name': 'A',
      });
    });

    test('limit of 8 MiB of the upload', () {
      expect(fakeImage(size: PickedImage.maxBytes).isTooLarge, isFalse);
      expect(fakeImage(size: PickedImage.maxBytes + 1).isTooLarge, isTrue);
    });

    test('image type from the extension', () {
      expect(mimeTypeForFileName('a.PNG'), 'image/png');
      expect(mimeTypeForFileName('a.webp'), 'image/webp');
      expect(mimeTypeForFileName('a.heic'), 'image/heic');
      expect(mimeTypeForFileName('a.jpg'), 'image/jpeg');
      expect(mimeTypeForFileName('sem_extensao'), 'image/jpeg');
    });
  });

  group('request bodies', () {
    ({RemoteProfilesRepository repo, FakeAdapter adapter}) make(
      Object? body, {
      int status = 200,
    }) {
      final adapter = FakeAdapter((_) async => jsonResponse(status, body));
      final dio = Dio(BaseOptions(baseUrl: 'http://fake'))
        ..httpClientAdapter = adapter;
      return (repo: RemoteProfilesRepository(dio), adapter: adapter);
    }

    test('PATCH only with the fields changed', () async {
      final m = make(null, status: 204);
      await m.repo.updateProfile(const ProfileChanges(bio: 'nova'));
      expect(m.adapter.requests.single.method, 'PATCH');
      expect(m.adapter.requests.single.path, '/users/me');
      expect(m.adapter.requests.single.data, {'bio': 'nova'});
    });

    test('without changes does not make the request', () async {
      final m = make(null, status: 204);
      await m.repo.updateProfile(const ProfileChanges());
      expect(m.adapter.requests, isEmpty);
    });

    test('follow uses post and leave of follow uses DELETE', () async {
      final m = make(null, status: 204);
      await m.repo.setFollow('u1', follow: true);
      await m.repo.setFollow('u1', follow: false);
      expect(m.adapter.requests.map((r) => '${r.method} ${r.path}').toList(), [
        'POST /users/u1/follow',
        'DELETE /users/u1/follow',
      ]);
    });

    test('upload of avatar: multipart with the field, the name and the type correct', () async {
      final m = make({'avatarUrl': 'http://x/uploads/avatars/a.jpg'});
      final url = await m.repo.uploadImage(
        ProfileImageKind.avatar,
        fakeImage(name: 'eu.png'),
      );
      final req = m.adapter.requests.single;
      expect((req.method, req.path), ('POST', '/users/me/avatar'));
      final form = req.data as FormData;
      expect(form.files.single.key, 'avatar');
      expect(form.files.single.value.filename, 'eu.png');
      expect(form.files.single.value.contentType.toString(), 'image/png');
      expect(url, 'http://x/uploads/avatars/a.jpg');
    });

    test(
      'upload of banner uses the route and the field of the banner',
      () async {
        final m = make({'bannerUrl': 'http://x/uploads/banners/b.jpg'});
        final url = await m.repo.uploadImage(
          ProfileImageKind.banner,
          fakeImage(),
        );
        expect(m.adapter.requests.single.path, '/users/me/banner');
        expect(
          (m.adapter.requests.single.data as FormData).files.single.key,
          'banner',
        );
        expect(url, endsWith('b.jpg'));
      },
    );

    test('profile and search use the id and the term', () async {
      final m = make([]);
      await m.repo.search('ana');
      expect(m.adapter.requests.single.queryParameters['q'], 'ana');
    });
  });

  group('FollowStore', () {
    test(
      'follow is immediate, sum +1 to the counter and confirms on the server',
      () async {
        final repo = FakeProfilesRepository();
        final c = await makeContainer(repo);
        await c
            .read(followStoreProvider.notifier)
            .toggle('u-beto', currentlyFollowing: false);
        final info = c.read(followStoreProvider)['u-beto']!;
        expect((info.following, info.followerDelta), (true, 1));
        expect(repo.followCalls, [('u-beto', true)]);
      },
    );

    test(
      'leave of follow logo after accumulates the adjustment (returns the 0)',
      () async {
        final c = await makeContainer(FakeProfilesRepository());
        final store = c.read(followStoreProvider.notifier);
        await store.toggle('u-beto', currentlyFollowing: false);
        await store.toggle('u-beto', currentlyFollowing: true);
        final info = c.read(followStoreProvider)['u-beto']!;
        expect((info.following, info.followerDelta), (false, 0));
      },
    );

    test('undoes when the server fails (without entry previous, removes the entry)', () async {
      final repo = FakeProfilesRepository()
        ..followError = const NetworkException();
      final c = await makeContainer(repo);
      await expectLater(
        c
            .read(followStoreProvider.notifier)
            .toggle('u-beto', currentlyFollowing: false),
        throwsA(isA<NetworkException>()),
      );
      expect(c.read(followStoreProvider).containsKey('u-beto'), isFalse);
      expect(c.read(followStoreProvider.notifier).isPending('u-beto'), isFalse);
    });

    test(
      'undoes for the state previous when already there was adjustment',
      () async {
        final repo = FakeProfilesRepository();
        final c = await makeContainer(repo);
        final store = c.read(followStoreProvider.notifier);
        await store.toggle('u-beto', currentlyFollowing: false);
        repo.followError = const NetworkException();
        await expectLater(
          store.toggle('u-beto', currentlyFollowing: true),
          throwsA(isA<NetworkException>()),
        );
        final info = c.read(followStoreProvider)['u-beto']!;
        expect((info.following, info.followerDelta), (true, 1));
      },
    );

    test('taps while pending does not generate requests', () async {
      final gate = Completer<void>();
      final repo = FakeProfilesRepository()..followGate = gate;
      final c = await makeContainer(repo);
      final store = c.read(followStoreProvider.notifier);
      final first = store.toggle('u-beto', currentlyFollowing: false);
      await store.toggle('u-beto', currentlyFollowing: true);
      await store.toggle('u-beto', currentlyFollowing: true);
      expect(repo.followCalls.length, 1);
      gate.complete();
      await first;
    });

    test(
      'sync discards the local change except while the change is in progress',
      () async {
        final gate = Completer<void>();
        final repo = FakeProfilesRepository()..followGate = gate;
        final c = await makeContainer(repo);
        final store = c.read(followStoreProvider.notifier);
        final pending = store.toggle('u-beto', currentlyFollowing: false);
        await Future<void>.delayed(Duration.zero);
        store.sync('u-beto');
        expect(
          c.read(followStoreProvider).containsKey('u-beto'),
          isTrue,
          reason: 'pendente: preserva a resposta imediata',
        );
        gate.complete();
        await pending;
        store.sync('u-beto');
        expect(
          c.read(followStoreProvider).containsKey('u-beto'),
          isFalse,
          reason: 'dados do servidor são a verdade',
        );
      },
    );

    test('follow marks the feed Following the outdated', () async {
      var now = DateTime.utc(2026, 6, 1, 12);
      final feed = FakeFeedRepository(following: [fakePost(id: 'p1')]);
      final c = await makeContainer(
        FakeProfilesRepository(),
        feed: feed,
        clock: () => now,
      );
      c.listen(feedControllerProvider(FeedScope.following), (_, _) {});
      await c.read(feedControllerProvider(FeedScope.following).future);
      final calls = feed.feedCalls.length;

      await c
          .read(followStoreProvider.notifier)
          .toggle('u-beto', currentlyFollowing: false);
      now = now.add(const Duration(seconds: 5));
      c.read(feedRevalidatorProvider).revalidateIfStale();
      await c.read(feedControllerProvider(FeedScope.following).future);
      expect(feed.feedCalls.length, calls + 1);
    });

    test('state is discarded when leaving the account', () async {
      final auth = FakeAuthRepository()
        ..restoreResult = Restored(fakeUser('u-ana', 'ana'));
      final c = await makeContainer(FakeProfilesRepository(), auth: auth);
      await c
          .read(followStoreProvider.notifier)
          .toggle('u-beto', currentlyFollowing: false);
      expect(c.read(followStoreProvider), isNotEmpty);
      await c.read(sessionControllerProvider.notifier).logout();
      expect(c.read(followStoreProvider), isEmpty);
    });
  });

  group('search of people', () {
    test('term short does not query', () async {
      final repo = FakeProfilesRepository();
      final c = await makeContainer(repo);
      expect(await c.read(peopleSearchProvider('a').future), isEmpty);
      expect(repo.searches, isEmpty);
    });

    test('respects debounce and trims the term', () {
      fakeAsync((async) {
        final repo = FakeProfilesRepository()..searchResult = [fakePerson()];
        final c = ProviderContainer(
          retry: noAutomaticRetry,
          overrides: [
            ...fakeAuthOverrides(FakeAuthRepository()),
            profilesRepositoryProvider.overrideWithValue(repo),
          ],
        );
        addTearDown(c.dispose);
        final sub = c.listen(peopleSearchProvider('  beto '), (_, _) {});
        async.elapse(peopleSearchDebounce - const Duration(milliseconds: 50));
        expect(repo.searches, isEmpty);
        async.elapse(const Duration(milliseconds: 100));
        async.flushMicrotasks();
        expect(repo.searches, ['beto']);
        sub.close();
      });
    });

    test('type more before of the debounce abandons the query previous', () {
      fakeAsync((async) {
        final repo = FakeProfilesRepository();
        final c = ProviderContainer(
          retry: noAutomaticRetry,
          overrides: [
            ...fakeAuthOverrides(FakeAuthRepository()),
            profilesRepositoryProvider.overrideWithValue(repo),
          ],
        );
        addTearDown(c.dispose);
        final s1 = c.listen(peopleSearchProvider('be'), (_, _) {});
        async.elapse(const Duration(milliseconds: 200));
        s1.close();
        final s2 = c.listen(peopleSearchProvider('bet'), (_, _) {});
        async.elapse(const Duration(seconds: 1));
        async.flushMicrotasks();
        expect(repo.searches, ['bet']);
        s2.close();
      });
    });

    test(
      'results discard old local follow changes (the server is authoritative)',
      () async {
        final repo = FakeProfilesRepository()
          ..searchResult = [fakePerson(id: 'u-beto', followed: true)];
        final c = await makeContainer(repo);
        await c
            .read(followStoreProvider.notifier)
            .toggle('u-beto', currentlyFollowing: false);
        expect(c.read(followStoreProvider), isNotEmpty);

        c.listen(peopleSearchProvider('beto'), (_, _) {});
        await Future<void>.delayed(
          peopleSearchDebounce + const Duration(milliseconds: 50),
        );
        await c.read(peopleSearchProvider('beto').future);
        expect(c.read(followStoreProvider), isEmpty);
      },
    );
  });

  group('ProfileEditor', () {
    test('save updates the session, the posts already loaded and reloads the profile', () async {
      final auth = FakeAuthRepository()
        ..restoreResult = Restored(fakeUser('u-ana', 'ana'));
      final repo = FakeProfilesRepository()
        ..profiles['u-ana'] = fakeProfile(
          id: 'u-ana',
          username: 'ana',
          name: 'ANA',
        );
      final c = await makeContainer(repo, auth: auth);
      c.listen(profileProvider('u-ana'), (_, _) {});
      await c.read(profileProvider('u-ana').future);
      c.read(postStoreProvider.notifier).upsert([
        fakePost(
          id: 'mine',
          author: const UserSummary(id: 'u-ana', username: 'ana', name: 'ANA'),
        ),
        fakePost(id: 'other', author: beto),
      ]);
      final profileCalls = repo.profileCalls;

      auth.meResult = const AuthUser(
        id: 'u-ana',
        username: 'ana_nova',
        email: 'ana@example.test',
        name: 'Ana Silva',
        avatarUrl: 'http://x/a.jpg',
      );
      await c
          .read(profileEditorProvider)
          .save(const ProfileChanges(username: 'ana_nova', name: 'Ana Silva'));

      expect(repo.updates.single.toJson(), {
        'username': 'ana_nova',
        'name': 'Ana Silva',
      });
      final session = c.read(sessionControllerProvider);
      expect((session as dynamic).user.username, 'ana_nova');
      final mine = c.read(postStoreProvider)['mine']!;
      expect(
        (mine.author.displayName, mine.author.username, mine.author.avatarUrl),
        ('Ana Silva', 'ana_nova', 'http://x/a.jpg'),
      );
      expect(
        c.read(postStoreProvider)['other']!.author.username,
        'beto',
        reason: 'posts de outros intactos',
      );
      await c.read(profileProvider('u-ana').future);
      expect(
        repo.profileCalls,
        greaterThan(profileCalls),
        reason: 'perfil recarregado',
      );
    });

    test('username conflict throws and changes nothing', () async {
      final auth = FakeAuthRepository()
        ..restoreResult = Restored(fakeUser('u-ana', 'ana'));
      final repo = FakeProfilesRepository()
        ..updateError = const ApiException(
          409,
          'conflict',
          'Username já está em uso',
        );
      final c = await makeContainer(repo, auth: auth);
      await expectLater(
        c
            .read(profileEditorProvider)
            .save(const ProfileChanges(username: 'beto')),
        throwsA(
          isA<ApiException>().having((e) => e.isConflict, 'isConflict', true),
        ),
      );
      expect(
        (c.read(sessionControllerProvider) as dynamic).user.username,
        'ana',
      );
    });

    test('upload: reports progress, returns the URL and updates the avatar of the session', () async {
      final auth = FakeAuthRepository()
        ..restoreResult = Restored(fakeUser('u-ana', 'ana'));
      final repo = FakeProfilesRepository();
      final c = await makeContainer(repo, auth: auth);
      auth.meResult = AuthUser(
        id: 'u-ana',
        username: 'ana',
        email: 'a@example.test',
        avatarUrl: repo.avatarUrlResult,
      );

      final progress = <double>[];
      final url = await c
          .read(profileEditorProvider)
          .uploadImage(
            ProfileImageKind.avatar,
            fakeImage(),
            onProgress: progress.add,
          );
      expect(url, repo.avatarUrlResult);
      expect(progress, [0.5, 1.0]);
      expect(
        (c.read(sessionControllerProvider) as dynamic).user.avatarUrl,
        repo.avatarUrlResult,
      );
    });

    test('upload failure throws and does not change the session', () async {
      final repo = FakeProfilesRepository()
        ..uploadError = const ApiException(
          400,
          'validation_error',
          'Imagem inválida ou corrompida',
        );
      final c = await makeContainer(repo);
      await expectLater(
        c
            .read(profileEditorProvider)
            .uploadImage(ProfileImageKind.avatar, fakeImage()),
        throwsA(isA<ApiException>()),
      );
      expect(
        (c.read(sessionControllerProvider) as dynamic).user.avatarUrl,
        isNull,
      );
    });

    test('if reler the account fails after save, the change is not given the fails', () async {
      final auth = FakeAuthRepository()
        ..restoreResult = Restored(fakeUser('u-ana', 'ana'))
        ..meError = const NetworkException();
      final repo = FakeProfilesRepository();
      final c = await makeContainer(repo, auth: auth);
      await c.read(profileEditorProvider).save(const ProfileChanges(bio: 'oi'));
      expect(repo.updates, hasLength(1), reason: 'foi salvo no servidor');
    });
  });

  group('theme', () {
    test('the preference persists across app launches', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      ProviderContainer make() => ProviderContainer(
        overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
      );

      final first = make();
      expect(first.read(themeModeProvider), ThemeMode.system);
      first.read(themeModeProvider.notifier).set(ThemeMode.dark);
      first.dispose();

      final second = make();
      addTearDown(second.dispose);
      expect(second.read(themeModeProvider), ThemeMode.dark);
    });

    test('value unknown falls in "system"', () async {
      SharedPreferences.setMockInitialValues({'theme.mode': 'roxo'});
      final prefs = await SharedPreferences.getInstance();
      final c = ProviderContainer(
        overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
      );
      addTearDown(c.dispose);
      expect(c.read(themeModeProvider), ThemeMode.system);
    });
  });
}
