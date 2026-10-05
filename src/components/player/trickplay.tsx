import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { formatDuration, type JellyfinClient } from '@/lib/jellyfin/client';
import type { TrickplayInfo } from '@/lib/jellyfin/types';
import { colors, font, radius } from '@/theme';

/**
 * Anteprima del fotogramma mentre si trascina la barra.
 * Jellyfin genera "tasselli": immagini con TileWidth×TileHeight anteprime ciascuna,
 * una ogni `Interval` ms. Si mostra il tassello giusto spostato per far vedere solo il riquadro.
 */
export function TrickplayThumb({
  client,
  tp,
  seconds,
  width = 176,
}: {
  client: JellyfinClient;
  tp: TrickplayInfo | null;
  seconds: number;
  width?: number;
}) {
  const height = tp ? (width * tp.Height) / tp.Width : (width * 9) / 16;
  let content: React.ReactNode = null;
  if (tp && tp.ThumbnailCount > 0) {
    const idx = Math.min(tp.ThumbnailCount - 1, Math.max(0, Math.floor((seconds * 1000) / tp.Interval)));
    const perTile = tp.TileWidth * tp.TileHeight;
    const tile = Math.floor(idx / perTile);
    const inTile = idx % perTile;
    const col = inTile % tp.TileWidth;
    const row = Math.floor(inTile / tp.TileWidth);
    content = (
      <Image
        source={client.trickplayTileUrl(tp, tile)}
        style={{
          position: 'absolute',
          width: width * tp.TileWidth,
          height: height * tp.TileHeight,
          left: -col * width,
          top: -row * height,
        }}
        contentFit="fill"
        cachePolicy="memory-disk"
        recyclingKey={`tile-${tile}`}
      />
    );
  }
  return (
    <View style={styles.wrap}>
      {tp ? <View style={[styles.frame, { width, height }]}>{content}</View> : null}
      <Text style={styles.time}>{formatDuration(seconds)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 4 },
  frame: {
    overflow: 'hidden',
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: colors.surface,
  },
  time: {
    color: '#fff',
    fontSize: font.sm,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
});
