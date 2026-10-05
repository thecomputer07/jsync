import * as Linking from 'expo-linking';

/**
 * Invito a un gruppo. Nessun server di JSync in mezzo: il link contiene solo
 * l'indirizzo del server Jellyfin e l'id del gruppo SyncPlay. Chi lo apre entra
 * col proprio account di quel server.
 *
 *   jsync://join?s=<url server>&g=<id gruppo>&n=<nome gruppo>
 */
export interface Invite {
  server: string;
  groupId: string;
  groupName?: string;
}

export function buildInviteLink(inv: Invite) {
  const q = new URLSearchParams({ s: inv.server, g: inv.groupId });
  if (inv.groupName) q.set('n', inv.groupName);
  return `jsync://join?${q.toString()}`;
}

export function buildInviteMessage(inv: Invite, from?: string) {
  const link = buildInviteLink(inv);
  return (
    `${from ? `${from} ti invita` : 'Sei invitato'} a guardare insieme su JSync` +
    (inv.groupName ? ` nel gruppo «${inv.groupName}»` : '') +
    `.\n\nApri il link con l'app JSync:\n${link}\n\n` +
    `Server Jellyfin: ${inv.server}\n(Serve un account su quel server.)`
  );
}

/** Accetta il link jsync:// (o il vecchio rave://), un testo che lo contiene, o il QR. */
export function parseInvite(text: string): Invite | null {
  const m = text.match(/(?:jsync|rave):\/\/join\?[^\s]+/i);
  if (!m) return null;
  try {
    const parsed = Linking.parse(m[0]);
    const s = String(parsed.queryParams?.s ?? '');
    const g = String(parsed.queryParams?.g ?? '');
    const n = parsed.queryParams?.n ? String(parsed.queryParams.n) : undefined;
    if (!s || !g) return null;
    return { server: s, groupId: g, groupName: n };
  } catch {
    return null;
  }
}
