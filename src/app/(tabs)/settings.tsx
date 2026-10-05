import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Focusable } from '@/components/focusable';
import { toast } from '@/components/toast';
import { Button, Input } from '@/components/ui';
import { useT, type LangSetting, type TKey } from '@/i18n';
import { PRIVACY_URL, SOURCE_URL } from '@/lib/invite';
import { APP_VERSION } from '@/lib/jellyfin/client';
import { useClient, useSession } from '@/state/session';
import { colors, font, radius, space, tv } from '@/theme';

const QUALITIES: { label: string; key?: TKey; value: number }[] = [
  { label: '', key: 'settings.max', value: 120_000_000 },
  { label: '40 Mbps', value: 40_000_000 },
  { label: '20 Mbps', value: 20_000_000 },
  { label: '8 Mbps', value: 8_000_000 },
  { label: '4 Mbps', value: 4_000_000 },
  { label: '2 Mbps', value: 2_000_000 },
];

// Lingue preferite per audio/sottotitoli (codici ISO 639-2 di Jellyfin).
const LANG_CODES = ['ita', 'eng', 'jpn', 'spa', 'fre', 'ger'] as const;

const LICENSES_URL = `${SOURCE_URL}/blob/main/THIRD_PARTY_LICENSES.md`;

export default function SettingsScreen() {
  const c = useClient();
  const { accounts, account, switchAccount, logout, settings, updateSettings } = useSession();
  const insets = useSafeAreaInsets();
  const [qcCode, setQcCode] = useState('');
  const [qcBusy, setQcBusy] = useState(false);
  const { t } = useT();

  const qualities = QUALITIES.map((q) => ({ label: q.key ? t(q.key) : q.label, value: q.value }));
  const langs = LANG_CODES.map((code) => ({ label: t(`langs.${code}`), value: code as string }));
  // "Italiano" e "English" scritti nella loro lingua: chi non capisce la lingua attuale li riconosce comunque.
  const appLangs: { label: string; value: LangSetting }[] = [
    { label: t('settings.langAuto'), value: 'auto' },
    { label: 'Italiano', value: 'it' },
    { label: 'English', value: 'en' },
  ];
  const openLink = (url: string) => {
    WebBrowser.openBrowserAsync(url).catch(() => {});
  };

  const confirmLogout = (id: string, name: string) => {
    if (tv) return logout(id);
    Alert.alert(t('settings.logout'), t('settings.logoutAsk', { name }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.logout'), style: 'destructive', onPress: () => logout(id) },
    ]);
  };

  const authorize = async () => {
    setQcBusy(true);
    try {
      await c.quickConnectAuthorize(qcCode.trim());
      toast(t('settings.qcOk'));
      setQcCode('');
    } catch (e: any) {
      toast(e?.status === 404 || e?.status === 400 ? t('settings.qcBad') : (e?.message ?? t('common.error')), 'error');
    } finally {
      setQcBusy(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={[styles.wrap, { paddingTop: insets.top + space.lg }]} keyboardShouldPersistTaps="handled">
      <Text style={styles.h1}>{t('settings.title')}</Text>

      <Section title={t('settings.account')}>
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
                {a.userName} {a.id === account?.id ? <Text style={{ color: colors.accent }}>{t('settings.active')}</Text> : null}
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
        <Button title={t('settings.addServer')} variant="secondary" icon={<Ionicons name="add" size={18} color={colors.text} />} onPress={() => router.push('/connect')} />
      </Section>

      <Section title={t('settings.playback')}>
        <Toggle label={t('settings.autoIntro')} hint={t('settings.autoIntroHint')} value={settings.autoSkipIntro} onChange={(v) => updateSettings({ autoSkipIntro: v })} />
        <Toggle label={t('settings.autoRecap')} value={settings.autoSkipRecap} onChange={(v) => updateSettings({ autoSkipRecap: v })} />
        <Toggle label={t('settings.autoNext')} value={settings.autoPlayNext} onChange={(v) => updateSettings({ autoPlayNext: v })} />
        <Toggle
          label={t('settings.burn')}
          hint={t('settings.burnHint')}
          value={settings.burnSubtitles}
          onChange={(v) => updateSettings({ burnSubtitles: v })}
        />
        <Text style={styles.label}>{t('settings.maxQuality')}</Text>
        <Chips options={qualities} value={settings.maxBitrate} onChange={(v) => updateSettings({ maxBitrate: v })} />
        <Text style={styles.label}>{t('settings.audioLang')}</Text>
        <Chips options={[{ label: t('settings.langDefault'), value: '' }, ...langs]} value={settings.preferredAudioLang} onChange={(v) => updateSettings({ preferredAudioLang: v })} />
        <Text style={styles.label}>{t('settings.subLang')}</Text>
        <Chips options={[{ label: t('settings.langNone'), value: '' }, ...langs]} value={settings.preferredSubtitleLang} onChange={(v) => updateSettings({ preferredSubtitleLang: v })} />
      </Section>

      <Section title={t('settings.language')}>
        <Chips options={appLangs} value={settings.language} onChange={(v) => updateSettings({ language: v })} />
      </Section>

      <Section title={t('settings.qc')}>
        <Text style={styles.hint}>{t('settings.qcHint')}</Text>
        <Input placeholder={t('settings.qcPh')} value={qcCode} onChangeText={setQcCode} keyboardType="number-pad" maxLength={6} />
        <Button title={t('settings.qcAuthorize')} onPress={authorize} loading={qcBusy} disabled={qcCode.trim().length < 6} />
      </Section>

      <Section title={t('settings.about')}>
        <Text style={styles.hint}>{t('settings.aboutText', { version: APP_VERSION })}</Text>
        <LinkRow icon="shield-checkmark-outline" label={t('settings.privacy')} onPress={() => openLink(PRIVACY_URL)} />
        <LinkRow icon="logo-github" label={t('settings.source')} onPress={() => openLink(SOURCE_URL)} />
        <LinkRow icon="document-text-outline" label={t('settings.licenses')} onPress={() => openLink(LICENSES_URL)} />
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

function LinkRow({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Focusable style={styles.linkRow} zoom={false} onPress={onPress}>
      <Ionicons name={icon} size={20} color={colors.textDim} />
      <Text style={styles.linkLabel}>{label}</Text>
      <Ionicons name="open-outline" size={16} color={colors.textMute} />
    </Focusable>
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
  wrap: { paddingHorizontal: space.lg, paddingBottom: space.xxl * 2, gap: space.xl, maxWidth: tv ? 1000 : 900, width: '100%', alignSelf: 'center' },
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
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  linkLabel: { color: colors.text, fontSize: font.md, fontWeight: '600', flex: 1 },
  label: { color: colors.textDim, fontSize: font.sm, fontWeight: '700', marginTop: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  chipOn: { backgroundColor: '#fff', borderColor: '#fff' },
  chipText: { color: colors.text, fontSize: font.sm, fontWeight: '600' },
});
