import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { HeaderBell } from '@/components';
import { colors } from '@/theme/tokens';

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
      <Tabs.Screen name="index" options={{ title: 'Início', tabBarIcon: HomeIcon }} />
      <Tabs.Screen name="library" options={{ title: 'Biblioteca', tabBarIcon: LibraryIcon }} />
      <Tabs.Screen name="explore" options={{ title: 'Explorar', tabBarIcon: SearchIcon }} />
      <Tabs.Screen
        name="messages"
        options={{ title: 'Mensagens', tabBarIcon: ChatIcon, headerRight: () => null }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Perfil', tabBarIcon: PersonIcon }} />
    </Tabs>
  );
}
