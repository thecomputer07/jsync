import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import { View, type ColorValue } from 'react-native';

import { useSyncPlayState } from '@/state/session';
import { colors, tv } from '@/theme';

function GroupIcon({ color, size }: { color: ColorValue; size: number }) {
  const { group } = useSyncPlayState();
  return (
    <View>
      <Ionicons name="people" color={color as string} size={size} />
      {group ? (
        <View
          style={{
            position: 'absolute',
            top: -2,
            right: -4,
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: colors.success,
            borderWidth: 2,
            borderColor: colors.bg,
          }}
        />
      ) : null}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textMute,
        tabBarStyle: {
          backgroundColor: 'rgba(7,7,10,0.97)',
          borderTopColor: colors.border,
          height: tv ? 90 : undefined,
        },
        tabBarLabelStyle: { fontWeight: '700', fontSize: tv ? 16 : 11 },
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      <Tabs.Screen
        name="home"
        options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: 'Cerca', tabBarIcon: ({ color, size }) => <Ionicons name="search" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="groups"
        options={{ title: 'Gruppi', tabBarIcon: ({ color, size }) => <GroupIcon color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Impostazioni', tabBarIcon: ({ color, size }) => <Ionicons name="settings-sharp" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
