import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Focusable } from '@/components/focusable';
import { Button, Input } from '@/components/ui';
import { JellyfinClient, normalizeServerUrl } from '@/lib/jellyfin/client';
import type { AuthResult, UserDto } from '@/lib/jellyfin/types';
import { newDeviceId, useSession } from '@/state/session';
import { colors, font, radius, space, tv } from '@/theme';

export default function Login() {
  const p = useLocalSearchParams<{ url: string; serverId: string; serverName: string; version: string }>();
  const { completeLogin, accounts, pendingInvite } = useSession();

  // Jellyfin revoca i token di un DeviceId a ogni nuovo login con quel DeviceId: lo riusiamo
  // solo se rientra lo stesso utente (sostituisce la sua vecchia sessione), altrimenti uno nuovo.
  const freshDeviceId = useMemo(() => newDeviceId(), []);
  const [username, setUsername] = useState('');
  const deviceId = useMemo(() => {
    const prev = accounts.find(
      (a) => a.serverId === p.serverId && a.userName.toLowerCase() === username.trim().toLowerCase(),
    );
    return prev?.deviceId ?? freshDeviceId;
  }, [accounts, p.serverId, username, freshDeviceId]);
  const client = useMemo(() => new JellyfinClient({ baseUrl: p.url, deviceId }), [p.url, deviceId]);

  const [users, setUsers] = useState<UserDto[]>([]);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qcAvailable, setQcAvailable] = useState(false);
  const [qcCode, setQcCode] = useState<string | null>(null);
  const qcTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pwRef = useRef<TextInput>(null);

  useEffect(() => {
    const client = new JellyfinClient({ baseUrl: p.url, deviceId: freshDeviceId });
    client.publicUsers().then((u) => setUsers(u ?? [])).catch(() => {});
    client.quickConnectEnabled().then((v) => setQcAvailable(!!v)).catch(() => {});
    return () => {
      if (qcTimer.current) clearInterval(qcTimer.current);
    };
  }, [p.url, freshDeviceId]);

  const finish = async (auth: AuthResult) => {
    await completeLogin(p.url, { Id: p.serverId, ServerName: p.serverName, Version: p.version }, deviceId, auth);
    if (pendingInvite && normalizeServerUrl(pendingInvite.server) === normalizeServerUrl(p.url)) {
      router.replace({ pathname: '/join', params: { s: pendingInvite.server, g: pendingInvite.groupId, n: pendingInvite.groupName } });
    } else {
      router.replace('/home');
    }
  };

  const login = async () => {
    setError(null);
    setBusy(true);
    try {
      await finish(await client.authenticate(username.trim(), password));
    } catch (e: any) {
      setError(e?.status === 401 ? 'Nome utente o password errati.' : (e?.message ?? 'Accesso non riuscito.'));
    } finally {
      setBusy(false);
    }
  };

  const startQuickConnect = async () => {
    setError(null);
    try {
      const { Code, Secret } = await client.quickConnectInitiate();
      setQcCode(Code);
      if (qcTimer.current) clearInterval(qcTimer.current);
      qcTimer.current = setInterval(async () => {
        try {
          const st = await client.quickConnectState(Secret);
          if (st?.Authenticated) {
            if (qcTimer.current) clearInterval(qcTimer.current);
            await finish(await client.quickConnectAuthenticate(Secret));
          }
        } catch {}
      }, 3000);
    } catch (e: any) {
      setError(e?.message ?? 'Quick Connect non disponibile.');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
          <Focusable onPress={() => router.back()} style={styles.back} zoom={false}>
            <Ionicons name="chevron-back" size={22} color={colors.textDim} />
            <Text style={styles.backText}>Cambia server</Text>
          </Focusable>

          <View>
            <Text style={styles.server}>{p.serverName}</Text>
            <Text style={styles.url}>
              {p.url} · Jellyfin {p.version}
            </Text>
          </View>

          {users.length > 0 ? (
            <View style={styles.users}>
              {users.map((u) => (
                <Focusable
                  key={u.Id}
                  style={styles.user}
                  onPress={() => {
                    setUsername(u.Name);
                    setTimeout(() => pwRef.current?.focus(), 50);
                  }}>
                  <View style={[styles.avatar, username === u.Name && { borderColor: colors.accent }]}>
                    {u.PrimaryImageTag ? (
                      <Image source={client.userImageUrl(u.Id, u.PrimaryImageTag)} style={StyleSheet.absoluteFill} />
                    ) : (
                      <Text style={styles.avatarText}>{u.Name.slice(0, 1).toUpperCase()}</Text>
                    )}
                  </View>
                  <Text style={styles.userName} numberOfLines={1}>
                    {u.Name}
                  </Text>
                </Focusable>
              ))}
            </View>
          ) : null}

          {qcCode ? (
            <View style={styles.qc}>
              <Text style={styles.qcTitle}>Codice Quick Connect</Text>
              <Text style={styles.qcCode}>{qcCode}</Text>
              <Text style={styles.qcHelp}>
                Da un dispositivo già collegato apri Jellyfin (o JSync → Impostazioni → Autorizza un dispositivo) e inserisci
                questo codice. Si entra da solo appena lo confermi.
              </Text>
              <Button title="Annulla" variant="ghost" onPress={() => {
                if (qcTimer.current) clearInterval(qcTimer.current);
                setQcCode(null);
              }} />
            </View>
          ) : (
            <View style={styles.form}>
              <Input
                label="Nome utente"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                textContentType="username"
                autoComplete="username"
                returnKeyType="next"
                onSubmitEditing={() => pwRef.current?.focus()}
              />
              <Input
                ref={pwRef}
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textContentType="password"
                autoComplete="password"
                returnKeyType="go"
                onSubmitEditing={login}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button title="Accedi" onPress={login} loading={busy} disabled={!username.trim()} hasTVPreferredFocus={tv && !qcAvailable} />
              {qcAvailable ? (
                <Button title="Accedi con Quick Connect" variant="secondary" onPress={startQuickConnect} hasTVPreferredFocus={tv} />
              ) : null}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const AV = tv ? 96 : 64;
const styles = StyleSheet.create({
  wrap: { padding: space.xl, gap: space.xl, maxWidth: tv ? 900 : 520, width: '100%', alignSelf: 'center', flexGrow: 1 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', padding: 4 },
  backText: { color: colors.textDim, fontSize: font.sm },
  server: { color: colors.text, fontSize: font.xxl, fontWeight: '900' },
  url: { color: colors.textMute, fontSize: font.xs, marginTop: 4 },
  users: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  user: { alignItems: 'center', width: AV + 16, padding: 4 },
  avatar: {
    width: AV,
    height: AV,
    borderRadius: AV / 2,
    backgroundColor: colors.surfaceHi,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarText: { color: colors.text, fontSize: font.xl, fontWeight: '800' },
  userName: { color: colors.textDim, fontSize: font.xs, marginTop: 6 },
  form: { gap: space.md },
  error: { color: colors.danger, fontSize: font.sm },
  qc: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.xl, alignItems: 'center', gap: space.md },
  qcTitle: { color: colors.textDim, fontSize: font.sm, fontWeight: '700' },
  qcCode: { color: colors.text, fontSize: tv ? 72 : 48, fontWeight: '900', letterSpacing: 8 },
  qcHelp: { color: colors.textDim, fontSize: font.sm, textAlign: 'center', lineHeight: font.sm * 1.5 },
});
