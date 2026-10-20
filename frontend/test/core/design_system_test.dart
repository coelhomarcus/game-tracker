// Fundação visual (Etapa 02 do redesign): tema, tokens e os componentes compartilhados.
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gametracker/core/design_system/app_theme.dart';
import 'package:gametracker/core/design_system/content_skeleton.dart';
import 'package:gametracker/core/design_system/filter_toolbar.dart';
import 'package:gametracker/core/design_system/game_card.dart';
import 'package:gametracker/core/design_system/game_status.dart';
import 'package:gametracker/core/design_system/page_container.dart';
import 'package:gametracker/core/design_system/section_header.dart';
import 'package:gametracker/core/design_system/status_chip.dart';
import 'package:gametracker/core/design_system/tokens.dart';
import 'package:gametracker/core/design_system/user_avatar.dart';
import 'package:material_ui/material_ui.dart';

import '../support/golden.dart';

const _longTitle =
    'The Legend of Zelda: Tears of the Kingdom — Edição Colecionador Especial';

/// Composição representativa da biblioteca: cabeçalho de seção, cards, filtros e avatar.
class _Gallery extends StatelessWidget {
  const _Gallery({this.query = '', this.onClear});

  final String query;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          child: PageContainer(
            width: PageWidth.wide,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: Space.lg),
                SectionHeader(
                  title: 'Jogando agora',
                  count: 3,
                  actionLabel: 'Ver todos',
                  onAction: () {},
                ),
                LayoutBuilder(
                  builder: (context, constraints) {
                    final width = (constraints.maxWidth - Space.md * 2) / 3;
                    final height = GameGridGeometry.cardExtentFor(
                      context,
                      width,
                    );
                    return SizedBox(
                      height: height,
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        spacing: Space.md,
                        children: [
                          Expanded(
                            child: GameCard.collection(
                              title: 'Hades',
                              status: GameStatus.playing,
                              caption: 'PC',
                            ),
                          ),
                          Expanded(
                            child: GameCard.collection(
                              title: _longTitle,
                              status: GameStatus.completed,
                              caption: '2 registros',
                            ),
                          ),
                          const Expanded(
                            child: GameCard.cover(title: 'Celeste'),
                          ),
                        ],
                      ),
                    );
                  },
                ),
                const SizedBox(height: Space.lg),
                FilterToolbar(
                  query: query,
                  onQueryChanged: (_) {},
                  searchHint: 'Buscar na biblioteca',
                  filters: [
                    FilterChip(
                      label: const Text('Todos (3)'),
                      selected: true,
                      onSelected: (_) {},
                    ),
                    FilterChip(
                      avatar: Icon(GameStatus.playing.icon, size: 18),
                      label: const Text('Jogando (1)'),
                      selected: false,
                      onSelected: (_) {},
                    ),
                  ],
                  sortBuilder: (compact) => SortMenu<String>(
                    values: const ['Recentes', 'Nome A–Z'],
                    selected: 'Recentes',
                    labelOf: (v) => v,
                    onSelected: (_) {},
                    compact: compact,
                  ),
                  viewToggle: ViewModeToggle(grid: true, onChanged: (_) {}),
                  onClear: onClear,
                ),
                const SizedBox(height: Space.lg),
                const Row(
                  spacing: Space.md,
                  children: [
                    UserAvatar(name: 'Ana', radius: 16),
                    StatusChip(GameStatus.dropped),
                  ],
                ),
                const SizedBox(height: Space.lg),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

Future<void> _pump(
  WidgetTester tester,
  Widget home, {
  Size size = const Size(390, 900),
  double textScale = 1,
  Brightness brightness = Brightness.light,
  String? fontFamily,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light(fontFamily: fontFamily),
      darkTheme: AppTheme.dark(fontFamily: fontFamily),
      themeMode: brightness == Brightness.dark
          ? ThemeMode.dark
          : ThemeMode.light,
      debugShowCheckedModeBanner: false,
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context)
            .copyWith(textScaler: TextScaler.linear(textScale)),
        child: child!,
      ),
      home: home,
    ),
  );
}

void main() {
  setUpAll(loadGoldenFonts);

  group('theme', () {
    test('surfaces are neutral and keep the purple the action', () {
      final light = AppTheme.light().colorScheme;
      final dark = AppTheme.dark().colorScheme;
      expect(light.primary, isNot(light.surface));
      expect(dark.primary, isNot(dark.surface));
      expect(light.surface, const Color(0xFFF9F8FC));
      expect(dark.surface, const Color(0xFF121216));
      expect(light.surfaceContainerLow, const Color(0xFFF5F3F8));
      expect(dark.surfaceContainerLow, const Color(0xFF1A191E));
    });

    test('roles typographic follow size/height of line of the scale', () {
      for (final theme in [AppTheme.light(), AppTheme.dark()]) {
        final t = theme.textTheme;
        expect(
          (t.headlineMedium!.fontSize, t.headlineMedium!.height! * 28),
          (28, 34),
        );
        expect((t.titleLarge!.fontSize, t.titleLarge!.height! * 20), (20, 28));
        expect(
          (t.titleMedium!.fontSize, t.titleMedium!.height! * 16),
          (16, 24),
        );
        expect((t.bodyLarge!.fontSize, t.bodyLarge!.height! * 16), (16, 24));
        expect((t.bodyMedium!.fontSize, t.bodyMedium!.height! * 14), (14, 20));
        expect((t.labelSmall!.fontSize, t.labelSmall!.height! * 12), (12, 16));
      }
    });

    test('slash of navigation and tabs fit in 360 dp (finding of the inspection in the Chrome)', () {
      // Em 360 dp cada um dos 5 destinos tem 72 dp: com 12 sp "Comunidade" quebrava no meio da
      // palavra; as 3 abas do jogo cortavam "Meu progresso" com o recuo padrão de 16 dp.
      for (final theme in [AppTheme.light(), AppTheme.dark()]) {
        final nav = theme.navigationBarTheme;
        for (final states in [
          <WidgetState>{},
          {WidgetState.selected},
        ]) {
          expect(nav.labelTextStyle!.resolve(states)!.fontSize, 11);
        }
        expect(nav.labelPadding, EdgeInsets.zero);
        expect(
          theme.tabBarTheme.labelPadding,
          const EdgeInsets.symmetric(horizontal: Space.xs),
        );
      }
    });

    test(
      'the two variants originate the same seed and keep the colors of status',
      () {
        expect(AppTheme.light().colorScheme.primary, isNot(equals(null)));
        expect(AppTheme.light().extension<DomainColors>(), DomainColors.light);
        expect(AppTheme.dark().extension<DomainColors>(), DomainColors.dark);
        expect(
          AppTheme.light().materialTapTargetSize,
          MaterialTapTargetSize.padded,
        );
      },
    );
  });

  group('PageContainer', () {
    test('margin of 16 in screen narrow and 24 in wide', () {
      expect(PageContainer.gutterFor(359), Space.lg);
      expect(PageContainer.gutterFor(599), Space.lg);
      expect(PageContainer.gutterFor(600), Space.xl);
    });

    test('centers the content in the width maximum without shrink below of the margin', () {
      expect(
        PageContainer.insetsFor(390, PageWidth.reading),
        const EdgeInsets.symmetric(horizontal: 16),
      );
      expect(
        PageContainer.insetsFor(700, PageWidth.reading),
        const EdgeInsets.symmetric(horizontal: 24),
      );
      expect(
        PageContainer.insetsFor(1440, PageWidth.reading),
        const EdgeInsets.symmetric(horizontal: 380),
      );
      expect(
        PageContainer.insetsFor(1440, PageWidth.wide),
        const EdgeInsets.symmetric(horizontal: 120),
      );
    });

    testWidgets('limits the width of the content', (tester) async {
      await _pump(
        tester,
        const Scaffold(
          body: PageContainer(
            child: SizedBox(key: Key('content'), width: double.infinity),
          ),
        ),
        size: const Size(1440, 900),
      );
      expect(tester.getSize(find.byKey(const Key('content'))).width, 680);
    });
  });

  group('GameCard', () {
    testWidgets('columns: minimum adaptive with 12 dp of space', (
      tester,
    ) async {
      expect(GameGridGeometry.columnsFor(328), 2);
      expect(GameGridGeometry.columnsFor(468), 3);
      expect(GameGridGeometry.columnsFor(600), 3);
      expect(GameGridGeometry.columnsFor(1200), 6);
    });

    testWidgets(
      'the label of accessibility combines title, status and caption',
      (tester) async {
        final handle = tester.ensureSemantics();
        await _pump(
          tester,
          Scaffold(
            body: SizedBox(
              width: 160,
              height: 330,
              child: GameCard.collection(
                title: 'Hades',
                status: GameStatus.playing,
                caption: '2 registros',
                onTap: () {},
              ),
            ),
          ),
        );
        expect(
          tester.getSemantics(find.byType(InkWell)),
          matchesSemantics(
            label: 'Hades, Jogando, 2 registros',
            isButton: true,
            hasTapAction: true,
            isFocusable: true,
          ),
        );
        handle.dispose();
      },
    );

    testWidgets('geometry reserves cover, two lines, status and caption', (
      tester,
    ) async {
      late GameGridGeometry geometry;
      await _pump(
        tester,
        Scaffold(
          body: Builder(
            builder: (context) {
              geometry = GameGridGeometry.resolve(context, 328);
              return const SizedBox();
            },
          ),
        ),
      );
      expect(geometry.columns, 2);
      expect(geometry.cardWidth, 158);
      expect(geometry.titleExtent, 48);
      expect(geometry.cardExtent, greaterThan(geometry.cardWidth * 4 / 3));
      expect(
        geometry.catalogCardExtent,
        greaterThan(geometry.cardWidth * 4 / 3),
      );
    });

    testWidgets(
      'catalog separates open of the CTA and keeps name and platform',
      (tester) async {
        var opened = 0, added = 0;
        await _pump(
          tester,
          Scaffold(
            body: Builder(
              builder: (context) => SizedBox(
                width: 180,
                height: GameGridGeometry.catalogCardExtentFor(context, 180),
                child: GameCard.catalog(
                  title: 'Celeste',
                  caption: 'PC · Switch',
                  onTap: () => opened++,
                  action: FilledButton(
                    onPressed: () => added++,
                    child: const Text('Adicionar'),
                  ),
                ),
              ),
            ),
          ),
        );
        expect(find.text('Celeste'), findsWidgets);
        expect(find.text('PC · Switch'), findsOneWidget);
        await tester.tap(find.text('Adicionar'));
        expect((opened, added), (0, 1));
        await tester.tap(find.text('Celeste').last);
        expect((opened, added), (1, 1));
      },
    );

    testWidgets('tap opens and the focus of the keyboard wins outline', (
      tester,
    ) async {
      var taps = 0;
      await _pump(
        tester,
        Scaffold(
          body: GameCard.cover(title: 'Hades', onTap: () => taps++),
        ),
      );
      Color? outline() =>
          ((tester
                              .widget<AnimatedContainer>(
                                find.byType(AnimatedContainer),
                              )
                              .foregroundDecoration!
                          as BoxDecoration)
                      .border!
                  as Border)
              .top
              .color;

      expect(outline(), Colors.transparent);
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.pumpAndSettle();
      expect(outline(), AppTheme.light().colorScheme.primary);

      await tester.tap(find.byType(GameCard));
      expect(taps, 1);
    });

    testWidgets('the overlay receives the tap without open the game', (
      tester,
    ) async {
      var opened = 0, menu = 0;
      await _pump(
        tester,
        Scaffold(
          body: SizedBox(
            width: 160,
            child: GameCard.cover(
              title: 'Hades',
              onTap: () => opened++,
              overlay: IconButton(
                tooltip: 'Menu',
                icon: const Icon(Icons.more_vert),
                onPressed: () => menu++,
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.byTooltip('Menu'));
      expect((opened, menu), (0, 1));
    });

    testWidgets('title long occupies at most two lines', (tester) async {
      await _pump(
        tester,
        const Scaffold(
          body: SizedBox(
            width: 140,
            height: 420,
            child: GameCard.collection(
              title: _longTitle,
              status: GameStatus.playing,
              caption: 'Nintendo Switch',
            ),
          ),
        ),
        textScale: 2,
      );
      // O nome também aparece no fallback da capa; o título é o Text de duas linhas.
      final titles = tester
          .widgetList<Text>(find.text(_longTitle))
          .where((t) => t.maxLines == 2 && t.overflow == TextOverflow.ellipsis);
      expect(titles, hasLength(1));
      expect(tester.takeException(), isNull);
    });
  });

  group('FilterToolbar', () {
    testWidgets('type and clear the search warns who uses', (tester) async {
      final queries = <String>[];
      await _pump(
        tester,
        Scaffold(body: FilterToolbar(onQueryChanged: queries.add)),
      );
      await tester.enterText(find.byType(TextField), 'zel');
      await tester.pump();
      expect(queries, ['zel']);
      await tester.tap(find.byTooltip('Limpar busca'));
      await tester.pump();
      expect(queries, ['zel', '']);
      expect(find.byTooltip('Limpar busca'), findsNothing);
    });

    testWidgets('the query changed of outside updates the field', (
      tester,
    ) async {
      Widget build(String q) => Scaffold(
        body: FilterToolbar(query: q, onQueryChanged: (_) {}),
      );
      await _pump(tester, build('zelda'));
      expect(find.text('zelda'), findsOneWidget);
      await _pump(tester, build(''));
      expect(find.text('zelda'), findsNothing);
    });

    testWidgets('"clear" only exists with filter active', (tester) async {
      await _pump(tester, const _Gallery());
      expect(find.text('Limpar'), findsNothing);
      await _pump(tester, _Gallery(onClear: () {}));
      expect(find.text('Limpar'), findsOneWidget);
    });
  });

  group('SectionHeader', () {
    testWidgets('is the header and the action triggers', (tester) async {
      final handle = tester.ensureSemantics();
      var taps = 0;
      await _pump(
        tester,
        Scaffold(
          body: SectionHeader(
            title: 'Jogando agora',
            count: 3,
            actionLabel: 'Ver todos',
            onAction: () => taps++,
          ),
        ),
      );
      expect(
        tester.getSemantics(find.text('Jogando agora  3', findRichText: true)),
        matchesSemantics(label: 'Jogando agora  3', isHeader: true),
      );
      await tester.tap(find.text('Ver todos'));
      expect(taps, 1);
      handle.dispose();
    });
  });

  group('ContentSkeleton', () {
    for (final grid in [false, true]) {
      testWidgets('${grid ? 'grid' : 'list'} fits the 360 dp and text 200%', (
        tester,
      ) async {
        final handle = tester.ensureSemantics();
        await _pump(
          tester,
          Scaffold(
            body: grid
                ? const ContentSkeleton.grid()
                : const ContentSkeleton.list(),
          ),
          size: const Size(360, 800),
          textScale: 2,
        );
        expect(tester.takeException(), isNull);
        expect(find.bySemanticsLabel('Carregando'), findsOneWidget);
        handle.dispose();
      });
    }
  });

  group('movement', () {
    testWidgets('without animation when the system requests', (tester) async {
      late Duration normal, reduced;
      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(disableAnimations: true),
          child: Builder(
            builder: (context) {
              reduced = Motion.resolve(context, Motion.short);
              return const SizedBox();
            },
          ),
        ),
      );
      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(),
          child: Builder(
            builder: (context) {
              normal = Motion.resolve(context, Motion.short);
              return const SizedBox();
            },
          ),
        ),
      );
      expect((reduced, normal), (Duration.zero, Motion.short));
    });
  });

  group('composition of the foundation', () {
    for (final brightness in Brightness.values) {
      final name = brightness.name;

      for (final (size, scale) in [
        (const Size(360, 900), 2.0),
        (const Size(390, 900), 1.0),
        (const Size(1440, 900), 1.0),
      ]) {
        testWidgets('$name · ${size.width.toInt()} px · text $scale×', (
          tester,
        ) async {
          await _pump(
            tester,
            _Gallery(onClear: () {}),
            size: size,
            textScale: scale,
            brightness: brightness,
          );
          expect(tester.takeException(), isNull);
        });
      }

      testWidgets('$name · guidelines of accessibility', (tester) async {
        final handle = tester.ensureSemantics();
        await _pump(tester, _Gallery(onClear: () {}), brightness: brightness);
        await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
        await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
        await expectLater(tester, meetsGuideline(textContrastGuideline));
        handle.dispose();
      });

      testWidgets('$name · golden', skip: goldenSkip, (tester) async {
        await _pump(
          tester,
          _Gallery(query: 'zelda', onClear: () {}),
          brightness: brightness,
          fontFamily: goldenFontFamily,
        );
        await expectLater(
          find.byType(Scaffold),
          matchesGoldenFile('goldens/foundation_$name.png'),
        );
      });
    }
  });
}
