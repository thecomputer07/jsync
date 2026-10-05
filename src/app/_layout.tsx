import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, ThemeProvider, Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastHost } from '@/components/toast';
import { lockAppOrientation } from '@/lib/orientation';
import { playerState } from '@/lib/player-state';
import { SessionProvider, useSession } from '@/state/session';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false },
  },
});

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, primary: colors.accent, text: colors.text, border: colors.border },
};

function SyncPlayNavigator() {
  const { syncplay } = useSession();
  useEffect(() => {
    if (!syncplay) return;
    // Il gruppo ha avviato qualcosa: se il player non è aperto, aprilo.
    return syncplay.onPlayIntent(() => {
      if (!playerState.mounted) router.push({ pathname: '/player', params: { group: '1' } });
    });
  }, [syncplay]);
  return null;
}

function RootStack() {
  const { ready, account } = useSession();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  useEffect(() => {
    lockAppOrientation();
  }, []);

  if (!ready) return null;

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: Platform.isTV ? 'fade' : 'default',
        }}>
        <Stack.Protected guard={!!account}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="item/[id]" />
          <Stack.Screen name="library/[id]" />
          <Stack.Screen name="player" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="scan" options={{ presentation: 'modal' }} />
        </Stack.Protected>
        <Stack.Screen name="index" />
        <Stack.Screen name="connect" />
        <Stack.Screen name="login" />
        <Stack.Screen name="join" />
      </Stack>
      <SyncPlayNavigator />
      <ToastHost />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider value={theme}>
            <SessionProvider>
              <StatusBar style="light" />
              <RootStack />
            </SessionProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
