import { useEffect, useImperativeHandle, type ReactNode, type Ref } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import Animated, {
  clamp,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { duration, ease, radius, shadow, space, spring, useTheme } from '@/theme';

export type SheetHandle = { snapTo: (index: number) => void };

/**
 * A bottom sheet over the photo. Dragged by its header (so the list inside scrolls freely), snaps between
 * fractions of the screen with a spring, and rubber-bands past its ends.
 */
export function Sheet({
  ref,
  snaps,
  initial = 0,
  header,
  children,
  onSnap,
  position,
}: {
  ref?: Ref<SheetHandle>;
  /** Visible heights as fractions of the screen, ascending. */
  snaps: number[];
  initial?: number;
  header: ReactNode;
  children: ReactNode;
  onSnap?: (index: number) => void;
  /** Receives the sheet's current top edge (px from the top of the screen). */
  position?: SharedValue<number>;
}) {
  const { c, dark } = useTheme();
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const points = snaps.map((s) => height * (1 - s)); // translateY per snap, descending
  const top = useSharedValue(points[initial]);
  const start = useSharedValue(0);
  const index = useSharedValue(initial);

  const animateTo = (i: number, velocity = 0) => {
    'worklet';
    index.set(i);
    top.set(reduced ? withTiming(points[i], { duration: duration.base, easing: ease }) : withSpring(points[i], { ...spring.gentle, velocity }));
  };

  useImperativeHandle(ref, () => ({
    snapTo: (i: number) => {
      const next = Math.max(0, Math.min(points.length - 1, i));
      animateTo(next);
      onSnap?.(next);
    },
  }));

  // Keep snaps correct across rotation / window size changes.
  useEffect(() => {
    top.set(points[index.value]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  const notify = (i: number) => {
    haptic.select();
    onSnap?.(i);
  };

  const pan = Gesture.Pan()
    .onBegin(() => {
      start.set(top.value);
    })
    .onUpdate((e) => {
      const min = points[points.length - 1];
      const max = points[0];
      const raw = start.value + e.translationY;
      // Rubber band beyond the ends.
      if (raw < min) top.set(min - Math.sqrt(min - raw) * 2);
      else if (raw > max) top.set(max + Math.sqrt(raw - max) * 2);
      else top.set(raw);
    })
    .onEnd((e) => {
      const projected = top.value + e.velocityY * 0.18;
      let best = 0;
      for (let i = 1; i < points.length; i++) if (Math.abs(points[i] - projected) < Math.abs(points[best] - projected)) best = i;
      const changed = best !== index.value;
      animateTo(best, e.velocityY);
      if (changed) scheduleOnRN(notify, best);
    });

  const tapHandle = Gesture.Tap().onEnd(() => {
    const next = index.value < points.length - 1 ? index.value + 1 : 0;
    animateTo(next);
    scheduleOnRN(notify, next);
  });

  useAnimatedReaction(
    () => top.value,
    (v) => {
      position?.set(v);
    },
  );

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: clamp(top.value, 0, height) }] }));

  return (
    <Animated.View style={[styles.sheet, { height, backgroundColor: c.card }, shadow('floating', dark), dark ? styles.darkEdge : null, { borderColor: c.hairline }, style]}>
      <GestureDetector gesture={Gesture.Exclusive(pan, tapHandle)}>
        <View accessibilityRole="adjustable" accessibilityHint="Drag to expand or collapse" style={styles.header}>
          <View style={[styles.grabber, { backgroundColor: c.textTertiary }]} />
          {header}
        </View>
      </GestureDetector>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    overflow: 'hidden',
  },
  darkEdge: { borderWidth: StyleSheet.hairlineWidth },
  header: { paddingTop: space.sm, paddingHorizontal: space.xl, paddingBottom: space.md },
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, marginBottom: space.md, opacity: 0.5 },
});
