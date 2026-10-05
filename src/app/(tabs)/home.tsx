import { Ionicons } from '@expo/vector-icons';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Focusable } from '@/components/focusable';
import { MediaRow, backdropUrl, logoUrl, openItem } from '@/components/media';
import { Button, ErrorView, Loading } from '@/components/ui';
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
  const key = account?.id;

  const views = useQuery({ queryKey: ['home', key, 'views'], queryFn: () => c.views() });
  const resume = useQuery({ queryKey: ['home', key, 'resume'], queryFn: () => c.resume() });
  const nextUp = useQuery({ queryKey: ['home', key, 'nextup'], queryFn: () => c.nextUp() });
  const featured = useQuery({ queryKey: ['home', key, 'featured'], queryFn: () => c.featured(), staleTime: 10 * 60_000 });
  const latest = useQueries({
    queries: (views.data?.Items ?? []).map((v) => ({
      queryKey: ['home', key, 'latest', v.Id],
      queryFn: () => c.latest(v.Id),
    })),
  });

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([views.refetch(), resume.refetch(), nextUp.refetch(), ...latest.map((l) => l.refetch())]);
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
      {hero ? <Hero item={hero} /> : <View style={{ height: insets.top + space.lg }} />}

      {sp.group ? (
        <Focusable style={styles.groupBar} onPress={() => router.push('/groups')} zoom={false}>
          <View style={styles.liveDot} />
          <Text style={styles.groupText} numberOfLines={1}>
            Gruppo «{sp.group.GroupName}» · {sp.group.Participants?.length ?? 1} persone
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
        </Focusable>
      ) : null}

      <MediaRow title="Continua a guardare" items={resume.data?.Items} kind="landscape" />
      <MediaRow title="Prossimi episodi" items={nextUp.data?.Items} kind="landscape" />

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
        <MediaRow key={v.Id} title={`Aggiunti di recente · ${v.Name}`} items={latest[i]?.data as BaseItem[] | undefined} />
      ))}

      {!libs.length ? (
        <Text style={[styles.empty, { marginTop: space.xxl }]}>Nessuna libreria video su questo server.</Text>
      ) : null}
    </ScrollView>
  );
}

function Hero({ item }: { item: BaseItem }) {
  const c = useClient();
  const { width, height } = useWindowDimensions();
  const h = tv ? height * 0.62 : Math.min(height * 0.62, width * 1.25);
  const logo = logoUrl(c, item);
  return (
    <View style={{ width, height: h }}>
      <Image source={backdropUrl(c, item, tv ? 1920 : 1280)} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
      <LinearGradient colors={['rgba(7,7,10,0.35)', 'transparent', 'rgba(7,7,10,0.6)', colors.bg]} locations={[0, 0.3, 0.7, 1]} style={StyleSheet.absoluteFill} />
      <View style={[styles.heroBody, tv && { alignItems: 'flex-start', paddingHorizontal: space.xxl * 2 }]}>
        {logo ? (
          <Image source={logo} style={{ width: tv ? 480 : width * 0.65, height: tv ? 150 : 90 }} contentFit="contain" />
        ) : (
          <Text style={styles.heroTitle} numberOfLines={2}>
            {item.Name}
          </Text>
        )}
        <Text style={styles.heroMeta} numberOfLines={1}>
          {[itemSubtitle(item), item.Genres?.slice(0, 3).join(' · ')].filter(Boolean).join(' · ')}
        </Text>
        <View style={styles.heroBtns}>
          <Button
            title="Riproduci"
            variant="light"
            icon={<Ionicons name="play" size={18} color="#000" />}
            onPress={() => openItem(item)}
            style={{ minWidth: 140 }}
            hasTVPreferredFocus={tv}
          />
          <Button
            title="Info"
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
