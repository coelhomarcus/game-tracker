import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/data/hours.dart';
import 'package:gametracker/core/data/patch.dart';
import 'package:gametracker/core/dates/date_only.dart';
import 'package:gametracker/core/network/image_url.dart';

void main() {
  group('DateOnly', () {
    test('instant UTC to the half-night keeps the day, in any timezone', () {
      final d = DateOnly.parseApi('2026-01-05T00:00:00.000Z');
      expect((d.year, d.month, d.day), (2026, 1, 5));
      // O caminho ingênuo mostraria 04/01 em fusos a oeste de UTC.
      final naive = DateTime.parse('2026-01-05T00:00:00.000Z').toLocal();
      if (naive.timeZoneOffset.isNegative) {
        expect(
          naive.day,
          4,
          reason: 'confirma que o caminho ingênuo deslocaria o dia',
        );
      }
    });

    test('accepts YYYY-MM-DD and formats for API and screen', () {
      final d = DateOnly.parseApi('2026-03-09');
      expect(d.toApi(), '2026-03-09');
      expect(d.format(), '09/03/2026');
    });

    test('date of the picker local becomes the same day civil', () {
      expect(
        DateOnly.fromLocal(DateTime(2026, 12, 31, 23, 59)).toApi(),
        '2026-12-31',
      );
    });

    test('daysThrough account the two ends, including in the turned of year and leap', () {
      expect(
        const DateOnly(2026, 1, 1).daysThrough(const DateOnly(2026, 1, 1)),
        1,
      );
      expect(
        const DateOnly(2026, 1, 1).daysThrough(const DateOnly(2026, 1, 3)),
        3,
      );
      expect(
        const DateOnly(2025, 12, 31).daysThrough(const DateOnly(2026, 1, 1)),
        2,
      );
      expect(
        const DateOnly(2024, 2, 28).daysThrough(const DateOnly(2024, 3, 1)),
        3,
      );
    });

    test('ordering and equality', () {
      expect(
        const DateOnly(2026, 1, 2).isAfter(const DateOnly(2026, 1, 1)),
        isTrue,
      );
      expect(const DateOnly(2026, 1, 1) == const DateOnly(2026, 1, 1), isTrue);
    });
  });

  group('hours', () {
    test('accepts comma and dot', () {
      expect(parseHours('12'), 12.0);
      expect(parseHours('12,5'), 12.5);
      expect(parseHours('12.5'), 12.5);
      expect(parseHours(' 0 '), 0.0, reason: 'zero é valor, não ausência');
    });

    test('rejects trash and empty', () {
      for (final bad in ['', '  ', 'abc', '1,2,3', '-3', '1e3', ',5', '12,']) {
        expect(parseHours(bad), isNull, reason: bad);
      }
    });

    test('normalizes for the home', () {
      expect(parseHours('12,34'), 12.3);
      expect(parseHours('12,35'), 12.4);
    });

    test('formats with comma and prefill without zero to the left', () {
      expect(formatHours(20), '20,0');
      expect(hoursInputText(20), '20');
      expect(hoursInputText(12.5), '12,5');
    });

    test('plausible ceiling: 24 hours per calendar day', () {
      const today = DateOnly(2026, 6, 10);
      expect(maxPlausibleHours(null, null, today: today), maxHoursPlayed);
      expect(
        maxPlausibleHours(const DateOnly(2026, 6, 10), null, today: today),
        24,
      );
      expect(
        maxPlausibleHours(const DateOnly(2026, 6, 8), null, today: today),
        72,
      );
      expect(
        maxPlausibleHours(
          const DateOnly(2026, 1, 5),
          const DateOnly(2026, 1, 6),
          today: today,
        ),
        48,
      );
      expect(
        maxPlausibleHours(const DateOnly(2000, 1, 1), null, today: today),
        maxHoursPlayed,
      );
    });

    test('start after today does not blocks (the date is that is wrong)', () {
      expect(
        maxPlausibleHours(
          const DateOnly(2026, 7, 1),
          null,
          today: const DateOnly(2026, 6, 10),
        ),
        maxHoursPlayed,
      );
    });
  });

  group('Patch', () {
    test('diff: keep, clear, replace', () {
      expect(Patch<int>.diff(5, 5), isA<Keep<int>>());
      expect(Patch<int>.diff(null, null), isA<Keep<int>>());
      expect(Patch<int>.diff(5, null), isA<Clear<int>>());
      expect(Patch<int>.diff(null, 7), isA<Replace<int>>());
      expect((Patch<int>.diff(5, 7) as Replace<int>).value, 7);
    });

    test('only enters in the JSON the that changed; clear becomes null', () {
      final body = <String, Object?>{};
      const Keep<int>().putInto(body, 'a', (v) => v);
      const Clear<int>().putInto(body, 'b', (v) => v);
      const Replace<int>(3).putInto(body, 'c', (v) => v * 2);
      expect(body, {'b': null, 'c': 6});
      expect(body.containsKey('a'), isFalse);
    });

    test('zero hours is value distinct of clear', () {
      expect(Patch<double>.diff(5.0, 0.0), isA<Replace<double>>());
    });
  });

  group('ImageUrls', () {
    test('rewrites the host of the routes of image from the backend', () {
      final url = ImageUrls.resolve(
        'http://localhost:3100/api/images/cover?url=https%3A%2F%2Fx.test%2Fa.jpg',
        baseUrl: 'http://10.0.2.2:3100',
      );
      expect(
        url,
        'http://10.0.2.2:3100/api/images/cover?url=https%3A%2F%2Fx.test%2Fa.jpg',
      );
    });

    test('uploads also; URLs external remain unchanged', () {
      expect(
        ImageUrls.resolve(
          'http://localhost:3100/uploads/a.jpg',
          baseUrl: 'https://api.test',
        ),
        'https://api.test/uploads/a.jpg',
      );
      expect(
        ImageUrls.resolve(
          'https://i.pravatar.cc/300?u=x',
          baseUrl: 'https://api.test',
        ),
        'https://i.pravatar.cc/300?u=x',
      );
    });

    test('null and empty', () {
      expect(ImageUrls.resolve(null), isNull);
      expect(ImageUrls.resolve(''), isNull);
    });
  });
}
