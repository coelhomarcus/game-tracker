import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter, type Href } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';

import { HeaderBell, Layout } from '@/components';
import { fontFamily } from '@/components/Text';
import {
  MESSAGES_TAB_UNREAD_LABEL,
  MessagesTabIcon,
  NewConversationButton,
  useHasUnreadConversations,
} from '@/features/chat/MessagesTab';
import { HomeHeaderLeft } from '@/features/feed/HomeHeaderLeft';
import { colors, hairline } from '@/theme/tokens';

const EXPLORE_GAMES = '/explore?tab=games' as Href;

type IconName = ComponentProps<typeof Ionicons>['name'];
type TabIconProps = { color: ColorValue; size: number };

function makeIcon(name: IconName) {
  function TabIcon({ color, size }: TabIconProps) {
    return <Ionicons name={name} size={size} color={typeof color === 'string' ? color : undefined} />;
  }
  return TabIcon;
}

const HomeIcon = makeIcon('home');
const LibraryIcon = makeIcon('library');
const SearchIcon = makeIcon('search');
const PersonIcon = makeIcon('person');

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
  const unreadMessages = useHasUnreadConversations();
  return (
    <Tabs
      screenOptions={{
        // Same header component and height as the stacks.
        header: Layout.Header.renderTabHeader,
        headerRight: () => <HeaderBell />,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.borderLow, borderTopWidth: hairline },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMedium,
        tabBarLabelStyle: { fontFamily: fontFamily.medium },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Início', tabBarIcon: HomeIcon, headerLeft: HomeHeaderLeft }}
      />
      <Tabs.Screen
        name="library"
        options={{ title: 'Biblioteca', tabBarIcon: LibraryIcon, headerRight: LibraryHeaderRight }}
      />
      <Tabs.Screen name="explore" options={{ title: 'Explorar', tabBarIcon: SearchIcon }} />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Mensagens',
          tabBarIcon: MessagesTabIcon,
          // Left to the tab bar's own label unless something is unread.
          tabBarAccessibilityLabel: unreadMessages ? MESSAGES_TAB_UNREAD_LABEL : undefined,
          headerRight: NewConversationButton,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Perfil', tabBarIcon: PersonIcon, headerRight: ProfileHeaderRight }}
      />
    </Tabs>
  );
}
