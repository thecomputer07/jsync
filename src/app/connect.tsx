import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Wordmark } from '@/components/brand';
import { Button, Input } from '@/components/ui';
import { useSession } from '@/state/session';
import { colors, font, space, tv } from '@/theme';

export default function Connect() {
  const params = useLocalSearchParams<{ server?: string }>();
  const { probeServer, account, pendingInvite } = useSession();
  const [address, setAddress] = useState(params.server ?? pendingInvite?.server ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async (value = address) => {
    setError(null);
    setBusy(true);
    try {
      const { url, info } = await probeServer(value);
      router.push({
        pathname: '/login',
        params: { url, serverId: info.Id, serverName: info.ServerName, version: info.Version },
      });
    } catch (e: any) {
      setError(e?.message ?? 'Server non raggiungibile.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <LinearGradient colors={['#1a1033', colors.bg, colors.bg]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
            <View style={styles.brand}>
              <Wordmark width={tv ? 420 : 260} />
              <Text style={styles.subtitle}>
                Guarda film e serie del tuo server Jellyfin, da solo o insieme agli amici, perfettamente sincronizzati.
              </Text>
            </View>

            {pendingInvite ? (
              <View style={styles.invite}>
                <Text style={styles.inviteText}>
                  Hai un invito{pendingInvite.groupName ? ` al gruppo «${pendingInvite.groupName}»` : ''}. Accedi al server
                  per entrare.
                </Text>
              </View>
            ) : null}

            <View style={styles.form}>
              <Input
                label="Indirizzo del server Jellyfin"
                placeholder="es. jellyfin.casa.it oppure 192.168.1.10:8096"
                value={address}
                onChangeText={setAddress}
                autoCapitalize="none"
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={() => go()}
                autoFocus={!tv && !address}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button title="Continua" onPress={() => go()} loading={busy} disabled={!address.trim()} hasTVPreferredFocus={tv} />
              <Button
                title="Prova con il server demo di Jellyfin"
                variant="ghost"
                onPress={() => {
                  setAddress('https://demo.jellyfin.org/stable');
                  go('https://demo.jellyfin.org/stable');
                }}
              />
              {account ? <Button title="Annulla" variant="ghost" onPress={() => router.back()} /> : null}
            </View>

            <Text style={styles.note}>
              JSync non ha server propri e non raccoglie dati: si collega solo al server Jellyfin che inserisci tu.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: space.xl,
    gap: space.xl,
    maxWidth: tv ? 820 : 520,
    width: '100%',
    alignSelf: 'center',
  },
  brand: { alignItems: 'center', gap: space.lg },
  subtitle: { color: colors.textDim, fontSize: font.md, textAlign: 'center', lineHeight: font.md * 1.4 },
  form: { gap: space.md },
  error: { color: colors.danger, fontSize: font.sm },
  note: { color: colors.textMute, fontSize: font.xs, textAlign: 'center', lineHeight: font.xs * 1.5 },
  invite: {
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 12,
    padding: space.md,
  },
  inviteText: { color: colors.text, fontSize: font.sm, textAlign: 'center' },
});
