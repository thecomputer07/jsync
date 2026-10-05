import { AppState, type AppStateStatus } from 'react-native';

import type { JellyfinClient } from './client';

export interface SocketMessage {
  MessageType: string;
  Data?: any;
  MessageId?: string;
}

type Listener = (msg: SocketMessage) => void;
type StatusListener = (connected: boolean) => void;

/**
 * WebSocket /socket di Jellyfin. È il canale da cui arrivano i comandi SyncPlay:
 * senza socket aperto il server non considera la sessione "in ascolto" del gruppo.
 * Si riconnette da solo (backoff) e risponde al ForceKeepAlive del server.
 */
export class JellyfinSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<StatusListener>();
  private keepAlive: ReturnType<typeof setInterval> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private closed = false;
  private appSub: { remove(): void } | null = null;
  connected = false;

  constructor(private client: JellyfinClient) {}

  start() {
    this.closed = false;
    this.open();
    this.appSub = AppState.addEventListener('change', this.onAppState);
  }

  stop() {
    this.closed = true;
    this.appSub?.remove();
    this.appSub = null;
    this.clearTimers();
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
    this.setConnected(false);
  }

  on(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  onStatus(fn: StatusListener) {
    this.statusListeners.add(fn);
    return () => {
      this.statusListeners.delete(fn);
    };
  }

  send(MessageType: string, Data?: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ MessageType, Data }));
    }
  }

  private onAppState = (s: AppStateStatus) => {
    // Al ritorno in primo piano il socket può essere morto senza che onclose sia scattato.
    if (s === 'active' && !this.closed && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
      this.attempts = 0;
      this.reopenSoon(100);
    }
  };

  private setConnected(v: boolean) {
    if (this.connected === v) return;
    this.connected = v;
    this.statusListeners.forEach((fn) => fn(v));
  }

  private clearTimers() {
    if (this.keepAlive) clearInterval(this.keepAlive);
    if (this.retry) clearTimeout(this.retry);
    this.keepAlive = null;
    this.retry = null;
  }

  private open() {
    if (this.closed) return;
    this.clearTimers();
    try {
      this.ws?.close();
    } catch {}
    const ws = new WebSocket(this.client.socketUrl());
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.attempts = 0;
      this.setConnected(true);
      // Valore di sicurezza finché il server non manda il suo ForceKeepAlive.
      this.startKeepAlive(30);
      this.client.reportCapabilities().catch(() => {});
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      let msg: SocketMessage;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.MessageType === 'ForceKeepAlive') {
        this.startKeepAlive(Number(msg.Data) || 60);
        this.send('KeepAlive');
        return;
      }
      if (msg.MessageType === 'KeepAlive') return;
      this.listeners.forEach((fn) => {
        try {
          fn(msg);
        } catch (e) {
          console.warn('[socket] listener', e);
        }
      });
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.setConnected(false);
      this.reopenSoon();
    };
  }

  private startKeepAlive(timeoutSec: number) {
    if (this.keepAlive) clearInterval(this.keepAlive);
    this.keepAlive = setInterval(() => this.send('KeepAlive'), Math.max(5, timeoutSec / 2) * 1000);
  }

  private reopenSoon(delay?: number) {
    if (this.closed) return;
    if (this.retry) clearTimeout(this.retry);
    const d = delay ?? Math.min(30_000, 1000 * 2 ** this.attempts++);
    this.retry = setTimeout(() => this.open(), d);
  }
}
