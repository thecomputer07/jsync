import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Loading } from '@/components/ui';
import { normalizeServerUrl } from '@/lib/jellyfin/client';
import { useSession } from '@/state/session';
import { colors, font, space } from '@/theme';

/**
 * Apertura di un invito (rave://join?s=…&g=…&n=…).
 * - stesso server dell'account attivo → entra nel gruppo
 * - server di un altro account salvato → cambia account e entra
 * - server mai visto → chiede di accedere, poi entra da solo
 */
export default function Join() {
  const { s, g, n } = useLocalSearchParams<{ s?: string; g?: string; n?: string }>();
  const { account, syncplay, findAccountForServer, switchAccount, setPendingInvite } = useSession();
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (!s || !g) return;
    const sameServer = account && normalizeServerUrl(account.serverUrl) === normalizeServerUrl(s);
    if (!sameServer) {
      const other = findAccountForServer(s);
      if (other) {
        switchAccount(other.id); // al prossimo render l'account attivo è quello giusto
        return;
      }
      setPendingInvite({ server: s, groupId: g, groupName: n });
      router.replace({ pathname: '/connect', params: { server: s } });
      return;
    }
    if (!syncplay || done.current) return;
    done.current = true;
    setPendingInvite(null);
    syncplay
      .join(g)
      .then(() => router.replace('/groups'))
      .catch((e: any) => {
        done.current = false;
        setError(
          e?.status === 403
            ? 'Il tuo account non può entrare nei gruppi su questo server.'
            : e?.status === 404 || e?.status === 400
              ? 'Il gruppo non esiste più.'
              : (e?.message ?? 'Impossibile entrare nel gruppo.'),
        );
      });
  }, [s, g, n, account, syncplay, findAccountForServer, switchAccount, setPendingInvite]);

  const shownError = !s || !g ? 'Invito non valido.' : error;
  if (shownError) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Invito</Text>
        <Text style={styles.msg}>{shownError}</Text>
        <Button title="Vai alla home" variant="secondary" onPress={() => router.replace(account ? '/home' : '/connect')} />
      </View>
    );
  }
  return <Loading label={n ? `Entro nel gruppo «${n}»…` : 'Entro nel gruppo…'} />;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: space.xl, gap: space.lg },
  title: { color: colors.text, fontSize: font.xxl, fontWeight: '900' },
  msg: { color: colors.textDim, fontSize: font.md },
});
