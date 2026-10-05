import { Image } from 'expo-image';

import { tv } from '@/theme';

const ASPECT = 2.109; // larghezza/altezza del logotipo (assets/brand)

/** Logotipo JSync (marchio + scritta + "Sync your films"), versione per fondo scuro. */
export function Wordmark({ width = tv ? 340 : 220 }: { width?: number }) {
  return (
    <Image
      source={require('@/assets/images/wordmark.png')}
      style={{ width, height: width / ASPECT }}
      contentFit="contain"
      accessibilityLabel="JSync — Sync your films"
    />
  );
}
