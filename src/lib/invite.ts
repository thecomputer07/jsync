import { t } from '@/i18n';

/**
 * Invito a un gruppo. Nessun server di JSync in mezzo: il link contiene solo
 * l'indirizzo del server Jellyfin e l'id del gruppo SyncPlay. Chi lo apre entra
 * col proprio account di quel server.
 *
 * Link condiviso (cliccabile in WhatsApp, Telegram, Mail…), pagina statica su GitHub Pages:
 *   https://thecomputer07.github.io/jsync/j/#s=<server>&g=<gruppo>&n=<nome>
 * I dati stanno dopo il "#": il browser non li manda a nessun server, la pagina li passa all'app:
 *   jsync://join?s=<server>&g=<gruppo>&n=<nome>
 */
export const INVITE_WEB_BASE = 'https://thecomputer07.github.io/jsync/j/';
export const SITE_BASE = 'https://thecomputer07.github.io/jsync/';
export const PRIVACY_URL = `${SITE_BASE}privacy/`;
export const SOURCE_URL = 'https://github.com/thecomputer07/jsync';

export interface Invite {
  server: string;
  groupId: string;
  groupName?: string;
}

// Niente URLSearchParams: in React Native .get() non è implementato.
function params(inv: Invite) {
  const parts: [string, string][] = [['s', inv.server], ['g', inv.groupId]];
  if (inv.groupName) parts.push(['n', inv.groupName]);
  return parts.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

export function parseQuery(qs: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of qs.replace(/^[?#]/, '').split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    const k = i < 0 ? part : part.slice(0, i);
    const v = i < 0 ? '' : part.slice(i + 1);
    try {
      out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function buildInviteLink(inv: Invite) {
  return `${INVITE_WEB_BASE}#${params(inv)}`;
}

export function buildAppLink(inv: Invite) {
  return `jsync://join?${params(inv)}`;
}

export function buildInviteMessage(inv: Invite, from?: string) {
  return t('groups.inviteMsg', {
    who: from ? t('groups.inviteMsgFrom', { name: from }) : t('groups.inviteMsgYou'),
    group: inv.groupName ? t('groups.inviteMsgGroup', { name: inv.groupName }) : '',
    link: buildInviteLink(inv),
    server: inv.server,
  });
}

/** Accetta il link web, il link jsync:// (o il vecchio rave://), un testo che li contiene, o il QR. */
export function parseInvite(text: string): Invite | null {
  const web = text.match(/https?:\/\/[^\s]*\/j\/?#([^\s]+)/i);
  const app = text.match(/(?:jsync|rave):\/\/join\?([^\s]+)/i);
  const qs = web?.[1] ?? app?.[1];
  if (!qs) return null;
  const q = parseQuery(qs);
  const s = q.s ?? '';
  const g = q.g ?? '';
  if (!s || !g || !/^https?:\/\//i.test(s)) return null;
  return { server: s, groupId: g, groupName: q.n || undefined };
}
