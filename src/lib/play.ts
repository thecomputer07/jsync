import { router } from 'expo-router';

import type { JellyfinClient } from './jellyfin/client';
import type { BaseItem } from './jellyfin/types';
import type { SyncPlayManager } from './syncplay/manager';

/**
 * Avvia la riproduzione. In gruppo si imposta la coda sul server (che la manda a tutti):
 * per un episodio la coda sono gli episodi successivi della serie, così "prossimo episodio"
 * avanza per tutti insieme.
 */
export async function playItem(opts: {
  client: JellyfinClient;
  syncplay: SyncPlayManager | null;
  item: BaseItem;
  startTicks: number;
  inGroup: boolean;
}) {
  const { client, syncplay, item, startTicks, inGroup } = opts;
  if (inGroup && syncplay?.inGroup) {
    let ids = [item.Id];
    if (item.Type === 'Episode' && item.SeriesId) {
      try {
        const eps = await client.episodes(item.SeriesId, undefined, item.Id, 60);
        const list = eps.Items.map((e) => e.Id);
        if (list[0] === item.Id) ids = list;
      } catch {}
    }
    await syncplay.playInGroup(ids, 0, startTicks);
    return;
  }
  router.push({ pathname: '/player', params: { id: item.Id, start: String(startTicks) } });
}

/** Per una serie: l'episodio da cui ripartire (prossimo non visto, o il primo). */
export async function seriesEntryEpisode(client: JellyfinClient, seriesId: string): Promise<BaseItem | null> {
  const resume = await client
    .items({ parentId: seriesId, recursive: true, includeItemTypes: 'Episode', filters: 'IsResumable', sortBy: 'DatePlayed', sortOrder: 'Descending', limit: 1 })
    .catch(() => null);
  if (resume?.Items?.[0]) return resume.Items[0];
  const next = await client.nextUp(1, seriesId).catch(() => null);
  if (next?.Items?.[0]) return next.Items[0];
  const first = await client.episodes(seriesId, undefined, undefined, 1).catch(() => null);
  return first?.Items?.[0] ?? null;
}
