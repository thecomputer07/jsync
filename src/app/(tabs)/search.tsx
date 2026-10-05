import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PosterCard } from '@/components/media';
import { Input, Loading } from '@/components/ui';
import { useClient, useSession } from '@/state/session';
import { colors, font, space, tv } from '@/theme';

export default function Search() {
  const c = useClient();
  const { account } = useSession();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setTerm(text.trim()), 350);
    return () => clearTimeout(t);
  }, [text]);

  const q = useQuery({
    queryKey: ['search', account?.id, term],
    queryFn: () => c.search(term),
    enabled: term.length >= 2,
  });

  const cols = tv ? 7 : width > 700 ? 5 : 3;
  const cardW = (width - space.lg * 2 - space.md * (cols - 1)) / cols;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + space.md }}>
      <View style={styles.bar}>
        <Ionicons name="search" size={20} color={colors.textMute} style={styles.icon} />
        <Input
          placeholder="Film, serie, episodi…"
          value={text}
          onChangeText={setText}
          autoCapitalize="none"
          returnKeyType="search"
          style={{ paddingLeft: 44 }}
          clearButtonMode="while-editing"
        />
      </View>
      {q.isFetching && !q.data ? (
        <Loading />
      ) : (
        <FlatList
          key={cols}
          data={q.data?.Items ?? []}
          numColumns={cols}
          keyExtractor={(i) => i.Id}
          contentContainerStyle={{ padding: space.lg, gap: space.lg }}
          columnWrapperStyle={{ gap: space.md }}
          keyboardDismissMode="on-drag"
          renderItem={({ item }) => <PosterCard item={item} width={cardW} />}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {term.length >= 2 ? 'Nessun risultato.' : 'Cerca nella tua libreria di film e serie.'}
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: space.lg, justifyContent: 'center' },
  icon: { position: 'absolute', left: space.lg + 14, zIndex: 1, top: tv ? 22 : 14 },
  empty: { color: colors.textDim, textAlign: 'center', marginTop: space.xxl, fontSize: font.md },
});
