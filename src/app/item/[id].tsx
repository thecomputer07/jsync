import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Focusable } from '@/components/focusable';
import { WIDE, backdropUrl, landscapeUrl, logoUrl } from '@/components/media';
import { toast } from '@/components/toast';
import { Button, ErrorView, Loading, ProgressBar } from '@/components/ui';
import { useT } from '@/i18n';
import { formatDuration, itemSubtitle, runtimeLabel, ticksToSeconds } from '@/lib/jellyfin/client';
import type { BaseItem } from '@/lib/jellyfin/types';
import { playItem, seriesEntryEpisode } from '@/lib/play';
import { useClient, useSession, useSyncPlayState } from '@/state/session';
import { colors, font, radius, space, tv } from '@/theme';

export default function ItemDetail() {
  const { id, season } = useLocalSearchParams<{ id: string; season?: string }>();
  const c = useClient();
  const { account, syncplay } = useSession();
  const sp = useSyncPlayState();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { t } = useT();
  const key = account?.id;
  // Su iPad/tablet il contenuto resta in una colonna centrata e leggibile.
  const wide = !tv && width >= WIDE;
  const bodyW = wide ? Math.min(900, width - space.xl * 2) : width;

  const item = useQuery({ queryKey: ['item', key, id], queryFn: () => c.item(id) });
  const isSeries = item.data?.Type === 'Series';
  const seasons = useQuery({
    queryKey: ['seasons', key, id],
    queryFn: () => c.seasons(id),
    enabled: isSeries,
  });
  const [pickedSeason, setSeasonId] = useState<string | undefined>(season);
  // Se non scelta: la stagione col primo episodio non visto.
  const seasonId =
    pickedSeason ?? (seasons.data?.Items.find((x) => !x.UserData?.Played) ?? seasons.data?.Items[0])?.Id;
  const episodes = useQuery({
    queryKey: ['episodes', key, id, seasonId],
    queryFn: () => c.episodes(id, seasonId),
    enabled: isSeries && !!seasonId,
  });
  const entry = useQuery({
    queryKey: ['entry', key, id],
    queryFn: () => seriesEntryEpisode(c, id),
    enabled: isSeries,
  });

  if (item.isLoading) return <Loading />;
  if (item.error || !item.data) return <ErrorView message={(item.error as Error)?.message ?? t('item.notFound')} onRetry={() => item.refetch()} />;

  const it = item.data;
  const playTarget: BaseItem | null | undefined = isSeries ? entry.data : it;
  const pos = playTarget?.UserData?.PlaybackPositionTicks ?? 0;
  const canResume = pos > 0 && !playTarget?.UserData?.Played;

  const play = async (target: BaseItem, startTicks: number, inGroup: boolean) => {
    try {
      await playItem({ client: c, syncplay, item: target, startTicks, inGroup });
    } catch (e: any) {
      toast(e?.message ?? t('item.cannotStart'), 'error');
    }
  };

  const togglePlayed = async () => {
    try {
      await c.setPlayed(it.Id, !it.UserData?.Played);
      qc.invalidateQueries({ queryKey: ['item', key, id] });
      qc.invalidateQueries({ queryKey: ['episodes', key, id] });
      qc.invalidateQueries({ queryKey: ['home'] });
    } catch (e: any) {
      toast(e?.message, 'error');
    }
  };

  const isFav = !!it.UserData?.IsFavorite;
  const toggleFavorite = async () => {
    try {
      await c.setFavorite(it.Id, !isFav);
      qc.invalidateQueries({ queryKey: ['item', key, id] });
      qc.invalidateQueries({ queryKey: ['home'] });
    } catch (e: any) {
      toast(e?.message, 'error');
    }
  };

  const heroH = tv ? height * 0.55 : wide ? height * 0.5 : Math.min(height * 0.5, width * 0.9);
  const logo = logoUrl(c, it);
  const playLabel = isSeries
    ? playTarget
      ? t(canResume ? 'item.resumeEp' : 'item.playEp', { s: playTarget.ParentIndexNumber ?? 1, e: playTarget.IndexNumber ?? 1 })
      : t('item.play')
    : canResume
      ? t('item.resumeFrom', { time: formatDuration(ticksToSeconds(pos)) })
      : t('item.play');

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: space.xxl * 2 }}>
      <View style={{ width, height: heroH }}>
        <Image source={backdropUrl(c, it, tv ? 1920 : 1280)} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        <LinearGradient colors={['rgba(7,7,10,0.5)', 'transparent', colors.bg]} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
        <Focusable onPress={() => router.back()} style={[styles.back, { top: insets.top + space.sm }]} zoom={false}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </Focusable>
      </View>

      <View style={[styles.body, tv && { paddingHorizontal: space.xxl * 2 }, wide && { width: bodyW, alignSelf: 'center', paddingHorizontal: 0 }]}>
        {logo && !tv ? (
          <Image source={logo} style={{ width: Math.min(bodyW * 0.6, 420), height: wide ? 110 : 80, alignSelf: 'flex-start' }} contentFit="contain" contentPosition="left" />
        ) : (
          <Text style={styles.title}>{it.Type === 'Episode' ? it.Name : it.Name}</Text>
        )}
        <Text style={styles.meta}>
          {[
            it.Type === 'Episode' ? itemSubtitle(it) : it.ProductionYear,
            it.OfficialRating,
            runtimeLabel(it.RunTimeTicks),
            it.CommunityRating ? `★ ${it.CommunityRating.toFixed(1)}` : null,
          ]
            .filter(Boolean)
            .join('  ·  ')}
        </Text>
        {it.Genres?.length ? <Text style={styles.genres}>{it.Genres.slice(0, 4).join(' · ')}</Text> : null}

        {!isSeries && canResume && it.RunTimeTicks ? (
          <ProgressBar value={(pos / it.RunTimeTicks) * 100} style={{ marginTop: space.sm }} />
        ) : null}

        <View style={[styles.actions, (tv || wide) && { flexDirection: 'row', flexWrap: 'wrap' }]}>
          <Button
            title={playLabel}
            variant="light"
            icon={<Ionicons name="play" size={18} color="#000" />}
            disabled={!playTarget}
            onPress={() => playTarget && play(playTarget, canResume ? pos : 0, false)}
            hasTVPreferredFocus={tv}
            style={tv ? { minWidth: 280 } : undefined}
          />
          {canResume ? (
            <Button
              title={t('item.fromStart')}
              variant="secondary"
              icon={<Ionicons name="refresh" size={18} color={colors.text} />}
              onPress={() => playTarget && play(playTarget, 0, false)}
              style={tv ? { minWidth: 220 } : undefined}
            />
          ) : null}
          <Button
            title={sp.group ? t('item.watchInGroup', { name: sp.group.GroupName }) : t('item.watchTogether')}
            icon={<Ionicons name="people" size={18} color={colors.text} />}
            disabled={!playTarget}
            onPress={() => {
              if (!playTarget) return;
              if (!sp.group) {
                toast(t('item.needGroup'));
                router.push('/groups');
                return;
              }
              play(playTarget, canResume ? pos : 0, true);
            }}
            style={tv ? { minWidth: 280 } : undefined}
          />
        </View>

        {it.Overview ? <Text style={styles.overview}>{it.Overview}</Text> : null}

        <View style={styles.inlineRow}>
          {!isSeries ? (
            <Focusable onPress={togglePlayed} style={styles.inline} zoom={false}>
              <Ionicons name={it.UserData?.Played ? 'checkmark-circle' : 'checkmark-circle-outline'} size={22} color={it.UserData?.Played ? colors.accent : colors.textDim} />
              <Text style={styles.inlineText}>{it.UserData?.Played ? t('item.watched') : t('item.markWatched')}</Text>
            </Focusable>
          ) : null}
          <Focusable onPress={toggleFavorite} style={styles.inline} zoom={false}>
            <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={22} color={isFav ? colors.accent2 : colors.textDim} />
            <Text style={styles.inlineText}>{isFav ? t('item.inMyList') : t('item.addToList')}</Text>
          </Focusable>
        </View>

        {it.Type === 'Episode' && it.SeriesId ? (
          <Focusable onPress={() => router.push({ pathname: '/item/[id]', params: { id: it.SeriesId!, season: it.SeasonId } })} style={styles.inline} zoom={false}>
            <Ionicons name="albums-outline" size={20} color={colors.textDim} />
            <Text style={styles.inlineText}>{t('item.allEpisodes', { name: it.SeriesName ?? '' })}</Text>
          </Focusable>
        ) : null}
      </View>

      {isSeries ? (
        <View style={[{ marginTop: space.lg }, wide && { width: bodyW, alignSelf: 'center' }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.seasons, wide && { paddingHorizontal: 0 }]}>
            {(seasons.data?.Items ?? []).map((s) => (
              <Focusable key={s.Id} onPress={() => setSeasonId(s.Id)} style={[styles.seasonChip, seasonId === s.Id && styles.seasonOn]}>
                <Text style={[styles.seasonText, seasonId === s.Id && { color: '#000' }]}>{s.Name}</Text>
              </Focusable>
            ))}
          </ScrollView>
          {episodes.isLoading ? (
            <View style={{ height: 120 }}>
              <Loading />
            </View>
          ) : (
            <View style={{ paddingHorizontal: tv ? space.xxl * 2 : wide ? 0 : space.lg, gap: space.lg, marginTop: space.lg }}>
              {(episodes.data?.Items ?? []).map((ep) => (
                <EpisodeRow key={ep.Id} ep={ep} onPress={() => router.push({ pathname: '/item/[id]', params: { id: ep.Id } })} />
              ))}
            </View>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

function EpisodeRow({ ep, onPress }: { ep: BaseItem; onPress: () => void }) {
  const c = useClient();
  const { width } = useWindowDimensions();
  const thumbW = tv ? 320 : Math.min(170, width * 0.4);
  const pct = ep.RunTimeTicks && ep.UserData?.PlaybackPositionTicks ? (ep.UserData.PlaybackPositionTicks / ep.RunTimeTicks) * 100 : 0;
  return (
    <Focusable onPress={onPress} style={styles.ep} zoom={false}>
      <View style={[styles.epThumb, { width: thumbW, height: (thumbW * 9) / 16 }]}>
        <Image source={landscapeUrl(c, ep, thumbW * 2)} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={ep.Id} />
        {ep.UserData?.Played ? (
          <View style={styles.epCheck}>
            <Ionicons name="checkmark" size={12} color="#fff" />
          </View>
        ) : null}
        {pct > 0 ? <ProgressBar value={pct} style={{ position: 'absolute', left: 6, right: 6, bottom: 6 }} /> : null}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.epTitle} numberOfLines={2}>
          {ep.IndexNumber != null ? `${ep.IndexNumber}. ` : ''}
          {ep.Name}
        </Text>
        <Text style={styles.epMeta}>{runtimeLabel(ep.RunTimeTicks)}</Text>
        {ep.Overview ? (
          <Text style={styles.epOverview} numberOfLines={tv ? 3 : 2}>
            {ep.Overview}
          </Text>
        ) : null}
      </View>
    </Focusable>
  );
}

const styles = StyleSheet.create({
  back: { position: 'absolute', left: space.md, padding: 6, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)' },
  body: { paddingHorizontal: space.lg, gap: space.sm, marginTop: -space.xl },
  title: { color: colors.text, fontSize: font.xxl, fontWeight: '900' },
  meta: { color: colors.textDim, fontSize: font.sm },
  genres: { color: colors.textMute, fontSize: font.xs },
  actions: { gap: space.sm, marginTop: space.md },
  overview: { color: colors.text, fontSize: font.md, lineHeight: font.md * 1.45, marginTop: space.md, opacity: 0.9, maxWidth: 900 },
  inlineRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.xl },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, alignSelf: 'flex-start' },
  inlineText: { color: colors.textDim, fontSize: font.sm, fontWeight: '600' },
  seasons: { paddingHorizontal: tv ? space.xxl * 2 : space.lg, gap: space.sm },
  seasonChip: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  seasonOn: { backgroundColor: '#fff', borderColor: '#fff' },
  seasonText: { color: colors.text, fontSize: font.sm, fontWeight: '700' },
  ep: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  epThumb: { borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surface },
  epCheck: { position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  epTitle: { color: colors.text, fontSize: font.md, fontWeight: '700' },
  epMeta: { color: colors.textMute, fontSize: font.xs },
  epOverview: { color: colors.textDim, fontSize: font.sm, lineHeight: font.sm * 1.4 },
});
