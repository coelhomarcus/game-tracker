import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/network/app_exception.dart';
import 'package:gametracker/features/auth/data/auth_repository.dart';
import 'package:material_ui/material_ui.dart';

import '../../support/fake_auth.dart';
import '../../support/harness.dart';

Future<void> pumpApp(WidgetTester tester, FakeAuthRepository repo) async {
  await AppHarness(auth: repo, signedIn: false).pump(tester);
}

Future<void> tapText(WidgetTester tester, String text) async {
  final finder = find.text(text);
  await tapFinder(tester, finder);
}

Future<void> tapFinder(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('session restored opens direct in the Library', (tester) async {
    await pumpApp(
      tester,
      FakeAuthRepository()..restoreResult = Restored(fakeUser()),
    );
    expect(find.text('Biblioteca'), findsWidgets);
    expect(find.text('Entrar'), findsNothing);
  });

  testWidgets('credentials wrong show error and preserve the that was typed', (
    tester,
  ) async {
    final repo = FakeAuthRepository()
      ..loginError = const ApiException(
        401,
        'invalid_credentials',
        'Credenciais inválidas',
      );
    await pumpApp(tester, repo);
    await tester.enterText(find.byType(TextFormField).first, 'ana');
    await tester.enterText(find.byType(TextFormField).last, 'senha-errada');
    await tapText(tester, 'Entrar');

    expect(find.text('E-mail, username ou senha incorretos.'), findsOneWidget);
    expect(find.text('ana'), findsOneWidget);
    expect(find.text('Biblioteca'), findsNothing);
  });

  testWidgets('without the network connection shows message of connection', (
    tester,
  ) async {
    final repo = FakeAuthRepository()..loginError = const NetworkException();
    await pumpApp(tester, repo);
    await tester.enterText(find.byType(TextFormField).first, 'ana');
    await tester.enterText(find.byType(TextFormField).last, 'x');
    await tapText(tester, 'Entrar');
    expect(find.textContaining('Sem conexão'), findsOneWidget);
  });

  testWidgets('double-tapping Login sends one request', (tester) async {
    final repo = FakeAuthRepository()..loginGate = Completer<void>();
    await pumpApp(tester, repo);
    await tester.enterText(find.byType(TextFormField).first, 'ana');
    await tester.enterText(find.byType(TextFormField).last, 'senha');
    await tester.ensureVisible(find.text('Entrar'));
    await tester.tap(find.text('Entrar'));
    await tester.pump();
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    await tester.tap(find.byType(FilledButton), warnIfMissed: false);
    await tester.pump();
    expect(repo.loginCalls.length, 1);

    repo.loginGate!.complete();
    await tester.pumpAndSettle();
    expect(find.text('Biblioteca'), findsWidgets);
  });

  testWidgets('signup validates the limits from the backend', (tester) async {
    await pumpApp(tester, FakeAuthRepository());
    await tapFinder(tester, find.widgetWithText(TextButton, 'Criar conta'));
    expect(find.text('Leva menos de um minuto.'), findsOneWidget);

    await tapFinder(tester, find.widgetWithText(FilledButton, 'Criar conta'));
    expect(find.text('Informe seu nome'), findsOneWidget);
    expect(find.text('Use pelo menos 3 caracteres'), findsOneWidget);
    expect(find.text('Informe um e-mail válido'), findsOneWidget);
    expect(find.text('Use pelo menos 8 caracteres'), findsOneWidget);

    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), 'Ana');
    await tester.enterText(fields.at(1), 'ana silva');
    await tester.enterText(fields.at(2), 'ana@example.test');
    await tester.enterText(fields.at(3), '12345678');
    await tapFinder(tester, find.widgetWithText(FilledButton, 'Criar conta'));
    expect(find.text('Use apenas letras, números e _'), findsOneWidget);
  });

  testWidgets('signup with username repeated shows conflict', (tester) async {
    final repo = FakeAuthRepository()
      ..registerError = const ApiException(
        409,
        'conflict',
        'Username ou email já cadastrado',
      );
    await pumpApp(tester, repo);
    await tapFinder(tester, find.widgetWithText(TextButton, 'Criar conta'));
    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), 'Ana');
    await tester.enterText(fields.at(1), 'ana_silva');
    await tester.enterText(fields.at(2), 'ana@example.test');
    await tester.enterText(fields.at(3), 'senha-longa');
    await tapFinder(tester, find.widgetWithText(FilledButton, 'Criar conta'));
    expect(find.text('Username ou e-mail já cadastrado.'), findsOneWidget);
  });

  testWidgets(
    'without the connection to the restore: screen of new attempt, without logout',
    (tester) async {
      final repo = FakeAuthRepository()
        ..restoreResult = const RestoreUnavailable();
      await pumpApp(tester, repo);
      expect(find.text('Não foi possível conectar'), findsOneWidget);
      expect(find.text('Entrar'), findsNothing);

      repo.restoreResult = Restored(fakeUser());
      await tapText(tester, 'Tentar novamente');
      expect(find.text('Biblioteca'), findsWidgets);
      expect(repo.logoutCalls, 0);
    },
  );

  testWidgets('leave by settings returns to the login', (tester) async {
    final repo = FakeAuthRepository()..restoreResult = Restored(fakeUser());
    await pumpApp(tester, repo);
    await tapText(tester, 'Perfil');
    await tapFinder(tester, find.byTooltip('Configurações'));
    // Configurações tem várias seções: a conta e o "Sair" ficam abaixo da primeira tela.
    await tester.scrollUntilVisible(
      find.text('@ana · ana@example.test'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('@ana · ana@example.test'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Sair'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tapAndSettle(tester, find.text('Sair'));
    expect(find.text('Entrar'), findsOneWidget);
    expect(repo.logoutCalls, 1);
  });
}
