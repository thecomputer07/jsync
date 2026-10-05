import { Ionicons } from '@expo/vector-icons';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Wordmark } from '@/components/brand';
import { Focusable } from '@/components/focusable';
import { MediaRow, WIDE, backdropUrl, logoUrl, openItem } from '@/components/media';
import { Button, ErrorView, Loading } from '@/components/ui';
import { useT } from '@/i18n';
import { itemSubtitle } from '@/lib/jellyfin/client';
import type { BaseItem } from '@/lib/jellyfin/types';
import { useClient, useSession, useSyncPlayState } from '@/state/session';
import { colors, font, radius, space, tv } from '@/theme';

export default function Home() {
  const c = useClient();
  const { account } = useSession();
  const insets = useSafeAreaInsets();
  const sp = useSyncPlayState();
  const [refreshing, setRefreshing] = useState(false);
  const { t } = useT();
  const key = account?.id;

  const views = useQuery({ queryKey: ['home', key, 'views'], queryFn: () => c.views() });
  const resume = useQuery({ queryKey: ['home', key, 'resume'], queryFn: () => c.resume() });
  const nextUp = useQuery({ queryKey: ['home', key, 'nextup'], queryFn: () => c.nextUp() });
  const favorites = useQuery({ queryKey: ['home', key, 'favorites'], queryFn: () => c.favorites() });
  const featured = useQuery({ queryKey: ['home', key, 'featured'], queryFn: () => c.featured(), staleTime: 10 * 60_000 });
  const latest = useQueries({
    queries: (views.data?.Items ?? []).map((v) => ({
      queryKey: ['home', key, 'latest', v.Id],
      queryFn: () => c.latest(v.Id),
    })),
  });

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([views.refetch(), resume.refetch(), nextUp.refetch(), favorites.refetch(), ...latest.map((l) => l.refetch())]);
    setRefreshing(false);
  };

  if (views.isLoading) return <Loading />;
  if (views.error) return <ErrorView message={(views.error as Error).message} onRetry={() => views.refetch()} />;

  const hero = featured.data?.Items?.[0];
  const libs = views.data?.Items ?? [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: space.xxl }}
      refreshControl={tv ? undefined : <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.text} />}>
      {hero ? (
        <Hero item={hero} />
      ) : (
        <View style={{ paddingTop: insets.top + space.md, paddingHorizontal: space.lg, paddingBottom: space.lg }}>
          <Wordmark width={tv ? 220 : 130} />
        </View>
      )}

      {sp.group ? (
        <Focusable style={styles.groupBar} onPress={() => router.push('/groups')} zoom={false}>
          <View style={styles.liveDot} />
          <Text style={styles.groupText} numberOfLines={1}>
            {t('home.groupBar', { name: sp.group.GroupName, count: sp.group.Participants?.length ?? 1 })}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
        </Focusable>
      ) : null}

      <MediaRow title={t('home.continue')} items={resume.data?.Items} kind="landscape" />
      <MediaRow title={t('home.nextUp')} items={nextUp.data?.Items} kind="landscape" />
      <MediaRow title={t('home.myList')} items={favorites.data?.Items} kind="poster" />

      {libs.length > 1 ? (
        <View style={{ marginBottom: space.xl }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.libs}>
            {libs.map((v) => (
              <Focusable
                key={v.Id}
                style={styles.libChip}
                onPress={() => router.push({ pathname: '/library/[id]', params: { id: v.Id, name: v.Name, type: v.CollectionType ?? '' } })}>
                <Text style={styles.libText}>{v.Name}</Text>
              </Focusable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {libs.map((v, i) => (
        <MediaRow key={v.Id} title={t('home.latestIn', { name: v.Name })} items={latest[i]?.data as BaseItem[] | undefined} />
      ))}

      {!libs.length ? (
        <Text style={[styles.empty, { marginTop: space.xxl }]}>{t('home.noLibraries')}</Text>
      ) : null}
    </ScrollView>
  );
}

function Hero({ item }: { item: BaseItem }) {
  const c = useClient();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { t } = useT();
  // Su iPad/tablet l'hero non deve mangiare tutto lo schermo: al massimo il 60% dell'altezza.
  const wide = !tv && width >= WIDE;
  const h = tv ? height * 0.62 : wide ? height * 0.6 : Math.min(height * 0.62, width * 1.25);
  const logo = logoUrl(c, item);
  return (
    <View style={{ width, height: h }}>
      <Image source={backdropUrl(c, item, tv ? 1920 : 1280)} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
      <LinearGradient colors={['rgba(7,7,10,0.35)', 'transparent', 'rgba(7,7,10,0.6)', colors.bg]} locations={[0, 0.3, 0.7, 1]} style={StyleSheet.absoluteFill} />
      <View style={{ position: 'absolute', top: insets.top + space.sm, left: tv || wide ? space.xxl * 2 : space.lg }}>
        <Wordmark width={tv ? 220 : 130} />
      </View>
      <View style={[styles.heroBody, (tv || wide) && { alignItems: 'flex-start', paddingHorizontal: space.xxl * 2 }]}>
        {logo ? (
          <Image
            source={logo}
            style={{ width: tv ? 480 : wide ? Math.min(420, width * 0.4) : width * 0.65, height: tv ? 150 : wide ? 120 : 90 }}
            contentFit="contain"
            contentPosition={tv || wide ? 'left' : 'center'}
          />
        ) : (
          <Text style={[styles.heroTitle, wide && { textAlign: 'left', maxWidth: width * 0.6 }]} numberOfLines={2}>
            {item.Name}
          </Text>
        )}
        <Text style={styles.heroMeta} numberOfLines={1}>
          {[itemSubtitle(item), item.Genres?.slice(0, 3).join(' · ')].filter(Boolean).join(' · ')}
        </Text>
        <View style={styles.heroBtns}>
          <Button
            title={t('home.play')}
            variant="light"
            icon={<Ionicons name="play" size={18} color="#000" />}
            onPress={() => openItem(item)}
            style={{ minWidth: 140 }}
            hasTVPreferredFocus={tv}
          />
          <Button
            title={t('home.info')}
            variant="secondary"
            icon={<Ionicons name="information-circle-outline" size={18} color={colors.text} />}
            onPress={() => openItem(item)}
            style={{ minWidth: 120 }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroBody: { position: 'absolute', left: 0, right: 0, bottom: space.xl, alignItems: 'center', gap: space.md, paddingHorizontal: space.xl },
  heroTitle: { color: colors.text, fontSize: font.hero, fontWeight: '900', textAlign: 'center' },
  heroMeta: { color: colors.textDim, fontSize: font.sm },
  heroBtns: { flexDirection: 'row', gap: space.md },
  groupBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.xl,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderColor: 'rgba(34,197,94,0.4)',
    borderWidth: 1,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  groupText: { color: colors.text, fontSize: font.sm, fontWeight: '600', flex: 1 },
  libs: { paddingHorizontal: space.lg, gap: space.sm },
  libChip: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  libText: { color: colors.text, fontSize: font.sm, fontWeight: '600' },
  empty: { color: colors.textDim, textAlign: 'center', fontSize: font.md },
});
