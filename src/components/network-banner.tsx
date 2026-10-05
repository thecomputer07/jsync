import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '@/i18n';
import { colors, font, space } from '@/theme';

/** Striscia sottile in alto quando il dispositivo è senza rete. Non blocca i tocchi. */
export function NetworkBanner() {
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const [offline, setOffline] = useState(false);

  useEffect(
    () =>
      NetInfo.addEventListener((s) => {
        // isInternetReachable è null finché non è stato verificato: lo contiamo solo se è false.
        setOffline(s.isConnected === false || s.isInternetReachable === false);
      }),
    [],
  );

  if (!offline) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top }]}>
      <Text style={styles.text} numberOfLines={1}>
        {t('net.offline')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 999,
    elevation: 19,
    backgroundColor: 'rgba(244,63,94,0.92)',
    paddingVertical: space.xs,
    paddingHorizontal: space.lg,
  },
  text: { color: colors.text, fontSize: font.xs, fontWeight: '700', textAlign: 'center' },
});
