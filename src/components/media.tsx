import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { memo } from 'react';
import { FlatList, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { itemSubtitle, ticksToSeconds, type JellyfinClient } from '@/lib/jellyfin/client';
import type { BaseItem } from '@/lib/jellyfin/types';
import { useClient } from '@/state/session';
import { colors, font, radius, space, tv } from '@/theme';
import { Focusable } from './focusable';
import { ProgressBar, SectionTitle } from './ui';

/** Immagine verticale (locandina) per film/serie, con ripieghi su serie/stagione per gli episodi. */
export function posterUrl(c: JellyfinClient, item: BaseItem, width = 300) {
  if (item.Type === 'Episode' && item.SeriesId && item.SeriesPrimaryImageTag)
    return c.imageUrl(item.SeriesId, 'Primary', { tag: item.SeriesPrimaryImageTag, width });
  if (item.ImageTags?.Primary) return c.imageUrl(item.Id, 'Primary', { tag: item.ImageTags.Primary, width });
  if (item.SeriesId) return c.imageUrl(item.SeriesId, 'Primary', { width });
  return c.imageUrl(item.Id, 'Primary', { width });
}

/** Immagine orizzontale: fotogramma dell'episodio, thumb o sfondo. */
export function landscapeUrl(c: JellyfinClient, item: BaseItem, width = 600) {
  if (item.Type === 'Episode' && item.ImageTags?.Primary)
    return c.imageUrl(item.Id, 'Primary', { tag: item.ImageTags.Primary, width });
  if (item.ImageTags?.Thumb) return c.imageUrl(item.Id, 'Thumb', { tag: item.ImageTags.Thumb, width });
  if (item.ParentThumbItemId) return c.imageUrl(item.ParentThumbItemId, 'Thumb', { tag: item.ParentThumbImageTag, width });
  return backdropUrl(c, item, width);
}

export function backdropUrl(c: JellyfinClient, item: BaseItem, width = 1280) {
  if (item.BackdropImageTags?.length) return c.imageUrl(item.Id, 'Backdrop', { tag: item.BackdropImageTags[0], width });
  if (item.ParentBackdropItemId)
    return c.imageUrl(item.ParentBackdropItemId, 'Backdrop', { tag: item.ParentBackdropImageTags?.[0], width });
  if (item.SeriesId) return c.imageUrl(item.SeriesId, 'Backdrop', { width });
  return c.imageUrl(item.Id, 'Primary', { width });
}

export function logoUrl(c: JellyfinClient, item: BaseItem) {
  if (item.ImageTags?.Logo) return c.imageUrl(item.Id, 'Logo', { tag: item.ImageTags.Logo, width: 600 });
  if (item.ParentLogoItemId) return c.imageUrl(item.ParentLogoItemId, 'Logo', { tag: item.ParentLogoImageTag, width: 600 });
  return undefined;
}

export function openItem(item: BaseItem) {
  if (item.Type === 'Episode' || item.Type === 'Movie' || item.Type === 'Video') {
    router.push({ pathname: '/item/[id]', params: { id: item.Id } });
  } else if (item.Type === 'Season' && item.SeriesId) {
    router.push({ pathname: '/item/[id]', params: { id: item.SeriesId, season: item.Id } });
  } else if (item.Type === 'BoxSet' || item.Type === 'Folder' || item.Type === 'CollectionFolder') {
    router.push({ pathname: '/library/[id]', params: { id: item.Id, name: item.Name } });
  } else {
    router.push({ pathname: '/item/[id]', params: { id: item.Id } });
  }
}

export const PosterCard = memo(function PosterCard({
  item,
  width,
  onPress,
}: {
  item: BaseItem;
  width: number;
  onPress?: () => void;
}) {
  const c = useClient();
  const unplayed = item.UserData?.UnplayedItemCount;
  return (
    <Focusable onPress={onPress ?? (() => openItem(item))} style={{ width }}>
      <View style={[styles.poster, { width, height: width * 1.5 }]}>
        <Image source={posterUrl(c, item, Math.round(width * 2))} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} recyclingKey={item.Id} />
        {item.UserData?.Played ? (
          <View style={styles.badge}>
            <Ionicons name="checkmark" size={12} color="#fff" />
          </View>
        ) : unplayed ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unplayed}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>
        {item.Type === 'Episode' ? item.SeriesName : item.Name}
      </Text>
    </Focusable>
  );
});

export const LandscapeCard = memo(function LandscapeCard({
  item,
  width,
  onPress,
}: {
  item: BaseItem;
  width: number;
  onPress?: () => void;
}) {
  const c = useClient();
  const pct =
    item.UserData?.PlayedPercentage ??
    (item.RunTimeTicks && item.UserData?.PlaybackPositionTicks
      ? (item.UserData.PlaybackPositionTicks / item.RunTimeTicks) * 100
      : 0);
  const remaining = item.RunTimeTicks
    ? Math.max(0, Math.round((ticksToSeconds(item.RunTimeTicks) - ticksToSeconds(item.UserData?.PlaybackPositionTicks)) / 60))
    : 0;
  return (
    <Focusable onPress={onPress ?? (() => openItem(item))} style={{ width }}>
      <View style={[styles.poster, { width, height: (width * 9) / 16 }]}>
        <Image source={landscapeUrl(c, item, Math.round(width * 2))} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} recyclingKey={item.Id} />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={styles.cardShade} />
        <View style={styles.playDot}>
          <Ionicons name="play" size={tv ? 22 : 16} color="#fff" />
        </View>
        {pct > 0 ? <ProgressBar value={pct} style={styles.cardProgress} /> : null}
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>
        {item.Type === 'Episode' ? item.SeriesName : item.Name}
      </Text>
      <Text style={styles.cardSub} numberOfLines={1}>
        {item.Type === 'Episode'
          ? `${itemSubtitle(item).split(' · ').pop()} · ${item.Name}`
          : remaining && pct > 0
            ? `Mancano ${remaining} min`
            : itemSubtitle(item)}
      </Text>
    </Focusable>
  );
});

export function MediaRow({
  title,
  items,
  kind = 'poster',
}: {
  title: string;
  items: BaseItem[] | undefined;
  kind?: 'poster' | 'landscape';
}) {
  const { width } = useWindowDimensions();
  // Jellyfin a volte restituisce lo stesso elemento due volte (es. "Aggiunti di recente"
  // raggruppa gli episodi per serie): mostriamo ogni titolo una volta sola.
  const unique = items?.filter((it, i, arr) => arr.findIndex((x) => x.Id === it.Id) === i);
  if (!unique?.length) return null;
  const cardW =
    kind === 'poster'
      ? tv
        ? Math.round(width / 7.5)
        : Math.min(150, Math.round(width / 3.4))
      : tv
        ? Math.round(width / 4.4)
        : Math.min(300, Math.round(width / 1.7));
  return (
    <View style={{ marginBottom: space.xl }}>
      <SectionTitle>{title}</SectionTitle>
      <FlatList
        horizontal
        data={unique}
        keyExtractor={(i) => i.Id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md, paddingVertical: tv ? space.md : 0 }}
        renderItem={({ item }) =>
          kind === 'poster' ? <PosterCard item={item} width={cardW} /> : <LandscapeCard item={item} width={cardW} />
        }
        initialNumToRender={6}
        windowSize={5}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  poster: { borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surface },
  cardTitle: { color: colors.text, fontSize: font.sm, fontWeight: '600', marginTop: space.xs },
  cardSub: { color: colors.textDim, fontSize: font.xs },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  cardShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
  cardProgress: { position: 'absolute', left: 8, right: 8, bottom: 8 },
  playDot: {
    position: 'absolute',
    left: 10,
    bottom: 16,
    width: tv ? 40 : 30,
    height: tv ? 40 : 30,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
