/**
 * Jellyfin manda date .NET con 7 cifre decimali ("2026-10-05T08:23:49.1234567Z").
 * Non tutti i motori JS le accettano: le tronchiamo ai millisecondi prima del parse.
 */
export function parseServerDate(s: string | undefined | null): number {
  if (!s) return NaN;
  let v = s.trim().replace(/(\.\d{3})\d+/, '$1');
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(v)) v += 'Z';
  return Date.parse(v);
}
