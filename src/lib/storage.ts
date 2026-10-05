import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/** Un account = un utente su un server Jellyfin. Il token sta nel portachiavi, il resto in AsyncStorage. */
export interface Account {
  id: string; // serverId:userId
  serverUrl: string;
  serverId: string;
  serverName: string;
  userId: string;
  userName: string;
  deviceId: string;
  primaryImageTag?: string;
}

export interface StoredAccount extends Account {
  token: string;
}

// Chiavi interne nate quando l'app si chiamava Rave: non si rinominano (farebbe perdere i login).
const ACCOUNTS_KEY = 'rave.accounts.v1';
const ACTIVE_KEY = 'rave.active.v1';
const SETTINGS_KEY = 'rave.settings.v1';
const tokenKey = (id: string) => `rave_token_${id.replace(/[^A-Za-z0-9._-]/g, '_')}`;

export async function loadAccounts(): Promise<{ accounts: StoredAccount[]; activeId: string | null }> {
  const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
  const list: Account[] = raw ? JSON.parse(raw) : [];
  const accounts: StoredAccount[] = [];
  for (const a of list) {
    const token = await SecureStore.getItemAsync(tokenKey(a.id));
    if (token) accounts.push({ ...a, token });
  }
  const activeId = await AsyncStorage.getItem(ACTIVE_KEY);
  return { accounts, activeId: accounts.some((a) => a.id === activeId) ? activeId : (accounts[0]?.id ?? null) };
}

export async function saveAccount(acc: StoredAccount) {
  const { token, ...rest } = acc;
  await SecureStore.setItemAsync(tokenKey(acc.id), token);
  const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
  const list: Account[] = raw ? JSON.parse(raw) : [];
  const next = [rest, ...list.filter((a) => a.id !== acc.id)];
  await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next));
  await AsyncStorage.setItem(ACTIVE_KEY, acc.id);
}

export async function removeAccount(id: string) {
  await SecureStore.deleteItemAsync(tokenKey(id)).catch(() => {});
  const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
  const list: Account[] = raw ? JSON.parse(raw) : [];
  await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list.filter((a) => a.id !== id)));
}

export async function setActiveAccount(id: string) {
  await AsyncStorage.setItem(ACTIVE_KEY, id);
}

/**
 * Jellyfin revoca i token precedenti se un nuovo login usa lo stesso DeviceId:
 * ogni account ha quindi il suo DeviceId, fisso nel tempo.
 */
export function newDeviceId() {
  return `jsync-${Crypto.randomUUID()}`;
}

// ── Impostazioni ──

export interface Settings {
  autoSkipIntro: boolean;
  autoSkipRecap: boolean;
  autoPlayNext: boolean;
  burnSubtitles: boolean;
  maxBitrate: number; // bit/s
  preferredAudioLang: string; // es. "ita", "jpn" — vuoto = predefinita del server
  preferredSubtitleLang: string;
}

export const DEFAULT_SETTINGS: Settings = {
  autoSkipIntro: false,
  autoSkipRecap: false,
  autoPlayNext: true,
  burnSubtitles: false,
  maxBitrate: 40_000_000,
  preferredAudioLang: '',
  preferredSubtitleLang: '',
};

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: Settings) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}
