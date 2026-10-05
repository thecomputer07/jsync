import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

export type Side = 'left' | 'right';

/**
 * Superficie dei gesti sopra il video:
 * - tocco singolo: mostra/nasconde i controlli
 * - doppio tocco a sinistra/destra: -10 s / +10 s
 * - trascinamento verticale: a sinistra luminosità, a destra volume
 */
export function GestureLayer({
  onTap,
  onDoubleTap,
  onAdjust,
  onAdjustEnd,
  enabled = true,
}: {
  onTap: () => void;
  onDoubleTap: (side: Side) => void;
  /** delta in [-1, 1] rispetto all'altezza dello schermo, positivo = verso l'alto */
  onAdjust: (side: Side, delta: number) => void;
  onAdjustEnd: () => void;
  enabled?: boolean;
}) {
  // Callback e misure passano da un oggetto stabile: i gesti nativi possono restare legati a quelli
  // del primo render (su iOS il tocco chiamava ancora la versione "controlli visibili" e non li rimostrava più).
  const [live] = useState(() => ({ w: 1, h: 1, onTap, onDoubleTap, onAdjust, onAdjustEnd }));
  Object.assign(live, { onTap, onDoubleTap, onAdjust, onAdjustEnd });

  const gesture = useMemo(() => {
    const side = (x: number): Side => (x < live.w / 2 ? 'left' : 'right');
    const single = Gesture.Tap()
      .enabled(enabled)
      .runOnJS(true)
      .maxDuration(250)
      .onEnd((_e, ok) => ok && live.onTap());
    const double = Gesture.Tap()
      .enabled(enabled)
      .runOnJS(true)
      .numberOfTaps(2)
      .maxDelay(260)
      .onEnd((e, ok) => ok && live.onDoubleTap(side(e.x)));
    const pan = Gesture.Pan()
      .enabled(enabled)
      .runOnJS(true)
      .activeOffsetY([-14, 14])
      .failOffsetX([-30, 30])
      // il dito si muove in verticale (failOffsetX), quindi il lato resta quello di partenza
      .onChange((e) => live.onAdjust(side(e.x), -e.changeY / (live.h * 0.6)))
      .onFinalize(() => live.onAdjustEnd());
    return Gesture.Race(pan, Gesture.Exclusive(double, single));
  }, [enabled, live]);

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={StyleSheet.absoluteFill}
        collapsable={false}
        onLayout={(e) => Object.assign(live, { w: e.nativeEvent.layout.width || 1, h: e.nativeEvent.layout.height || 1 })}
      />
    </GestureDetector>
  );
}
