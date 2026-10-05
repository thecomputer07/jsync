import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/state/session';
import { colors, font, radius, space } from '@/theme';

type Toast = { text: string; kind: 'info' | 'error'; id: number };

const listeners = new Set<(t: Toast) => void>();
let nextId = 1;

/** Mostra un messaggio breve in alto, sopra a tutto (anche al player). */
export function toast(text: string, kind: Toast['kind'] = 'info') {
  const t = { text, kind, id: nextId++ };
  listeners.forEach((fn) => fn(t));
}

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const { syncplay } = useSession();
  const [current, setCurrent] = useState<Toast | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const show = (t: Toast) => {
      setCurrent(t);
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setCurrent(null));
      }, 2800);
    };
    listeners.add(show);
    return () => {
      listeners.delete(show);
    };
  }, [opacity]);

  // Le notifiche del gruppo (chi entra, chi esce, permessi) passano da qui.
  useEffect(() => {
    if (!syncplay) return;
    return syncplay.onNotice((n) => toast(n.text, n.kind));
  }, [syncplay]);

  if (!current) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toast,
        { top: insets.top + space.sm, opacity },
        current.kind === 'error' && { borderColor: colors.danger },
      ]}>
      <Text style={styles.text}>{current.text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: 520,
    marginHorizontal: space.lg,
    backgroundColor: 'rgba(18,18,24,0.96)',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    zIndex: 1000,
    elevation: 20,
  },
  text: { color: colors.text, fontSize: font.sm, fontWeight: '600', textAlign: 'center' },
});
