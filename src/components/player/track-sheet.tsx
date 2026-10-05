import { Ionicons } from '@expo/vector-icons';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Focusable } from '@/components/focusable';
import { useT } from '@/i18n';
import { streamLabel } from '@/lib/jellyfin/playback';
import type { MediaStream } from '@/lib/jellyfin/types';
import { colors, font, radius, space, tv } from '@/theme';

/** Foglio a colonne sopra il player (tracce, velocità, qualità). */
export function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} supportedOrientations={['landscape', 'portrait']}>
      <Focusable style={styles.backdrop} onPress={onClose} zoom={false} focusable={false}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          {children}
        </View>
      </Focusable>
    </Modal>
  );
}

export function Column({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.title}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <ScrollView contentContainerStyle={{ gap: 2 }}>{children}</ScrollView>
    </View>
  );
}

export function Option({
  label,
  on,
  onPress,
  first,
  disabled,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  first?: boolean;
  disabled?: boolean;
}) {
  return (
    <Focusable
      onPress={onPress}
      disabled={disabled}
      style={[styles.opt, disabled && { opacity: 0.4 }]}
      zoom={false}
      hasTVPreferredFocus={tv && (on || first)}>
      <Ionicons name="checkmark" size={18} color={on ? colors.text : 'transparent'} />
      <Text style={[styles.optText, on && { color: colors.text, fontWeight: '800' }]} numberOfLines={2}>
        {label}
      </Text>
    </Focusable>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

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
  const { t } = useT();
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Column title={t('player.audio')}>
        {audio.length ? (
          audio.map((s, i) => (
            <Option key={s.Index} label={streamLabel(s)} on={s.Index === audioIndex} first={i === 0} onPress={() => onPick('audio', s.Index)} />
          ))
        ) : (
          <Text style={styles.none}>{t('player.noTracks')}</Text>
        )}
      </Column>
      <Divider />
      <Column title={t('player.subtitles')}>
        <Option label={t('player.off')} on={subtitleIndex == null || subtitleIndex < 0} onPress={() => onPick('subtitle', -1)} />
        {subtitles.map((s) => (
          <Option
            key={s.Index}
            label={`${streamLabel(s)}${s.IsForced ? ` · ${t('player.forced')}` : ''}`}
            on={s.Index === subtitleIndex}
            onPress={() => onPick('subtitle', s.Index)}
          />
        ))}
      </Column>
    </Sheet>
  );
}

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
export const QUALITY_CHOICES = [0, 120_000_000, 20_000_000, 8_000_000, 4_000_000, 2_000_000]; // 0 = dalle impostazioni

/** Velocità (solo da soli) e qualità dello streaming. */
export function OptionsSheet({
  visible,
  onClose,
  speed,
  onSpeed,
  speedLocked,
  quality,
  onQuality,
}: {
  visible: boolean;
  onClose: () => void;
  speed: number;
  onSpeed: (s: number) => void;
  speedLocked: boolean;
  quality: number;
  onQuality: (q: number) => void;
}) {
  const { t } = useT();
  const qLabel = (q: number) =>
    q === 0 ? t('player.qualityAuto') : q >= 100_000_000 ? t('settings.max') : `${Math.round(q / 1_000_000)} Mbps`;
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Column title={t('player.speed')} hint={speedLocked ? t('player.speedGroup') : undefined}>
        {SPEEDS.map((s, i) => (
          <Option key={s} label={`${s}×`} on={s === speed} first={i === 0} disabled={speedLocked} onPress={() => onSpeed(s)} />
        ))}
      </Column>
      <Divider />
      <Column title={t('player.quality')}>
        {QUALITY_CHOICES.map((q) => (
          <Option key={q} label={qLabel(q)} on={q === quality} onPress={() => onQuality(q)} />
        ))}
      </Column>
    </Sheet>
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
  hint: { color: colors.textMute, fontSize: font.xs, marginBottom: space.sm },
  opt: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.xs },
  optText: { color: colors.textDim, fontSize: font.md, flex: 1 },
  none: { color: colors.textMute, fontSize: font.sm },
});
