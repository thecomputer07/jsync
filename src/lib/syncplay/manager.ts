import { t } from '@/i18n';

import { JellyfinClient, secondsToTicks, ticksToSeconds } from '../jellyfin/client';
import { parseServerDate } from '../jellyfin/dates';
import type { JellyfinSocket, SocketMessage } from '../jellyfin/socket';
import type { GroupInfo, GroupState, GroupUpdate, PlayQueueUpdate, SyncPlayCommand } from '../jellyfin/types';
import { TimeSync } from './timesync';

/** Quello che il manager chiede al player. Implementato dalla schermata player. */
export interface SyncPlayer {
  currentTime(): number; // secondi
  isPlaying(): boolean;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setRate(rate: number): void;
  /** Risolve quando il player ha di nuovo dati pronti dopo un seek/caricamento. */
  waitReady(timeoutMs: number): Promise<void>;
  /** Il gruppo ha fermato la riproduzione: chiudi il player. */
  stop(): void;
}

export interface CurrentGroupItem {
  itemId: string;
  playlistItemId: string;
  startTicks: number;
  index: number;
  total: number;
  /** Incrementa a ogni cambio: il player ricarica quando cambia. */
  seq: number;
}

export interface SyncPlaySnapshot {
  group: GroupInfo | null;
  state: GroupState | null;
  current: CurrentGroupItem | null;
  following: boolean;
  syncing: string | null; // es. "×1.04" mentre corregge la deriva
  diffMs: number;
  /** true quando diffMs è una misura in corso (si sta riproducendo in gruppo). */
  measuring: boolean;
}

type Notice = { text: string; kind: 'info' | 'error' };

// Soglie (ms). Partono da quelle del client web ufficiale, ma più dolci: provate con due
// player simulati contro un server vero, ×2 o ×0.2 si sentono; ±20% di velocità no.
const MIN_DELAY_SPEED = 60; // sotto: già in sync
const MAX_DELAY_SPEED = 1500; // sopra: salto diretto invece di accelerare
const MAX_RATE_DELTA = 0.2; // velocità fra ×0.8 e ×1.2
const MIN_SPEED_DURATION = 1000;
const MIN_DELAY_SKIP = 400; // allo sblocco: scarto oltre cui si fa seek prima di partire
const SYNC_CHECK_MS = 1500; // ogni quanto si misura la deriva
const SYNC_AFTER_COMMAND_MS = 1500; // dopo un comando si lascia assestare il player

interface ParsedCommand extends SyncPlayCommand {
  whenMs: number; // ora server in ms
  emittedMs: number;
}

/**
 * Logica SyncPlay lato client: traduce gli aggiornamenti del server in azioni sul player,
 * e le azioni dell'utente in richieste al server. Il server Jellyfin è l'unica fonte di verità:
 * play/pausa/seek in gruppo NON toccano il player locale, si chiede al server e si esegue il
 * comando che torna indietro (per tutti nello stesso istante).
 */
export class SyncPlayManager {
  readonly time: TimeSync;
  private player: SyncPlayer | null = null;
  private listeners = new Set<() => void>();
  private noticeListeners = new Set<(n: Notice) => void>();
  private intentListeners = new Set<(c: CurrentGroupItem) => void>();
  private unsubSocket: (() => void) | null = null;

  private queue: PlayQueueUpdate | null = null;
  private queueUpdatedMs = 0;
  private lastCommand: ParsedCommand | null = null;
  private scheduled: ReturnType<typeof setTimeout> | null = null;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private syncEnabled = false;
  private lastSyncCheck = 0;
  private buffering = false;
  private seq = 0;
  /**
   * Dopo un riavvio dell'app la sessione sul server potrebbe essere rimasta in un gruppo
   * di cui non sappiamo più nulla: ne usciamo. Le azioni di gruppo aspettano questa uscita,
   * altrimenti un invito aperto a freddo entrerebbe e verrebbe subito buttato fuori.
   */
  private startup: Promise<void> | null = null;

  private snap: SyncPlaySnapshot = {
    group: null,
    state: null,
    current: null,
    following: false,
    syncing: null,
    diffMs: 0,
    measuring: false,
  };

  constructor(
    private client: JellyfinClient,
    socket: JellyfinSocket,
  ) {
    this.time = new TimeSync(client);
    this.time.onMeasured = (ping) => {
      if (this.snap.group) client.syncPlayPing(ping);
    };
    this.unsubSocket = socket.on(this.onSocket);
  }

  /** Uscita iniziale da gruppi orfani: una volta sola, chiunque arrivi prima (avvio o invito). */
  start() {
    if (!this.startup) this.startup = this.client.syncPlayLeave().catch(() => {});
    return this.startup;
  }

  dispose() {
    this.unsubSocket?.();
    this.clearScheduled();
    this.time.stop();
    this.listeners.clear();
  }

  // ── stato osservabile (useSyncExternalStore) ──

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.snap;

  private set(patch: Partial<SyncPlaySnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  onNotice(fn: (n: Notice) => void) {
    this.noticeListeners.add(fn);
    return () => {
      this.noticeListeners.delete(fn);
    };
  }

  /** Il gruppo vuole che questo dispositivo riproduca qualcosa (serve aprire il player). */
  onPlayIntent(fn: (c: CurrentGroupItem) => void) {
    this.intentListeners.add(fn);
    return () => {
      this.intentListeners.delete(fn);
    };
  }

  private notice(text: string, kind: Notice['kind'] = 'info') {
    this.noticeListeners.forEach((fn) => fn({ text, kind }));
  }

  get inGroup() {
    return !!this.snap.group;
  }

  // ── azioni utente sul gruppo ──

  async create(name: string) {
    await this.start();
    await this.client.syncPlayNew(name);
  }

  async join(groupId: string) {
    await this.start();
    await this.client.syncPlayJoin(groupId);
  }

  async leave() {
    try {
      await this.client.syncPlayLeave();
    } finally {
      this.resetGroup();
    }
  }

  /** Avvia qualcosa per tutto il gruppo. */
  async playInGroup(itemIds: string[], index = 0, startTicks = 0) {
    this.set({ following: true });
    await this.client.syncPlaySetIgnoreWait(false);
    await this.client.syncPlaySetNewQueue(itemIds, index, startTicks);
  }

  requestPause() {
    return this.client.syncPlayPause();
  }
  requestUnpause() {
    return this.client.syncPlayUnpause();
  }
  requestSeek(seconds: number) {
    return this.client.syncPlaySeek(secondsToTicks(seconds));
  }
  requestNext() {
    const id = this.snap.current?.playlistItemId;
    if (id) return this.client.syncPlayNextItem(id);
  }
  requestPrevious() {
    const id = this.snap.current?.playlistItemId;
    if (id) return this.client.syncPlayPreviousItem(id);
  }

  /** Riapre la riproduzione del gruppo su questo dispositivo dopo averla chiusa. */
  async rejoinPlayback() {
    if (!this.snap.group || !this.queue) return;
    this.set({ following: true });
    await this.client.syncPlaySetIgnoreWait(false);
    this.emitCurrent(true);
  }

  // ── aggancio del player ──

  attachPlayer(p: SyncPlayer) {
    this.player = p;
    if (!this.snap.following) {
      this.set({ following: true });
      this.client.syncPlaySetIgnoreWait(false);
    }
  }

  /** L'utente ha chiuso il player: il gruppo non deve più aspettarci. */
  detachPlayer(p: SyncPlayer) {
    if (this.player !== p) return;
    this.player = null;
    this.clearScheduled();
    if (this.snap.group && this.snap.following) {
      this.set({ following: false });
      this.client.syncPlaySetIgnoreWait(true);
    }
  }

  /** Stima della posizione del gruppo adesso (per partire già allineati). */
  estimatedStartTicks(): number {
    const cmd = this.lastCommand;
    const now = this.time.serverNow().getTime();
    if (cmd && cmd.emittedMs >= this.queueUpdatedMs && cmd.PlaylistItemId === this.snap.current?.playlistItemId) {
      const base = cmd.PositionTicks ?? 0;
      return cmd.Command === 'Unpause' ? base + (now - cmd.whenMs) * 10_000 : base;
    }
    if (this.queue) {
      return this.queue.IsPlaying
        ? this.queue.StartPositionTicks + (now - this.queueUpdatedMs) * 10_000
        : this.queue.StartPositionTicks;
    }
    return 0;
  }

  /** Il player ha caricato l'elemento del gruppo: pausa e "pronto" al server. */
  async onPlayerLoaded() {
    const p = this.player;
    if (!p || !this.snap.current) return;
    p.pause();
    this.buffering = false;
    await this.sendReady(false);
  }

  /** Il player si è bloccato a caricare (rete lenta). */
  onBufferingStart() {
    if (!this.player || this.buffering || !this.snap.current) return;
    this.buffering = true;
    this.client
      .syncPlayBuffering(this.stateBody(this.player.isPlaying()))
      .catch(() => {});
  }

  onBufferingEnd() {
    if (!this.player || !this.buffering) return;
    this.buffering = false;
    this.sendReady(this.player.isPlaying());
  }

  /** Cambio audio/sottotitoli: si ricarica lo stream, il gruppo aspetta. */
  onLocalReload() {
    this.buffering = false;
    this.onBufferingStart();
  }

  onEnded() {
    this.requestNext()?.catch(() => {});
  }

  /** Chiamato dal player a ogni aggiornamento del tempo: correzione della deriva. */
  onTimeUpdate(currentSec: number) {
    const cmd = this.lastCommand;
    const p = this.player;
    if (!p || !cmd || cmd.Command !== 'Unpause' || this.buffering) return;
    if (cmd.PlaylistItemId !== this.snap.current?.playlistItemId) return;

    const nowServer = this.time.serverNow().getTime();
    const serverPosMs = ticksToSeconds(cmd.PositionTicks) * 1000 + (nowServer - cmd.whenMs);
    const diff = serverPosMs - currentSec * 1000; // >0: siamo indietro
    const now = Date.now();
    if (now - this.lastSyncCheck < SYNC_CHECK_MS) return;
    this.lastSyncCheck = now;
    if (!this.snap.measuring || Math.abs(diff - this.snap.diffMs) > 5) this.set({ diffMs: Math.round(diff), measuring: true });
    if (!this.syncEnabled) return;

    const abs = Math.abs(diff);
    if (abs >= MIN_DELAY_SPEED && abs < MAX_DELAY_SPEED) {
      // Recupera `diff` in `duration` ms senza uscire da ×(1±MAX_RATE_DELTA).
      const duration = Math.max(MIN_SPEED_DURATION, abs / MAX_RATE_DELTA);
      const speed = 1 + diff / duration;
      p.setRate(speed);
      this.syncEnabled = false;
      this.set({ syncing: `×${speed.toFixed(2)}` });
      this.syncTimer = setTimeout(() => {
        this.player?.setRate(1);
        this.syncEnabled = true;
        this.set({ syncing: null });
      }, duration);
    } else if (abs >= MAX_DELAY_SPEED) {
      p.seek(serverPosMs / 1000);
      this.syncEnabled = false;
      this.set({ syncing: 'salto' });
      this.syncTimer = setTimeout(() => {
        this.syncEnabled = true;
        this.set({ syncing: null });
      }, SYNC_AFTER_COMMAND_MS);
    }
  }

  // ── messaggi dal server ──

  private onSocket = (msg: SocketMessage) => {
    if (msg.MessageType === 'SyncPlayGroupUpdate') this.onGroupUpdate(msg.Data as GroupUpdate);
    else if (msg.MessageType === 'SyncPlayCommand') this.onCommand(msg.Data as SyncPlayCommand);
  };

  private onGroupUpdate(u: GroupUpdate) {
    switch (u.Type) {
      case 'GroupJoined': {
        const g = u.Data as GroupInfo;
        this.time.start();
        this.time.resync();
        this.set({ group: g, state: g.State });
        this.notice(t('syncplay.joined', { name: g.GroupName }));
        break;
      }
      case 'UserJoined': {
        const g = this.snap.group;
        // Lo stesso utente può essere nel gruppo da due dispositivi: si aggiunge, non si deduplica.
        if (g) this.set({ group: { ...g, Participants: [...(g.Participants ?? []), u.Data] } });
        this.notice(t('syncplay.userJoined', { name: u.Data }));
        break;
      }
      case 'UserLeft': {
        const g = this.snap.group;
        if (g) {
          const parts = [...(g.Participants ?? [])];
          const i = parts.indexOf(u.Data);
          if (i >= 0) parts.splice(i, 1);
          this.set({ group: { ...g, Participants: parts } });
        }
        this.notice(t('syncplay.userLeft', { name: u.Data }));
        break;
      }
      case 'GroupLeft':
      case 'NotInGroup':
        if (this.snap.group) this.notice(t('syncplay.left'));
        this.resetGroup();
        break;
      case 'StateUpdate':
        this.set({ state: u.Data?.State ?? null });
        break;
      case 'PlayQueue':
        this.onPlayQueue(u.Data as PlayQueueUpdate);
        break;
      case 'GroupDoesNotExist':
        this.notice(t('syncplay.notExist'), 'error');
        break;
      case 'CreateGroupDenied':
        this.notice(t('syncplay.createDenied'), 'error');
        break;
      case 'JoinGroupDenied':
        this.notice(t('syncplay.joinDenied'), 'error');
        break;
      case 'LibraryAccessDenied':
        this.notice(t('syncplay.libraryDenied'), 'error');
        break;
    }
  }

  private onPlayQueue(q: PlayQueueUpdate) {
    const updated = parseServerDate(q.LastUpdate);
    if (this.queue && updated < this.queueUpdatedMs) return; // aggiornamento vecchio
    const prevId = this.snap.current?.playlistItemId;
    this.queue = q;
    this.queueUpdatedMs = updated;

    const item = q.Playlist?.[q.PlayingItemIndex];
    if (!item) {
      this.set({ current: null });
      return;
    }
    const changed = item.PlaylistItemId !== prevId;
    const restart = q.Reason === 'NewPlaylist' || q.Reason === 'SetCurrentItem' || q.Reason === 'NextItem' || q.Reason === 'PreviousItem';
    if (q.Reason === 'NewPlaylist' && !this.snap.following) {
      // Qualcuno ha avviato un nuovo contenuto: chi è nel gruppo lo segue.
      this.set({ following: true });
      this.client.syncPlaySetIgnoreWait(false);
    }
    if (changed || restart) {
      this.clearScheduled();
      this.lastCommand = null;
      this.emitCurrent(true);
    } else {
      // Riordino/aggiunte in coda: aggiorna solo indice e totale.
      const c = this.snap.current;
      if (c) this.set({ current: { ...c, index: q.PlayingItemIndex, total: q.Playlist.length } });
    }
  }

  private emitCurrent(bump: boolean) {
    const q = this.queue;
    const item = q?.Playlist?.[q.PlayingItemIndex];
    if (!q || !item) return;
    if (bump) this.seq++;
    const current: CurrentGroupItem = {
      itemId: item.ItemId,
      playlistItemId: item.PlaylistItemId,
      startTicks: q.StartPositionTicks,
      index: q.PlayingItemIndex,
      total: q.Playlist.length,
      seq: this.seq,
    };
    this.set({ current });
    if (this.snap.following) this.intentListeners.forEach((fn) => fn(current));
  }

  private onCommand(raw: SyncPlayCommand) {
    const cmd: ParsedCommand = {
      ...raw,
      whenMs: parseServerDate(raw.When),
      emittedMs: parseServerDate(raw.EmittedAt),
    };
    const last = this.lastCommand;
    const p = this.player;
    if (
      last &&
      last.whenMs === cmd.whenMs &&
      last.PositionTicks === cmd.PositionTicks &&
      last.Command === cmd.Command &&
      last.PlaylistItemId === cmd.PlaylistItemId
    ) {
      // Duplicato: se il momento è passato e lo stato non torna, riallinea.
      if (!p || this.localMs(cmd) > Date.now()) return;
      if (cmd.Command === 'Unpause' && !p.isPlaying()) this.scheduleUnpause(cmd);
      else if (cmd.Command === 'Pause' && p.isPlaying()) this.schedulePause(cmd);
      return;
    }
    this.lastCommand = cmd;
    if (!p) return;
    if (cmd.PlaylistItemId !== this.snap.current?.playlistItemId) return;
    switch (cmd.Command) {
      case 'Unpause':
        this.scheduleUnpause(cmd);
        break;
      case 'Pause':
        this.schedulePause(cmd);
        break;
      case 'Seek':
        this.scheduleSeek(cmd);
        break;
      case 'Stop':
        this.scheduleAt(cmd, () => this.player?.stop());
        break;
    }
  }

  private localMs(cmd: ParsedCommand) {
    return cmd.whenMs - this.time.offset;
  }

  private clearScheduled() {
    if (this.scheduled) clearTimeout(this.scheduled);
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.scheduled = null;
    this.syncTimer = null;
    this.syncEnabled = false;
    this.player?.setRate(1);
    if (this.snap.syncing) this.set({ syncing: null });
  }

  private scheduleAt(cmd: ParsedCommand, fn: () => void) {
    this.clearScheduled();
    const delay = this.localMs(cmd) - Date.now();
    if (delay > 0) this.scheduled = setTimeout(fn, delay);
    else fn();
  }

  private scheduleUnpause(cmd: ParsedCommand) {
    const p = this.player;
    if (!p) return;
    this.clearScheduled();
    const target = ticksToSeconds(cmd.PositionTicks);
    const delay = this.localMs(cmd) - Date.now();
    const enableSync = () => {
      this.syncTimer = setTimeout(() => {
        this.syncEnabled = true;
      }, SYNC_AFTER_COMMAND_MS);
    };
    if (delay > 0) {
      // Da fermi riallinearsi costa poco: meglio partire esatti che correggere dopo.
      const tolerance = p.isPlaying() ? MIN_DELAY_SKIP : 100;
      if (Math.abs(p.currentTime() - target) * 1000 > tolerance) p.seek(target);
      this.scheduled = setTimeout(() => {
        this.player?.play();
        enableSync();
      }, delay);
    } else {
      const serverPos = target + -delay / 1000;
      if (Math.abs(p.currentTime() - serverPos) * 1000 > MIN_DELAY_SKIP) p.seek(serverPos);
      p.play();
      enableSync();
    }
  }

  private schedulePause(cmd: ParsedCommand) {
    if (this.snap.measuring) this.set({ measuring: false });
    this.scheduleAt(cmd, () => {
      const p = this.player;
      if (!p) return;
      p.pause();
      p.seek(ticksToSeconds(cmd.PositionTicks));
    });
  }

  private scheduleSeek(cmd: ParsedCommand) {
    if (this.snap.measuring) this.set({ measuring: false });
    this.scheduleAt(cmd, async () => {
      const p = this.player;
      if (!p) return;
      p.pause();
      p.seek(ticksToSeconds(cmd.PositionTicks));
      try {
        await p.waitReady(8000);
      } catch {}
      if (this.player === p) this.sendReady(false);
    });
  }

  private stateBody(isPlaying: boolean) {
    const p = this.player;
    return {
      When: this.time.serverNow().toISOString(),
      PositionTicks: secondsToTicks(p ? p.currentTime() : 0),
      IsPlaying: isPlaying,
      PlaylistItemId: this.snap.current?.playlistItemId ?? '',
    };
  }

  private sendReady(isPlaying: boolean) {
    if (!this.snap.current) return Promise.resolve();
    return this.client.syncPlayReady(this.stateBody(isPlaying)).catch(() => {});
  }

  private resetGroup() {
    this.clearScheduled();
    this.queue = null;
    this.lastCommand = null;
    this.time.stop();
    this.set({ group: null, state: null, current: null, following: false, syncing: null, diffMs: 0, measuring: false });
  }
}
