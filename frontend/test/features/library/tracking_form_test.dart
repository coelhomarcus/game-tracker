import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/design_system/game_cover.dart';
import 'package:gametracker/core/dates/date_only.dart';
import 'package:gametracker/core/design_system/game_status.dart';
import 'package:gametracker/core/network/app_exception.dart';
import 'package:gametracker/features/games/data/game_models.dart';
import 'package:gametracker/features/library/presentation/tracking_form_page.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../../support/fake_repos.dart';
import '../../support/harness.dart';

const _newPath = '/games/900001/playthroughs/new';

Finder get saveButton => find.widgetWithText(FilledButton, 'Salvar registro');
Finder get hoursField => find.widgetWithText(TextFormField, 'Horas jogadas');

Future<AppHarness> openForm(
  WidgetTester tester, {
  String path = _newPath,
  FakeLibraryRepository? library,
  FakeGamesRepository? games,
}) async {
  final h = AppHarness(library: library, games: games);
  // Alto: o formulário é uma lista preguiçosa e as seções finais ficam abaixo de 900 dp.
  await h.pump(tester, size: const Size(400, 2000));
  await goTo(tester, path);
  return h;
}

void main() {
  group('validation rules', () {
    const today = DateOnly(2026, 6, 10);

    test('hours: empty is valid; garbage and limit are rejected', () {
      String? check(String t, {DateOnly? start, DateOnly? end}) =>
          TrackingRules.hours(t, start: start, end: end, today: today);
      expect(check(''), isNull);
      expect(check('0'), isNull, reason: 'zero é valor válido');
      expect(check('12,5'), isNull);
      expect(check('abc'), 'Use só números, como 12 ou 12,5.');
      expect(check('100000'), contains('máximo'));
    });

    test('hours: 24 h by day between start and end, or until today', () {
      final msg = TrackingRules.hours(
        '73',
        start: const DateOnly(2026, 6, 8),
        end: null,
        today: today,
      );
      expect(msg, contains('72 h'));
      expect(msg, contains('entre o início e hoje'));
      expect(
        TrackingRules.hours(
          '72',
          start: const DateOnly(2026, 6, 8),
          end: null,
          today: today,
        ),
        isNull,
      );
      final withEnd = TrackingRules.hours(
        '50',
        start: const DateOnly(2026, 1, 5),
        end: const DateOnly(2026, 1, 6),
        today: today,
      );
      expect(withEnd, contains('48 h'));
      expect(withEnd, contains('entre início e fim'));
    });

    test('period: end before start is an error', () {
      expect(
        TrackingRules.period(
          start: const DateOnly(2026, 2, 1),
          end: const DateOnly(2026, 1, 1),
        ),
        isNotNull,
      );
      expect(
        TrackingRules.period(
          start: const DateOnly(2026, 1, 1),
          end: const DateOnly(2026, 1, 1),
        ),
        isNull,
      );
      expect(
        TrackingRules.period(start: null, end: const DateOnly(2026, 1, 1)),
        isNull,
      );
    });
  });

  group('create', () {
    testWidgets('opens through the deep link, with the platforms of the game', (
      tester,
    ) async {
      await openForm(tester);
      expect(find.text('Novo registro'), findsWidgets);
      expect(find.text('Jogo Fixture Um'), findsOneWidget);
      expect(find.widgetWithText(ChoiceChip, 'PC'), findsOneWidget);
      expect(find.widgetWithText(ChoiceChip, 'PlayStation 5'), findsOneWidget);
    });

    testWidgets('saves status, hours and platform chosen', (tester) async {
      final h = await openForm(tester);
      await tapAndSettle(
        tester,
        find.widgetWithText(ChoiceChip, 'PlayStation 5'),
      );
      await tapAndSettle(tester, find.widgetWithText(ChoiceChip, 'Jogando'));
      await tester.enterText(hoursField, '12,5');
      await tapAndSettle(tester, saveButton);

      final (igdbId, draft) = h.library.created.single;
      expect(igdbId, 900001);
      expect(draft.platform, 'PlayStation 5');
      expect(draft.status, GameStatus.playing);
      expect(draft.hoursPlayed, 12.5);
      expect((draft.rating, draft.startedAt, draft.notes), (null, null, null));
      expect(
        find.text('Meu progresso'),
        findsOneWidget,
        reason: 'volta para a página do jogo',
      );
    });

    testWidgets('zero hours is sent the zero', (tester) async {
      final h = await openForm(tester);
      await tester.enterText(hoursField, '0');
      await tapAndSettle(tester, saveButton);
      expect(h.library.created.single.$2.hoursPlayed, 0);
    });

    testWidgets('invalid hours block saving and explain why', (tester) async {
      final h = await openForm(tester);
      await tester.enterText(hoursField, 'abc');
      await tester.pumpAndSettle();
      expect(find.text('Use só números, como 12 ou 12,5.'), findsOneWidget);
      await tapAndSettle(tester, saveButton);
      expect(h.library.created, isEmpty);
    });

    testWidgets('hour limit considers the chosen start date', (tester) async {
      final h = await openForm(tester);
      await tapAndSettle(tester, find.text('Início'));
      await tapAndSettle(tester, find.text('OK'));
      expect(find.text(DateOnly.today().format()), findsOneWidget);

      await tester.enterText(hoursField, '30');
      await tester.pumpAndSettle();
      expect(find.textContaining('passa das 24 h possíveis'), findsOneWidget);
      await tapAndSettle(tester, saveButton);
      expect(h.library.created, isEmpty);

      await tester.enterText(hoursField, '10');
      await tester.pumpAndSettle();
      expect(find.textContaining('passa das'), findsNothing);
    });

    testWidgets('chosen date is sent the the calendar day', (tester) async {
      final h = await openForm(tester);
      await tapAndSettle(tester, find.text('Início'));
      await tapAndSettle(tester, find.text('OK'));
      await tapAndSettle(tester, saveButton);
      expect(h.library.created.single.$2.startedAt, DateOnly.today());
    });

    testWidgets('fails preserves the that was typed and allows try of new', (
      tester,
    ) async {
      final library = FakeLibraryRepository()
        ..mutationError = const NetworkException();
      final h = await openForm(tester, library: library);
      await tester.enterText(hoursField, '12');
      await tapAndSettle(tester, find.widgetWithText(ChoiceChip, 'Concluído'));
      await tapAndSettle(tester, saveButton);

      expect(find.textContaining('Sem conexão'), findsWidgets);
      expect(
        find.text('12'),
        findsOneWidget,
        reason: 'horas continuam no campo',
      );
      expect(
        tester
            .widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Concluído'))
            .selected,
        isTrue,
      );
      expect(h.library.created, isEmpty);
      expect(
        find.text('Novo registro'),
        findsWidgets,
        reason: 'continua no formulário',
      );

      library.mutationError = null;
      await tapAndSettle(tester, saveButton);
      expect(h.library.created.length, 1);
      expect(h.library.created.single.$2.hoursPlayed, 12);
    });

    testWidgets('warns that creating again is the replay', (tester) async {
      await openForm(
        tester,
        library: FakeLibraryRepository([fakeEntry(id: 'a')]),
      );
      expect(
        find.text(
          'Você já tem 1 registro deste jogo. Este será um novo registro.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('with multiple entries, says how many', (tester) async {
      await openForm(
        tester,
        library: FakeLibraryRepository([
          fakeEntry(id: 'a'),
          fakeEntry(id: 'b'),
          fakeEntry(id: 'c'),
        ]),
      );
      expect(
        find.text(
          'Você já tem 3 registros deste jogo. Este será um novo registro.',
        ),
        findsOneWidget,
      );
    });

    testWidgets(
      'without entries previous does not show the warning of replay',
      (tester) async {
        await openForm(tester);
        expect(find.textContaining('Você já tem'), findsNothing);
      },
    );

    testWidgets(
      'rating: in the rating by default; choose 1 to 10 and removes it',
      (tester) async {
        final h = await openForm(tester);
        expect(find.text('Sem nota'), findsOneWidget);
        expect(find.byType(Slider), findsNothing);
        for (var n = 1; n <= 10; n++) {
          expect(find.widgetWithText(ChoiceChip, '$n'), findsOneWidget);
        }
        expect(find.widgetWithText(ChoiceChip, '0'), findsNothing);
        expect(find.widgetWithText(ChoiceChip, '11'), findsNothing);

        await tapAndSettle(tester, find.widgetWithText(ChoiceChip, '8'));
        expect(find.text('8/10'), findsOneWidget);
        await tapAndSettle(tester, find.widgetWithText(ChoiceChip, '10'));
        expect(find.text('10/10'), findsOneWidget);
        expect(find.text('8/10'), findsNothing);

        await tapAndSettle(tester, find.widgetWithText(TextButton, 'Sem nota'));
        expect(find.text('Sem nota'), findsOneWidget);
        await tapAndSettle(tester, saveButton);
        expect(
          h.library.created.single.$2.rating,
          isNull,
          reason: 'sem nota nunca vira 0',
        );
      },
    );

    testWidgets('chosen rating is sent the an integer', (tester) async {
      final h = await openForm(tester);
      await tapAndSettle(tester, find.widgetWithText(ChoiceChip, '1'));
      await tapAndSettle(tester, saveButton);
      expect(h.library.created.single.$2.rating, 1);
    });

    testWidgets('the note has label for the reader of screen', (tester) async {
      final handle = tester.ensureSemantics();
      await openForm(tester);
      expect(find.bySemanticsLabel('Nota 8 de 10'), findsOneWidget);
      handle.dispose();
    });

    testWidgets('game without platforms requests the platform by text', (
      tester,
    ) async {
      final games = FakeGamesRepository(
        games: {
          900001: const Game(
            id: 'g',
            igdbId: 900001,
            name: 'Sem Plataforma',
            screenshots: [],
            platforms: [],
            genres: [],
          ),
        },
      );
      final h = await openForm(tester, games: games);
      await tapAndSettle(tester, saveButton);
      expect(find.text('Informe a plataforma'), findsOneWidget);
      expect(h.library.created, isEmpty);

      await tester.enterText(
        find.widgetWithText(TextFormField, 'Plataforma'),
        'Mega Drive',
      );
      await tapAndSettle(tester, saveButton);
      expect(h.library.created.single.$2.platform, 'Mega Drive');
    });
  });

  group('structure', () {
    testWidgets('header with the cover and the title of the game', (
      tester,
    ) async {
      await openForm(tester);
      expect(find.byType(GameCover), findsOneWidget);
      expect(find.text('Jogo Fixture Um'), findsWidgets);
      expect(
        find.text('Novo registro'),
        findsOneWidget,
        reason: 'título da página',
      );
    });

    testWidgets('order: status, platform, progress, rating', (tester) async {
      await openForm(tester);
      double y(String label) => tester.getTopLeft(find.text(label).first).dy;
      final order = [
        y('Status'),
        y('Plataforma'),
        y('Progresso  opcional'),
        y('Início'),
        y('Horas jogadas'),
        y('Sua avaliação  opcional'),
        y('Nota'),
        y('Notas pessoais'),
      ];
      expect(order, orderedEquals([...order]..sort()));
      expect(order.toSet(), hasLength(order.length));
      // Só status e plataforma são essenciais; o resto avisa que pode ficar em branco.
      expect(find.textContaining('opcional'), findsNWidgets(2));
    });

    testWidgets('status chips with icon and text', (tester) async {
      await openForm(tester);
      for (final s in GameStatus.values) {
        final chip = tester.widget<ChoiceChip>(
          find.widgetWithText(ChoiceChip, s.label),
        );
        expect((chip.avatar! as Icon).icon, s.icon);
      }
    });

    testWidgets('private notes indicate that only the user sees them', (
      tester,
    ) async {
      await openForm(tester);
      expect(find.text('Só você vê.'), findsOneWidget);
      expect(
        find.widgetWithText(TextFormField, 'Notas pessoais'),
        findsOneWidget,
      );
    });

    testWidgets('platform outside the catalog: "other" opens the text field', (
      tester,
    ) async {
      final h = await openForm(tester);
      expect(find.widgetWithText(TextFormField, 'Plataforma'), findsNothing);
      await tapAndSettle(tester, find.widgetWithText(ChoiceChip, 'Outra'));
      expect(find.widgetWithText(TextFormField, 'Plataforma'), findsOneWidget);
      expect(
        tester
            .widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'PC'))
            .selected,
        isFalse,
      );

      await tapAndSettle(tester, saveButton);
      expect(find.text('Informe a plataforma'), findsOneWidget);
      expect(h.library.created, isEmpty);

      await tester.enterText(
        find.widgetWithText(TextFormField, 'Plataforma'),
        'Amiga 500',
      );
      await tapAndSettle(tester, saveButton);
      expect(h.library.created.single.$2.platform, 'Amiga 500');
    });

    testWidgets('returning to the catalog platform discards typed text', (
      tester,
    ) async {
      final h = await openForm(tester);
      await tapAndSettle(tester, find.widgetWithText(ChoiceChip, 'Outra'));
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Plataforma'),
        'Amiga 500',
      );
      await tapAndSettle(
        tester,
        find.widgetWithText(ChoiceChip, 'PlayStation 5'),
      );
      expect(find.widgetWithText(TextFormField, 'Plataforma'), findsNothing);
      await tapAndSettle(tester, saveButton);
      expect(h.library.created.single.$2.platform, 'PlayStation 5');
    });
  });

  group('save and keyboard', () {
    testWidgets(
      'the save stays visible above of the keyboard and of the field in focus',
      (tester) async {
        await openForm(tester);
        tester.view.viewInsets = const FakeViewPadding(bottom: 600);
        addTearDown(tester.view.resetViewInsets);
        await tester.pumpAndSettle();
        await tester.tap(hoursField);
        await tester.pumpAndSettle();

        final screenHeight =
            tester.view.physicalSize.height / tester.view.devicePixelRatio;
        final saveBottom = tester.getBottomLeft(saveButton).dy;
        expect(
          saveBottom,
          lessThanOrEqualTo(screenHeight - 600),
          reason: 'acima do teclado',
        );
        final fieldBottom = tester.getBottomLeft(hoursField).dy;
        expect(
          fieldBottom,
          lessThanOrEqualTo(tester.getTopLeft(saveButton).dy),
          reason: 'o campo em foco não fica atrás do botão',
        );
      },
    );

    testWidgets(
      'a network error appears beside the save button and does not clear the fields',
      (tester) async {
        final library = FakeLibraryRepository()
          ..mutationError = const NetworkException();
        await openForm(tester, library: library);
        await tester.enterText(hoursField, '12');
        await tapAndSettle(tester, find.widgetWithText(ChoiceChip, '9'));
        await tapAndSettle(tester, saveButton);

        expect(find.textContaining('Sem conexão'), findsOneWidget);
        expect(
          tester.getBottomLeft(find.textContaining('Sem conexão')).dy,
          lessThanOrEqualTo(tester.getTopLeft(saveButton).dy),
          reason: 'o aviso fica logo acima do botão',
        );
        expect(tester.widget<TextFormField>(hoursField).controller!.text, '12');
        expect(find.text('9/10'), findsOneWidget);
      },
    );

    testWidgets('error of field appears in the own field', (tester) async {
      await openForm(tester);
      await tester.enterText(hoursField, 'abc');
      await tapAndSettle(tester, saveButton);
      expect(
        find.descendant(
          of: find.byType(TextFormField),
          matching: find.text('Use só números, como 12 ou 12,5.'),
        ),
        findsOneWidget,
      );
    });

    testWidgets('save triggers the time only even with taps repeated', (
      tester,
    ) async {
      final gate = Completer<void>();
      final library = FakeLibraryRepository()..mutationGate = gate;
      final h = await openForm(tester, library: library);
      await tester.tap(saveButton);
      await tester.pump();
      // Durante o envio o botão mostra o progresso (sem texto) e fica desabilitado.
      await tester.tap(find.byType(FilledButton).last, warnIfMissed: false);
      await tester.pump();
      gate.complete();
      await tester.pumpAndSettle();
      expect(h.library.created, hasLength(1));
    });
  });

  group('edit', () {
    final entry = fakeEntry(
      id: 'e1',
      status: GameStatus.completed,
      hours: 20,
      rating: 8,
      startedAt: const DateOnly(2026, 1, 5),
      finishedAt: const DateOnly(2026, 1, 20),
      notes: 'Primeira vez',
    );
    const editPath = '/games/900001/playthroughs/e1/edit';

    testWidgets('shows the values saved, without move the dates', (
      tester,
    ) async {
      await openForm(
        tester,
        path: editPath,
        library: FakeLibraryRepository([entry]),
      );
      expect(find.text('Editar registro'), findsWidgets);
      expect(tester.widget<TextFormField>(hoursField).controller!.text, '20');
      expect(find.text('05/01/2026'), findsOneWidget);
      expect(find.text('20/01/2026'), findsOneWidget);
      expect(find.text('8/10'), findsOneWidget);
      expect(find.text('Primeira vez'), findsOneWidget);
      expect(
        tester
            .widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Concluído'))
            .selected,
        isTrue,
      );
    });

    testWidgets('clearing fields sends the removal without tapping elsewhere', (
      tester,
    ) async {
      final h = await openForm(
        tester,
        path: editPath,
        library: FakeLibraryRepository([entry]),
      );
      await tester.enterText(hoursField, '');
      await tapAndSettle(tester, find.widgetWithText(TextButton, 'Sem nota'));
      await tapAndSettle(tester, find.byTooltip('Limpar Fim'));
      await tapAndSettle(tester, saveButton);

      final (id, draft) = h.library.updated.single;
      expect(id, 'e1');
      expect(draft.hoursPlayed, isNull);
      expect(draft.rating, isNull);
      expect(draft.finishedAt, isNull);
      expect(
        draft.startedAt,
        const DateOnly(2026, 1, 5),
        reason: 'início não foi alterado',
      );
      expect(draft.status, GameStatus.completed);
      expect(draft.notes, 'Primeira vez');
    });

    testWidgets('missing entry shows the useful exit', (tester) async {
      await openForm(
        tester,
        path: '/games/900001/playthroughs/zzz/edit',
        library: FakeLibraryRepository([entry]),
      );
      expect(find.text('Registro não encontrado'), findsOneWidget);
      expect(find.text('Voltar ao jogo'), findsOneWidget);
    });

    testWidgets(
      'leaving with changes asks for confirmation; without changes, does not',
      (tester) async {
        final h = AppHarness(library: FakeLibraryRepository([entry]));
        await h.pump(tester);
        await goTo(tester, '/games/900001');
        Future<void> openEdit() async {
          GoRouter.of(tester.element(find.byType(Scaffold).first))
              .push(editPath);
          await tester.pumpAndSettle();
        }

        await openEdit();
        await tester.binding.handlePopRoute();
        await tester.pumpAndSettle();
        expect(
          find.text('Descartar alterações?'),
          findsNothing,
          reason: 'nada mudou',
        );
        expect(
          find.text('Meu progresso'),
          findsOneWidget,
          reason: 'voltou ao jogo',
        );

        await openEdit();
        await tester.enterText(hoursField, '25');
        await tester.pumpAndSettle();
        await tester.binding.handlePopRoute();
        await tester.pumpAndSettle();
        expect(find.text('Descartar alterações?'), findsOneWidget);

        await tapAndSettle(tester, find.text('Continuar editando'));
        expect(find.text('Descartar alterações?'), findsNothing);
        expect(
          tester.widget<TextFormField>(hoursField).controller!.text,
          '25',
          reason: 'o texto continua',
        );

        await tester.binding.handlePopRoute();
        await tester.pumpAndSettle();
        await tapAndSettle(tester, find.text('Descartar'));
        expect(find.text('Meu progresso'), findsOneWidget);
      },
    );

    testWidgets(
      'edit without change nothing does not triggers change inappropriate',
      (tester) async {
        final h = await openForm(
          tester,
          path: editPath,
          library: FakeLibraryRepository([entry]),
        );
        await tapAndSettle(tester, saveButton);
        // O formulário entrega o mesmo conteúdo; o repositório real compara e não envia nada (ver testes de corpo).
        expect(h.library.updated.single.$2.hoursPlayed, 20);
        expect(h.library.updated.single.$2.rating, 8);
      },
    );
  });

  testWidgets('layout the 360 px and text 200% does not overflows', (
    tester,
  ) async {
    final h = AppHarness();
    await h.pump(tester, size: const Size(360, 800), textScale: 2.0);
    await goTo(tester, _newPath);
    expect(tester.takeException(), isNull);
    final bottom = tester.getBottomLeft(saveButton).dy;
    expect(bottom, lessThanOrEqualTo(800), reason: 'o salvar continua à vista');
  });

  testWidgets('change only the note already account the change the discard', (
    tester,
  ) async {
    final h = await openForm(tester);
    await tapAndSettle(tester, find.widgetWithText(ChoiceChip, '6'));
    await tapAndSettle(tester, find.byType(BackButton));
    expect(find.text('Descartar alterações?'), findsOneWidget);
    await tapAndSettle(tester, find.text('Continuar editando'));
    expect(find.text('6/10'), findsOneWidget, reason: 'nada se perdeu');
    expect(h.library.created, isEmpty);
  });

  testWidgets('without change, return does not asks', (tester) async {
    await openForm(tester);
    await tapAndSettle(tester, find.byType(BackButton));
    expect(find.text('Descartar alterações?'), findsNothing);
  });
}
