import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { FlatList, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Focusable } from '@/components/focusable';
import { PosterCard } from '@/components/media';
import { ErrorView, Loading } from '@/components/ui';
import { useClient, useSession } from '@/state/session';
import { colors, font, space, tv } from '@/theme';

const PAGE = 60;

export default function Library() {
  const { id, name, type } = useLocalSearchParams<{ id: string; name?: string; type?: string }>();
  const c = useClient();
  const { account } = useSession();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const q = useInfiniteQuery({
    queryKey: ['library', account?.id, id],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => c.libraryItems(id, pageParam, PAGE, type || undefined),
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.Items.length, 0);
      return loaded < last.TotalRecordCount ? loaded : undefined;
    },
  });

  const cols = tv ? 7 : width > 700 ? 5 : 3;
  const cardW = (width - space.lg * 2 - space.md * (cols - 1)) / cols;
  const items = q.data?.pages.flatMap((p) => p.Items) ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Focusable onPress={() => router.back()} style={styles.back} zoom={false}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Focusable>
        <Text style={styles.title} numberOfLines={1}>
          {name ?? 'Libreria'}
        </Text>
        {q.data ? <Text style={styles.count}>{q.data.pages[0]?.TotalRecordCount ?? 0}</Text> : null}
      </View>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorView message={(q.error as Error).message} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          key={cols}
          data={items}
          numColumns={cols}
          keyExtractor={(i) => i.Id}
          contentContainerStyle={{ padding: space.lg, gap: space.lg }}
          columnWrapperStyle={{ gap: space.md }}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
          onEndReachedThreshold={0.6}
          renderItem={({ item }) => <PosterCard item={item} width={cardW} />}
          ListFooterComponent={q.isFetchingNextPage ? <Loading /> : null}
          ListEmptyComponent={<Text style={styles.empty}>Libreria vuota.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, paddingVertical: space.sm, gap: space.xs },
  back: { padding: space.sm },
  title: { color: colors.text, fontSize: font.xl, fontWeight: '900', flex: 1 },
  count: { color: colors.textMute, fontSize: font.sm, paddingRight: space.lg },
  empty: { color: colors.textDim, textAlign: 'center', marginTop: space.xxl, fontSize: font.md },
});
