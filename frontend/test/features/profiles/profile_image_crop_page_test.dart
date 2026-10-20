// Editor de recorte (Etapa 04): fluxo, enquadramento, avisos, erros e acessibilidade, com o
// `Crop` e o processador reais.
import 'dart:ui' as ui;

import 'package:crop_your_image/crop_your_image.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/design_system/app_theme.dart';
import 'package:gametracker/features/profiles/data/profile_models.dart';
import 'package:gametracker/features/profiles/presentation/profile_image_crop_page.dart';
import 'package:image/image.dart' as img;
import 'package:material_ui/material_ui.dart';

/// Fundo preto com um quadrado branco no centro, de [fraction] do lado: o quanto de branco sobra
/// no recorte diz o quanto o enquadramento aproximou.
PickedImage squareWithDot(int side, {double fraction = 0.25}) {
  final image = img.Image(width: side, height: side, numChannels: 3);
  final lo = (side * (1 - fraction) / 2).round();
  final hi = (side * (1 + fraction) / 2).round();
  for (final p in image) {
    final white = p.x >= lo && p.x < hi && p.y >= lo && p.y < hi;
    p.r = p.g = p.b = white ? 255 : 0;
  }
  return PickedImage(
    bytes: img.encodePng(image),
    fileName: 'foto.png',
    mimeType: 'image/png',
  );
}

/// Paisagem 3:1 (esquerda vermelha, direita azul): mover a moldura muda a proporção de vermelho.
PickedImage redBlue(int width, int height, {String mime = 'image/png'}) {
  final image = img.Image(width: width, height: height, numChannels: 3);
  for (final p in image) {
    final left = p.x < width / 2;
    p.r = left ? 255 : 0;
    p.g = 0;
    p.b = left ? 0 : 255;
  }
  return PickedImage(
    bytes: mime == 'image/gif' ? img.encodeGif(image) : img.encodePng(image),
    fileName: 'foto',
    mimeType: mime,
  );
}

double fraction(PickedImage out, bool Function(img.Pixel) test) {
  final decoded = img.decodeJpg(Uint8List.fromList(out.bytes))!;
  var hits = 0, total = 0;
  final y = decoded.height ~/ 2;
  for (var x = 0; x < decoded.width; x++) {
    total++;
    if (test(decoded.getPixel(x, y))) hits++;
  }
  return hits / total;
}

bool isRed(img.Pixel p) => p.r > 150 && p.b < 100;
bool isWhite(img.Pixel p) => p.r > 150 && p.g > 150 && p.b > 150;

class _Host extends StatefulWidget {
  const _Host({required this.image, required this.kind, required this.onDone});
  final PickedImage image;
  final ProfileImageKind kind;
  final ValueChanged<PickedImage?> onDone;

  @override
  State<_Host> createState() => _HostState();
}

class _HostState extends State<_Host> {
  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(
      child: FilledButton(
        onPressed: () async {
          final result = await const RouteProfileImageCropper().crop(
            context,
            widget.image,
            widget.kind,
            name: 'Ana',
          );
          widget.onDone(result);
        },
        child: const Text('Abrir'),
      ),
    ),
  );
}

/// Abre o editor e espera, no relógio real, o isolate preparar a imagem.
Future<void> open(
  WidgetTester tester,
  PickedImage image,
  ProfileImageKind kind,
  ValueChanged<PickedImage?> onDone, {
  Size size = const Size(390, 900),
  double textScale = 1,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp(
        theme: AppTheme.light(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(textScale)),
          child: child!,
        ),
        home: _Host(image: image, kind: kind, onDone: onDone),
      ),
    ),
  );
  await tester.tap(find.text('Abrir'));
  await settle(tester);
}

/// Alterna o relógio real (isolates, decodificação) com bombeadas até estabilizar.
Future<void> settle(WidgetTester tester, {int rounds = 40}) async {
  for (var i = 0; i < rounds; i++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 60)),
    );
    await tester.pump(const Duration(milliseconds: 60));
  }
}

Future<PickedImage?> save(
  WidgetTester tester,
  String label,
  Future<PickedImage?> Function() result,
) async {
  await tester.tap(find.text(label));
  PickedImage? out;
  var done = false;
  result().then((v) {
    out = v;
    done = true;
  });
  for (var i = 0; i < 500 && !done; i++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 60)),
    );
    await tester.pump(const Duration(milliseconds: 60));
  }
  return out;
}

void main() {
  group('flow', () {
    testWidgets(
      'avatar: "adjust photo" → "save photo" returns a 400×400 JPEG',
      (tester) async {
        PickedImage? result;
        var closed = false;
        await open(tester, redBlue(600, 200), ProfileImageKind.avatar, (r) {
          result = r;
          closed = true;
        });

        expect(find.text('Ajustar foto'), findsOneWidget);
        expect(find.byType(Crop), findsOneWidget);
        for (final label in ['Cancelar', 'Restaurar', 'Salvar foto']) {
          expect(find.text(label), findsOneWidget, reason: label);
        }

        await tester.tap(find.text('Salvar foto'));
        for (var i = 0; i < 500 && !closed; i++) {
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 60)),
          );
          await tester.pump(const Duration(milliseconds: 60));
        }
        expect(closed, isTrue, reason: 'o editor fecha ao salvar');
        final out = result!;
        expect(out.mimeType, 'image/jpeg');
        expect(out.fileName, 'avatar.jpg');
        final decoded = img.decodeJpg(Uint8List.fromList(out.bytes))!;
        expect((decoded.width, decoded.height), (400, 400));
        expect(out.bytes.length, lessThan(PickedImage.maxBytes));
      },
    );

    testWidgets(
      'cover: "adjust cover" → "save cover" returns a 1500×500 JPEG',
      (tester) async {
        PickedImage? result;
        var closed = false;
        await open(tester, redBlue(900, 300), ProfileImageKind.banner, (r) {
          result = r;
          closed = true;
        });
        expect(find.text('Ajustar capa'), findsOneWidget);
        expect(find.text('Salvar foto'), findsNothing);

        await tester.tap(find.text('Salvar capa'));
        for (var i = 0; i < 500 && !closed; i++) {
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 60)),
          );
          await tester.pump(const Duration(milliseconds: 60));
        }
        final decoded = img.decodeJpg(Uint8List.fromList(result!.bytes))!;
        expect((decoded.width, decoded.height), (1500, 500));
        expect(result!.fileName, 'banner.jpg');
      },
    );

    testWidgets('cancel closes without returning an image', (tester) async {
      var closed = false;
      PickedImage? result = redBlue(10, 10);
      await open(tester, redBlue(600, 200), ProfileImageKind.avatar, (r) {
        result = r;
        closed = true;
      });
      await tester.tap(find.text('Cancelar'));
      await tester.pumpAndSettle();
      expect(closed, isTrue);
      expect(result, isNull);
      expect(find.byType(Crop), findsNothing);
    });

    testWidgets('on the wide window, opens the dialog of at most 720 dp', (
      tester,
    ) async {
      await open(
        tester,
        redBlue(600, 200),
        ProfileImageKind.avatar,
        (_) {},
        size: const Size(1280, 900),
      );
      expect(find.byType(Dialog), findsOneWidget);
      expect(
        tester.getSize(find.byType(ProfileImageCropPage)).width,
        lessThanOrEqualTo(720),
      );
    });

    testWidgets('in window narrow opens in screen full', (tester) async {
      await open(tester, redBlue(600, 200), ProfileImageKind.avatar, (_) {});
      expect(find.byType(Dialog), findsNothing);
    });
  });

  group('crop', () {
    /// Abre, aplica [act], salva e devolve a fração de pixels que satisfazem [test].
    Future<double> framed(
      WidgetTester tester,
      PickedImage image,
      bool Function(img.Pixel) test,
      Future<void> Function() act,
    ) async {
      PickedImage? result;
      await open(tester, image, ProfileImageKind.avatar, (r) => result = r);
      await act();
      await settle(tester, rounds: 5);
      await tester.tap(find.text('Salvar foto'));
      for (var i = 0; i < 500 && result == null; i++) {
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 60)),
        );
        await tester.pump(const Duration(milliseconds: 60));
      }
      return fraction(result!, test);
    }

    testWidgets('moving the area right reveals more blue', (tester) async {
      final before = await framed(
        tester,
        redBlue(900, 300),
        isRed,
        () async {},
      );
      await tester.pumpWidget(const SizedBox());
      final after = await framed(tester, redBlue(900, 300), isRed, () async {
        for (var i = 0; i < 3; i++) {
          await tester.tap(find.byTooltip('Mover área para a direita'));
          await tester.pump();
        }
      });
      expect(after, lessThan(before - 0.1));
    });

    testWidgets('mover for the left reveals more red', (tester) async {
      final before = await framed(
        tester,
        redBlue(900, 300),
        isRed,
        () async {},
      );
      await tester.pumpWidget(const SizedBox());
      final after = await framed(tester, redBlue(900, 300), isRed, () async {
        for (var i = 0; i < 3; i++) {
          await tester.tap(find.byTooltip('Mover área para a esquerda'));
          await tester.pump();
        }
      });
      expect(after, greaterThan(before + 0.1));
    });

    testWidgets('keyboard arrows move the area like the buttons', (
      tester,
    ) async {
      final before = await framed(
        tester,
        redBlue(900, 300),
        isRed,
        () async {},
      );
      await tester.pumpWidget(const SizedBox());
      final after = await framed(tester, redBlue(900, 300), isRed, () async {
        for (var i = 0; i < 3; i++) {
          await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
          await tester.pump();
        }
      });
      expect(after, lessThan(before - 0.1));
    });

    testWidgets('decreasing the area zooms in; increasing zooms out', (
      tester,
    ) async {
      final base = await framed(
        tester,
        squareWithDot(400),
        isWhite,
        () async {},
      );
      await tester.pumpWidget(const SizedBox());
      final closer = await framed(
        tester,
        squareWithDot(400),
        isWhite,
        () async {
          for (var i = 0; i < 5; i++) {
            await tester.tap(find.byTooltip('Diminuir área'));
            await tester.pump();
          }
        },
      );
      expect(closer, greaterThan(base * 1.5));

      await tester.pumpWidget(const SizedBox());
      final farther = await framed(
        tester,
        squareWithDot(400),
        isWhite,
        () async {
          await tester.tap(find.byTooltip('Diminuir área'));
          await tester.pump();
          await tester.tap(find.byTooltip('Aumentar área'));
          await tester.pump();
        },
      );
      expect(farther, closeTo(base, 0.1));
    });

    testWidgets('restore returns to the initial crop', (tester) async {
      final base = await framed(tester, redBlue(900, 300), isRed, () async {});
      await tester.pumpWidget(const SizedBox());
      final restored = await framed(tester, redBlue(900, 300), isRed, () async {
        for (var i = 0; i < 3; i++) {
          await tester.tap(find.byTooltip('Mover área para a direita'));
          await tester.pump();
        }
        await tester.tap(find.text('Restaurar'));
        await settle(tester, rounds: 10);
      });
      expect(restored, closeTo(base, 0.05));
    });
  });

  group('preview', () {
    /// Fração de pixels vermelhos na linha do meio do que a prévia desenha.
    Future<double> previewRed(WidgetTester tester) async {
      final boundary = tester.renderObject<RenderRepaintBoundary>(
        find.byKey(cropPreviewKey),
      );
      final snapshot = (await tester.runAsync(
        () => boundary.toImage(pixelRatio: 1),
      ))!;
      final data = (await tester.runAsync(
        () => snapshot.toByteData(format: ui.ImageByteFormat.rawRgba),
      ))!;
      final y = snapshot.height ~/ 2;
      var red = 0;
      for (var x = 0; x < snapshot.width; x++) {
        final i = (y * snapshot.width + x) * 4;
        if (data.getUint8(i) > 150 && data.getUint8(i + 2) < 100) red++;
      }
      return red / snapshot.width;
    }

    for (final kind in ProfileImageKind.values) {
      testWidgets('${kind.name}: the preview matches the saved file crop', (
        tester,
      ) async {
        PickedImage? result;
        await open(tester, redBlue(1200, 400), kind, (r) => result = r);
        for (var i = 0; i < 3; i++) {
          await tester.tap(find.byTooltip('Mover área para a direita'));
          await tester.pump();
        }
        await settle(tester, rounds: 5);

        final shown = await previewRed(tester);
        await tester.tap(
          find.text(
            kind == ProfileImageKind.avatar ? 'Salvar foto' : 'Salvar capa',
          ),
        );
        for (var i = 0; i < 500 && result == null; i++) {
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 60)),
          );
          await tester.pump(const Duration(milliseconds: 60));
        }
        final saved = fraction(result!, isRed);

        expect(
          shown,
          closeTo(saved, 0.06),
          reason: 'prévia $shown × salvo $saved',
        );
        expect(
          shown,
          lessThan(0.45),
          reason: 'a moldura se moveu para a direita',
        );
      });
    }
  });

  group('warnings', () {
    testWidgets('image small warns, but does not prevents save', (
      tester,
    ) async {
      await open(tester, redBlue(120, 120), ProfileImageKind.avatar, (_) {});
      expect(
        find.text('Imagem pequena: a foto pode ficar com pouca nitidez.'),
        findsOneWidget,
      );
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Salvar foto'),
            )
            .onPressed,
        isNotNull,
      );
    });

    testWidgets('large image does not show the resolution warning', (
      tester,
    ) async {
      await open(tester, redBlue(1200, 1200), ProfileImageKind.avatar, (_) {});
      expect(find.textContaining('Imagem pequena'), findsNothing);
    });

    testWidgets('GIF warns that the photo will be static', (tester) async {
      await open(
        tester,
        redBlue(600, 600, mime: 'image/gif'),
        ProfileImageKind.avatar,
        (_) {},
      );
      expect(find.textContaining('A foto será estática'), findsOneWidget);
    });
  });

  group('errors', () {
    testWidgets('HEIC without decoder requests JPG, PNG or WebP and closes', (
      tester,
    ) async {
      var closed = false;
      PickedImage? result = redBlue(10, 10);
      await open(
        tester,
        PickedImage(
          bytes: Uint8List.fromList([
            0,
            0,
            0,
            24,
            0x66,
            0x74,
            0x79,
            0x70,
            0x68,
            0x65,
            0x69,
            0x63,
            ...List.filled(64, 0),
          ]),
          fileName: 'foto.heic',
          mimeType: 'image/heic',
        ),
        ProfileImageKind.avatar,
        (r) {
          result = r;
          closed = true;
        },
      );
      expect(find.text('Use uma imagem JPG, PNG ou WebP.'), findsOneWidget);
      expect(find.byType(Crop), findsNothing);
      expect(find.text('Salvar foto'), findsNothing);

      await tester.tap(find.text('Fechar'));
      await tester.pumpAndSettle();
      expect(closed, isTrue);
      expect(result, isNull);
    });

    testWidgets('resolution above 24 million pixels is rejected', (
      tester,
    ) async {
      final huge = img.Image(width: 5000, height: 5000, numChannels: 1);
      await open(
        tester,
        PickedImage(
          bytes: img.encodePng(huge, level: 1),
          fileName: 'enorme.png',
          mimeType: 'image/png',
        ),
        ProfileImageKind.avatar,
        (_) {},
      );
      expect(find.textContaining('24 milhões de pixels'), findsOneWidget);
      expect(find.byType(Crop), findsNothing);
    });
  });

  group('accessibility and layout', () {
    testWidgets('controls have the label and the 48 dp target', (tester) async {
      final handle = tester.ensureSemantics();
      await open(tester, redBlue(600, 200), ProfileImageKind.avatar, (_) {});
      for (final tooltip in [
        'Mover área para a esquerda',
        'Mover área para a direita',
        'Mover área para cima',
        'Mover área para baixo',
        'Aumentar área',
        'Diminuir área',
      ]) {
        expect(find.byTooltip(tooltip), findsOneWidget, reason: tooltip);
      }
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      handle.dispose();
    });

    for (final (kind, size, scale) in [
      (ProfileImageKind.avatar, const Size(360, 800), 2.0),
      (ProfileImageKind.banner, const Size(360, 800), 2.0),
      (ProfileImageKind.banner, const Size(390, 844), 1.0),
      (ProfileImageKind.banner, const Size(1440, 900), 1.0),
    ]) {
      testWidgets(
        '${kind.name} the ${size.width.toInt()} px, text $scale×: without overflow',
        (tester) async {
          await open(
            tester,
            redBlue(900, 300),
            kind,
            (_) {},
            size: size,
            textScale: scale,
          );
          expect(tester.takeException(), isNull);
          expect(
            find.text(
              kind == ProfileImageKind.avatar ? 'Salvar foto' : 'Salvar capa',
            ),
            findsOneWidget,
          );
        },
      );
    }
  });
}
