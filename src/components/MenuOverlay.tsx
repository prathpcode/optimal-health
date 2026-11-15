import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import type { Fit, Item, TextOutline, Verdict } from '@engine/types';
import { boxToRect, tiltedRect, unionBox, type Rect, type Tilted } from '@/lib/layout';
import { fitColor } from '@/lib/verdict';
import { duration, onPhoto, palette, radius, spring } from '@/theme';
import { Tap } from './Tap';

// Labels sit on the photo, so they use the light palette in both themes (like a label stuck on paper).
const light = palette.light;

/**
 * Where one outline sits on the photo, in the one shape the overlay uses: turned to the angle its text runs at when
 * the corners are known, upright when they are not. The same padding is used from the first second of a scan to the
 * final dish boxes, so an outline never jumps shape as the scan fills in.
 */
function frameOf(outline: TextOutline, photo: Rect): { frame: { left: number; top: number; width: number; height: number }; angle: number } {
  const tilt = outline.quad?.length === 4 ? tiltedRect([outline.quad], photo) : null;
  if (tilt) {
    return {
      frame: { left: tilt.cx - tilt.width / 2 - 5, top: tilt.cy - tilt.height / 2 - 4, width: tilt.width + 10, height: tilt.height + 8 },
      angle: tilt.angle,
    };
  }
  const r = boxToRect(outline.box, photo);
  return { frame: { left: r.x - 5, top: r.y - 4, width: r.width + 10, height: r.height + 8 }, angle: 0 };
}

/**
 * A box around each dish on the photo, in its verdict's colour. The boxes carry the result on their own: nothing is
 * laid over the menu's text, so it stays readable. Tapping a box opens that dish; while it is the chosen one its own
 * box is drawn brighter, and nothing is drawn over the menu.
 */
export function MenuOverlay({
  photo,
  bounds,
  items,
  verdicts,
  provisional = false,
  selectedId,
  onSelect,
}: {
  photo: Rect;
  /** The part of the screen the overlay may draw in: `top` is where the top bar ends, `height` where the sheet begins. */
  bounds: { width: number; height: number; top?: number };
  items: Item[];
  verdicts: Record<string, Verdict>;
  /** Fast first-pass verdicts still being checked: boxes are drawn dashed until they are confirmed. */
  provisional?: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const boxes = useMemo(
    () =>
      items
        .filter((i) => i.position?.[0])
        // The whole dish: its name and the description lines under it. Top to bottom, so the stagger reads down the menu.
        // `tilt` follows the text when the menu was photographed at a slant; `rect` is its upright extent.
        .map((i) => ({ item: i, rect: boxToRect(unionBox(i.position!), photo), tilt: i.quads?.length ? tiltedRect(i.quads, photo) : null }))
        .sort((a, b) => a.rect.y - b.rect.y),
    [items, photo],
  );

  if (photo.width === 0) return null;
  const minTop = bounds.top ?? 0;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {boxes.map(({ item, rect, tilt }, order) => (
        <DishBox
          key={item.id}
          order={order}
          item={item}
          rect={rect}
          tilt={tilt}
          fit={verdicts[item.id]?.fit ?? null}
          checking={provisional && !!verdicts[item.id]}
          selected={selectedId === item.id}
          // A box that has slid under the top bar or the sheet is not a target.
          hidden={rect.y + rect.height < minTop || rect.y > bounds.height}
          onPress={() => onSelect(item.id)}
        />
      ))}
    </View>
  );
}

function DishBox({ order, item, rect, tilt, fit, checking, selected, hidden, onPress }: { order: number; item: Item; rect: Rect; tilt: Tilted | null; fit: Fit | null; checking: boolean; selected: boolean; hidden: boolean; onPress: () => void }) {
  const reduced = useReducedMotion();
  const pop = useSharedValue(1);
  const opacity = useSharedValue(0);
  const hadFit = useRef(fit !== null);
  const col = fit ? fitColor(fit, light).solid : onPhoto.textSecondary;
  // Dishes that are out or need a question carry more weight than the ones that are fine.
  const strong = fit === 'not_fit' || fit === 'cant_tell';

  useEffect(() => {
    // The verdict "pop": once, when a verdict first lands on this box, staggered down the menu.
    if (fit && !hadFit.current && !reduced) {
      pop.value = withDelay(order * 50, withSequence(withTiming(1.04, { duration: 140 }), withSpring(1, spring.pop)));
    }
    // The box is there as soon as the dish has a name: faint and grey until a verdict colours it.
    opacity.value = withDelay(order * 50, withTiming(fit ? 1 : 0.6, { duration: 300 }));
    hadFit.current = fit !== null;
  }, [fit, order, reduced, pop, opacity]);

  const turn = tilt?.angle ?? 0;
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ rotate: `${turn}rad` }, { scale: pop.value }] }));
  if (hidden) return null;
  // Turned to the text's own angle when its corners are known; otherwise the upright box.
  const frame = tilt
    ? { left: tilt.cx - tilt.width / 2 - 5, top: tilt.cy - tilt.height / 2 - 4, width: tilt.width + 10, height: tilt.height + 8 }
    : { left: rect.x - 5, top: rect.y - 4, width: rect.width + 10, height: rect.height + 8 };

  return (
    <Animated.View style={[{ position: 'absolute' }, frame, style]}>
      <Tap accessibilityRole="button" accessibilityLabel={`${item.name}${fit ? `, ${fit.replace('_', ' ')}` : ''}`} feedback="select" onPress={onPress} hitSlop={6} scaleTo={0.98} style={StyleSheet.absoluteFill}>
        <View
          style={[
            styles.box,
            {
              borderColor: col,
              borderWidth: selected ? 3.5 : strong ? 2.5 : 1.5,
              borderStyle: checking ? 'dashed' : 'solid',
              // A light wash of the verdict's colour, so a dish reads at a glance without a label.
              backgroundColor: fit ? `${col}${selected ? '5A' : strong ? '2E' : '1F'}` : selected ? 'rgba(255,255,255,0.22)' : 'transparent',
            },
          ]}
        />
      </Tap>
    </Animated.View>
  );
}

/**
 * Every line of text found on the photo, as faint outlines. Shown for the first seconds of a scan, before any dish
 * has a name, so the menu is visibly being found; replaced by the dish boxes once they exist.
 */
export function TextOutlines({ photo, lines }: { photo: Rect; lines: TextOutline[] }) {
  const reduced = useReducedMotion();
  if (photo.width === 0) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {lines.map((line, i) => {
        const { frame, angle } = frameOf(line, photo);
        return (
          <Animated.View
            key={i}
            entering={reduced ? FadeIn.duration(duration.fast) : FadeIn.duration(duration.base).delay(Math.min(i * 12, 600))}
            exiting={FadeOut.duration(duration.fast)}
            style={[styles.textLine, frame, { transform: [{ rotate: `${angle}rad` }] }]}
          />
        );
      })}
    </View>
  );
}

/**
 * Lines that already look like trouble, a couple of seconds into a scan: a dashed box in the colour the dish is
 * likely to end up, drawn over the faint text outlines. Dashed means "still checking", as it does on the dish boxes.
 */
export function EarlyHints({ photo, hints }: { photo: Rect; hints: (TextOutline & { fit: 'not_fit' | 'cant_tell' })[] }) {
  const reduced = useReducedMotion();
  if (photo.width === 0) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {hints.map((h, i) => {
        const { frame, angle } = frameOf(h, photo);
        const col = fitColor(h.fit, light).solid;
        return (
          <Animated.View
            key={`${h.box.top}-${h.box.left}`}
            entering={reduced ? FadeIn.duration(duration.fast) : ZoomIn.springify().damping(14).delay(Math.min(i * 60, 400))}
            exiting={FadeOut.duration(duration.fast)}
            style={[styles.hint, frame, { transform: [{ rotate: `${angle}rad` }], borderColor: col, backgroundColor: `${col}33` }]}
          />
        );
      })}
    </View>
  );
}

/** A soft bright band sweeping down the photo while it is being read. */
export function ScanSweep({ photo, active }: { photo: Rect; active: boolean }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  const visible = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    visible.value = withTiming(active ? 1 : 0, { duration: duration.slow });
    if (active && !reduced) {
      t.value = 0;
      t.value = withRepeat(withTiming(1, { duration: duration.sweep, easing: Easing.inOut(Easing.quad) }), -1, true);
    } else {
      cancelAnimation(t);
    }
  }, [active, reduced, t, visible]);

  const band = 120;
  const style = useAnimatedStyle(() => ({
    opacity: visible.value,
    transform: [{ translateY: t.value * Math.max(0, photo.height - band) }],
  }));
  const dim = useAnimatedStyle(() => ({ opacity: visible.value * 0.28 }));

  if (photo.width === 0) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill]}>
      <Animated.View style={[{ position: 'absolute', left: photo.x, top: photo.y, width: photo.width, height: photo.height, backgroundColor: '#000' }, dim]} />
      <Animated.View style={[{ position: 'absolute', left: photo.x, top: photo.y, width: photo.width, height: band }, style]}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.sweepLine} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, borderRadius: radius.sm },
  hint: { position: 'absolute', borderWidth: 2, borderRadius: radius.sm, borderStyle: 'dashed' },
  textLine: { position: 'absolute', borderWidth: 1, borderRadius: radius.sm, borderColor: 'rgba(255,255,255,0.55)', backgroundColor: 'rgba(255,255,255,0.08)' },
  sweepLine: { position: 'absolute', left: 0, right: 0, top: 59, height: 2, backgroundColor: 'rgba(255,255,255,0.85)' },
});
