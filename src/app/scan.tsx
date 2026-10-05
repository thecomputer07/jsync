import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Focusable } from '@/components/focusable';
import { Button } from '@/components/ui';
import { parseInvite } from '@/lib/invite';
import { colors, font, space } from '@/theme';

export default function Scan() {
  const [perm, request] = useCameraPermissions();
  const insets = useSafeAreaInsets();
  const handled = useRef(false);

  if (!perm) return <View style={styles.wrap} />;
  if (!perm.granted) {
    return (
      <View style={[styles.wrap, { padding: space.xl, justifyContent: 'center', gap: space.lg }]}>
        <Text style={styles.msg}>Per leggere il QR di un invito serve la fotocamera.</Text>
        <Button title="Consenti fotocamera" onPress={request} />
        <Button title="Annulla" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (handled.current) return;
          const inv = parseInvite(data);
          if (!inv) return;
          handled.current = true;
          router.replace({ pathname: '/join', params: { s: inv.server, g: inv.groupId, n: inv.groupName } });
        }}
      />
      <View style={styles.frame} pointerEvents="none" />
      <Text style={[styles.tip, { bottom: insets.bottom + space.xxl }]}>Inquadra il QR dell’invito</Text>
      <Focusable onPress={() => router.back()} style={[styles.close, { top: insets.top + space.md }]} zoom={false}>
        <Ionicons name="close" size={28} color="#fff" />
      </Focusable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#000' },
  msg: { color: colors.text, fontSize: font.md, textAlign: 'center' },
  frame: {
    position: 'absolute',
    alignSelf: 'center',
    top: '30%',
    width: 240,
    height: 240,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  tip: { position: 'absolute', alignSelf: 'center', color: '#fff', fontSize: font.md, fontWeight: '700' },
  close: { position: 'absolute', right: space.lg, padding: 6, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)' },
});
