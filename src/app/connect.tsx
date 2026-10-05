import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Wordmark } from '@/components/brand';
import { Focusable } from '@/components/focusable';
import { Button, Input } from '@/components/ui';
import { useT } from '@/i18n';
import { PRIVACY_URL } from '@/lib/invite';
import { useSession } from '@/state/session';
import { colors, font, space, tv } from '@/theme';

export default function Connect() {
  const params = useLocalSearchParams<{ server?: string }>();
  const { probeServer, account, pendingInvite } = useSession();
  const [address, setAddress] = useState(params.server ?? pendingInvite?.server ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useT();

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
      setError(e?.message ?? t('errors.serverUnreachable'));
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
              <Text style={styles.subtitle}>{t('connect.tagline')}</Text>
            </View>

            {pendingInvite ? (
              <View style={styles.invite}>
                <Text style={styles.inviteText}>
                  {t('connect.inviteFor', {
                    group: pendingInvite.groupName ? t('connect.inviteGroup', { name: pendingInvite.groupName }) : '',
                  })}
                </Text>
              </View>
            ) : null}

            <View style={styles.form}>
              <Input
                label={t('connect.address')}
                placeholder={t('connect.addressPh')}
                value={address}
                onChangeText={setAddress}
                autoCapitalize="none"
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={() => go()}
                autoFocus={!tv && !address}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button title={t('common.continue')} onPress={() => go()} loading={busy} disabled={!address.trim()} hasTVPreferredFocus={tv} />
              <Button
                title={t('connect.demo')}
                variant="ghost"
                onPress={() => {
                  setAddress('https://demo.jellyfin.org/stable');
                  go('https://demo.jellyfin.org/stable');
                }}
              />
              {account ? <Button title={t('common.cancel')} variant="ghost" onPress={() => router.back()} /> : null}
            </View>

            <View style={{ gap: space.xs, alignItems: 'center' }}>
              <Text style={styles.note}>{t('connect.privacy')}</Text>
              <Focusable onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL).catch(() => {})} style={styles.link} zoom={false}>
                <Text style={styles.linkText}>{t('connect.privacyLink')}</Text>
              </Focusable>
            </View>
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
  link: { paddingHorizontal: space.sm, paddingVertical: space.xs },
  linkText: { color: colors.textDim, fontSize: font.xs, textDecorationLine: 'underline' },
  inviteText: { color: colors.text, fontSize: font.sm, textAlign: 'center' },
});
