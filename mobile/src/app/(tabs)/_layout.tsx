import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomBar, HeaderBell, Layout } from '@/components';
import {
  messagesTabLabel,
  MessagesHeaderRight,
  useUnreadConversationCount,
} from '@/features/chat/MessagesTab';
import { colors } from '@/theme/tokens';

const EXPLORE_GAMES = '/explore?tab=games' as Href;

function LibraryHeaderRight() {
  const router = useRouter();
  return (
    <View style={styles.headerRight}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Adicionar jogo"
        onPress={() => router.push(EXPLORE_GAMES)}
        style={styles.addButton}
      >
        <Ionicons name="add" size={26} color={colors.text} />
      </Pressable>
      <HeaderBell />
    </View>
  );
}

function ProfileHeaderRight() {
  const router = useRouter();
  return (
    <View style={styles.headerRight}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Configurações"
        onPress={() => router.push('/settings' as Href)}
        style={styles.addButton}
      >
        <Ionicons name="settings-outline" size={24} color={colors.text} />
      </Pressable>
      <HeaderBell />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  addButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});

export default function TabsLayout() {
  const unreadMessages = useUnreadConversationCount();
  return (
    <Tabs
      tabBar={(props) => <BottomBar {...props} />}
      screenOptions={{
        // Same header component and height as the stacks.
        header: Layout.Header.renderTabHeader,
        headerRight: () => <HeaderBell />,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {/* Início draws its own header (`HomeHeader`), which hides as the feed scrolls. */}
      <Tabs.Screen name="index" options={{ title: 'Início', headerShown: false }} />
      <Tabs.Screen name="library" options={{ title: 'Biblioteca', headerRight: LibraryHeaderRight }} />
      <Tabs.Screen name="explore" options={{ title: 'Explorar' }} />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Mensagens',
          tabBarBadge: unreadMessages > 0 ? unreadMessages : undefined,
          tabBarAccessibilityLabel: messagesTabLabel(unreadMessages),
          headerRight: MessagesHeaderRight,
        }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Perfil', headerRight: ProfileHeaderRight }} />
    </Tabs>
  );
}
