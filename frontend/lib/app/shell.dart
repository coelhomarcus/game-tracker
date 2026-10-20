import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

import '../core/design_system/tokens.dart';
import '../features/chat/application/conversations_controller.dart';
import '../features/feed/application/feed_controller.dart';

class _Destination {
  const _Destination(this.label, this.icon, this.selectedIcon);
  final String label;
  final IconData icon;
  final IconData selectedIcon;
}

const _destinations = [
  _Destination('Biblioteca', Icons.video_library_outlined, Icons.video_library),
  _Destination('Explorar', Icons.search, Icons.search),
  _Destination('Comunidade', Icons.forum_outlined, Icons.forum),
  _Destination('Mensagens', Icons.chat_bubble_outline, Icons.chat_bubble),
  _Destination('Perfil', Icons.person_outline, Icons.person),
];

const _destinationRoots = [
  '/library',
  '/explore',
  '/community',
  '/messages',
  '/me',
];

const _communityIndex = 2;
const _messagesIndex = 3;

/// Efeitos de entrar num destino, iguais na barra, no rail e no rail das páginas de detalhe.
void _prepareDestination(WidgetRef ref, int index) {
  // Ao entrar na Comunidade, revalida o feed se ele ficou velho ou foi marcado como
  // desatualizado (ex.: uma atividade criada pelo backend depois de salvar um registro).
  if (index == _communityIndex) {
    ref.read(feedRevalidatorProvider).revalidateIfStale();
  }
  // Não há evento por usuário no backend: ao entrar em Mensagens, a lista é revalidada.
  if (index == _messagesIndex && ref.exists(conversationsControllerProvider)) {
    ref.read(conversationsControllerProvider.notifier).revalidateIfStale();
  }
}

/// O ícone de Mensagens ganha um selo com as conversas não lidas.
Widget _icon(_Destination d, {required bool selected, required int unread}) {
  final icon = Icon(selected ? d.selectedIcon : d.icon);
  if (d.label != 'Mensagens' || unread == 0) return icon;
  return Badge(label: Text('$unread'), child: icon);
}

/// Rail com os cinco destinos. [selectedIndex] é nulo quando a página aberta não pertence a
/// nenhum deles.
class _AppRail extends ConsumerWidget {
  const _AppRail({required this.selectedIndex, required this.onSelected});

  final int? selectedIndex;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final width = MediaQuery.sizeOf(context).width;
    final unread = ref.watch(unreadConversationsProvider);
    final extended = width >= Breakpoints.railExtended;
    return Row(
      children: [
        NavigationRail(
          selectedIndex: selectedIndex,
          onDestinationSelected: onSelected,
          extended: extended,
          labelType: extended
              ? NavigationRailLabelType.none
              : NavigationRailLabelType.all,
          destinations: [
            for (final d in _destinations)
              NavigationRailDestination(
                icon: _icon(d, selected: false, unread: unread),
                selectedIcon: _icon(d, selected: true, unread: unread),
                label: Text(d.label),
              ),
          ],
        ),
        const VerticalDivider(width: 1),
      ],
    );
  }
}

/// Moldura das páginas fora dos cinco destinos (detalhe de jogo, post, perfil de outra pessoa,
/// formulários, alertas e ajustes). No celular a página ocupa a tela e volta pelo histórico; a
/// partir de 600 dp o rail continua à esquerda, como nos destinos.
class DetailShell extends ConsumerWidget {
  const DetailShell({super.key, required this.child});

  final Widget child;

  /// Destino ao qual a página pertence, quando houver um óbvio.
  static int? destinationFor(String path) {
    if (path.startsWith('/posts')) return _communityIndex;
    if (path.startsWith('/me') || path.startsWith('/settings')) return 4;
    return null;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wide = _usesRail(context);
    final path = GoRouterState.of(context).uri.path;
    // A página tem chave própria: girar ou redimensionar a janela mostra ou esconde o rail sem
    // recriar o histórico dela.
    return Scaffold(
      body: Row(
        children: [
          if (wide)
            _AppRail(
              selectedIndex: destinationFor(path),
              onSelected: (i) {
                _prepareDestination(ref, i);
                context.go(_destinationRoots[i]);
              },
            ),
          Expanded(key: const ValueKey('detail-content'), child: child),
        ],
      ),
    );
  }
}

/// Mesmos cinco destinos em qualquer largura: barra abaixo de 600, rail a partir daí, unless
/// enlarged text needs the extra width of the compact navigation.
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  void _select(WidgetRef ref, int index) {
    _prepareDestination(ref, index);
    navigationShell.goBranch(
      index,
      // Tocar no destino já ativo volta à raiz dele.
      initialLocation: index == navigationShell.currentIndex,
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(unreadConversationsProvider);
    final label = unread == 0 ? 'Mensagens' : 'Mensagens, $unread não lidas';

    if (!_usesRail(context)) {
      // A conversa aberta ocupa a tela toda: sem a barra, o campo de mensagem fica logo acima
      // do teclado e a lista de mensagens ganha altura.
      final inConversation = GoRouterState.of(context).uri.path
          .startsWith('/messages/');
      return Scaffold(
        body: navigationShell,
        bottomNavigationBar: inConversation
            ? null
            : NavigationBar(
                selectedIndex: navigationShell.currentIndex,
                onDestinationSelected: (i) => _select(ref, i),
                destinations: [
                  for (final d in _destinations)
                    NavigationDestination(
                      icon: _icon(d, selected: false, unread: unread),
                      selectedIcon: _icon(d, selected: true, unread: unread),
                      label: d.label,
                      tooltip: d.label == 'Mensagens' ? label : d.label,
                    ),
                ],
              ),
      );
    }
    return Scaffold(
      body: Row(
        children: [
          _AppRail(
            selectedIndex: navigationShell.currentIndex,
            onSelected: (i) => _select(ref, i),
          ),
          Expanded(child: navigationShell),
        ],
      ),
    );
  }
}

/// A lateral rail consumes enough horizontal space to make a 600 dp window fragile when users
/// enlarge text. Keep the compact navigation in that case so the page still has usable width.
bool _usesRail(BuildContext context) {
  final width = MediaQuery.sizeOf(context).width;
  final textScale = MediaQuery.textScalerOf(context).scale(14) / 14;
  return width >= Breakpoints.medium && textScale < 1.5;
}
