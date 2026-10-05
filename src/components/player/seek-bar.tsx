import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { formatDuration } from '@/lib/jellyfin/client';
import type { MediaSegment } from '@/lib/jellyfin/types';
import { colors, font, tv } from '@/theme';

/**
 * Barra di avanzamento: trascini e vedi l'anteprima del tempo, il seek parte al rilascio
 * (in gruppo un solo seek per tutti, non uno per ogni pixel).
 * I segmenti intro/riassunto/titoli di coda sono segnati sulla barra.
 */
export function SeekBar({
  position,
  duration,
  buffered,
  segments,
  onSeek,
  onScrubStart,
}: {
  position: number;
  duration: number;
  buffered: number;
  segments: MediaSegment[];
  onSeek: (seconds: number) => void;
  onScrubStart?: () => void;
}) {
  const [width, setWidth] = useState(1);
  const [scrub, setScrub] = useState<number | null>(null);
  const pos = scrub ?? position;
  const pct = duration > 0 ? Math.min(1, Math.max(0, pos / duration)) : 0;
  const bufPct = duration > 0 ? Math.min(1, buffered / duration) : 0;
  const at = (x: number) => Math.min(duration, Math.max(0, (x / width) * duration));

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(2)
    .onBegin((e) => {
      onScrubStart?.();
      setScrub(at(e.x));
    })
    .onUpdate((e) => setScrub(at(e.x)))
    .onEnd((e) => {
      onSeek(at(e.x));
    })
    .onFinalize(() => setScrub(null));
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e) => onSeek(at(e.x)));

  return (
    <View style={styles.wrap}>
      <Text style={styles.time}>{formatDuration(pos)}</Text>
      <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
        <View style={styles.hit} onLayout={(e) => setWidth(Math.max(1, e.nativeEvent.layout.width))}>
          <View style={styles.track}>
            <View style={[styles.buffer, { width: `${bufPct * 100}%` }]} />
            {duration > 0
              ? segments
                  .filter((s) => s.Type === 'Intro' || s.Type === 'Recap' || s.Type === 'Outro')
                  .map((s, i) => {
                    const a = s.StartTicks / 1e7 / duration;
                    const b = s.EndTicks / 1e7 / duration;
                    return <View key={i} style={[styles.segment, { left: `${a * 100}%`, width: `${Math.max(0.3, (b - a) * 100)}%` }]} />;
                  })
              : null}
            <View style={[styles.fill, { width: `${pct * 100}%` }]} />
          </View>
          <View style={[styles.knob, scrub != null && styles.knobBig, { left: pct * width - (scrub != null ? 11 : 7) }]} />
        </View>
      </GestureDetector>
      <Text style={styles.time}>-{formatDuration(Math.max(0, duration - pos))}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  time: { color: '#fff', fontSize: font.sm, fontVariant: ['tabular-nums'], minWidth: tv ? 90 : 56, textAlign: 'center' },
  hit: { flex: 1, height: 36, justifyContent: 'center' },
  track: { height: tv ? 6 : 4, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  buffer: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.35)' },
  segment: { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(236,72,153,0.55)' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.accent },
  knob: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff' },
  knobBig: { width: 22, height: 22, borderRadius: 11 },
});
