import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Tabs } from 'expo-router/js-tabs';
import { Platform, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '@/i18n';
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

// Barra alta e bersagli grandi: ogni tab occupa tutta la sua colonna, ben oltre i 44 pt minimi.
const BAR_HEIGHT = tv ? 90 : 68;
const ICON_SIZE = tv ? 30 : 27;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { t } = useT();
  return (
    <Tabs
      screenListeners={{
        tabPress: () => {
          if (Platform.OS !== 'web' && !tv) Haptics.selectionAsync().catch(() => {});
        },
      }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textMute,
        tabBarStyle: {
          backgroundColor: 'rgba(7,7,10,0.97)',
          borderTopColor: colors.border,
          height: BAR_HEIGHT + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 6,
        },
        tabBarItemStyle: { paddingVertical: 4 },
        tabBarIconStyle: { marginBottom: 2 },
        tabBarLabelStyle: { fontWeight: '700', fontSize: tv ? 16 : 12 },
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      <Tabs.Screen
        name="home"
        options={{ title: t('tabs.home'), tabBarIcon: ({ color }) => <Ionicons name="home" color={color} size={ICON_SIZE} /> }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: t('tabs.search'), tabBarIcon: ({ color }) => <Ionicons name="search" color={color} size={ICON_SIZE} /> }}
      />
      <Tabs.Screen
        name="groups"
        options={{ title: t('tabs.groups'), tabBarIcon: ({ color }) => <GroupIcon color={color} size={ICON_SIZE} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: t('tabs.settings'), tabBarIcon: ({ color }) => <Ionicons name="settings-sharp" color={color} size={ICON_SIZE} /> }}
      />
    </Tabs>
  );
}
