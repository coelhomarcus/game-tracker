import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/app/router.dart';
import 'package:gametracker/features/auth/presentation/session_state.dart';

import '../../support/fake_auth.dart';

String? go(SessionState s, String uri) => sessionRedirect(s, Uri.parse(uri));

void main() {
  final authed = SessionAuthenticated(fakeUser());
  const anon = SessionUnauthenticated();

  group('does not authenticated', () {
    test('route protected goes to the login remembering the destination', () {
      expect(
        go(anon, '/games/42'),
        '/login?from=${Uri.encodeQueryComponent('/games/42')}',
      );
    });

    test('keeps query of the destination', () {
      expect(
        go(anon, '/games/42?tab=2'),
        '/login?from=${Uri.encodeQueryComponent('/games/42?tab=2')}',
      );
    });

    test('login and signup are public', () {
      expect(go(anon, '/login'), isNull);
      expect(go(anon, '/register?from=%2Fme'), isNull);
    });
  });

  group('initializing and without the connection', () {
    test('deep link waits the session without lose the destination', () {
      const s = SessionInitializing();
      expect(
        go(s, '/games/42'),
        '/splash?from=${Uri.encodeQueryComponent('/games/42')}',
      );
      expect(go(s, '/splash?from=%2Fgames%2F42'), isNull);
    });

    test('unavailable restoration shows the retry screen', () {
      const s = SessionRestoreUnavailable();
      expect(
        go(s, '/library'),
        '/restore?from=${Uri.encodeQueryComponent('/library')}',
      );
      expect(go(s, '/restore'), isNull);
    });

    test('splash becomes login without lose the destination when the session does not exist', () {
      expect(
        go(anon, '/splash?from=%2Fgames%2F42'),
        '/login?from=${Uri.encodeQueryComponent('/games/42')}',
      );
    });
  });

  group('authenticated', () {
    test('login goes to the destination requested or to the Library', () {
      expect(go(authed, '/login'), '/library');
      expect(go(authed, '/login?from=%2Fgames%2F42'), '/games/42');
      expect(go(authed, '/splash?from=%2Fme'), '/me');
      expect(go(authed, '/restore'), '/library');
    });

    test('route protected passes', () {
      expect(go(authed, '/games/42'), isNull);
    });
  });

  group('destination safe', () {
    test('rejects URL external, protocolo relative and routes of session', () {
      expect(safeDestination('https://evil.example'), isNull);
      expect(safeDestination('//evil.example'), isNull);
      expect(safeDestination('javascript:alert(1)'), isNull);
      expect(safeDestination('/login'), isNull);
      expect(safeDestination('/splash'), isNull);
      expect(safeDestination(''), isNull);
      expect(safeDestination(null), isNull);
    });

    test('accepts path internal', () {
      expect(safeDestination('/games/42?x=1'), '/games/42?x=1');
    });

    test('from external in the login authenticated lands on the Library', () {
      expect(go(authed, '/login?from=https%3A%2F%2Fevil.example'), '/library');
    });
  });
}
