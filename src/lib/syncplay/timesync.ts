import type { JellyfinClient } from '../jellyfin/client';
import { parseServerDate } from '../jellyfin/dates';

interface Sample {
  offset: number; // ms: serverTime - localTime
  ping: number; // ms: andata e ritorno al netto del tempo di elaborazione del server
}

/**
 * Stima dello scarto fra orologio locale e orologio del server, stile NTP,
 * su /GetUtcTime. Tiene gli ultimi campioni e usa quello col ping più basso
 * (il più affidabile). I comandi SyncPlay arrivano con un "When" in ora server:
 * senza questo scarto due telefoni partirebbero sfasati di quanto sono sfasati i loro orologi.
 */
export class TimeSync {
  private samples: Sample[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private burst = 0;
  private running = false;
  /** Chiamato dopo ogni misura (il manager lo usa per mandare il ping al gruppo). */
  onMeasured?: (ping: number) => void;

  constructor(private client: JellyfinClient) {}

  get offset() {
    const best = this.best();
    return best ? best.offset : 0;
  }

  get ping() {
    const best = this.best();
    return best ? best.ping : 0;
  }

  get ready() {
    return this.samples.length > 0;
  }

  private best() {
    if (!this.samples.length) return null;
    return this.samples.reduce((a, b) => (b.ping < a.ping ? b : a));
  }

  serverNow() {
    return new Date(Date.now() + this.offset);
  }

  /** Converte un istante del server in timestamp locale (ms). */
  toLocal(serverIso: string) {
    return parseServerDate(serverIso) - this.offset;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.burst = 0;
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Raffica di misure ravvicinate (all'ingresso in un gruppo), poi una al minuto. */
  resync() {
    this.burst = 0;
    if (this.running) {
      if (this.timer) clearTimeout(this.timer);
      this.loop();
    }
  }

  private async loop() {
    if (!this.running) return;
    await this.measure();
    this.burst++;
    const delay = this.burst < 8 ? 600 : 60_000;
    this.timer = setTimeout(() => this.loop(), delay);
  }

  async measure() {
    const t0 = Date.now();
    try {
      const r = await this.client.utcTime();
      const t3 = Date.now();
      const t1 = parseServerDate(r.RequestReceptionTime);
      const t2 = parseServerDate(r.ResponseTransmissionTime);
      if (!isFinite(t1) || !isFinite(t2)) return;
      const offset = (t1 - t0 + (t2 - t3)) / 2;
      const ping = t3 - t0 - (t2 - t1);
      this.samples.push({ offset, ping: Math.max(0, ping) });
      if (this.samples.length > 8) this.samples.shift();
      this.onMeasured?.(this.ping);
    } catch {}
  }
}
