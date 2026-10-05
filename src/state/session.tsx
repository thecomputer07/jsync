import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { JellyfinClient, JellyfinError, candidateServerUrls, normalizeServerUrl } from '@/lib/jellyfin/client';
import { JellyfinSocket } from '@/lib/jellyfin/socket';
import type { AuthResult, PublicSystemInfo } from '@/lib/jellyfin/types';
import type { Invite } from '@/lib/invite';
import {
  DEFAULT_SETTINGS,
  type Settings,
  type StoredAccount,
  loadAccounts,
  loadSettings,
  newDeviceId,
  removeAccount,
  saveAccount,
  saveSettings,
  setActiveAccount,
} from '@/lib/storage';
import { SyncPlayManager } from '@/lib/syncplay/manager';

interface Session {
  ready: boolean;
  accounts: StoredAccount[];
  account: StoredAccount | null;
  client: JellyfinClient | null;
  socket: JellyfinSocket | null;
  syncplay: SyncPlayManager | null;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  /** Prova gli URL possibili e restituisce quello che risponde da server Jellyfin. */
  probeServer: (input: string) => Promise<{ url: string; info: PublicSystemInfo }>;
  completeLogin: (serverUrl: string, info: PublicSystemInfo, deviceId: string, auth: AuthResult) => Promise<void>;
  switchAccount: (id: string) => Promise<void>;
  logout: (id?: string) => Promise<void>;
  pendingInvite: Invite | null;
  setPendingInvite: (inv: Invite | null) => void;
  findAccountForServer: (server: string) => StoredAccount | undefined;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [pendingInvite, setPendingInvite] = useState<Invite | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [{ accounts, activeId }, s] = await Promise.all([loadAccounts(), loadSettings()]);
        setAccounts(accounts);
        setActiveId(activeId);
        setSettings(s);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const account = useMemo(() => accounts.find((a) => a.id === activeId) ?? null, [accounts, activeId]);

  // Client + socket + SyncPlay vivono finché resta attivo lo stesso account.
  const runtime = useMemo(() => {
    if (!account) return null;
    const client = new JellyfinClient({
      baseUrl: account.serverUrl,
      deviceId: account.deviceId,
      token: account.token,
      userId: account.userId,
    });
    const socket = new JellyfinSocket(client);
    const syncplay = new SyncPlayManager(client, socket);
    return { client, socket, syncplay };
  }, [account?.id, account?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!runtime) return;
    runtime.socket.start();
    runtime.syncplay.start();
    const off = runtime.socket.on((m) => {
      if (m.MessageType === 'UserDataChanged' || m.MessageType === 'LibraryChanged') {
        qc.invalidateQueries({ queryKey: ['home'] });
      }
    });
    return () => {
      off();
      runtime.syncplay.dispose();
      runtime.socket.stop();
    };
  }, [runtime, qc]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next).catch(() => {});
      return next;
    });
  }, []);

  const probeServer = useCallback(async (input: string) => {
    const urls = candidateServerUrls(input);
    if (!urls.length) throw new Error('Scrivi l’indirizzo del server.');
    let lastErr: unknown = null;
    for (const url of urls) {
      try {
        const info = await new JellyfinClient({ baseUrl: url, deviceId: 'probe' }).publicInfo();
        if (info?.Id && info?.Version) {
          const [maj, min] = info.Version.split('.').map(Number);
          if (maj < 10 || (maj === 10 && min < 9)) {
            throw new Error(`Il server ha Jellyfin ${info.Version}: serve la 10.9 o successiva.`);
          }
          return { url, info };
        }
      } catch (e) {
        lastErr = e;
        if (e instanceof Error && e.message.startsWith('Il server ha Jellyfin')) throw e;
      }
    }
    throw lastErr instanceof JellyfinError || lastErr instanceof Error
      ? new Error('Nessun server Jellyfin a questo indirizzo. Controlla indirizzo e porta (di solito 8096).')
      : new Error('Server non raggiungibile.');
  }, []);

  const completeLogin = useCallback(
    async (serverUrl: string, info: PublicSystemInfo, deviceId: string, auth: AuthResult) => {
      const acc: StoredAccount = {
        id: `${auth.ServerId || info.Id}:${auth.User.Id}`,
        serverUrl,
        serverId: auth.ServerId || info.Id,
        serverName: info.ServerName,
        userId: auth.User.Id,
        userName: auth.User.Name,
        primaryImageTag: auth.User.PrimaryImageTag,
        deviceId,
        token: auth.AccessToken,
      };
      await saveAccount(acc);
      qc.clear();
      setAccounts((prev) => [acc, ...prev.filter((a) => a.id !== acc.id)]);
      setActiveId(acc.id);
    },
    [qc],
  );

  const switchAccount = useCallback(
    async (id: string) => {
      await setActiveAccount(id);
      qc.clear();
      setActiveId(id);
    },
    [qc],
  );

  const logout = useCallback(
    async (id?: string) => {
      const target = accounts.find((a) => a.id === (id ?? activeId));
      if (!target) return;
      if (runtime && target.id === activeId) {
        await runtime.client.logout().catch(() => {});
      }
      await removeAccount(target.id);
      const rest = accounts.filter((a) => a.id !== target.id);
      setAccounts(rest);
      if (target.id === activeId) {
        qc.clear();
        setActiveId(rest[0]?.id ?? null);
        if (rest[0]) await setActiveAccount(rest[0].id);
      }
    },
    [accounts, activeId, runtime, qc],
  );

  const findAccountForServer = useCallback(
    (server: string) => {
      const n = normalizeServerUrl(server);
      return accounts.find((a) => normalizeServerUrl(a.serverUrl) === n);
    },
    [accounts],
  );

  const value: Session = {
    ready,
    accounts,
    account,
    client: runtime?.client ?? null,
    socket: runtime?.socket ?? null,
    syncplay: runtime?.syncplay ?? null,
    settings,
    updateSettings,
    probeServer,
    completeLogin,
    switchAccount,
    logout,
    pendingInvite,
    setPendingInvite,
    findAccountForServer,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession fuori da SessionProvider');
  return s;
}

/** Client dell'account attivo (le schermate interne esistono solo da loggati). */
export function useClient() {
  const { client } = useSession();
  if (!client) throw new Error('Nessun account attivo');
  return client;
}

const EMPTY = {
  group: null,
  state: null,
  current: null,
  following: false,
  syncing: null,
  diffMs: 0,
  measuring: false,
} as const;
const noopSub = () => () => {};

export function useSyncPlayState() {
  const { syncplay } = useSession();
  return useSyncExternalStore(
    syncplay ? syncplay.subscribe : noopSub,
    syncplay ? syncplay.getSnapshot : () => EMPTY,
  );
}

export { newDeviceId };
