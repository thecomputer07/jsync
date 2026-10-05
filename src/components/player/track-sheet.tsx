import { Ionicons } from '@expo/vector-icons';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Focusable } from '@/components/focusable';
import { streamLabel } from '@/lib/jellyfin/playback';
import type { MediaStream } from '@/lib/jellyfin/types';
import { colors, font, radius, space, tv } from '@/theme';

/** Scelta audio e sottotitoli. Ognuno nel gruppo sceglie i suoi: non tocca gli altri. */
export function TrackSheet({
  visible,
  onClose,
  audio,
  subtitles,
  audioIndex,
  subtitleIndex,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  audio: MediaStream[];
  subtitles: MediaStream[];
  audioIndex?: number;
  subtitleIndex?: number;
  onPick: (kind: 'audio' | 'subtitle', index: number) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} supportedOrientations={['landscape', 'portrait']}>
      <Focusable style={styles.backdrop} onPress={onClose} zoom={false} focusable={false}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <Column title="Audio">
            {audio.length ? (
              audio.map((s, i) => (
                <Option key={s.Index} label={streamLabel(s)} on={s.Index === audioIndex} first={i === 0} onPress={() => onPick('audio', s.Index)} />
              ))
            ) : (
              <Text style={styles.none}>Nessuna traccia</Text>
            )}
          </Column>
          <View style={styles.divider} />
          <Column title="Sottotitoli">
            <Option label="Disattivati" on={subtitleIndex == null || subtitleIndex < 0} onPress={() => onPick('subtitle', -1)} />
            {subtitles.map((s) => (
              <Option
                key={s.Index}
                label={`${streamLabel(s)}${s.IsForced ? ' · forzati' : ''}`}
                on={s.Index === subtitleIndex}
                onPress={() => onPick('subtitle', s.Index)}
              />
            ))}
          </Column>
        </View>
      </Focusable>
    </Modal>
  );
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.title}>{title}</Text>
      <ScrollView contentContainerStyle={{ gap: 2 }}>{children}</ScrollView>
    </View>
  );
}

function Option({ label, on, onPress, first }: { label: string; on: boolean; onPress: () => void; first?: boolean }) {
  return (
    <Focusable onPress={onPress} style={styles.opt} zoom={false} hasTVPreferredFocus={tv && (on || first)}>
      <Ionicons name="checkmark" size={18} color={on ? colors.text : 'transparent'} />
      <Text style={[styles.optText, on && { color: colors.text, fontWeight: '800' }]} numberOfLines={2}>
        {label}
      </Text>
    </Focusable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  sheet: {
    flexDirection: 'row',
    width: '86%',
    maxWidth: 900,
    maxHeight: '80%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.lg,
  },
  divider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  title: { color: colors.text, fontSize: font.lg, fontWeight: '900', marginBottom: space.sm },
  opt: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.xs },
  optText: { color: colors.textDim, fontSize: font.md, flex: 1 },
  none: { color: colors.textMute, fontSize: font.sm },
});
