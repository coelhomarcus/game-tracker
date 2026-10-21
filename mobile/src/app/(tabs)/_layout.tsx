import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter, type Href } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';

import { HeaderBell } from '@/components';
import { HomeHeaderLeft } from '@/features/feed/HomeHeaderLeft';
import { colors } from '@/theme/tokens';

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
const ChatIcon = makeIcon('chatbubbles');
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
        hitSlop={4}
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
  addButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textStrong,
        headerShadowVisible: false,
        headerRight: () => <HeaderBell />,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1 },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
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
        options={{ title: 'Mensagens', tabBarIcon: ChatIcon, headerRight: () => null }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Perfil', tabBarIcon: PersonIcon, headerRight: ProfileHeaderRight }}
      />
    </Tabs>
  );
}
