// Perfis, busca de pessoas, seguir e uploads contra o backend real (ambiente isolado).
//
//   flutter test test/integration --dart-define=GT_BACKEND=http://localhost:3100
//
// Requer o jogo sintético 900001 no cache (cd backend && npm run test:seed).
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/design_system/game_status.dart';
import 'package:gametracker/core/network/api_client.dart';
import 'package:gametracker/core/network/app_exception.dart';
import 'package:gametracker/core/network/session_manager.dart';
import 'package:gametracker/core/storage/token_store.dart';
import 'package:gametracker/features/auth/data/auth_api.dart';
import 'package:gametracker/features/feed/data/feed_repository.dart';
import 'package:gametracker/features/games/data/games_repository.dart';
import 'package:gametracker/features/library/data/game_entry.dart';
import 'package:gametracker/features/library/data/library_repository.dart';
import 'package:gametracker/features/profiles/application/profile_image_processor.dart';
import 'package:gametracker/features/profiles/data/profile_models.dart';
import 'package:gametracker/features/profiles/data/profiles_repository.dart';
import 'package:image/image.dart' as img;

const backend = String.fromEnvironment('GT_BACKEND');

/// PNG 1x1 válido.
final _png = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
);

class Account {
  Account(this.id, this.username, this.dio)
    : profiles = RemoteProfilesRepository(dio),
      feed = RemoteFeedRepository(dio),
      library = RemoteLibraryRepository(dio),
      games = RemoteGamesRepository(dio);

  final String id;
  final String username;
  final Dio dio;
  final RemoteProfilesRepository profiles;
  final RemoteFeedRepository feed;
  final RemoteLibraryRepository library;
  final RemoteGamesRepository games;
}

Future<Account> signUp(String prefix) async {
  final n = DateTime.now().microsecondsSinceEpoch.toRadixString(36);
  final authApi = AuthApi(createAuthDio(baseUrl: '$backend/api'));
  final session = SessionManager(
    store: MemoryTokenStore(),
    refreshCall: authApi.refresh,
  );
  final r = await authApi.register(
    name: prefix,
    username: '${prefix}_$n',
    email: '${prefix}_$n@example.test',
    password: 'senha-fixture-123',
  );
  await session.start(r.tokens);
  return Account(
    r.user.id,
    r.user.username,
    createApiDio(session, baseUrl: '$backend/api'),
  );
}

void main() {
  final skip = backend.isEmpty
      ? 'defina --dart-define=GT_BACKEND=http://localhost:3100'
      : null;

  test(
    'search by username finds the person and never the own user',
    skip: skip,
    () async {
      final a = await signUp('pa');
      final b = await signUp('pb');
      final found = await a.profiles.search(
        b.username.substring(0, b.username.length - 2),
      );
      expect(found.any((p) => p.user.id == b.id), isTrue);
      expect(
        found.any((p) => p.user.id == a.id),
        isFalse,
        reason: 'a busca exclui quem busca',
      );
      expect(
        found.firstWhere((p) => p.user.id == b.id).isFollowedByMe,
        isFalse,
      );
    },
  );

  test(
    'follow and unfollow: relationship and counters in the profile',
    skip: skip,
    () async {
      final a = await signUp('pc');
      final b = await signUp('pd');

      await a.profiles.setFollow(b.id, follow: true);
      await a.profiles.setFollow(b.id, follow: true); // idempotente
      var profile = await a.profiles.profile(b.id);
      expect((profile.isFollowedByMe, profile.followerCount), (true, 1));
      expect((await b.profiles.profile(b.id)).followerCount, 1);
      expect((await a.profiles.profile(a.id)).followingCount, 1);
      final found = await a.profiles.search(b.username);
      expect(found.firstWhere((p) => p.user.id == b.id).isFollowedByMe, isTrue);

      await a.profiles.setFollow(b.id, follow: false);
      await a.profiles.setFollow(b.id, follow: false);
      profile = await a.profiles.profile(b.id);
      expect((profile.isFollowedByMe, profile.followerCount), (false, 0));
    },
  );

  test('missing profile is 404', skip: skip, () async {
    final a = await signUp('pe');
    await expectLater(
      a.profiles.profile('00000000-0000-0000-0000-000000000000'),
      throwsA(isA<ApiException>().having((e) => e.status, 'status', 404)),
    );
  });

  test(
    'edit profile: only sent fields; empty bio clears; repeated username is 409',
    skip: skip,
    () async {
      final a = await signUp('pf');
      final b = await signUp('pg');

      await a.profiles.updateProfile(const ProfileChanges(bio: 'Minha bio'));
      var p = await a.profiles.profile(a.id);
      expect((p.bioOrNull, p.name), ('Minha bio', 'pf'));

      await a.profiles.updateProfile(const ProfileChanges(bio: ''));
      expect((await a.profiles.profile(a.id)).bioOrNull, isNull);

      await expectLater(
        a.profiles.updateProfile(ProfileChanges(username: b.username)),
        throwsA(
          isA<ApiException>().having((e) => e.isConflict, 'isConflict', true),
        ),
      );
      p = await a.profiles.profile(a.id);
      expect(p.username, a.username, reason: 'nada mudou');

      await a.profiles.updateProfile(
        const ProfileChanges(),
      ); // sem alterações: nem faz requisição
    },
  );

  test(
    'upload of avatar and of cover: URLs served the JPEG and reflected in the profile',
    skip: skip,
    () async {
      final a = await signUp('ph');
      final image = PickedImage(
        bytes: _png,
        fileName: 'eu.png',
        mimeType: 'image/png',
      );
      final fractions = <double>[];

      final avatarUrl = await a.profiles.uploadImage(
        ProfileImageKind.avatar,
        image,
        onProgress: fractions.add,
      );
      expect(avatarUrl, contains('/uploads/avatars/'));
      final bannerUrl = await a.profiles.uploadImage(
        ProfileImageKind.banner,
        image,
      );
      expect(bannerUrl, contains('/uploads/banners/'));

      final served = await Dio().get<List<int>>(
        avatarUrl,
        options: Options(responseType: ResponseType.bytes),
      );
      expect(served.statusCode, 200);
      expect(served.headers.value('content-type'), 'image/jpeg');

      final p = await a.profiles.profile(a.id);
      expect((p.avatarUrl, p.bannerUrl), (avatarUrl, bannerUrl));
    },
  );

  test(
    'file exported by the crop editor is accepted and served at the saved dimensions',
    skip: skip,
    () async {
      final a = await signUp('pc');
      // Foto grande, como a de um celular: passa pela preparação e pelo recorte reais.
      final photo = img.Image(width: 3000, height: 2000, numChannels: 3);
      for (final p in photo) {
        p.r = p.x * 255 ~/ 3000;
        p.g = p.y * 255 ~/ 2000;
        p.b = 120;
      }
      final prepared = prepareProfileImageSync(
        img.encodeJpg(photo, quality: 90),
      );
      expect(prepared.width, 2048, reason: 'limitada a 2048 px');

      const processor = ImagePackageProcessor();
      for (final kind in ProfileImageKind.values) {
        final file = await processor.export(prepared.bytes, kind);
        expect(file.mimeType, 'image/jpeg');
        expect(file.bytes.length, lessThan(PickedImage.maxBytes));

        final url = await a.profiles.uploadImage(kind, file);
        final served = await Dio().get<List<int>>(
          url,
          options: Options(responseType: ResponseType.bytes),
        );
        expect(served.headers.value('content-type'), 'image/jpeg');
        final decoded = img.decodeJpg(Uint8List.fromList(served.data!))!;
        // O servidor valida e recorta de novo; com a proporção certa, nada é cortado.
        expect(
          decoded.width / decoded.height,
          closeTo(kind.aspectRatio, 0.01),
          reason: '${kind.name}: ${decoded.width}×${decoded.height}',
        );
      }
    },
  );

  test('switch the avatar returns another URL', skip: skip, () async {
    final a = await signUp('pi');
    final image = PickedImage(
      bytes: _png,
      fileName: 'eu.png',
      mimeType: 'image/png',
    );
    final first = await a.profiles.uploadImage(ProfileImageKind.avatar, image);
    final second = await a.profiles.uploadImage(ProfileImageKind.avatar, image);
    expect(second, isNot(first));
  });

  test(
    'file corrupted with type of image is rejected the 400 (does not 500)',
    skip: skip,
    () async {
      final a = await signUp('pj');
      final bad = PickedImage(
        bytes: utf8.encode('isto não é um png'),
        fileName: 'ruim.png',
        mimeType: 'image/png',
      );
      await expectLater(
        a.profiles.uploadImage(ProfileImageKind.avatar, bad),
        throwsA(
          isA<ApiException>()
              .having((e) => e.status, 'status', 400)
              .having((e) => e.code, 'code', 'validation_error'),
        ),
      );
    },
  );

  test('file that is not image is rejected', skip: skip, () async {
    final a = await signUp('pk');
    final text = PickedImage(
      bytes: utf8.encode('texto'),
      fileName: 'a.txt',
      mimeType: 'text/plain',
    );
    await expectLater(
      a.profiles.uploadImage(ProfileImageKind.avatar, text),
      throwsA(isA<ApiException>().having((e) => e.status, 'status', 400)),
    );
  });

  test(
    'file above of 8 MiB is rejected through the server',
    skip: skip,
    () async {
      final a = await signUp('pl');
      final big = PickedImage(
        bytes: [..._png, ...List.filled(PickedImage.maxBytes + 1024, 0)],
        fileName: 'grande.png',
        mimeType: 'image/png',
      );
      expect(big.isTooLarge, isTrue);
      await expectLater(
        a.profiles.uploadImage(ProfileImageKind.avatar, big),
        throwsA(isA<ApiException>().having((e) => e.status, 'status', 400)),
      );
    },
  );

  test(
    'public collection, favorites and posts from another user',
    skip: skip,
    () async {
      final a = await signUp('pm');
      final b = await signUp('pn');
      final game = await a.games.byIgdbId(900001);
      final entry = await a.library.create(
        900001,
        const EntryDraft(
          platform: 'PC',
          status: GameStatus.completed,
          hoursPlayed: 5,
        ),
      );
      await a.games.setFavorite(game.id, favorite: true);
      await a.feed.create(content: 'post do A', gameEntryId: entry.id);

      final collection = await b.profiles.collection(a.id);
      expect(collection.single.id, entry.id);
      expect(collection.single.hoursPlayed, 5);
      expect((await b.profiles.favorites(a.id)).single.igdbId, 900001);

      final posts = await b.feed.userPosts(a.id, activities: false);
      expect(posts.items.single.content, 'post do A');
      final activities = await b.feed.userPosts(a.id, activities: true);
      expect(activities.items.every((p) => p.isActivity), isTrue);
      expect(activities.items.first.activityStatus, GameStatus.completed);
    },
  );

  test(
    'the profile own reflects the editing in the account (GET /auth/me)',
    skip: skip,
    () async {
      final a = await signUp('po');
      await a.profiles.updateProfile(const ProfileChanges(name: 'Nome Novo'));
      final me = await a.dio.get<Map<String, dynamic>>('/auth/me');
      expect(me.data!['name'], 'Nome Novo');
    },
  );
}
