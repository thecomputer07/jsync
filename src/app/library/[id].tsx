import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Focusable } from '@/components/focusable';
import { PosterCard, gridColumns } from '@/components/media';
import { Button, ErrorView, Loading } from '@/components/ui';
import { useT, type TKey } from '@/i18n';
import { DEFAULT_FILTERS, type LibraryFilters, type LibrarySort } from '@/lib/jellyfin/client';
import { useClient, useSession } from '@/state/session';
import { colors, font, radius, space, tv } from '@/theme';

const PAGE = 60;

const SORTS: { value: LibrarySort; key: TKey }[] = [
  { value: 'SortName', key: 'library.sortName' },
  { value: 'DateCreated', key: 'library.sortAdded' },
  { value: 'ProductionYear', key: 'library.sortYear' },
  { value: 'CommunityRating', key: 'library.sortRating' },
  { value: 'Random', key: 'library.sortRandom' },
];

/** Quanti filtri sono diversi da quelli predefiniti (per il pallino sul pulsante). */
function activeCount(f: LibraryFilters) {
  return (f.sort !== DEFAULT_FILTERS.sort ? 1 : 0) + (f.unwatched ? 1 : 0) + (f.favorites ? 1 : 0) + f.genreIds.length;
}

export default function Library() {
  const { id, name, type } = useLocalSearchParams<{ id: string; name?: string; type?: string }>();
  const c = useClient();
  const { account } = useSession();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t } = useT();
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_FILTERS);
  const [panel, setPanel] = useState(false);

  const q = useInfiniteQuery({
    queryKey: ['library', account?.id, id, filters],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => c.libraryItems(id, pageParam, PAGE, type || undefined, filters),
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.Items.length, 0);
      return loaded < last.TotalRecordCount ? loaded : undefined;
    },
  });

  const genres = useQuery({
    queryKey: ['genres', account?.id, id],
    queryFn: () => c.genres(id),
    enabled: panel,
    staleTime: 10 * 60_000,
  });

  const cols = gridColumns(width);
  const cardW = (width - space.lg * 2 - space.md * (cols - 1)) / cols;
  const items = q.data?.pages.flatMap((p) => p.Items) ?? [];
  const active = activeCount(filters);

  const toggleGenre = (gid: string) =>
    setFilters((f) => ({
      ...f,
      genreIds: f.genreIds.includes(gid) ? f.genreIds.filter((x) => x !== gid) : [...f.genreIds, gid],
    }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Focusable onPress={() => router.back()} style={styles.back} zoom={false}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Focusable>
        <Text style={styles.title} numberOfLines={1}>
          {name ?? t('library.title')}
        </Text>
        {q.data ? <Text style={styles.count}>{q.data.pages[0]?.TotalRecordCount ?? 0}</Text> : null}
        <Focusable onPress={() => setPanel(true)} style={[styles.filterBtn, active > 0 && styles.filterBtnOn]} zoom={false}>
          <Ionicons name="options-outline" size={18} color={colors.text} />
          <Text style={styles.filterText}>{t('library.filters')}</Text>
          {active > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{active}</Text>
            </View>
          ) : null}
        </Focusable>
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
          ListEmptyComponent={
            <View style={{ alignItems: 'center', gap: space.lg }}>
              <Text style={styles.empty}>{t('library.empty')}</Text>
              {active > 0 ? <Button title={t('common.reset')} variant="secondary" onPress={() => setFilters(DEFAULT_FILTERS)} /> : null}
            </View>
          }
        />
      )}

      <Modal visible={panel} transparent animationType={tv ? 'fade' : 'slide'} onRequestClose={() => setPanel(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPanel(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{t('library.filters')}</Text>
            <Focusable onPress={() => setFilters(DEFAULT_FILTERS)} zoom={false} style={{ padding: space.sm }} disabled={active === 0}>
              <Text style={[styles.reset, active === 0 && { opacity: 0.4 }]}>{t('common.reset')}</Text>
            </Focusable>
          </View>
          <ScrollView contentContainerStyle={{ gap: space.md, paddingBottom: space.md }}>
            <Text style={styles.label}>{t('library.sortBy')}</Text>
            <View style={styles.chips}>
              {SORTS.map((s) => (
                <Chip key={s.value} label={t(s.key)} on={filters.sort === s.value} onPress={() => setFilters((f) => ({ ...f, sort: s.value }))} />
              ))}
            </View>

            <FilterToggle label={t('library.unwatched')} value={filters.unwatched} onChange={(v) => setFilters((f) => ({ ...f, unwatched: v }))} />
            <FilterToggle label={t('library.favorites')} value={filters.favorites} onChange={(v) => setFilters((f) => ({ ...f, favorites: v }))} />

            <Text style={styles.label}>{t('library.genres')}</Text>
            {genres.isLoading ? (
              <Text style={styles.dim}>{t('common.loading')}</Text>
            ) : (
              <View style={styles.chips}>
                <Chip label={t('common.all')} on={filters.genreIds.length === 0} onPress={() => setFilters((f) => ({ ...f, genreIds: [] }))} />
                {(genres.data?.Items ?? []).map((g) => (
                  <Chip key={g.Id} label={g.Name} on={filters.genreIds.includes(g.Id)} onPress={() => toggleGenre(g.Id)} />
                ))}
              </View>
            )}
          </ScrollView>
          <Button title={t('common.done')} onPress={() => setPanel(false)} hasTVPreferredFocus={tv} />
        </View>
      </Modal>
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Focusable onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && { color: '#000' }]}>{label}</Text>
    </Focusable>
  );
}

function FilterToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Focusable style={styles.toggle} zoom={false} onPress={() => onChange(!value)}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent, false: colors.surfaceHi }} thumbColor="#fff" focusable={false} />
    </Focusable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, paddingVertical: space.sm, gap: space.xs },
  back: { padding: space.sm },
  title: { color: colors.text, fontSize: font.xl, fontWeight: '900', flex: 1 },
  count: { color: colors.textMute, fontSize: font.sm, paddingRight: space.sm },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginRight: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterBtnOn: { borderColor: colors.accent },
  filterText: { color: colors.text, fontSize: font.sm, fontWeight: '700' },
  badge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  empty: { color: colors.textDim, textAlign: 'center', marginTop: space.xxl, fontSize: font.md },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.md,
    maxHeight: '80%',
    width: '100%',
    maxWidth: 700,
    alignSelf: 'center',
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { color: colors.text, fontSize: font.xl, fontWeight: '900' },
  reset: { color: colors.accent, fontSize: font.sm, fontWeight: '800' },
  label: { color: colors.textMute, fontSize: font.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginTop: space.sm },
  dim: { color: colors.textDim, fontSize: font.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  chipOn: { backgroundColor: '#fff', borderColor: '#fff' },
  chipText: { color: colors.text, fontSize: font.sm, fontWeight: '600' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  toggleLabel: { color: colors.text, fontSize: font.md, fontWeight: '600', flex: 1 },
});
