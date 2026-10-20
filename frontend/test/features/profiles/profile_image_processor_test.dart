// Saída do processador de foto de perfil: orientação, limites, formatos e dimensões exatas.
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/features/profiles/application/profile_image_processor.dart';
import 'package:gametracker/features/profiles/data/profile_models.dart';
import 'package:image/image.dart' as img;

/// Imagem com a metade esquerda vermelha e a direita azul: a orientação fica visível nos pixels.
img.Image halves(int width, int height, {int? alpha}) {
  final image = img.Image(
    width: width,
    height: height,
    numChannels: alpha == null ? 3 : 4,
  );
  for (final p in image) {
    final left = p.x < width / 2;
    p.r = left ? 255 : 0;
    p.g = 0;
    p.b = left ? 0 : 255;
    if (alpha != null) p.a = alpha;
  }
  return image;
}

/// JPEG com um segmento EXIF (APP1) no formato que as câmeras gravam: TIFF little-endian com a
/// tag de orientação. O codificador do pacote `image` não grava um EXIF que o decodificador releia.
Uint8List withOrientation(Uint8List jpeg, int orientation) {
  final tiff = [
    0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, // cabeçalho, IFD0 em 8
    0x01, 0x00, // 1 entrada
    0x12,
    0x01,
    0x03,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    orientation,
    0x00,
    0x00,
    0x00,
    0x00, 0x00, 0x00, 0x00, // sem próximo IFD
  ];
  final length = 2 + 6 + tiff.length;
  return Uint8List.fromList([
    0xFF, 0xD8, // SOI
    0xFF, 0xE1, length >> 8, length & 0xFF,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    ...tiff,
    ...jpeg.sublist(2),
  ]);
}

bool isRed(img.Pixel p) => p.r > 200 && p.b < 80;
bool isBlue(img.Pixel p) => p.b > 200 && p.r < 80;

void main() {
  group('prepare', () {
    test(
      'applies EXIF orientation before preview (photo of phone in upright)',
      () {
        // Guardada deitada (300×100) com orientação 6: deve ser exibida em pé (100×300).
        final bytes = withOrientation(
          img.encodeJpg(halves(300, 100), quality: 95),
          6,
        );
        // O decodificador de JPEG do pacote já aplica a orientação e zera a tag; o
        // `bakeOrientation` seguinte não pode girar de novo (o resultado abaixo prova isso).

        final prepared = prepareProfileImageSync(bytes);
        expect((prepared.width, prepared.height), (100, 300));

        // Girar 90° horário leva a metade esquerda (vermelha) para o topo.
        final out = img.decodePng(prepared.bytes)!;
        expect(isRed(out.getPixel(50, 20)), isTrue);
        expect(isBlue(out.getPixel(50, 280)), isTrue);
      },
    );

    test('orientation 3 rotates 180° and keeps dimensions', () {
      final bytes = withOrientation(
        img.encodeJpg(halves(200, 100), quality: 95),
        3,
      );
      final prepared = prepareProfileImageSync(bytes);
      expect((prepared.width, prepared.height), (200, 100));
      final out = img.decodePng(prepared.bytes)!;
      expect(isBlue(out.getPixel(20, 50)), isTrue);
      expect(isRed(out.getPixel(180, 50)), isTrue);
    });

    test('without orientation, keeps the image unchanged', () {
      final prepared = prepareProfileImageSync(
        img.encodeJpg(halves(200, 100), quality: 95),
      );
      expect((prepared.width, prepared.height), (200, 100));
      expect(prepared.animatedSource, isFalse);
    });

    test(
      'limits the longest side to 2048 px while preserving the aspect ratio',
      () {
        final wide = prepareProfileImageSync(img.encodePng(halves(3000, 1500)));
        expect((wide.width, wide.height), (2048, 1024));
        final tall = prepareProfileImageSync(img.encodePng(halves(1000, 4000)));
        expect((tall.width, tall.height), (512, 2048));
      },
    );

    test('does not expands image smaller that the limit', () {
      final p = prepareProfileImageSync(img.encodePng(halves(120, 80)));
      expect((p.width, p.height), (120, 80));
    });

    test('GIF animated uses the first board and warns', () {
      final gif = img.Image(width: 40, height: 20, numChannels: 3);
      img.fill(gif, color: img.ColorRgb8(255, 0, 0));
      final second = img.Image(width: 40, height: 20, numChannels: 3);
      img.fill(second, color: img.ColorRgb8(0, 0, 255));
      gif.addFrame(second);
      final bytes = img.encodeGif(gif);

      final prepared = prepareProfileImageSync(bytes);
      expect(prepared.animatedSource, isTrue);
      expect((prepared.width, prepared.height), (40, 20));
      expect(isRed(img.decodePng(prepared.bytes)!.getPixel(10, 10)), isTrue);
    });

    test('accepts PNG and WebP (with and without losses)', () {
      final source = halves(80, 60);
      expect(prepareProfileImageSync(img.encodePng(source)).width, 80);
      for (final bytes in [
        img.encodeWebP(source),
        img.encodeWebP(source, lossless: false, quality: 80),
      ]) {
        final prepared = prepareProfileImageSync(bytes);
        expect((prepared.width, prepared.height), (80, 60));
        expect(prepared.animatedSource, isFalse);
        expect(isRed(img.decodePng(prepared.bytes)!.getPixel(10, 30)), isTrue);
      }
    });

    test('rejects more than 24 million pixels without decoding', () {
      final huge = img.Image(width: 5000, height: 5000, numChannels: 1);
      final bytes = img.encodePng(huge, level: 1);
      expect(bytes.length, lessThan(PickedImage.maxBytes));
      expect(
        () => prepareProfileImageSync(bytes),
        throwsA(
          isA<ImageProcessingException>().having(
            (e) => e.message,
            'message',
            contains('24 milhões de pixels'),
          ),
        ),
      );
    });

    test('accepts exactly in the ceiling of pixels', () {
      final edge = img.Image(width: 4000, height: 6000, numChannels: 1);
      expect(
        prepareProfileImageSync(img.encodePng(edge, level: 1)).height,
        2048,
      );
    });

    test('rejects file above of 8 MiB before open', () {
      expect(
        () => prepareProfileImageSync(Uint8List(PickedImage.maxBytes + 1)),
        throwsA(
          isA<ImageProcessingException>().having(
            (e) => e.message,
            'message',
            contains('8 MB'),
          ),
        ),
      );
    });

    test('HEIC and unsupported files recommend using JPG, PNG, or WebP', () {
      // Cabeçalho "ftyp heic" de um HEIC; o decodificador não o reconhece.
      final heic = Uint8List.fromList([
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
      ]);
      for (final bytes in [
        heic,
        Uint8List.fromList([1, 2, 3, 4, 5]),
      ]) {
        expect(
          () => prepareProfileImageSync(bytes),
          throwsA(
            isA<ImageProcessingException>().having(
              (e) => e.message,
              'message',
              'Use uma imagem JPG, PNG ou WebP.',
            ),
          ),
        );
      }
    });

    test('formats outside the list (BMP) also are rejected', () {
      expect(
        () => prepareProfileImageSync(img.encodeBmp(halves(20, 20))),
        throwsA(isA<ImageProcessingException>()),
      );
    });
  });

  group('export', () {
    for (final (kind, w, h) in [
      (ProfileImageKind.avatar, 400, 400),
      (ProfileImageKind.banner, 1500, 500),
    ]) {
      test('${kind.name}: JPEG of exactly $w×$h', () {
        // Recorte de tamanho "estranho", como sai do editor.
        final cropped = img.encodePng(halves(1234, 1233));
        final out = exportProfileImageSync(cropped, w, h);

        expect(out.sublist(0, 3), [
          0xFF,
          0xD8,
          0xFF,
        ], reason: 'assinatura JPEG');
        final decoded = img.decodeJpg(out)!;
        expect((decoded.width, decoded.height), (w, h));
        expect(out.length, lessThan(PickedImage.maxBytes));
        expect(
          decoded.exif.isEmpty,
          isTrue,
          reason: 'nenhum metadado EXIF no arquivo enviado',
        );
        expect(isRed(decoded.getPixel(10, 10)), isTrue);
        expect(isBlue(decoded.getPixel(w - 10, h - 10)), isTrue);
      });
    }

    test('expands crop small in time of reject', () {
      final out = exportProfileImageSync(
        img.encodePng(halves(50, 50)),
        400,
        400,
      );
      expect(
        (img.decodeJpg(out)!.width, img.decodeJpg(out)!.height),
        (400, 400),
      );
    });

    test('transparency becomes the white background', () {
      final transparent = img.Image(width: 20, height: 20, numChannels: 4);
      img.fill(transparent, color: img.ColorRgba8(255, 0, 0, 0));
      final out = img.decodeJpg(
        exportProfileImageSync(img.encodePng(transparent), 100, 100),
      )!;
      final p = out.getPixel(50, 50);
      expect([p.r, p.g, p.b].every((c) => c > 245), isTrue);
    });

    test('semi-transparent pixels composite against white', () {
      final half = halves(40, 40, alpha: 128);
      final p = img
          .decodeJpg(exportProfileImageSync(img.encodePng(half), 40, 40))!
          .getPixel(5, 20);
      // Vermelho a 50% sobre branco: avermelhado claro, não vermelho puro nem branco.
      expect(p.r, greaterThan(230));
      expect(p.g, inInclusiveRange(100, 160));
    });

    test('non-image bytes fails with the message', () {
      expect(
        () => exportProfileImageSync(Uint8List.fromList([1, 2, 3]), 400, 400),
        throwsA(isA<ImageProcessingException>()),
      );
    });
  });

  group('specification', () {
    test('planned sizes and ratios', () {
      expect(ProfileImageKind.avatar.outputWidth, 400);
      expect(ProfileImageKind.avatar.aspectRatio, 1);
      expect(ProfileImageKind.banner.outputWidth, 1500);
      expect(ProfileImageKind.banner.outputHeight, 500);
      expect(ProfileImageKind.banner.aspectRatio, 3);
    });
  });

  group('processor (compute)', () {
    test('export returns PickedImage with name and MIME consistent', () async {
      final out = await const ImagePackageProcessor().export(
        img.encodePng(halves(300, 100)),
        ProfileImageKind.banner,
      );
      expect(out.fileName, 'banner.jpg');
      expect(out.mimeType, 'image/jpeg');
      expect(img.decodeJpg(Uint8List.fromList(out.bytes))!.width, 1500);
    });
  });
}
