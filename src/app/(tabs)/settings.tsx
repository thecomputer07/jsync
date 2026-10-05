import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Focusable } from '@/components/focusable';
import { toast } from '@/components/toast';
import { Button, Input } from '@/components/ui';
import { APP_VERSION } from '@/lib/jellyfin/client';
import { useClient, useSession } from '@/state/session';
import { colors, font, radius, space, tv } from '@/theme';

const QUALITIES = [
  { label: 'Massima', value: 120_000_000 },
  { label: '40 Mbps', value: 40_000_000 },
  { label: '20 Mbps', value: 20_000_000 },
  { label: '8 Mbps', value: 8_000_000 },
  { label: '4 Mbps', value: 4_000_000 },
  { label: '2 Mbps', value: 2_000_000 },
];

const LANGS = [
  { label: 'Predefinita', value: '' },
  { label: 'Italiano', value: 'ita' },
  { label: 'Inglese', value: 'eng' },
  { label: 'Giapponese', value: 'jpn' },
  { label: 'Spagnolo', value: 'spa' },
  { label: 'Francese', value: 'fre' },
  { label: 'Tedesco', value: 'ger' },
];

export default function SettingsScreen() {
  const c = useClient();
  const { accounts, account, switchAccount, logout, settings, updateSettings } = useSession();
  const insets = useSafeAreaInsets();
  const [qcCode, setQcCode] = useState('');
  const [qcBusy, setQcBusy] = useState(false);

  const confirmLogout = (id: string, name: string) => {
    if (tv) return logout(id);
    Alert.alert('Esci', `Vuoi uscire da ${name}?`, [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Esci', style: 'destructive', onPress: () => logout(id) },
    ]);
  };

  const authorize = async () => {
    setQcBusy(true);
    try {
      await c.quickConnectAuthorize(qcCode.trim());
      toast('Dispositivo autorizzato');
      setQcCode('');
    } catch (e: any) {
      toast(e?.status === 404 || e?.status === 400 ? 'Codice non valido o scaduto.' : (e?.message ?? 'Errore'), 'error');
    } finally {
      setQcBusy(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={[styles.wrap, { paddingTop: insets.top + space.lg }]} keyboardShouldPersistTaps="handled">
      <Text style={styles.h1}>Impostazioni</Text>

      <Section title="Account">
        {accounts.map((a) => (
          <Focusable key={a.id} style={styles.account} zoom={false} onPress={() => a.id !== account?.id && switchAccount(a.id)}>
            <View style={styles.avatar}>
              {a.primaryImageTag && a.id === account?.id ? (
                <Image source={c.userImageUrl(a.userId, a.primaryImageTag)} style={StyleSheet.absoluteFill} />
              ) : (
                <Text style={styles.avatarText}>{a.userName.slice(0, 1).toUpperCase()}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.accName}>
                {a.userName} {a.id === account?.id ? <Text style={{ color: colors.accent }}> · attivo</Text> : null}
              </Text>
              <Text style={styles.accServer} numberOfLines={1}>
                {a.serverName} · {a.serverUrl}
              </Text>
            </View>
            <Focusable onPress={() => confirmLogout(a.id, `${a.userName}@${a.serverName}`)} style={{ padding: space.sm }} zoom={false}>
              <Ionicons name="log-out-outline" size={22} color={colors.textDim} />
            </Focusable>
          </Focusable>
        ))}
        <Button title="Aggiungi server o utente" variant="secondary" icon={<Ionicons name="add" size={18} color={colors.text} />} onPress={() => router.push('/connect')} />
      </Section>

      <Section title="Riproduzione">
        <Toggle label="Salta automaticamente le intro" hint="Da soli. In gruppo compare il pulsante «Salta intro»." value={settings.autoSkipIntro} onChange={(v) => updateSettings({ autoSkipIntro: v })} />
        <Toggle label="Salta automaticamente i riassunti" value={settings.autoSkipRecap} onChange={(v) => updateSettings({ autoSkipRecap: v })} />
        <Toggle label="Avvia il prossimo episodio" value={settings.autoPlayNext} onChange={(v) => updateSettings({ autoPlayNext: v })} />
        <Toggle
          label="Sottotitoli impressi nel video"
          hint="Mantiene lo stile dei sottotitoli ASS (anime), ma il server deve ricodificare il video."
          value={settings.burnSubtitles}
          onChange={(v) => updateSettings({ burnSubtitles: v })}
        />
        <Text style={styles.label}>Qualità massima in streaming</Text>
        <Chips options={QUALITIES} value={settings.maxBitrate} onChange={(v) => updateSettings({ maxBitrate: v })} />
        <Text style={styles.label}>Lingua audio preferita</Text>
        <Chips options={LANGS} value={settings.preferredAudioLang} onChange={(v) => updateSettings({ preferredAudioLang: v })} />
        <Text style={styles.label}>Lingua sottotitoli preferita</Text>
        <Chips options={[{ label: 'Nessuna', value: '' }, ...LANGS.slice(1)]} value={settings.preferredSubtitleLang} onChange={(v) => updateSettings({ preferredSubtitleLang: v })} />
      </Section>

      <Section title="Autorizza un dispositivo (Quick Connect)">
        <Text style={styles.hint}>Per entrare su una TV senza scrivere la password: inserisci qui il codice che mostra.</Text>
        <Input placeholder="Codice a 6 cifre" value={qcCode} onChangeText={setQcCode} keyboardType="number-pad" maxLength={6} />
        <Button title="Autorizza" onPress={authorize} loading={qcBusy} disabled={qcCode.trim().length < 6} />
      </Section>

      <Section title="Informazioni">
        <Text style={styles.hint}>
          Rave {APP_VERSION}. Un player per il tuo server Jellyfin: nessun account Rave, nessun server di terze parti, nessun
          tracciamento. I dati restano fra questo dispositivo e il tuo server.
        </Text>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Focusable style={styles.toggle} zoom={false} onPress={() => onChange(!value)}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent, false: colors.surfaceHi }} thumbColor="#fff" focusable={false} />
    </Focusable>
  );
}

function Chips<T extends string | number>({ options, value, onChange }: { options: { label: string; value: T }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => (
        <Focusable key={String(o.value)} onPress={() => onChange(o.value)} style={[styles.chip, o.value === value && styles.chipOn]}>
          <Text style={[styles.chipText, o.value === value && { color: '#000' }]}>{o.label}</Text>
        </Focusable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.lg, paddingBottom: space.xxl * 2, gap: space.xl, maxWidth: tv ? 1000 : 700, width: '100%', alignSelf: 'center' },
  h1: { color: colors.text, fontSize: font.xxl, fontWeight: '900' },
  section: { gap: space.sm },
  sectionTitle: { color: colors.textMute, fontSize: font.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, gap: space.md, borderWidth: 1, borderColor: colors.border },
  account: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { color: colors.text, fontWeight: '800', fontSize: font.md },
  accName: { color: colors.text, fontSize: font.md, fontWeight: '700' },
  accServer: { color: colors.textMute, fontSize: font.xs },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  toggleLabel: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  hint: { color: colors.textMute, fontSize: font.xs, lineHeight: font.xs * 1.5, marginTop: 2 },
  label: { color: colors.textDim, fontSize: font.sm, fontWeight: '700', marginTop: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  chipOn: { backgroundColor: '#fff', borderColor: '#fff' },
  chipText: { color: colors.text, fontSize: font.sm, fontWeight: '600' },
});
