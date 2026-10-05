import { Platform } from 'react-native';
import * as Device from 'expo-device';

import type {
  AuthResult,
  BaseItem,
  GroupInfo,
  ItemsResult,
  MediaSegment,
  PlaybackInfoResponse,
  PublicSystemInfo,
  UserDto,
} from './types';

export const APP_NAME = 'JSync';
export const APP_VERSION = '1.0.0';

export const TICKS_PER_SECOND = 10_000_000;
export const ticksToSeconds = (t?: number | null) => (t ?? 0) / TICKS_PER_SECOND;
export const secondsToTicks = (s: number) => Math.max(0, Math.round(s * TICKS_PER_SECOND));

export class JellyfinError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Nome dispositivo come appare nella dashboard Jellyfin ("iPhone di Lorenzo" ecc.). */
export function deviceName() {
  if (Platform.isTV) return Device.deviceName || 'Android TV';
  return Device.deviceName || Device.modelName || (Platform.OS === 'ios' ? 'iPhone' : 'Android');
}

/**
 * Normalizza quello che l'utente scrive ("casa.example.com:8096", "http://10.0.0.5:8096/")
 * nella lista di URL da provare, in ordine.
 */
export function candidateServerUrls(input: string): string[] {
  let s = input.trim().replace(/\/+$/, '');
  if (!s) return [];
  s = s.replace(/\/web(\/index\.html)?(#.*)?$/i, '');
  if (/^https?:\/\//i.test(s)) return [s];
  return [`https://${s}`, `http://${s}`];
}

export function normalizeServerUrl(url: string) {
  return url.trim().replace(/\/+$/, '').toLowerCase();
}

interface ClientInit {
  baseUrl: string;
  deviceId: string;
  token?: string;
  userId?: string;
}

type Query = Record<string, string | number | boolean | undefined | null | string[]>;

export class JellyfinClient {
  baseUrl: string;
  deviceId: string;
  token?: string;
  userId?: string;

  constructor(init: ClientInit) {
    this.baseUrl = init.baseUrl.replace(/\/+$/, '');
    this.deviceId = init.deviceId;
    this.token = init.token;
    this.userId = init.userId;
  }

  authHeader() {
    const esc = (v: string) => v.replace(/"/g, "'");
    let h =
      `MediaBrowser Client="${APP_NAME}", Device="${esc(deviceName())}", ` +
      `DeviceId="${this.deviceId}", Version="${APP_VERSION}"`;
    if (this.token) h += `, Token="${this.token}"`;
    return h;
  }

  url(path: string, query?: Query) {
    const qs: string[] = [];
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null || v === '') continue;
        const val = Array.isArray(v) ? v.join(',') : String(v);
        qs.push(`${encodeURIComponent(k)}=${encodeURIComponent(val)}`);
      }
    }
    return `${this.baseUrl}${path}${qs.length ? `?${qs.join('&')}` : ''}`;
  }

  async request<T>(
    method: string,
    path: string,
    opts: { query?: Query; body?: unknown; timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20_000);
    opts.signal?.addEventListener('abort', () => ctrl.abort());
    let res: Response;
    try {
      res = await fetch(this.url(path, opts.query), {
        method,
        headers: {
          Authorization: this.authHeader(),
          Accept: 'application/json',
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: ctrl.signal,
      });
    } catch (e: any) {
      throw new JellyfinError(
        e?.name === 'AbortError' ? 'Il server non risponde.' : 'Impossibile raggiungere il server.',
        0,
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      let msg = `Errore ${res.status}`;
      if (res.status === 401) msg = 'Sessione scaduta o credenziali errate.';
      else if (res.status === 403) msg = 'Non hai i permessi per questa operazione.';
      else if (res.status === 404) msg = 'Non trovato sul server.';
      throw new JellyfinError(msg, res.status);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  private uid() {
    if (!this.userId) throw new JellyfinError('Nessun utente collegato.', 401);
    return this.userId;
  }

  // ── Server / auth ──

  publicInfo(timeoutMs = 8000) {
    return this.request<PublicSystemInfo>('GET', '/System/Info/Public', { timeoutMs });
  }

  publicUsers() {
    return this.request<UserDto[]>('GET', '/Users/Public');
  }

  authenticate(username: string, password: string) {
    return this.request<AuthResult>('POST', '/Users/AuthenticateByName', {
      body: { Username: username, Pw: password },
    });
  }

  quickConnectEnabled() {
    return this.request<boolean>('GET', '/QuickConnect/Enabled');
  }

  quickConnectInitiate() {
    return this.request<{ Code: string; Secret: string }>('POST', '/QuickConnect/Initiate');
  }

  quickConnectState(secret: string) {
    return this.request<{ Authenticated: boolean }>('GET', '/QuickConnect/Connect', {
      query: { secret },
    });
  }

  quickConnectAuthenticate(secret: string) {
    return this.request<AuthResult>('POST', '/Users/AuthenticateWithQuickConnect', {
      body: { Secret: secret },
    });
  }

  quickConnectAuthorize(code: string) {
    return this.request<boolean>('POST', '/QuickConnect/Authorize', {
      query: { code, userId: this.uid() },
    });
  }

  me() {
    return this.request<UserDto>('GET', '/Users/Me');
  }

  logout() {
    return this.request<void>('POST', '/Sessions/Logout', { timeoutMs: 5000 });
  }

  reportCapabilities() {
    return this.request<void>('POST', '/Sessions/Capabilities/Full', {
      body: {
        PlayableMediaTypes: ['Video'],
        SupportedCommands: [],
        SupportsMediaControl: false,
        SupportsPersistentIdentifier: true,
      },
    });
  }

  utcTime() {
    return this.request<{ RequestReceptionTime: string; ResponseTransmissionTime: string }>(
      'GET',
      '/GetUtcTime',
      { timeoutMs: 5000 },
    );
  }

  // ── Libreria ──

  static FIELDS = [
    'Overview',
    'PrimaryImageAspectRatio',
    'Genres',
    'ParentId',
    'ChildCount',
    'MediaSourceCount',
  ];

  /** Librerie dell'utente, solo quelle video. */
  async views() {
    const r = await this.request<ItemsResult>('GET', '/UserViews', { query: { userId: this.uid() } });
    const Items = (r?.Items ?? []).filter(isVideoLibrary);
    return { ...r, Items, TotalRecordCount: Items.length };
  }

  resume(limit = 20) {
    return this.request<ItemsResult>('GET', '/UserItems/Resume', {
      query: {
        userId: this.uid(),
        limit,
        mediaTypes: 'Video',
        includeItemTypes: 'Movie,Episode,Video',
        fields: JellyfinClient.FIELDS,
        enableImageTypes: 'Primary,Backdrop,Thumb',
        enableTotalRecordCount: false,
      },
    });
  }

  nextUp(limit = 20, seriesId?: string) {
    return this.request<ItemsResult>('GET', '/Shows/NextUp', {
      query: {
        userId: this.uid(),
        limit,
        seriesId,
        fields: JellyfinClient.FIELDS,
        enableResumable: false,
        enableRewatching: false,
        enableTotalRecordCount: false,
      },
    });
  }

  latest(parentId: string, limit = 20) {
    return this.request<BaseItem[]>('GET', '/Items/Latest', {
      query: {
        userId: this.uid(),
        parentId,
        limit,
        fields: JellyfinClient.FIELDS,
        groupItems: true,
        includeItemTypes: 'Movie,Episode,Series,Video',
        enableImageTypes: 'Primary,Backdrop,Thumb',
      },
    });
  }

  featured(limit = 6) {
    return this.request<ItemsResult>('GET', '/Items', {
      query: {
        userId: this.uid(),
        recursive: true,
        includeItemTypes: 'Movie,Series',
        sortBy: 'Random',
        imageTypes: 'Backdrop',
        hasOverview: true,
        limit,
        fields: JellyfinClient.FIELDS,
      },
    });
  }

  items(query: Query) {
    return this.request<ItemsResult>('GET', '/Items', {
      query: { userId: this.uid(), fields: JellyfinClient.FIELDS, ...query },
    });
  }

  libraryItems(parentId: string, startIndex: number, limit: number, collectionType?: string) {
    const types =
      collectionType === 'movies'
        ? 'Movie'
        : collectionType === 'tvshows'
          ? 'Series'
          : collectionType === 'boxsets'
            ? 'BoxSet'
            : 'Movie,Series,Video,BoxSet';
    // Nelle cartelle miste mai audio o libri: sopra elenchiamo solo tipi video.
    return this.items({
      parentId,
      recursive: true,
      includeItemTypes: types,
      sortBy: 'SortName',
      sortOrder: 'Ascending',
      startIndex,
      limit,
    });
  }

  search(term: string) {
    return this.items({
      searchTerm: term,
      recursive: true,
      includeItemTypes: 'Movie,Series,Episode',
      limit: 50,
    });
  }

  item(id: string) {
    return this.request<BaseItem>('GET', `/Items/${id}`, { query: { userId: this.uid() } });
  }

  seasons(seriesId: string) {
    return this.request<ItemsResult>('GET', `/Shows/${seriesId}/Seasons`, {
      query: { userId: this.uid(), fields: JellyfinClient.FIELDS },
    });
  }

  episodes(seriesId: string, seasonId?: string, startItemId?: string, limit?: number) {
    return this.request<ItemsResult>('GET', `/Shows/${seriesId}/Episodes`, {
      query: {
        userId: this.uid(),
        seasonId,
        startItemId,
        limit,
        fields: JellyfinClient.FIELDS,
      },
    });
  }

  setPlayed(itemId: string, played: boolean) {
    return this.request<unknown>(played ? 'POST' : 'DELETE', `/UserPlayedItems/${itemId}`, {
      query: { userId: this.uid() },
    });
  }

  /** Salta intro: API ufficiale Media Segments (10.10+), poi plugin Intro Skipper come ripiego. */
  async segments(itemId: string): Promise<MediaSegment[]> {
    try {
      const r = await this.request<{ Items: MediaSegment[] }>('GET', `/MediaSegments/${itemId}`, {
        timeoutMs: 6000,
      });
      if (r?.Items?.length) return r.Items;
    } catch {}
    try {
      // Il plugin ha cambiato nomi dei campi fra versioni: Start/End oppure IntroStart/IntroEnd.
      const r = await this.request<
        Record<string, { Valid?: boolean; Start?: number; End?: number; IntroStart?: number; IntroEnd?: number }>
      >('GET', `/Episode/${itemId}/IntroSkipperSegments`, { timeoutMs: 6000 });
      const out: MediaSegment[] = [];
      for (const [k, v] of Object.entries(r ?? {})) {
        const start = v?.Start ?? v?.IntroStart ?? 0;
        const end = v?.End ?? v?.IntroEnd ?? 0;
        if (!v || v.Valid === false || end <= start) continue;
        const type = k === 'Credits' ? 'Outro' : k === 'Introduction' ? 'Intro' : (k as any);
        out.push({ Type: type, StartTicks: secondsToTicks(start), EndTicks: secondsToTicks(end) });
      }
      return out;
    } catch {
      return [];
    }
  }

  // ── Riproduzione ──

  playbackInfo(
    itemId: string,
    body: {
      DeviceProfile: unknown;
      StartTimeTicks?: number;
      AudioStreamIndex?: number;
      SubtitleStreamIndex?: number;
      MediaSourceId?: string;
      MaxStreamingBitrate?: number;
      EnableDirectPlay?: boolean;
      EnableDirectStream?: boolean;
    },
  ) {
    return this.request<PlaybackInfoResponse>('POST', `/Items/${itemId}/PlaybackInfo`, {
      query: { userId: this.uid() },
      body: {
        UserId: this.uid(),
        EnableDirectPlay: true,
        EnableDirectStream: true,
        EnableTranscoding: true,
        AutoOpenLiveStream: true,
        AllowVideoStreamCopy: true,
        AllowAudioStreamCopy: true,
        ...body,
      },
    });
  }

  reportPlaying(kind: 'start' | 'progress' | 'stop', body: Record<string, unknown>) {
    const path =
      kind === 'start' ? '/Sessions/Playing' : kind === 'progress' ? '/Sessions/Playing/Progress' : '/Sessions/Playing/Stopped';
    return this.request<void>('POST', path, { body, timeoutMs: 8000 }).catch(() => {});
  }

  stopEncoding(playSessionId: string) {
    return this.request<void>('DELETE', '/Videos/ActiveEncodings', {
      query: { deviceId: this.deviceId, playSessionId },
      timeoutMs: 5000,
    }).catch(() => {});
  }

  // ── Immagini ──

  imageUrl(
    itemId: string | undefined,
    type: 'Primary' | 'Backdrop' | 'Thumb' | 'Logo',
    opts: { tag?: string; width?: number; index?: number } = {},
  ) {
    if (!itemId) return undefined;
    const idx = type === 'Backdrop' ? `/${opts.index ?? 0}` : '';
    return this.url(`/Items/${itemId}/Images/${type}${idx}`, {
      fillWidth: opts.width ?? 400,
      quality: 90,
      tag: opts.tag,
    });
  }

  userImageUrl(userId: string, tag?: string) {
    return this.url(`/Users/${userId}/Images/Primary`, { width: 120, tag });
  }

  // ── SyncPlay (gruppi) ──

  syncPlayList() {
    return this.request<GroupInfo[]>('GET', '/SyncPlay/List');
  }
  syncPlayGet(groupId: string) {
    return this.request<GroupInfo>('GET', `/SyncPlay/${groupId}`);
  }
  syncPlayNew(groupName: string) {
    return this.request<void>('POST', '/SyncPlay/New', { body: { GroupName: groupName } });
  }
  syncPlayJoin(groupId: string) {
    return this.request<void>('POST', '/SyncPlay/Join', { body: { GroupId: groupId } });
  }
  syncPlayLeave() {
    return this.request<void>('POST', '/SyncPlay/Leave');
  }
  syncPlaySetNewQueue(itemIds: string[], index: number, startTicks: number) {
    return this.request<void>('POST', '/SyncPlay/SetNewQueue', {
      body: { PlayingQueue: itemIds, PlayingItemPosition: index, StartPositionTicks: startTicks },
    });
  }
  syncPlayPause() {
    return this.request<void>('POST', '/SyncPlay/Pause');
  }
  syncPlayUnpause() {
    return this.request<void>('POST', '/SyncPlay/Unpause');
  }
  syncPlayStop() {
    return this.request<void>('POST', '/SyncPlay/Stop');
  }
  syncPlaySeek(positionTicks: number) {
    return this.request<void>('POST', '/SyncPlay/Seek', { body: { PositionTicks: positionTicks } });
  }
  syncPlayReady(body: { When: string; PositionTicks: number; IsPlaying: boolean; PlaylistItemId: string }) {
    return this.request<void>('POST', '/SyncPlay/Ready', { body });
  }
  syncPlayBuffering(body: { When: string; PositionTicks: number; IsPlaying: boolean; PlaylistItemId: string }) {
    return this.request<void>('POST', '/SyncPlay/Buffering', { body });
  }
  syncPlayNextItem(playlistItemId: string) {
    return this.request<void>('POST', '/SyncPlay/NextItem', { body: { PlaylistItemId: playlistItemId } });
  }
  syncPlayPreviousItem(playlistItemId: string) {
    return this.request<void>('POST', '/SyncPlay/PreviousItem', { body: { PlaylistItemId: playlistItemId } });
  }
  syncPlaySetIgnoreWait(ignoreWait: boolean) {
    return this.request<void>('POST', '/SyncPlay/SetIgnoreWait', { body: { IgnoreWait: ignoreWait } }).catch(() => {});
  }
  syncPlayPing(ping: number) {
    return this.request<void>('POST', '/SyncPlay/Ping', { body: { Ping: Math.round(ping) } }).catch(() => {});
  }

  /**
   * Token nella query: `ApiKey` (Jellyfin 10.11+, dove `api_key` è disattivato di default e dà 401)
   * più `api_key` per i server più vecchi. Verificato sul server demo 12.x: entrambi insieme vanno.
   */
  tokenQuery() {
    return { ApiKey: this.token, api_key: this.token };
  }

  socketUrl() {
    const ws = this.baseUrl.replace(/^http/i, 'ws');
    const t = encodeURIComponent(this.token ?? '');
    return `${ws}/socket?ApiKey=${t}&api_key=${t}&deviceId=${encodeURIComponent(this.deviceId)}`;
  }
}

export function itemSubtitle(item: BaseItem) {
  if (item.Type === 'Episode') {
    const se =
      item.ParentIndexNumber != null && item.IndexNumber != null
        ? `S${item.ParentIndexNumber}:E${item.IndexNumber}`
        : '';
    return [item.SeriesName, se].filter(Boolean).join(' · ');
  }
  return [item.ProductionYear, item.OfficialRating].filter(Boolean).join(' · ');
}

export function formatDuration(seconds: number) {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

export function runtimeLabel(ticks?: number) {
  const min = Math.round(ticksToSeconds(ticks) / 60);
  if (!min) return '';
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
}

/** Solo librerie video: niente musica, libri, audiolibri, foto, TV in diretta. */
const VIDEO_COLLECTIONS = new Set(['movies', 'tvshows', 'homevideos', 'boxsets', 'mixed', '', 'folders']);
export function isVideoLibrary(view: BaseItem) {
  return VIDEO_COLLECTIONS.has((view.CollectionType ?? '').toLowerCase());
}

/** Tipi riproducibili ammessi ovunque nell'app. */
export const VIDEO_ITEM_TYPES = 'Movie,Series,Episode,Video';
export function isVideoItem(item: BaseItem) {
  return ['Movie', 'Series', 'Season', 'Episode', 'Video', 'BoxSet'].includes(item.Type);
}
