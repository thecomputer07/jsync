import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Focusable } from '@/components/focusable';
import { toast } from '@/components/toast';
import { Button, Input } from '@/components/ui';
import { buildInviteLink, buildInviteMessage, parseInvite } from '@/lib/invite';
import { useClient, useSession, useSyncPlayState } from '@/state/session';
import { colors, font, radius, space, tv } from '@/theme';

const STATE_LABEL: Record<string, string> = {
  Idle: 'In attesa di scegliere cosa guardare',
  Waiting: 'Sincronizzazione in corso…',
  Paused: 'In pausa',
  Playing: 'In riproduzione',
};

export default function Groups() {
  const c = useClient();
  const { account, syncplay } = useSession();
  const sp = useSyncPlayState();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [paste, setPaste] = useState('');

  const list = useQuery({
    queryKey: ['groups', account?.id],
    queryFn: () => c.syncPlayList(),
    refetchInterval: sp.group ? false : 5000,
  });

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e: any) {
      toast(
        e?.status === 403 ? 'Il tuo account non ha il permesso SyncPlay su questo server (lo abilita l’amministratore).' : (e?.message ?? 'Errore'),
        'error',
      );
    } finally {
      setBusy(null);
      list.refetch();
    }
  };

  const invite = sp.group && account ? { server: account.serverUrl, groupId: sp.group.GroupId, groupName: sp.group.GroupName } : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[styles.wrap, { paddingTop: insets.top + space.lg }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={tv ? undefined : <RefreshControl refreshing={list.isRefetching} onRefresh={() => list.refetch()} tintColor={colors.text} />}>
      <Text style={styles.h1}>Guarda insieme</Text>
      <Text style={styles.lead}>
        I gruppi vivono sul tuo server Jellyfin ({account?.serverName}). Chi entra vede la stessa cosa nello stesso istante:
        pausa, salti e prossimo episodio valgono per tutti.
      </Text>

      {sp.group && invite ? (
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.liveDot} />
            <Text style={styles.groupName} numberOfLines={1}>
              {sp.group.GroupName}
            </Text>
          </View>
          <Text style={styles.state}>{STATE_LABEL[sp.state ?? 'Idle'] ?? sp.state}</Text>

          <Text style={styles.label}>Partecipanti</Text>
          <View style={styles.people}>
            {(sp.group.Participants ?? []).map((p, i) => (
              <View key={`${p}-${i}`} style={styles.person}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{p.slice(0, 1).toUpperCase()}</Text>
                </View>
                <Text style={styles.personName} numberOfLines={1}>
                  {p}
                  {p === account?.userName ? ' (tu)' : ''}
                </Text>
              </View>
            ))}
          </View>

          {sp.current && !sp.following ? (
            <Button
              title="Torna alla visione del gruppo"
              icon={<Ionicons name="play" size={18} color={colors.text} />}
              onPress={() => syncplay?.rejoinPlayback()}
            />
          ) : null}
          {!sp.current ? (
            <Text style={styles.hint}>Apri un film o un episodio e premi «Guarda nel gruppo» per avviarlo per tutti.</Text>
          ) : null}

          <Text style={[styles.label, { marginTop: space.md }]}>Invita</Text>
          <View style={styles.inviteRow}>
            <View style={styles.qr}>
              <QRCode value={buildInviteLink(invite)} size={tv ? 220 : 132} backgroundColor="#fff" color="#000" />
            </View>
            <View style={{ flex: 1, gap: space.sm }}>
              {!tv ? (
                <Button
                  title="Condividi invito"
                  icon={<Ionicons name="share-outline" size={18} color={colors.text} />}
                  onPress={() => Share.share({ message: buildInviteMessage(invite, account?.userName) })}
                />
              ) : null}
              <Button
                title="Copia link"
                variant="secondary"
                icon={<Ionicons name="copy-outline" size={18} color={colors.text} />}
                onPress={async () => {
                  await Clipboard.setStringAsync(buildInviteLink(invite));
                  toast('Link copiato');
                }}
              />
              <Text style={styles.hint}>
                {tv
                  ? 'Inquadra il QR con la fotocamera del telefono (app Rave → Gruppi → Scansiona).'
                  : 'Chi riceve l’invito deve avere un account su questo server.'}
              </Text>
            </View>
          </View>

          <Button title="Esci dal gruppo" variant="danger" loading={busy === 'leave'} onPress={() => run('leave', () => syncplay!.leave())} />
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.label}>Nuovo gruppo</Text>
            <Input
              placeholder={`Serata di ${account?.userName ?? ''}`}
              value={name}
              onChangeText={setName}
              returnKeyType="done"
              maxLength={40}
            />
            <Button
              title="Crea gruppo"
              icon={<Ionicons name="add" size={20} color={colors.text} />}
              loading={busy === 'create'}
              hasTVPreferredFocus={tv}
              onPress={() => run('create', () => syncplay!.create(name.trim() || `Serata di ${account?.userName ?? 'Rave'}`))}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Gruppi aperti su questo server</Text>
            {list.data?.length ? (
              list.data.map((g) => (
                <Focusable key={g.GroupId} style={styles.groupItem} zoom={false} onPress={() => run('join', () => syncplay!.join(g.GroupId))}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.groupItemName}>{g.GroupName}</Text>
                    <Text style={styles.groupItemMeta} numberOfLines={1}>
                      {g.Participants?.join(', ')} · {STATE_LABEL[g.State] ?? g.State}
                    </Text>
                  </View>
                  <Text style={styles.join}>Entra</Text>
                </Focusable>
              ))
            ) : (
              <Text style={styles.hint}>{list.isLoading ? 'Caricamento…' : 'Nessun gruppo aperto in questo momento.'}</Text>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Hai ricevuto un invito?</Text>
            {!tv ? (
              <Button
                title="Scansiona QR"
                variant="secondary"
                icon={<Ionicons name="qr-code-outline" size={18} color={colors.text} />}
                onPress={() => router.push('/scan')}
              />
            ) : null}
            <Input placeholder="Incolla qui il link rave://…" value={paste} onChangeText={setPaste} autoCapitalize="none" />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {Platform.OS !== 'web' && !tv ? (
                <Button
                  title="Incolla"
                  variant="secondary"
                  style={{ flex: 1 }}
                  onPress={async () => setPaste(await Clipboard.getStringAsync())}
                />
              ) : null}
              <Button
                title="Apri invito"
                style={{ flex: 1 }}
                disabled={!paste.trim()}
                onPress={() => {
                  const inv = parseInvite(paste);
                  if (!inv) return toast('Non è un invito Rave valido.', 'error');
                  router.push({ pathname: '/join', params: { s: inv.server, g: inv.groupId, n: inv.groupName } });
                }}
              />
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.lg, paddingBottom: space.xxl * 2, gap: space.lg, maxWidth: tv ? 1100 : 700, width: '100%', alignSelf: 'center' },
  h1: { color: colors.text, fontSize: font.xxl, fontWeight: '900' },
  lead: { color: colors.textDim, fontSize: font.sm, lineHeight: font.sm * 1.5 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, gap: space.md, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  groupName: { color: colors.text, fontSize: font.xl, fontWeight: '900', flex: 1 },
  state: { color: colors.textDim, fontSize: font.sm },
  label: { color: colors.textMute, fontSize: font.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  person: { alignItems: 'center', width: tv ? 110 : 72 },
  avatar: { width: tv ? 64 : 44, height: tv ? 64 : 44, borderRadius: 32, backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.text, fontWeight: '800', fontSize: font.md },
  personName: { color: colors.textDim, fontSize: font.xs, marginTop: 4 },
  hint: { color: colors.textMute, fontSize: font.xs, lineHeight: font.xs * 1.5 },
  inviteRow: { flexDirection: 'row', gap: space.lg, alignItems: 'center' },
  qr: { padding: 10, backgroundColor: '#fff', borderRadius: radius.md },
  groupItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, gap: space.md },
  groupItemName: { color: colors.text, fontSize: font.md, fontWeight: '700' },
  groupItemMeta: { color: colors.textMute, fontSize: font.xs, marginTop: 2 },
  join: { color: colors.accent, fontWeight: '800', fontSize: font.sm },
});
