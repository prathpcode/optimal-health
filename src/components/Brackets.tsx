import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { Rect } from '@/lib/layout';
import { onPhoto, spring } from '@/theme';

const ARM = 34;
const THICK = 3.5;

/** Four rounded corner brackets framing the target. Breathe while idle; spring to a new rect when it changes. */
export function Brackets({ rect, breathing }: { rect: Rect; breathing: boolean }) {
  const reduced = useReducedMotion();
  const x = useSharedValue(rect.x);
  const y = useSharedValue(rect.y);
  const w = useSharedValue(rect.width);
  const h = useSharedValue(rect.height);
  const breathe = useSharedValue(0);

  useEffect(() => {
    const go = (sv: typeof x, v: number) => {
      sv.value = reduced ? withTiming(v, { duration: 160 }) : withSpring(v, spring.gentle);
    };
    go(x, rect.x);
    go(y, rect.y);
    go(w, rect.width);
    go(h, rect.height);
  }, [rect.x, rect.y, rect.width, rect.height, reduced, x, y, w, h]);

  useEffect(() => {
    if (!breathing || reduced) {
      breathe.value = withTiming(0, { duration: 200 });
      return;
    }
    breathe.value = withRepeat(
      withSequence(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.sin) })),
      -1,
    );
  }, [breathing, reduced, breathe]);

  const frame = useAnimatedStyle(() => {
    const grow = breathe.value * 6;
    return { left: x.value - grow, top: y.value - grow, width: w.value + grow * 2, height: h.value + grow * 2 };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.frame, frame]}>
      <View style={[styles.corner, { top: 0, left: 0, borderTopWidth: THICK, borderLeftWidth: THICK, borderTopLeftRadius: 18 }]} />
      <View style={[styles.corner, { top: 0, right: 0, borderTopWidth: THICK, borderRightWidth: THICK, borderTopRightRadius: 18 }]} />
      <View style={[styles.corner, { bottom: 0, left: 0, borderBottomWidth: THICK, borderLeftWidth: THICK, borderBottomLeftRadius: 18 }]} />
      <View style={[styles.corner, { bottom: 0, right: 0, borderBottomWidth: THICK, borderRightWidth: THICK, borderBottomRightRadius: 18 }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: { position: 'absolute' },
  corner: { position: 'absolute', width: ARM, height: ARM, borderColor: onPhoto.text },
});
